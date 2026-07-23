"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Envelope } from "./types";

export type SourceState<T> = {
  data: T | null;
  /** True until the first response of any kind arrives. */
  loading: boolean;
  /** Set when the fetch threw, or the envelope came back status:"down". */
  error: string | null;
  /** ISO UTC from the server envelope — when the *data* was gathered. */
  fetchedAt: string | null;
};

/**
 * Polls one route handler on an interval. A failure never throws upward: it
 * lands in `error` so the owning module can grey itself out while the rest of
 * the page carries on.
 */
export function useSource<T>(
  url: string,
  intervalMs: number,
): SourceState<T> & { refresh: () => void } {
  const [state, setState] = useState<SourceState<T>>({
    data: null,
    loading: true,
    error: null,
    fetchedAt: null,
  });

  // Keeps the interval callback from closing over a stale abort controller.
  const abort = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;

    try {
      const res = await fetch(url, { signal: ac.signal, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as Envelope<T>;

      if (body.status === "down" || body.data === null) {
        setState((s) => ({
          // Keep the last good payload on screen rather than blanking it —
          // stale fire positions still beat an empty frame.
          data: s.data,
          loading: false,
          error: body.error ?? "source indisponible",
          fetchedAt: body.fetchedAt ?? s.fetchedAt,
        }));
        return;
      }

      setState({
        data: body.data,
        loading: false,
        error: null,
        fetchedAt: body.fetchedAt,
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState((s) => ({
        data: s.data,
        loading: false,
        error: (e as Error).message || "échec réseau",
        fetchedAt: s.fetchedAt,
      }));
    }
  }, [url]);

  useEffect(() => {
    load();
    const id = setInterval(load, intervalMs);

    // Catch up immediately when a backgrounded tab returns to the foreground.
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      abort.current?.abort();
    };
  }, [load, intervalMs]);

  return { ...state, refresh: load };
}
