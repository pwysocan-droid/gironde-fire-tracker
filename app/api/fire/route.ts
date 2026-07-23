import { NextResponse } from "next/server";
import { CACHE, FIRMS_AREA } from "@/lib/constants";
import type { Detection, Envelope, FireData } from "@/lib/types";

export const revalidate = 600; // 10 min

/**
 * NASA FIRMS active-fire detections for the Gironde bbox, merged across three
 * sensors. Key stays server-side. Sensors are fetched independently so one
 * failing sensor degrades resolution rather than killing the module.
 */

const SENSORS = [
  { api: "VIIRS_NOAA20_NRT", id: "VIIRS_NOAA20" },
  { api: "VIIRS_NOAA21_NRT", id: "VIIRS_NOAA21" },
  { api: "MODIS_NRT", id: "MODIS" },
] as const;

/** Days of history to request. 2 gives us "today + yesterday" for the buckets. */
const DAYS = 2;

/**
 * VIIRS reports confidence as low/nominal/high; MODIS as 0–100. Normalise to a
 * single 0–100 scale so the two can be filtered together.
 */
function normaliseConfidence(raw: string): number {
  const t = raw.trim().toLowerCase();
  if (t === "l") return 20;
  if (t === "n") return 60;
  if (t === "h") return 90;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/**
 * FIRMS gives acq_date `YYYY-MM-DD` and acq_time as an HHMM integer that drops
 * leading zeros — "105" means 01:05 UTC, not 10:50. Pad before slicing.
 */
function toIsoUtc(acqDate: string, acqTime: string): string | null {
  const hhmm = acqTime.trim().padStart(4, "0");
  const iso = `${acqDate.trim()}T${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}:00Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function parseCsv(csv: string, sensorId: Detection["sensor"]): Detection[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  const cols = lines[0].split(",").map((c) => c.trim());
  const idx = (name: string) => cols.indexOf(name);

  const iLat = idx("latitude");
  const iLon = idx("longitude");
  // VIIRS uses bright_ti4, MODIS uses brightness.
  const iBright = idx("bright_ti4") !== -1 ? idx("bright_ti4") : idx("brightness");
  const iFrp = idx("frp");
  const iDate = idx("acq_date");
  const iTime = idx("acq_time");
  const iConf = idx("confidence");
  const iSat = idx("satellite");
  const iDn = idx("daynight");

  if (iLat === -1 || iLon === -1 || iDate === -1 || iTime === -1) return [];

  const out: Detection[] = [];
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(",");
    if (f.length < cols.length) continue;

    const lat = Number(f[iLat]);
    const lon = Number(f[iLon]);
    const acquiredAt = toIsoUtc(f[iDate], f[iTime]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !acquiredAt) continue;

    out.push({
      lat,
      lon,
      brightness: iBright === -1 ? 0 : Number(f[iBright]) || 0,
      frp: iFrp === -1 ? 0 : Number(f[iFrp]) || 0,
      acquiredAt,
      confidence: iConf === -1 ? 0 : normaliseConfidence(f[iConf]),
      sensor: sensorId,
      satellite: iSat === -1 ? "" : f[iSat].trim(),
      daynight: iDn !== -1 && f[iDn].trim() === "N" ? "N" : "D",
    });
  }
  return out;
}

export async function GET() {
  const fetchedAt = new Date().toISOString();
  const key = process.env.FIRMS_MAP_KEY;

  if (!key) {
    const body: Envelope<FireData> = {
      status: "down",
      fetchedAt,
      error: "FIRMS_MAP_KEY absente",
      data: null,
    };
    return NextResponse.json(body, { status: 200 });
  }

  const sensorsOk: string[] = [];
  const sensorsFailed: string[] = [];

  const results = await Promise.all(
    SENSORS.map(async (s) => {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${s.api}/${FIRMS_AREA}/${DAYS}`;
      try {
        const res = await fetch(url, {
          next: { revalidate: CACHE.firms },
          headers: { Accept: "text/csv" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        // An invalid key returns a 200 with an HTML/plain-text error body.
        if (!text.startsWith("latitude") && !text.startsWith("country_id")) {
          throw new Error("réponse inattendue");
        }
        sensorsOk.push(s.id);
        return parseCsv(text, s.id);
      } catch {
        sensorsFailed.push(s.id);
        return [] as Detection[];
      }
    }),
  );

  if (sensorsOk.length === 0) {
    const body: Envelope<FireData> = {
      status: "down",
      fetchedAt,
      error: "aucun capteur n'a répondu",
      data: null,
    };
    return NextResponse.json(body, { status: 200 });
  }

  const detections = results.flat();

  // Drop the lowest-confidence VIIRS returns; they are mostly warm bare soil
  // and industrial heat, and at this bbox they add noise around the refineries.
  const kept = detections.filter((d) => d.confidence >= 30 || d.frp >= 5);

  const now = Date.now();
  const H6 = 6 * 3600 * 1000;
  const H24 = 24 * 3600 * 1000;

  let last6h = 0;
  let last24h = 0;
  let totalFrp = 0;
  let newest = 0;

  // FRP-weighted centroid over the last 24 h — the fire's current heart.
  let wSum = 0;
  let latSum = 0;
  let lonSum = 0;

  for (const d of kept) {
    const t = Date.parse(d.acquiredAt);
    const age = now - t;
    totalFrp += d.frp;
    if (t > newest) newest = t;
    if (age <= H6) last6h++;
    if (age <= H24) {
      last24h++;
      const w = Math.max(d.frp, 0.1);
      wSum += w;
      latSum += d.lat * w;
      lonSum += d.lon * w;
    }
  }

  kept.sort((a, b) => Date.parse(b.acquiredAt) - Date.parse(a.acquiredAt));

  const body: Envelope<FireData> = {
    status: "ok",
    fetchedAt,
    data: {
      detections: kept,
      last6h,
      last24h,
      totalFrp: Math.round(totalFrp * 10) / 10,
      newestAt: newest > 0 ? new Date(newest).toISOString() : null,
      sensorsOk,
      sensorsFailed,
      centroid:
        wSum > 0 ? { lat: latSum / wSum, lon: lonSum / wSum } : null,
    },
  };

  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Cache-Control": `public, s-maxage=${CACHE.firms}, stale-while-revalidate=${CACHE.firms * 2}`,
    },
  });
}
