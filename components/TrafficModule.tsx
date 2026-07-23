"use client";

import Module from "./Module";
import { nnn } from "@/lib/format";
import type { TrafficData } from "@/lib/types";
import type { SourceState } from "@/lib/useSource";

/** m/s → km/h. OpenSky reports velocity in m/s. */
const kmh = (ms: number | null) => (ms === null ? null : ms * 3.6);

export default function TrafficModule({ src }: { src: SourceState<TrafficData> }) {
  const d = src.data;
  const down = !!src.error && !d;

  return (
    <Module
      num="03"
      title="TRAFIC AÉRIEN"
      meta={d ? `${d.total} APPAREILS` : "OPENSKY"}
      down={down}
      detail={src.error ?? undefined}
      grow
    >
      {d ? (
        <>
          <div className="stats" style={{ flex: "none" }}>
            <div className="stat">
              <span className="stat-val sm accent">
                {nnn(d.firefighterCount)}
              </span>
              <span className="stat-unit">
                sécurité
                <br />
                civile
              </span>
            </div>
            <div className="stat">
              <span className="stat-val sm">{nnn(d.total)}</span>
              <span className="stat-unit">
                total
                <br />
                zone
              </span>
            </div>
            <div className="stat">
              <span className="stat-val sm">{nnn(d.bodTraffic)}</span>
              <span className="stat-unit">
                approche
                <br />
                BOD
              </span>
            </div>
          </div>

          <div
            className="table-scroll"
            style={{ marginTop: 11, flex: "1 1 auto" }}
          >
            <table className="table">
              <thead>
                <tr>
                  <th>Indicatif</th>
                  <th>Type</th>
                  <th className="num-cell">Alt m</th>
                  <th className="num-cell">km/h</th>
                </tr>
              </thead>
              <tbody>
                {d.aircraft.map((a) => {
                  const v = kmh(a.velocity);
                  return (
                    <tr
                      key={a.icao24}
                      className={a.firefighter ? "firefighter" : undefined}
                    >
                      <td>{a.callsign}</td>
                      <td>
                        {a.firefighter
                          ? a.firefighter.type
                          : a.onGround
                            ? "au sol"
                            : a.country}
                      </td>
                      <td className="num-cell">
                        {a.onGround
                          ? "—"
                          : a.altitude !== null
                            ? nnn(a.altitude)
                            : "—"}
                      </td>
                      <td className="num-cell">
                        {v !== null ? nnn(v) : "—"}
                      </td>
                    </tr>
                  );
                })}
                {d.aircraft.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="dim">
                      Aucun appareil dans la zone
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {src.error ? (
            <div className="label accent" style={{ marginTop: 9, flex: "none" }}>
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
