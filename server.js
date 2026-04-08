require("dotenv").config();
const express = require("express");
const path = require("path");
const axios = require("axios");
const { getInsights } = require("./utils/flights");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

let countriesCache = null;

app.get("/api/countries", async (req, res) => {
  if (countriesCache) return res.json(countriesCache);
  try {
    const { data } = await axios.get(
      "https://restcountries.com/v3.1/all?fields=name,cca2,latlng,area",
      { timeout: 25000 },
    );
    countriesCache = data
      .filter((c) => Array.isArray(c.latlng) && c.latlng.length >= 2)
      .map((c) => ({
        code: c.cca2,
        name: c.name.common,
        lat: c.latlng[0],
        lon: c.latlng[1],
        area: typeof c.area === "number" ? c.area : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    res.json(countriesCache);
  } catch (err) {
    console.error("GET /api/countries:", err.message);
    res.status(502).json({ error: "Could not load country list" });
  }
});

// Warm-up endpoint — no-op, just keeps the function alive
app.get("/api/ping", (req, res) => res.json({ ok: true }));

app.get("/api/flights", async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const radius = parseFloat(req.query.radius);

  if ([lat, lon, radius].some(Number.isNaN)) {
    return res.status(400).json({ error: "lat, lon, and radius must be valid numbers" });
  }
  if (radius <= 0 || radius > 500) {
    return res.status(400).json({ error: "radius must be between 1 and 500 km" });
  }

  try {
    const insights = await getInsights(lat, lon, radius);
    res.json(insights);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.statusText || err.message;
    res.status(status).json({ error: message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Airspace Insights running at http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use (another process is listening).`,
    );
    console.error(
      "Stop that server (close the terminal or end the node process), or use a different port, e.g.:",
    );
    console.error("  PowerShell:  $env:PORT=3001; npm run web");
    console.error("  cmd.exe:     set PORT=3001 && npm run web");
    process.exit(1);
  }
  throw err;
});
