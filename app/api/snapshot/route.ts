import { NextRequest, NextResponse } from "next/server";
import { takeSnapshot } from "@/lib/snapshot";

/**
 * Backstop trigger for the 15-min history snapshots — POSTed by a GitHub
 * Actions cron (Vercel Hobby crons only fire daily). The primary cadence
 * comes from /api/history taking opportunistic snapshots while anyone has
 * the page open; the min-interval guard in takeSnapshot() makes the two
 * triggers safe together.
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

  try {
    const result = await takeSnapshot();
    return NextResponse.json(result, { status: result.taken ? 200 : 202 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}
