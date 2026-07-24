import type { Snapshot } from "./types";

/**
 * History store on Vercel Blob — one rolling JSON document, plain fetch, no
 * SDK. Chosen after Supabase fell through (no free project available): Blob
 * ships with the Vercel account this app already deploys to, so there is no
 * second service to provision or pay for.
 *
 * The store is public-access: these are aggregates of what the page already
 * displays publicly, and public blobs keep reads to a plain CDN GET. The
 * write token stays server-side.
 *
 * History is optional infrastructure — when the token is absent every helper
 * reports "not configured" and the UI hides its history features.
 */

const API = "https://blob.vercel-storage.com";
const OBJECT = "history.json";
export const HISTORY_WINDOW_MS = 48 * 3600 * 1000;

export function historyConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function auth(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` };
}

/**
 * The public URL carries a per-store host, so reads go through the list API
 * rather than a hardcoded hostname. Cache-busting query param because public
 * blob URLs sit behind the CDN even with a short max-age.
 */
async function objectUrl(): Promise<string | null> {
  const res = await fetch(`${API}/?prefix=${OBJECT}&limit=1`, {
    headers: auth(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`liste blobs HTTP ${res.status}`);
  const j = (await res.json()) as { blobs?: { pathname: string; url: string }[] };
  const hit = j.blobs?.find((b) => b.pathname === OBJECT);
  return hit?.url ?? null;
}

export async function readHistory(): Promise<Snapshot[]> {
  const url = await objectUrl();
  if (!url) return []; // never written yet
  const res = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`lecture historique HTTP ${res.status}`);
  const rows = (await res.json()) as Snapshot[];
  return Array.isArray(rows) ? rows : [];
}

export async function appendSnapshot(row: Snapshot): Promise<void> {
  const cutoff = Date.now() - HISTORY_WINDOW_MS;
  const rows = (await readHistory())
    .filter((s) => Date.parse(s.taken_at) >= cutoff)
    .concat([row])
    .sort((a, b) => Date.parse(a.taken_at) - Date.parse(b.taken_at));

  const res = await fetch(`${API}/${OBJECT}`, {
    method: "PUT",
    headers: {
      ...auth(),
      "x-add-random-suffix": "0",
      "x-allow-overwrite": "1",
      "x-content-type": "application/json",
      // Minimum allowed; keeps the CDN from serving day-old history.
      "x-cache-control-max-age": "60",
    },
    body: JSON.stringify(rows),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`écriture historique HTTP ${res.status}: ${await res.text()}`);
  }
}
