import { TZ } from "./constants";

/** Store UTC, display Europe/Paris. */
export function parisTime(d: Date | string | number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(d));
}

export function parisDateTime(d: Date | string | number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(d));
}

/** Compact age, e.g. "4 MIN", "2 H 10", "3 J". */
export function age(from: Date | string | number, now = Date.now()): string {
  const ms = now - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "<1 MIN";
  if (min < 60) return `${min} MIN`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} H ${String(min % 60).padStart(2, "0")}`;
  return `${Math.floor(h / 24)} J`;
}

export function ageMs(from: Date | string | number, now = Date.now()): number {
  return now - new Date(from).getTime();
}

/** 16-point compass, French — used for wind direction readouts. */
const COMPASS_FR = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO",
];

export function compass(deg: number): string {
  return COMPASS_FR[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

export function nnn(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Great-circle distance in km. */
export function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
