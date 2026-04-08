const axios = require("axios");
const { haversine, boundingBox } = require("./distance");

const BASE_URL = process.env.OPENSKY_BASE_URL || "https://opensky-network.org/api";
const CLIENT_ID = process.env.OPENSKY_CLIENT_ID;
const CLIENT_SECRET = process.env.OPENSKY_CLIENT_SECRET;

/** Max flights to ask OpenSky /flights/aircraft for (rate limits). */
const ROUTE_ENRICH_MAX = Math.min(
  250,
  Math.max(0, parseInt(process.env.OPENSKY_ROUTE_ENRICH_MAX || "18", 10) || 18),
);
const ROUTE_ENRICH_DELAY_MS = Math.max(
  0,
  parseInt(process.env.OPENSKY_ROUTE_ENRICH_DELAY_MS || "350", 10) || 0,
);

function classifyAltitude(altitudeMeters) {
  if (altitudeMeters == null) return "unknown";
  if (altitudeMeters < 3000) return "landing";
  if (altitudeMeters <= 10000) return "mid-flight";
  return "cruising";
}

function trafficLevel(count) {
  if (count <= 5) return "LOW";
  if (count <= 20) return "MEDIUM";
  return "HIGH";
}

function axiosAuthConfig() {
  if (CLIENT_ID && CLIENT_SECRET) {
    return { auth: { username: CLIENT_ID, password: CLIENT_SECRET } };
  }
  return {};
}

async function fetchFlights(lat, lon, radiusKm) {
  const bbox = boundingBox(lat, lon, radiusKm);

  const params = {
    lamin: bbox.lamin.toFixed(4),
    lamax: bbox.lamax.toFixed(4),
    lomin: bbox.lomin.toFixed(4),
    lomax: bbox.lomax.toFixed(4),
  };

  // Try authenticated first, fall back to anonymous (sometimes faster)
  try {
    const response = await axios.get(`${BASE_URL}/states/all`, {
      params,
      timeout: 9000,
      ...axiosAuthConfig(),
    });
    return response.data;
  } catch (err) {
    if (CLIENT_ID && CLIENT_SECRET) {
      // Retry without auth — anonymous requests can be faster
      const response = await axios.get(`${BASE_URL}/states/all`, {
        params,
        timeout: 9000,
      });
      return response.data;
    }
    throw err;
  }
}

/**
 * OpenSky state vector indices — see https://opensky-network.org/data/api
 * 5 lon, 6 lat, 7 baro alt, 13 geo alt
 */
function processFlights(data, lat, lon, radiusKm) {
  if (!data || !data.states || data.states.length === 0) return [];

  return data.states
    .map((s) => {
      const flightLat = s[6];
      const flightLon = s[5];
      if (flightLat == null || flightLon == null) return null;

      const distance = haversine(lat, lon, flightLat, flightLon);
      const altitude = s[7] ?? s[13];
      const velocity = s[9];
      const heading = s[10];
      const verticalRate = s[11];

      return {
        icao24: s[0],
        callsign: (s[1] || "").trim() || "N/A",
        country: s[2],
        latitude: flightLat,
        longitude: flightLon,
        altitude,
        velocity,
        heading,
        verticalRate: verticalRate != null ? verticalRate : null,
        onGround: s[8] === true,
        timePosition: s[3] != null ? s[3] : null,
        lastContact: s[4] != null ? s[4] : null,
        distance: Math.round(distance * 100) / 100,
        classification: classifyAltitude(altitude),
        estDepartureAirport: null,
        estArrivalAirport: null,
        routeFirstSeen: null,
        routeLastSeen: null,
      };
    })
    .filter((f) => f && f.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Best-effort route leg from OpenSky flights DB (ADS-B derived, not airline schedules).
 */
async function fetchAircraftRoute(icao24) {
  const hex = String(icao24 || "")
    .trim()
    .toLowerCase()
    .replace(/^0x/, "");
  if (!hex) return null;

  const now = Math.floor(Date.now() / 1000);
  const begin = now - 10 * 3600;
  const end = now + 120;

  try {
    const { data } = await axios.get(`${BASE_URL}/flights/aircraft`, {
      params: { icao24: hex, begin, end },
      timeout: 4000,
      ...axiosAuthConfig(),
    });
    if (!Array.isArray(data) || data.length === 0) return null;

    const leg = data.reduce((a, b) =>
      (a.lastSeen || 0) >= (b.lastSeen || 0) ? a : b,
    );

    return {
      estDepartureAirport: leg.estDepartureAirport ?? null,
      estArrivalAirport: leg.estArrivalAirport ?? null,
      routeFirstSeen: typeof leg.firstSeen === "number" ? leg.firstSeen : null,
      routeLastSeen: typeof leg.lastSeen === "number" ? leg.lastSeen : null,
    };
  } catch {
    return null;
  }
}

async function enrichFlightsWithRoutes(flights) {
  const n = Math.min(flights.length, ROUTE_ENRICH_MAX);
  for (let i = 0; i < n; i++) {
    const route = await fetchAircraftRoute(flights[i].icao24);
    if (route) Object.assign(flights[i], route);
    if (i < n - 1 && ROUTE_ENRICH_DELAY_MS > 0) {
      await sleep(ROUTE_ENRICH_DELAY_MS);
    }
  }
}

async function getInsights(lat, lon, radiusKm) {
  const data = await fetchFlights(lat, lon, radiusKm);
  const flights = processFlights(data, lat, lon, radiusKm);

  // Skip route enrichment in serverless environments (too slow for Vercel's 10s limit)
  if (!process.env.VERCEL) {
    await enrichFlightsWithRoutes(flights);
  }

  const counts = { landing: 0, "mid-flight": 0, cruising: 0, unknown: 0 };
  flights.forEach((f) => counts[f.classification]++);

  return {
    center: { lat, lon },
    radiusKm,
    totalFlights: flights.length,
    traffic: trafficLevel(flights.length),
    nearest: flights[0] || null,
    top5: flights.slice(0, 5),
    breakdown: counts,
    flights,
    dataNotes: {
      route:
        `Airports and leg times come from OpenSky ADS-B estimates, not airline schedules. ` +
        `“ADS-B leg” is first/last contact for this track segment, not gate departure or predicted landing. ` +
        `Route enrichment runs for the closest ${ROUTE_ENRICH_MAX} aircraft (set OPENSKY_ROUTE_ENRICH_MAX to change).`,
    },
  };
}

module.exports = { getInsights, classifyAltitude, trafficLevel };
