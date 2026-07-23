/**
 * Region of interest and the two distinct events. These are deliberately kept
 * apart: the ACTIVE fire near Lège-Cap-Ferret is what we track; Bordeaux-
 * Mérignac (BOD) is only an air-traffic anchor, its 21 July fire is RESOLVED.
 */

export const BBOX = {
  lonMin: -1.45,
  latMin: 44.4,
  lonMax: -0.4,
  latMax: 45.1,
} as const;

/** `lon,lat,lon,lat` — the order NASA FIRMS wants. */
export const FIRMS_AREA = `${BBOX.lonMin},${BBOX.latMin},${BBOX.lonMax},${BBOX.latMax}`;

/** Approximate centre of the active wildfire. */
export const FIRE_CENTROID = { lat: 44.75, lon: -1.2 } as const;

/** Bordeaux-Mérignac airport — air-traffic anchor only. */
export const BOD = { lat: 44.828, lon: -0.715, icao: "LFBD", iata: "BOD" } as const;

/** Radius (km) and ceiling (m) used to count BOD approach/departure traffic. */
export const BOD_RADIUS_KM = 10;
export const BOD_CEILING_M = 3000;

export const TZ = "Europe/Paris";

/**
 * Sécurité Civile firefighting callsign prefixes. A PELICAN shuttling between
 * the Arcachon basin and the fire line is the single most informative signal
 * on the map, so these get pinned and rendered in accent.
 */
export const FIREFIGHTER_PREFIXES = [
  { prefix: "PELICAN", type: "Canadair CL-415", role: "BOMBARDIER D'EAU" },
  { prefix: "MILAN", type: "Dash 8 Q400MR", role: "BOMBARDIER D'EAU" },
  { prefix: "DRAGON", type: "Hélicoptère", role: "HÉLICOPTÈRE" },
  // Beechcraft King Air recon birds that lead the bomber packs.
  { prefix: "BENGAL", type: "Beech King Air", role: "RECONNAISSANCE" },
] as const;

/**
 * ICAO type codes for firefighting airframes, used when the provider reports a
 * type. Callsign matching alone misses contracted operators: on this fire the
 * Air Tractors were working the fire line as TRACTA/TRACTC/TRACKE, which match
 * no Sécurité Civile prefix, but their AT8T type gives them away.
 * Callsign remains authoritative where both are available.
 */
export const FIREFIGHTER_TYPES: Record<string, { type: string; role: string }> = {
  AT8T: { type: "Air Tractor AT-802", role: "BOMBARDIER D'EAU" },
  AT802: { type: "Air Tractor AT-802", role: "BOMBARDIER D'EAU" },
  A802: { type: "Air Tractor AT-802", role: "BOMBARDIER D'EAU" },
  CL41: { type: "Canadair CL-415", role: "BOMBARDIER D'EAU" },
  CL2T: { type: "Canadair CL-215T", role: "BOMBARDIER D'EAU" },
  CL21: { type: "Canadair CL-215", role: "BOMBARDIER D'EAU" },
  DH8D: { type: "Dash 8 Q400MR", role: "BOMBARDIER D'EAU" },
  S64: { type: "Erickson Air-Crane", role: "HÉLICOPTÈRE" },
};

export const CACHE = {
  firms: 600, // 10 min — satellites pass a few times daily
  meteo: 900, // 15 min
  opensky: 60, // 60 s — anonymous access is credit-limited
} as const;
