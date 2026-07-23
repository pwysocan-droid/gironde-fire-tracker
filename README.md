# SUIVI FEU / GIRONDE

Single-page fire situation tracker for the active wildfire near
Lège-Cap-Ferret, Gironde (July 2026). Live satellite detections, wind, and
air traffic over one region of interest.

**Production:** https://gironde-fire-tracker.vercel.app

## Two distinct events

These are deliberately kept apart in the code and the UI:

1. **ACTIVE** — wildfire near Lège-Cap-Ferret (~44.75°N, -1.20°E). This is the
   fire being tracked.
2. **RESOLVED** — the 21 July fire at Bordeaux-Mérignac airport (BOD,
   44.828°N, -0.715°E). BOD appears on the map only as an air-traffic anchor
   (a plain ring), never as a fire feature.

Region of interest: lat 44.40 → 45.10, lon -1.45 → -0.40.

## Stack

Next.js (App Router) + TypeScript on Vercel. MapLibre GL with Carto Positron
raster tiles. Hand-rolled CSS — no component library, no gradients, no
shadows, no rounded corners. `maplibre-gl` is the only dependency beyond the
framework itself.

## Data sources

Every third-party API is proxied through a Next.js Route Handler. Nothing is
called from the client, so no key ever reaches the browser.

| Module | Route | Source | Cache |
| --- | --- | --- | --- |
| 01 FEU | `/api/fire` | NASA FIRMS (VIIRS NOAA-20, NOAA-21, MODIS) | 10 min |
| 02 VENT | `/api/wind` | Open-Meteo forecast + air quality | 15 min |
| 03 TRAFIC AÉRIEN | `/api/traffic` | adsb.lol (primary), OpenSky (fallback) | 60 s |

Each module fails independently: a source going down greys out only its own
frame and shows `SOURCE INDISPONIBLE`, and the last good payload stays on
screen rather than blanking. It never takes the page with it.

## Environment

Copy `.env.local.example` to `.env.local`.

- `FIRMS_MAP_KEY` — **required** for module 01. Free, instant email signup at
  https://firms.modaps.eosdis.nasa.gov/api/. Also set it in Vercel under
  Project Settings → Environment Variables.
- `OPENSKY_CLIENT_ID` / `OPENSKY_CLIENT_SECRET` — optional, and only useful
  where OpenSky is reachable (see below). Anonymous access works but is
  limited to roughly 400 credits/day.

Open-Meteo and adsb.lol need no key.

```bash
npm install
npm run dev
```

Note: `.npmrc` pins this project to the public npm registry, since the
machine default points at an internal registry that requires VPN.

### Why module 03 is not on OpenSky

OpenSky was the brief's air-traffic source, and it works from a laptop. It
does not work from Vercel: every OpenSky host TCP-times-out from Vercel's
egress (`UND_ERR_CONNECT_TIMEOUT`, ~10.5 s) while Open-Meteo answers in 83 ms
from the same function. OAuth2 credentials cannot fix it — `auth.opensky-
network.org` is unreachable too, so no token can be obtained — and calling it
from the browser instead is blocked by OpenSky's CORS policy, which allows
only its own origin.

So `/api/traffic` uses **adsb.lol** (free, no key, community ADS-B) as the
primary source and falls back to OpenSky automatically where it is reachable.
The live module header names whichever provider answered. adsb.lol also
reports the ICAO airframe type, which OpenSky does not.


## Notes on the data

- FIRMS returns two different CSV schemas — VIIRS reports `bright_ti4` and a
  categorical `l`/`n`/`h` confidence, MODIS reports `brightness` and a 0–100
  confidence. Both are normalised onto one scale.
- FIRMS `acq_time` is an HHMM integer with leading zeros dropped, so `105`
  means 01:05 UTC. It is padded before parsing.
- Detections below 30 confidence are dropped unless FRP ≥ 5, which cuts most
  bare-soil and industrial false positives around the estuary.
- Open-Meteo returns unzoned Europe/Paris wall-clock timestamps; the 24 h
  strip is aligned against a Paris wall-clock key, never a UTC instant.
- Firefighting aircraft are flagged by Sécurité Civile callsign prefix
  (PELICAN, MILAN, DRAGON, BENGAL) *and*, where the provider reports one, by
  airframe type. Callsign alone is not enough: on this fire the Air Tractor
  AT-802 water bombers were working the fire line as TRACTA/TRACTC/TRACKE,
  which match no Sécurité Civile prefix.
- Wind direction is reported as the direction wind comes *from*. The fire is
  driven toward `direction + 180`, which is what the arrow and the
  plain-language reading both show.
- Timestamps are stored UTC and displayed Europe/Paris throughout.

## Attribution

NASA FIRMS · Open-Meteo · adsb.lol · OpenSky Network · basemap © OpenStreetMap
contributors © CARTO. FIRMS and OpenSky both require attribution; all sources
are credited in the page footer.
