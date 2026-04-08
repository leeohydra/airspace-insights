const EARTH_RADIUS_KM = 6371;

/**
 * Convert degrees to radians.
 */
function toRadians(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Calculate distance between two lat/lng points using the Haversine formula.
 * Returns distance in kilometers.
 */
function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Compute a bounding box around a center point for API query filtering.
 * Returns { lamin, lamax, lomin, lomax }.
 */
function boundingBox(lat, lon, radiusKm) {
  const dLat = radiusKm / EARTH_RADIUS_KM;
  const dLon = radiusKm / (EARTH_RADIUS_KM * Math.cos(toRadians(lat)));

  const dLatDeg = dLat * (180 / Math.PI);
  const dLonDeg = dLon * (180 / Math.PI);

  return {
    lamin: lat - dLatDeg,
    lamax: lat + dLatDeg,
    lomin: lon - dLonDeg,
    lomax: lon + dLonDeg,
  };
}

module.exports = { haversine, boundingBox };
