# SPRINT PROMPT — GIRONDE FIRE TRACKER

Paste everything below into Claude Code as the opening prompt.

---

Build a single-page fire situation tracker for the active wildfire near Lège-Cap-Ferret / Gironde, France (July 2026), deployed to Vercel via GitHub. Work in phases; commit at the end of each phase with a clear message so I can roll back.

## CONTEXT

Two distinct events, do not conflate them:
1. ACTIVE: wildfire near Lège-Cap-Ferret (approx 44.75°N, -1.20°E), 2,400+ hectares, mass evacuations, still spreading. This is the fire we track.
2. RESOLVED: July 21 fire at Bordeaux-Mérignac Airport (BOD, 44.828°N, -0.715°E) that suspended flights. BOD matters only as the air-traffic anchor point.

Region of interest bounding box: lat 44.40 → 45.10, lon -1.45 → -0.40 (covers Cap Ferret, the Landes forest edge, Arcachon basin, and BOD).

## STACK

- Next.js (App Router), TypeScript, deployed on Vercel
- No component library. Hand-rolled CSS. No gradients, no shadows, no rounded corners.
- Map: MapLibre GL JS with a free raster/vector basemap (OpenFreeMap or Carto Positron), heavily desaturated to near-monochrome via CSS filter or style JSON so data layers carry all the color
- All external APIs proxied through Next.js Route Handlers (`app/api/*/route.ts`) with `revalidate`-style caching — never call third-party APIs from the client. This hides keys and respects rate limits.

## DATA SOURCES (all free)

### 1. FIRE — NASA FIRMS
- Endpoint: `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_NOAA20_NRT/-1.45,44.40,-0.40,45.10/2`
- Also pull `VIIRS_NOAA21_NRT` and `MODIS_NRT` and merge
- MAP_KEY is free (instant email signup at firms.modaps.eosdis.nasa.gov/api/) — read it from `process.env.FIRMS_MAP_KEY`; create `.env.local.example` and remind me to add it in Vercel project settings
- Parse CSV → JSON: lat, lon, brightness, acq_date, acq_time (UTC), frp (fire radiative power), confidence
- Cache: 10 min (satellites pass a few times daily; no point polling harder)
- Render as map dots sized by FRP, colored by recency (last 6h = accent red, 6–24h = ink at 60%, older = 30%)

### 2. WIND — Open-Meteo (no key needed)
- `https://api.open-meteo.com/v1/forecast?latitude=44.75&longitude=-1.20&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,temperature_2m&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kmh&timezone=Europe%2FParis`
- Cache: 15 min
- Render: (a) a current-conditions block with a wind direction arrow drawn as pure SVG, (b) a 24h forecast strip — direction glyphs + speed/gust numerals, hour by hour. Wind direction is THE critical variable: westerly = fire pushed inland toward forest, easterly = toward the coast/evacuation zones. Compute and display a one-line plain-language reading of this.
- Bonus if time allows: Open-Meteo Air Quality API (`air-quality-api.open-meteo.com`) for PM2.5/PM10 at Bordeaux city — smoke plume proxy.

### 3. AIR TRAFFIC — OpenSky Network
- `https://opensky-network.org/api/states/all?lamin=44.40&lomin=-1.45&lamax=45.10&lomax=-0.40`
- Anonymous access is rate-limited (~400 credits/day) — cache the route handler response 60s and poll the client every 60s. If I later register OAuth2 client credentials, read them from env and use authenticated access.
- Parse the states array: callsign, lat, lon, baro_altitude, velocity, true_track, on_ground
- CRITICAL FEATURE: flag Sécurité Civile firefighting aircraft by callsign prefix — `PELICAN` (Canadair CL-415 water bombers), `MILAN` (Dash 8 Q400MR), `DRAGON` (helicopters). Render these in accent red with the callsign labeled; all other traffic as small neutral ink triangles rotated to true_track. A visible PELICAN loop between the Arcachon basin (water pickup) and the fire line is the single most informative signal on the map.
- Secondary: count aircraft on approach/departure at BOD (within ~10 km of 44.828, -0.715 and below 3,000 m) as a rough "is the airport operating normally" indicator.

## LAYOUT — SINGLE SCREEN, THREE-COLUMN GRID

Use my established system: IBM Plex Mono for chrome/data, Barlow Condensed for display; ground #F4F2EC, ink #0A0A08, single accent #E8280A (which happens to be exactly right for a fire tracker — the accent finally means something literal). 2px outer border on the page frame, 1px internal rules, 9px uppercase tracked labels, numbered sections (01 FEU / 02 VENT / 03 TRAFIC AÉRIEN — use French labels, it's a French fire).

- Masthead: title, live UTC+2 clock, data-freshness timestamps per source
- Left column (60%): the map, full height, fire dots + aircraft + a wind barb at the fire centroid
- Right column (40%): stacked numbered modules — 01 fire stats (active detections, total FRP, newest detection age), 02 wind current + 24h strip + plain-language direction reading, 03 aircraft table (callsign, alt, speed, type-flag) with firefighting aircraft pinned to top
- Footer: source attribution (NASA FIRMS, Open-Meteo, OpenSky Network) — FIRMS and OpenSky both require it
- Everything ranged flush-left; the grid does the work. Think Müller-Brockmann doing a NOTAM board, or an Otto Neurath Isotype panel where every mark is countable.

## PHASES

1. Scaffold Next.js + the page frame/grid with static placeholder data, deploy to Vercel immediately so the pipeline is proven
2. FIRMS route handler + fire dots on map + module 01
3. Open-Meteo route handler + module 02 + wind barb on map
4. OpenSky route handler + aircraft layer + module 03 with callsign flagging
5. Polish: freshness indicators, error states per module (a source failing should gray out its module, never blank the page), mobile stack (columns collapse vertically), attribution footer

## RULES

- Each module fails independently — wrap each fetch, show "SOURCE UNAVAILABLE" in that module's frame on error
- No client-side API keys anywhere
- Timestamps: display Europe/Paris, store UTC
- Ask me before adding any dependency beyond maplibre-gl
