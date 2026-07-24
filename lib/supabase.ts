/**
 * Minimal Supabase PostgREST access via fetch — deliberately no SDK, keeping
 * the dependency surface small. Server-side only: the service-role key must
 * never reach the client, so these helpers are imported by route handlers
 * exclusively.
 *
 * History is optional infrastructure: when the env vars are absent every
 * helper reports "not configured" and the UI hides its history features
 * rather than erroring.
 */

export function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function headers(): Record<string, string> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export async function insertRow(
  table: string,
  row: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...headers(), Prefer: "return=minimal" },
    body: JSON.stringify(row),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Supabase insert HTTP ${res.status}: ${await res.text()}`);
  }
}

export async function selectRows<T>(
  table: string,
  query: string,
): Promise<T[]> {
  const res = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/${table}?${query}`,
    { headers: headers(), cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`Supabase select HTTP ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T[];
}
