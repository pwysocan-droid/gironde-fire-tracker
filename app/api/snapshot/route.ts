import { NextRequest, NextResponse } from "next/server";
import { GET as fireGET } from "@/app/api/fire/route";
import { GET as windGET } from "@/app/api/wind/route";
import { GET as trafficGET } from "@/app/api/traffic/route";
import { insertRow, supabaseConfigured } from "@/lib/supabase";
import type { Envelope, FireData, TrafficData, WindData } from "@/lib/types";

/**
 * Writes one aggregate row to Supabase. Called every 15 minutes by a
 * Supabase pg_cron job (Vercel Hobby crons only fire daily, so the database
 * schedules its own feeding):
 *
 *   select cron.schedule('snapshot-gironde', '*_/15 * * * *', $$
 *     select net.http_post(
 *       url     := 'https://gironde-fire-tracker.vercel.app/api/snapshot',
 *       headers := jsonb_build_object('Authorization', 'Bearer <SNAPSHOT_SECRET>')
 *     ) $$);
 *
 * Guarded by SNAPSHOT_SECRET so strangers can't write rows or burn quota.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.SNAPSHOT_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }

  if (!supabaseConfigured()) {
    return NextResponse.json(
      { error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absentes" },
      { status: 503 },
    );
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
    return NextResponse.json(
      { error: `FIRMS indisponible: ${fire.error ?? "?"}` },
      { status: 502 },
    );
  }

  await insertRow("gironde_snapshots", {
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
  });

  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
