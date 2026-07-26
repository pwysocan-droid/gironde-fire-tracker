"use client";

import { track } from "@vercel/analytics";

/**
 * Session-deduped analytics events. The page runs ~36k views/day at peak and
 * Vercel bills by event volume, so behavioural events fire at most once per
 * browser session — enough to answer "what share of sessions did X", which
 * is the only question we ask of them.
 */
export function trackOnce(name: string, props?: Record<string, string>): void {
  const key = `evt:${name}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    // Private browsing can refuse sessionStorage; better one duplicate
    // event than none at all.
  }
  track(name, props);
}

/** Not deduped — for rare, deliberate actions where each use is the signal. */
export { track };
