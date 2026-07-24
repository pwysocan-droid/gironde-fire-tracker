"use client";

import Module from "./Module";
import Sparkline from "./Sparkline";
import { age, compass, nnn, parisTime } from "@/lib/format";
import type { FireData, HistoryData } from "@/lib/types";
import type { SourceState } from "@/lib/useSource";

export default function FireModule({
  src,
  history,
  now,
}: {
  src: SourceState<FireData>;
  /** Optional: sparklines + measured spread appear once history accumulates. */
  history: HistoryData | null;
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

          {history && history.snapshots.length >= 3 ? (
            <div
              style={{
                marginTop: 11,
                paddingTop: 9,
                borderTop: "1px solid rgba(10,10,8,0.12)",
                display: "flex",
                gap: 18,
                flexWrap: "wrap",
                alignItems: "flex-end",
              }}
            >
              <div>
                <div className="label dim">PUISSANCE 48 H</div>
                <div style={{ marginTop: 4 }}>
                  <Sparkline
                    values={history.snapshots.map((s) => s.total_frp)}
                    accent
                  />
                </div>
              </div>
              <div>
                <div className="label dim">DÉTECTIONS &lt;6 H</div>
                <div style={{ marginTop: 4 }}>
                  <Sparkline
                    values={history.snapshots.map((s) => s.detections_6h)}
                  />
                </div>
              </div>
              {history.spreadKmh !== null && history.spreadHeading !== null ? (
                <div>
                  <div className="label dim">PROPAGATION MESURÉE 6 H</div>
                  <div style={{ marginTop: 4, fontSize: 12 }}>
                    <span className="accent" style={{ fontWeight: 600 }}>
                      {nnn(history.spreadKmh, 2)} km/h
                    </span>
                    <span className="dim">
                      {" "}
                      vers {compass(history.spreadHeading)}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* The counts breathe with the orbit, not only with the fire: no
              new detections can arrive between satellite passes, so the <6 h
              figure decays through the morning then jumps at the midday
              overpasses. Say so, or the page reads as the fire shrinking. */}
          <div
            className="label dim"
            style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: "1px solid rgba(10,10,8,0.12)",
              lineHeight: 1.6,
              letterSpacing: "0.08em",
            }}
          >
            ≈ 4 PASSAGES SATELLITE/JOUR (≈ 01H30 · 10H30 · 13H30 · 22H30).
            ENTRE DEUX PASSAGES, LES COMPTEURS RETOMBENT MÉCANIQUEMENT — UNE
            BAISSE MATINALE N&apos;EST PAS UN RECUL DU FEU.
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
