import type { Snapshot } from "./types";

/**
 * History store on Supabase **Storage** — one private bucket holding a single
 * rolling JSON document, written via plain fetch.
 *
 * Why Storage and not a table: this rides in a shared Supabase project, and a
 * bucket needs no DDL — the app creates it lazily on first write, so setup is
 * zero SQL and the host project's tables are never touched. One writer every
 * 15 minutes and one small document make PostgREST overkill anyway.
 *
 * Server-side only: the service-role key must never reach the client. History
 * is optional infrastructure — when env vars are absent every helper reports
 * "not configured" and the UI hides its history features rather than erroring.
 */

const BUCKET = "gironde-fire";
const OBJECT = "history.json";
export const HISTORY_WINDOW_MS = 48 * 3600 * 1000;

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

function headers(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return { apikey: key, Authorization: `Bearer ${key}` };
}

/** Idempotent: 409 (already exists) is success. */
async function ensureBucket(): Promise<void> {
  const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
    cache: "no-store",
  });
  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    // Supabase reports an existing bucket as a 400 "already exists" in some
    // versions; tolerate that shape too.
    if (!text.includes("already exists")) {
      throw new Error(`création bucket HTTP ${res.status}: ${text}`);
    }
  }
}

export async function readHistory(): Promise<Snapshot[]> {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${OBJECT}`,
    { headers: headers(), cache: "no-store" },
  );
  if (res.status === 400 || res.status === 404) return []; // not written yet
  if (!res.ok) {
    throw new Error(`lecture historique HTTP ${res.status}`);
  }
  const rows = (await res.json()) as Snapshot[];
  return Array.isArray(rows) ? rows : [];
}

export async function appendSnapshot(row: Snapshot): Promise<void> {
  await ensureBucket();
  const cutoff = Date.now() - HISTORY_WINDOW_MS;
  const rows = (await readHistory())
    .filter((s) => Date.parse(s.taken_at) >= cutoff)
    .concat([row])
    .sort((a, b) => Date.parse(a.taken_at) - Date.parse(b.taken_at));

  const res = await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${OBJECT}`,
    {
      method: "POST",
      headers: {
        ...headers(),
        "Content-Type": "application/json",
        "x-upsert": "true",
      },
      body: JSON.stringify(rows),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`écriture historique HTTP ${res.status}: ${await res.text()}`);
  }
}
