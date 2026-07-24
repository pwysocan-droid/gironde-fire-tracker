import { GET as fireGET } from "@/app/api/fire/route";
import { GET as windGET } from "@/app/api/wind/route";
import { GET as trafficGET } from "@/app/api/traffic/route";
import { appendSnapshot, historyConfigured, readHistory } from "./store";
import type {
  Envelope,
  FireData,
  Snapshot,
  TrafficData,
  WindData,
} from "./types";

/**
 * Take one aggregate snapshot if the last one is old enough. Shared between
 * the POST /api/snapshot endpoint (GitHub Actions backstop, every 30 min) and
 * the opportunistic path in /api/history (fires while anyone is watching the
 * page) — the min-interval guard is what makes both triggers safe together.
 */
const MIN_INTERVAL_MS = 12 * 60 * 1000;

export async function takeSnapshot(): Promise<
  { taken: true; at: string } | { taken: false; reason: string }
> {
  if (!historyConfigured()) {
    return { taken: false, reason: "historique non configuré (BLOB_READ_WRITE_TOKEN)" };
  }

  const existing = await readHistory();
  const newest = existing[existing.length - 1];
  if (newest && Date.now() - Date.parse(newest.taken_at) < MIN_INTERVAL_MS) {
    return { taken: false, reason: "instantané récent déjà présent" };
  }

  // Call the sibling route handlers directly — no network hop, and their
  // own fetch caches still apply, so a snapshot never hammers the upstreams.
  const [fire, wind, traffic] = await Promise.all([
    fireGET().then((r) => r.json() as Promise<Envelope<FireData>>),
    windGET().then((r) => r.json() as Promise<Envelope<WindData>>),
    trafficGET().then((r) => r.json() as Promise<Envelope<TrafficData>>),
  ]);

  // Fire is the row's backbone; without it there is nothing worth recording.
  if (fire.status !== "ok" || !fire.data) {
    return { taken: false, reason: `FIRMS indisponible: ${fire.error ?? "?"}` };
  }

  const row: Snapshot = {
    taken_at: new Date().toISOString(),
    detections_6h: fire.data.last6h,
    detections_24h: fire.data.last24h,
    total_frp: fire.data.totalFrp,
    centroid_lat: fire.data.centroid?.lat ?? null,
    centroid_lon: fire.data.centroid?.lon ?? null,
    wind_speed: wind.data?.current.speed ?? null,
    wind_gust: wind.data?.current.gust ?? null,
    wind_dir: wind.data?.current.direction ?? null,
    humidity: wind.data?.current.humidity ?? null,
    pm25: wind.data?.air?.pm25 ?? null,
    firefighters: traffic.data?.firefighterCount ?? null,
  };

  await appendSnapshot(row);
  return { taken: true, at: row.taken_at };
}
