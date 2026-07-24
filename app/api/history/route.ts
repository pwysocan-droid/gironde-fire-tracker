import { NextResponse } from "next/server";
import { historyConfigured, readHistory } from "@/lib/store";
import { takeSnapshot } from "@/lib/snapshot";
import { haversineKm } from "@/lib/format";
import type { Envelope, HistoryData } from "@/lib/types";

/**
 * Last 48 h of snapshots, plus a measured spread rate: centroid drift over
 * ~6 h (six hours smooths satellite-pass jitter — consecutive 15-min rows
 * share the same detections between passes, so short-window drift is noise).
 *
 * This route is also the primary snapshot trigger: when the newest row is
 * stale it takes one before answering. Clients poll every 5 min, so history
 * feeds itself while anyone is watching; the GitHub Actions cron is only the
 * backstop for unwatched stretches.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const fetchedAt = new Date().toISOString();

  if (!historyConfigured()) {
    const body: Envelope<HistoryData> = {
      status: "down",
      fetchedAt,
      error: "historique non configuré",
      data: null,
    };
    return NextResponse.json(body, { status: 200 });
  }

  try {
    // Opportunistic snapshot — the min-interval guard inside makes this a
    // no-op most of the time. Its failure must never break reads.
    try {
      await takeSnapshot();
    } catch {
      /* history stays servable */
    }

    const snapshots = await readHistory();

    let spreadKmh: number | null = null;
    let spreadHeading: number | null = null;

    const latest = snapshots[snapshots.length - 1];
    if (latest?.centroid_lat != null && latest.centroid_lon != null) {
      const targetT = Date.parse(latest.taken_at) - 6 * 3600 * 1000;
      const past = snapshots.find(
        (s) =>
          s.centroid_lat != null &&
          Math.abs(Date.parse(s.taken_at) - targetT) <= 3600 * 1000,
      );
      if (past?.centroid_lat != null && past.centroid_lon != null) {
        const hours =
          (Date.parse(latest.taken_at) - Date.parse(past.taken_at)) / 3600000;
        if (hours >= 4) {
          const km = haversineKm(
            past.centroid_lat,
            past.centroid_lon,
            latest.centroid_lat,
            latest.centroid_lon,
          );
          spreadKmh = Math.round((km / hours) * 100) / 100;
          const dLon =
            (latest.centroid_lon - past.centroid_lon) *
            Math.cos((latest.centroid_lat * Math.PI) / 180);
          const dLat = latest.centroid_lat - past.centroid_lat;
          spreadHeading =
            ((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360;
        }
      }
    }

    const body: Envelope<HistoryData> = {
      status: "ok",
      fetchedAt,
      data: { snapshots, spreadKmh, spreadHeading },
    };
    return NextResponse.json(body, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    const body: Envelope<HistoryData> = {
      status: "down",
      fetchedAt,
      error: (e as Error).message,
      data: null,
    };
    return NextResponse.json(body, { status: 200 });
  }
}
