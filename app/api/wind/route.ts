import { NextResponse } from "next/server";
import { CACHE, FIRE_CENTROID, TZ } from "@/lib/constants";
import { compass } from "@/lib/format";
import type { Envelope, WindData, WindHour } from "@/lib/types";

export const revalidate = 900; // 15 min

/** Bordeaux city centre — where we sample smoke as an air-quality proxy. */
const BORDEAUX = { lat: 44.8378, lon: -0.5792 };

const FORECAST_URL =
  `https://api.open-meteo.com/v1/forecast` +
  `?latitude=${FIRE_CENTROID.lat}&longitude=${FIRE_CENTROID.lon}` +
  `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,temperature_2m` +
  `&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,temperature_2m` +
  `&wind_speed_unit=kmh&timezone=${encodeURIComponent(TZ)}`;

const AIR_URL =
  `https://air-quality-api.open-meteo.com/v1/air-quality` +
  `?latitude=${BORDEAUX.lat}&longitude=${BORDEAUX.lon}` +
  `&current=pm2_5,pm10&timezone=${encodeURIComponent(TZ)}`;

/**
 * Turn a wind vector into the sentence that actually matters: which way is the
 * fire being pushed, and what is in that direction.
 *
 * Open-Meteo reports the direction the wind comes FROM, so the fire runs
 * toward `from + 180`. The fire sits on the coast at ~44.75 N, -1.20 E: the
 * Atlantic and the Cap Ferret spit are west of it, the Landes pine massif east.
 */
function reading(fromDeg: number, speed: number, gust: number, rh: number | null): string {
  const toward = (fromDeg + 180) % 360;
  const src = compass(fromDeg);

  // Where the fire is driven, in terms of what is actually at risk.
  let target: string;
  if (toward >= 45 && toward < 135) {
    target =
      "vers l'intérieur des terres, sur le massif forestier landais";
  } else if (toward >= 135 && toward < 225) {
    target = "vers le sud, en direction du bassin d'Arcachon et de Lège";
  } else if (toward >= 225 && toward < 315) {
    target =
      "vers la côte et les zones évacuées du Cap Ferret";
  } else {
    target = "vers le nord, en direction de Lacanau";
  }

  // Wind strength dominates rate of spread; gust factor signals erratic
  // behaviour that makes a flank run without warning.
  let force: string;
  if (speed < 10) force = "Vent faible";
  else if (speed < 20) force = "Vent modéré";
  else if (speed < 35) force = "Vent soutenu";
  else force = "Vent fort";

  const parts = [
    `${force} de ${src} (${Math.round(speed)} km/h) : feu poussé ${target}.`,
  ];

  if (gust >= speed * 1.5 && gust >= 30) {
    parts.push(
      `Rafales à ${Math.round(gust)} km/h — sautes de feu et reprises de flanc possibles.`,
    );
  }

  if (rh !== null && rh <= 30) {
    parts.push(`Humidité ${Math.round(rh)} % — végétation très sèche.`);
  }

  return parts.join(" ");
}

/**
 * Current Europe/Paris wall-clock hour as `YYYY-MM-DDTHH`, matching the shape
 * of Open-Meteo's unzoned hourly timestamps so the two sort together.
 * en-CA gives ISO-ordered date parts, which is the whole point of using it.
 */
function parisHourKey(now = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  // Intl can emit "24" for midnight in some ICU versions; normalise it.
  const hh = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hh}`;
}

export async function GET() {
  const fetchedAt = new Date().toISOString();

  try {
    const res = await fetch(FORECAST_URL, {
      next: { revalidate: CACHE.meteo },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();

    const cur = j.current ?? {};
    const h = j.hourly ?? {};
    const times: string[] = h.time ?? [];

    // Open-Meteo returns whole days as unzoned Europe/Paris wall-clock strings
    // ("2026-07-23T17:00"). Compare them against the current Paris wall-clock
    // hour built the same way — never against a UTC instant, or the window
    // slips by the server's own offset (Vercel runs UTC, laptops do not).
    let start = times.findIndex((t) => t.slice(0, 13) >= parisHourKey());
    if (start < 0) start = 0;

    const hours: WindHour[] = times
      .slice(start, start + 24)
      .map((t, i) => {
        const k = start + i;
        return {
          time: t,
          speed: h.wind_speed_10m?.[k] ?? 0,
          gust: h.wind_gusts_10m?.[k] ?? 0,
          direction: h.wind_direction_10m?.[k] ?? 0,
          humidity: h.relative_humidity_2m?.[k] ?? 0,
          temp: h.temperature_2m?.[k] ?? 0,
        };
      });

    // Air quality is a bonus signal; never let it fail the wind module.
    let air: WindData["air"] = null;
    try {
      const ares = await fetch(AIR_URL, { next: { revalidate: CACHE.meteo } });
      if (ares.ok) {
        const aj = await ares.json();
        air = {
          pm25: aj.current?.pm2_5 ?? null,
          pm10: aj.current?.pm10 ?? null,
        };
      }
    } catch {
      air = null;
    }

    const speed = cur.wind_speed_10m ?? 0;
    const gust = cur.wind_gusts_10m ?? 0;
    const direction = cur.wind_direction_10m ?? 0;
    const humidity = cur.relative_humidity_2m ?? null;

    const body: Envelope<WindData> = {
      status: "ok",
      fetchedAt,
      data: {
        current: {
          speed,
          gust,
          direction,
          humidity,
          temp: cur.temperature_2m ?? null,
        },
        hours,
        reading: reading(direction, speed, gust, humidity),
        air,
      },
    };

    return NextResponse.json(body, {
      status: 200,
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE.meteo}, stale-while-revalidate=${CACHE.meteo * 2}`,
      },
    });
  } catch (e) {
    const body: Envelope<WindData> = {
      status: "down",
      fetchedAt,
      error: (e as Error).message || "Open-Meteo injoignable",
      data: null,
    };
    return NextResponse.json(body, { status: 200 });
  }
}
