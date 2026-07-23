"use client";

import Module from "./Module";
import WindArrow from "./WindArrow";
import { compass, nnn } from "@/lib/format";
import { TZ } from "@/lib/constants";
import type { WindData } from "@/lib/types";
import type { SourceState } from "@/lib/useSource";

/** Small glyph for the hourly strip — direction of travel, not of origin. */
function HourGlyph({ from, accent }: { from: number; accent: boolean }) {
  const heading = (from + 180) % 360;
  const col = accent ? "#F4F2EC" : "#0A0A08";
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
      <g transform={`rotate(${heading} 6.5 6.5)`}>
        <line x1="6.5" y1="11" x2="6.5" y2="3" stroke={col} strokeWidth="1.4" />
        <polygon points="6.5,1 3.7,6 9.3,6" fill={col} />
      </g>
    </svg>
  );
}

function hourLabel(iso: string): string {
  // Open-Meteo already returns Europe/Paris local time when asked, but the
  // string is unzoned — treat it as wall-clock and just take the hour.
  const m = /T(\d{2}):/.exec(iso);
  return m ? m[1] : "--";
}

export default function WindModule({ src }: { src: SourceState<WindData> }) {
  const d = src.data;
  const down = !!src.error && !d;

  const nowHour = new Intl.DateTimeFormat("fr-FR", {
    timeZone: TZ,
    hour: "2-digit",
    hour12: false,
  }).format(new Date());

  return (
    <Module
      num="02"
      title="VENT"
      meta={d ? `${compass(d.current.direction)} ${Math.round(d.current.direction)}°` : "OPEN-METEO"}
      down={down}
      detail={src.error ?? undefined}
    >
      {d ? (
        <>
          <div className="wind-current">
            <WindArrow from={d.current.direction} />
            <div className="stats">
              <div className="stat">
                <span className="stat-val sm">{nnn(d.current.speed)}</span>
                <span className="stat-unit">km/h moyen</span>
              </div>
              <div className="stat">
                <span className="stat-val sm accent">
                  {nnn(d.current.gust)}
                </span>
                <span className="stat-unit">rafales</span>
              </div>
              <div className="stat">
                <span className="stat-val sm">
                  {d.current.humidity !== null
                    ? `${Math.round(d.current.humidity)}`
                    : "—"}
                </span>
                <span className="stat-unit">
                  % humidité
                  {d.current.temp !== null
                    ? ` · ${Math.round(d.current.temp)}°C`
                    : ""}
                </span>
              </div>
            </div>
          </div>

          <div className="wind-readout">{d.reading}</div>

          <div className="label dim" style={{ marginTop: 11 }}>
            PRÉVISION 24 H — HEURE LOCALE
          </div>
          <div className="wind-strip">
            {d.hours.map((h, i) => {
              const hh = hourLabel(h.time);
              const isNow = i === 0 || hh === nowHour;
              return (
                <div
                  className={`wind-hour${isNow && i === 0 ? " now" : ""}`}
                  key={h.time}
                  title={`${hh}:00 — ${compass(h.direction)} ${Math.round(h.speed)} km/h, rafales ${Math.round(h.gust)}`}
                >
                  <span className="wind-hour-label">{hh}</span>
                  <HourGlyph from={h.direction} accent={isNow && i === 0} />
                  <span className="wind-hour-spd">{Math.round(h.speed)}</span>
                  <span className="wind-hour-gust">{Math.round(h.gust)}</span>
                </div>
              );
            })}
          </div>

          {d.air && (d.air.pm25 !== null || d.air.pm10 !== null) ? (
            <div className="aq">
              <div className="label dim" style={{ alignSelf: "center" }}>
                FUMÉE
                <br />
                BORDEAUX
              </div>
              <div className="aq-item">
                <span className="aq-val">
                  {d.air.pm25 !== null ? nnn(d.air.pm25) : "—"}
                </span>
                <span className="label dim unit">PM2.5 µg/m³</span>
              </div>
              <div className="aq-item">
                <span className="aq-val">
                  {d.air.pm10 !== null ? nnn(d.air.pm10) : "—"}
                </span>
                <span className="label dim unit">PM10 µg/m³</span>
              </div>
            </div>
          ) : null}

          {src.error ? (
            <div className="label accent" style={{ marginTop: 9 }}>
              DONNÉES PÉRIMÉES — {src.error}
            </div>
          ) : null}
        </>
      ) : (
        <div className="label dim">CHARGEMENT…</div>
      )}
    </Module>
  );
}
