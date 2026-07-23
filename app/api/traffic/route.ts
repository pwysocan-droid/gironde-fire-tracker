import { NextResponse } from "next/server";
import {
  BBOX,
  BOD,
  BOD_CEILING_M,
  BOD_RADIUS_KM,
  CACHE,
  FIREFIGHTER_PREFIXES,
} from "@/lib/constants";
import { haversineKm } from "@/lib/format";
import type { Aircraft, Envelope, TrafficData } from "@/lib/types";

// Anonymous OpenSky is credit-limited; never cache shorter than this.
export const revalidate = 60;

const STATES_URL =
  `https://opensky-network.org/api/states/all` +
  `?lamin=${BBOX.latMin}&lomin=${BBOX.lonMin}&lamax=${BBOX.latMax}&lomax=${BBOX.lonMax}`;

const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

/**
 * OpenSky's `states` rows are positional arrays, not objects. Indices per the
 * published schema — naming them here keeps the parse readable.
 */
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

/** Cached OAuth2 token, kept in module scope across warm invocations. */
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

/**
 * Match Sécurité Civile callsigns. These are the aircraft actually fighting the
 * fire — a PELICAN shuttling between the Arcachon basin and the fire line is
 * the single most informative mark on the map, so they get pinned and drawn in
 * accent while everything else stays a neutral triangle.
 */
function classify(callsign: string): Aircraft["firefighter"] {
  const cs = callsign.trim().toUpperCase();
  for (const f of FIREFIGHTER_PREFIXES) {
    if (cs.startsWith(f.prefix)) return { type: f.type, role: f.role };
  }
  return null;
}

export async function GET() {
  const fetchedAt = new Date().toISOString();

  try {
    const bearer = await getToken();
    const res = await fetch(STATES_URL, {
      next: { revalidate: CACHE.opensky },
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
    });

    if (res.status === 429) throw new Error("quota OpenSky dépassé");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const j = await res.json();
    const states: unknown[][] = Array.isArray(j?.states) ? j.states : [];

    const aircraft: Aircraft[] = [];
    for (const s of states) {
      const lat = s[I.latitude] as number | null;
      const lon = s[I.longitude] as number | null;
      if (typeof lat !== "number" || typeof lon !== "number") continue;

      const callsign = ((s[I.callsign] as string) ?? "").trim();

      aircraft.push({
        icao24: (s[I.icao24] as string) ?? "",
        callsign: callsign || "—",
        lat,
        lon,
        altitude: (s[I.baroAltitude] as number | null) ?? null,
        velocity: (s[I.velocity] as number | null) ?? null,
        track: (s[I.trueTrack] as number | null) ?? null,
        verticalRate: (s[I.verticalRate] as number | null) ?? null,
        onGround: Boolean(s[I.onGround]),
        country: (s[I.originCountry] as string) ?? "",
        firefighter: classify(callsign),
      });
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
  } catch (e) {
    const body: Envelope<TrafficData> = {
      status: "down",
      fetchedAt,
      error: (e as Error).message || "OpenSky injoignable",
      data: null,
    };
    return NextResponse.json(body, { status: 200 });
  }
}
