"use client";

import { age, ageMs } from "@/lib/format";

type AnyState = {
  fetchedAt: string | null;
  error: string | null;
  loading: boolean;
} | null;

/** How old a source may get before its dot goes hollow. */
const STALE_MS = 20 * 60 * 1000;

/**
 * Per-source freshness read-out for the masthead. Solid dot = current,
 * grey = stale, accent = failing. This is the page's honesty layer: it must
 * always be possible to tell how old what you're looking at is.
 */
export default function Freshness({
  sources,
  now,
}: {
  sources: { key: string; state: AnyState }[];
  now: number;
}) {
  return (
    <div className="freshness">
      {sources.map(({ key, state }) => {
        const pending = !state || (state.loading && !state.fetchedAt);
        const failing = !!state?.error;
        const stale =
          !!state?.fetchedAt && ageMs(state.fetchedAt, now) > STALE_MS;

        const cls = failing ? "down" : stale || pending ? "stale" : "";

        return (
          <span className="fresh-item" key={key}>
            <span className={`fresh-dot ${cls}`} />
            <span className="label dim">
              {key}{" "}
              {state?.fetchedAt ? age(state.fetchedAt, now) : "—"}
            </span>
          </span>
        );
      })}
    </div>
  );
}
