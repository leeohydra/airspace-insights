require("dotenv").config();
const { getInsights } = require("./utils/flights");

// ── CLI argument parsing ────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.length < 3) {
  console.log("Usage: node app.js <latitude> <longitude> <radius_km>");
  console.log("Example: node app.js 28.6139 77.2090 100");
  process.exit(1);
}

const LAT = parseFloat(args[0]);
const LON = parseFloat(args[1]);
const RADIUS_KM = parseFloat(args[2]);

if ([LAT, LON, RADIUS_KM].some(Number.isNaN)) {
  console.error("Error: latitude, longitude, and radius must be valid numbers.");
  process.exit(1);
}

// ── Display results ─────────────────────────────────────────────────
function displayResults(r) {
  const divider = "\u2500".repeat(60);

  console.log(divider);
  console.log("  AIRSPACE INSIGHTS REPORT");
  console.log(divider);
  console.log(`  Center      : ${r.center.lat}, ${r.center.lon}`);
  console.log(`  Radius      : ${r.radiusKm} km`);
  console.log(`  Flights     : ${r.totalFlights}`);
  console.log(`  Traffic     : ${r.traffic}`);
  console.log(divider);

  if (r.totalFlights === 0) {
    console.log("  No flights detected in the specified area.\n");
    return;
  }

  const n = r.nearest;
  const utc = (unix) =>
    unix != null
      ? new Date(unix * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC"
      : "N/A";
  console.log("\n  NEAREST FLIGHT");
  console.log(`  Callsign    : ${n.callsign}`);
  console.log(`  ICAO24      : ${n.icao24}`);
  console.log(`  Country     : ${n.country}`);
  console.log(`  Distance    : ${n.distance} km`);
  console.log(`  Altitude    : ${n.altitude != null ? n.altitude + " m" : "N/A"}`);
  console.log(`  Speed       : ${n.velocity != null ? (n.velocity * 3.6).toFixed(1) + " km/h" : "N/A"}`);
  console.log(`  Phase       : ${n.classification}`);
  console.log(`  From (est.) : ${n.estDepartureAirport || "N/A"}`);
  console.log(`  To (est.)   : ${n.estArrivalAirport || "N/A"}`);
  console.log(`  ADS-B leg   : ${utc(n.routeFirstSeen)} → ${utc(n.routeLastSeen)}`);
  console.log(`  Last pos @  : ${utc(n.timePosition)}`);
  console.log(`  Last data @ : ${utc(n.lastContact)}`);

  console.log(`\n${divider}`);
  console.log("  TOP 5 CLOSEST FLIGHTS");
  console.log(divider);
  console.log("  #  Callsign       Distance   Altitude    Phase");
  console.log("  " + "-".repeat(56));

  r.top5.forEach((f, i) => {
    const cs = f.callsign.padEnd(13);
    const dist = (f.distance + " km").padEnd(10);
    const alt = (f.altitude != null ? f.altitude + " m" : "N/A").padEnd(11);
    console.log(`  ${i + 1}  ${cs} ${dist} ${alt} ${f.classification}`);
  });

  console.log(`\n${divider}`);
  console.log("  FLIGHT PHASE BREAKDOWN");
  console.log(divider);
  console.log(`  Landing   (<3000 m)      : ${r.breakdown.landing}`);
  console.log(`  Mid-flight (3000-10000 m): ${r.breakdown["mid-flight"]}`);
  console.log(`  Cruising  (>10000 m)     : ${r.breakdown.cruising}`);
  if (r.breakdown.unknown > 0) {
    console.log(`  Unknown                  : ${r.breakdown.unknown}`);
  }
  console.log();
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  try {
    console.log(`\nFetching flights near (${LAT}, ${LON}) within ${RADIUS_KM} km ...\n`);
    const insights = await getInsights(LAT, LON, RADIUS_KM);
    displayResults(insights);
  } catch (err) {
    if (err.response) {
      console.error(`API error (${err.response.status}): ${err.response.statusText}`);
      if (err.response.status === 401) console.error("Check your credentials in .env");
    } else {
      console.error("Error:", err.message);
    }
    process.exit(1);
  }
}

main();
