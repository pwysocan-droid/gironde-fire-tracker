import { NextResponse } from "next/server";
import {
  BBOX,
  BOD,
  BOD_CEILING_M,
  BOD_RADIUS_KM,
  CACHE,
  FIREFIGHTER_PREFIXES,
  FIREFIGHTER_TYPES,
} from "@/lib/constants";
import { haversineKm } from "@/lib/format";
import type { Aircraft, Envelope, TrafficData } from "@/lib/types";

export const revalidate = 60;

/**
 * Live aircraft over the region of interest.
 *
 * Provider note: OpenSky was the brief's source, but every OpenSky host —
 * including auth.opensky-network.org — TCP-times-out from Vercel's egress
 * (UND_ERR_CONNECT_TIMEOUT, ~10.5 s) while other upstreams answer in under
 * 100 ms from the same function. OAuth credentials cannot fix that: the auth
 * host is unreachable too, and OpenSky's CORS policy (allow-origin: its own
 * origin) rules out calling it from the browser instead.
 *
 * So adsb.lol — free, no key, community ADS-B — is the primary source, with
 * OpenSky kept as an automatic fallback for environments that *can* reach it
 * (local development does). Whichever answers is reported as `provider`.
 */

const ADSB_CENTER = {
  lat: (BBOX.latMin + BBOX.latMax) / 2,
  lon: (BBOX.lonMin + BBOX.lonMax) / 2,
};
/** Nautical miles; comfortably covers the bbox diagonal (~57 km), then filtered. */
const ADSB_RADIUS_NM = 40;

const ADSB_URL = `https://api.adsb.lol/v2/point/${ADSB_CENTER.lat.toFixed(3)}/${ADSB_CENTER.lon.toFixed(3)}/${ADSB_RADIUS_NM}`;

const OPENSKY_URL =
  `https://opensky-network.org/api/states/all` +
  `?lamin=${BBOX.latMin}&lomin=${BBOX.lonMin}&lamax=${BBOX.latMax}&lomax=${BBOX.lonMax}`;

const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

const FT_TO_M = 0.3048;
const KT_TO_MS = 0.514444;
const FTMIN_TO_MS = 0.00508;

/**
 * Match Sécurité Civile callsigns. These are the aircraft actually fighting the
 * fire — a PELICAN shuttling between the Arcachon basin and the fire line is
 * the single most informative mark on the map, so they get pinned and drawn in
 * accent while everything else stays a neutral triangle.
 */
function classify(
  callsign: string,
  typeCode?: string,
): Aircraft["firefighter"] {
  const cs = callsign.trim().toUpperCase();
  for (const f of FIREFIGHTER_PREFIXES) {
    if (cs.startsWith(f.prefix)) return { type: f.type, role: f.role };
  }
  // Fall back to the airframe when the provider reports one: contracted
  // bombers fly under ordinary callsigns and would otherwise read as airline
  // traffic sitting implausibly low over the fire.
  const t = (typeCode ?? "").trim().toUpperCase();
  if (t && FIREFIGHTER_TYPES[t]) return FIREFIGHTER_TYPES[t];
  return null;
}

function inBbox(lat: number, lon: number): boolean {
  return (
    lat >= BBOX.latMin &&
    lat <= BBOX.latMax &&
    lon >= BBOX.lonMin &&
    lon <= BBOX.lonMax
  );
}

/* ---------- primary: adsb.lol ---------- */

type AdsbAc = {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  lat?: number;
  lon?: number;
  /** Feet, or the literal string "ground". */
  alt_baro?: number | string;
  /** Ground speed, knots. */
  gs?: number;
  track?: number;
  /** Feet per minute. */
  baro_rate?: number;
};

async function fromAdsb(): Promise<Aircraft[]> {
  const res = await fetch(ADSB_URL, {
    next: { revalidate: CACHE.opensky },
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`adsb.lol HTTP ${res.status}`);

  const j = (await res.json()) as { ac?: AdsbAc[] };
  const list = Array.isArray(j.ac) ? j.ac : [];

  const out: Aircraft[] = [];
  for (const a of list) {
    if (typeof a.lat !== "number" || typeof a.lon !== "number") continue;
    if (!inBbox(a.lat, a.lon)) continue;

    // alt_baro is "ground" for aircraft on the surface, a number otherwise.
    const onGround = a.alt_baro === "ground";
    const altFt = typeof a.alt_baro === "number" ? a.alt_baro : null;
    const callsign = (a.flight ?? "").trim();

    out.push({
      icao24: (a.hex ?? "").trim(),
      callsign: callsign || "—",
      lat: a.lat,
      lon: a.lon,
      altitude: altFt !== null ? altFt * FT_TO_M : null,
      velocity: typeof a.gs === "number" ? a.gs * KT_TO_MS : null,
      track: typeof a.track === "number" ? a.track : null,
      verticalRate:
        typeof a.baro_rate === "number" ? a.baro_rate * FTMIN_TO_MS : null,
      onGround,
      descriptor: (a.t ?? a.r ?? "").trim(),
      firefighter: classify(callsign, a.t),
    });
  }
  return out;
}

/* ---------- fallback: OpenSky ---------- */

/** OpenSky `states` rows are positional arrays; name the indices once. */
const I = {
  icao24: 0,
  callsign: 1,
  originCountry: 2,
  longitude: 5,
  latitude: 6,
  baroAltitude: 7,
  onGround: 8,
  velocity: 9,
  trueTrack: 10,
  verticalRate: 11,
} as const;

let token: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  const id = process.env.OPENSKY_CLIENT_ID;
  const secret = process.env.OPENSKY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (token && Date.now() < token.expiresAt - 30_000) return token.value;

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: id,
        client_secret: secret,
      }),
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = await res.json();
    if (!j.access_token) return null;
    token = {
      value: j.access_token,
      expiresAt: Date.now() + (j.expires_in ?? 1800) * 1000,
    };
    return token.value;
  } catch {
    return null;
  }
}

async function fromOpenSky(): Promise<Aircraft[]> {
  const bearer = await getToken();
  const res = await fetch(OPENSKY_URL, {
    next: { revalidate: CACHE.opensky },
    // Short: this is the fallback, and an unreachable OpenSky must not hold
    // the whole module hostage for undici's 10.5 s default connect timeout.
    signal: AbortSignal.timeout(6000),
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  });

  if (res.status === 429) throw new Error("quota OpenSky dépassé");
  if (!res.ok) throw new Error(`OpenSky HTTP ${res.status}`);

  const j = await res.json();
  const states: unknown[][] = Array.isArray(j?.states) ? j.states : [];

  const out: Aircraft[] = [];
  for (const s of states) {
    const lat = s[I.latitude] as number | null;
    const lon = s[I.longitude] as number | null;
    if (typeof lat !== "number" || typeof lon !== "number") continue;

    const callsign = ((s[I.callsign] as string) ?? "").trim();
    out.push({
      icao24: (s[I.icao24] as string) ?? "",
      callsign: callsign || "—",
      lat,
      lon,
      altitude: (s[I.baroAltitude] as number | null) ?? null,
      velocity: (s[I.velocity] as number | null) ?? null,
      track: (s[I.trueTrack] as number | null) ?? null,
      verticalRate: (s[I.verticalRate] as number | null) ?? null,
      onGround: Boolean(s[I.onGround]),
      descriptor: ((s[I.originCountry] as string) ?? "").trim(),
      firefighter: classify(callsign),
    });
  }
  return out;
}

function describe(e: unknown): string {
  const err = e as Error & { cause?: { code?: string; message?: string } };
  const cause = err.cause?.code ?? err.cause?.message;
  return cause ? `${err.message} (${cause})` : err.message || "erreur inconnue";
}

export async function GET() {
  const fetchedAt = new Date().toISOString();
  const problems: string[] = [];

  let aircraft: Aircraft[] | null = null;
  let provider = "";

  for (const p of [
    { name: "adsb.lol", run: fromAdsb },
    { name: "OpenSky", run: fromOpenSky },
  ]) {
    try {
      aircraft = await p.run();
      provider = p.name;
      break;
    } catch (e) {
      problems.push(`${p.name}: ${describe(e)}`);
    }
  }

  if (!aircraft) {
    const body: Envelope<TrafficData> = {
      status: "down",
      fetchedAt,
      error: problems.join(" · "),
      data: null,
    };
    return NextResponse.json(body, { status: 200 });
  }

  // Firefighters first, then by altitude descending — the table should read
  // top-down as "what matters most".
  aircraft.sort((a, b) => {
    if (!!a.firefighter !== !!b.firefighter) return a.firefighter ? -1 : 1;
    return (b.altitude ?? -1) - (a.altitude ?? -1);
  });

  const bodTraffic = aircraft.filter(
    (a) =>
      !a.onGround &&
      (a.altitude ?? Infinity) < BOD_CEILING_M &&
      haversineKm(a.lat, a.lon, BOD.lat, BOD.lon) <= BOD_RADIUS_KM,
  ).length;

  const body: Envelope<TrafficData> = {
    status: "ok",
    fetchedAt,
    data: {
      aircraft,
      provider,
      firefighterCount: aircraft.filter((a) => a.firefighter).length,
      bodTraffic,
      total: aircraft.length,
    },
  };

  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": `public, s-maxage=${CACHE.opensky}, stale-while-revalidate=${CACHE.opensky * 4}`,
    },
  });
}
