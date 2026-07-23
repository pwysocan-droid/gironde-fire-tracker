"use client";

import { useEffect, useState } from "react";
import { TZ } from "@/lib/constants";

/**
 * Live Europe/Paris clock. Rendered empty on the server and filled on mount so
 * server/client markup can never disagree about the second.
 */
export default function Clock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now
    ? new Intl.DateTimeFormat("fr-FR", {
        timeZone: TZ,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(now)
    : "--:--:--";

  const date = now
    ? new Intl.DateTimeFormat("fr-FR", {
        timeZone: TZ,
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
        .format(now)
        .toUpperCase()
        .replace(/\./g, "")
    : "";

  return (
    <>
      <div className="clock-time" suppressHydrationWarning>
        {time}
      </div>
      <div className="label dim" suppressHydrationWarning>
        {date} · UTC+2
      </div>
    </>
  );
}
