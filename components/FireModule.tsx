"use client";

import Module from "./Module";
import { age, nnn, parisTime } from "@/lib/format";
import type { FireData } from "@/lib/types";
import type { SourceState } from "@/lib/useSource";

export default function FireModule({
  src,
  now,
}: {
  src: SourceState<FireData>;
  now: number;
}) {
  const d = src.data;
  const down = !!src.error && !d;

  return (
    <Module
      num="01"
      title="FEU"
      meta={
        src.loading && !d
          ? "CHARGEMENT"
          : d?.sensorsFailed.length
            ? `${d.sensorsOk.length}/3 CAPTEURS`
            : "NASA FIRMS"
      }
      down={down}
      detail={src.error ?? undefined}
    >
      {d ? (
        <>
          <div className="stats">
            <div className="stat">
              <span className="stat-val accent">{nnn(d.last6h)}</span>
              <span className="stat-unit">
                détections
                <br />&lt; 6 h
              </span>
            </div>
            <div className="stat">
              <span className="stat-val">{nnn(d.last24h)}</span>
              <span className="stat-unit">
                détections
                <br />&lt; 24 h
              </span>
            </div>
            <div className="stat">
              <span className="stat-val sm">
                {d.totalFrp >= 1000
                  ? `${nnn(d.totalFrp / 1000, 1)}k`
                  : nnn(d.totalFrp)}
              </span>
              <span className="stat-unit">
                puissance
                <br />
                totale MW
              </span>
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              paddingTop: 9,
              borderTop: "1px solid rgba(10,10,8,0.12)",
              display: "flex",
              gap: 18,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div className="label dim">DÉTECTION LA PLUS RÉCENTE</div>
              <div style={{ marginTop: 3, fontSize: 12 }}>
                {d.newestAt ? (
                  <>
                    <span className="accent" style={{ fontWeight: 600 }}>
                      {age(d.newestAt, now)}
                    </span>
                    <span className="dim"> · {parisTime(d.newestAt)}</span>
                  </>
                ) : (
                  <span className="dim">—</span>
                )}
              </div>
            </div>

            {d.centroid ? (
              <div>
                <div className="label dim">FOYER PRINCIPAL 24 H</div>
                <div style={{ marginTop: 3, fontSize: 12 }}>
                  {d.centroid.lat.toFixed(3)}°N{" "}
                  {Math.abs(d.centroid.lon).toFixed(3)}°
                  {d.centroid.lon < 0 ? "O" : "E"}
                </div>
              </div>
            ) : null}
          </div>

          {d.sensorsFailed.length ? (
            <div className="label dim" style={{ marginTop: 9 }}>
              CAPTEUR HORS SERVICE : {d.sensorsFailed.join(", ")}
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
