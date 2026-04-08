# Airspace Insights Tool

## Overview
A Node.js CLI tool that fetches real-time flight data from the OpenSky Network API and provides insights about air traffic around a given geographic point.

## Architecture

```
airspace-insights-tool/
├── app.js              # Main entry point — CLI parsing, API call, display
├── utils/
│   └── distance.js     # Haversine formula & bounding box helper
├── .env                # API credentials (not committed)
├── .gitignore
├── credentials.json    # Raw API credentials (not committed)
├── package.json
└── project.md          # This file
```

## How It Works

1. **Input**: User provides latitude, longitude, and radius (km) as CLI arguments.
2. **Bounding Box**: A geographic bounding box is computed around the center point to limit the API query — this reduces data transfer and avoids scanning the entire globe.
3. **API Call**: The tool queries `GET /api/states/all` on OpenSky with bounding box parameters and basic authentication.
4. **Haversine Filter**: Each returned flight is checked with the Haversine formula to confirm it falls within the exact circular radius (the API returns a rectangular bounding box, so some flights outside the circle are trimmed).
5. **Classification**: Flights are classified by barometric altitude:
   - **Landing**: below 3,000 m
   - **Mid-flight**: 3,000–10,000 m
   - **Cruising**: above 10,000 m
6. **Output**: A formatted report showing total count, nearest flight, top 5 closest, phase breakdown, and traffic level.

## API Reference
- Endpoint: `https://opensky-network.org/api/states/all`
- Auth: Basic auth with OpenSky client credentials
- Docs: https://openskynetwork.github.io/opensky-api/rest.html

## Setup & Run

```bash
# Install dependencies
npm install

# Run the tool (example: Delhi, 100 km radius)
node app.js 28.6139 77.2090 100

# Run the tool (example: London Heathrow, 50 km radius)
node app.js 51.4700 -0.4543 50
```

## Dependencies
- **axios** — HTTP client for API requests
- **dotenv** — loads `.env` credentials into `process.env`
