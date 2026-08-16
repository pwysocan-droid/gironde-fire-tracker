"use client";

import { useEffect, useState } from "react";
import Clock from "./Clock";
import FireMap from "./FireMap";
import FireModule from "./FireModule";
import WindModule from "./WindModule";
import TrafficModule from "./TrafficModule";
import SitrepModule from "./SitrepModule";
import Freshness from "./Freshness";
import PausedNotice from "./PausedNotice";
import { PAUSED } from "@/lib/constants";
import { useSource } from "@/lib/useSource";
import type { FireData, HistoryData, SitrepData, TrafficData, WindData } from "@/lib/types";

/**
 * Owns every data source and hands each one to exactly one module. Sources are
 * independent by construction: one erroring never unmounts another.
 */
export default function Dashboard() {
  // Paused: every source loads once for the archive, then stops. The sitrep
  // is not fetched at all — a frozen "live bulletin" would be worse than none,
  // and the notice above the fold already says what the page is.
  const poll = (ms: number) => (PAUSED ? 0 : ms);
  const fire = useSource<FireData>("/api/fire", poll(5 * 60 * 1000));
  const wind = useSource<WindData>("/api/wind", poll(10 * 60 * 1000));
  // 60 s to match the route cache; anonymous OpenSky is credit-limited.
  const traffic = useSource<TrafficData>("/api/traffic", poll(60 * 1000));
  // Server regenerates at 15-min cadence; clients just pick up the new copy.
  const history = useSource<HistoryData>("/api/history", poll(5 * 60 * 1000));
  const sitrep = useSource<SitrepData>(
    PAUSED ? "" : "/api/sitrep",
    poll(5 * 60 * 1000),
  );

  // A single ticking clock drives every relative "age" label on the page, so
  // they all advance together instead of drifting per-component.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {PAUSED ? <PausedNotice /> : null}

      <header className="masthead">
        <div className="masthead-title">
          <h1>
            Suivi Feu <span className="accent">/</span> Gironde
          </h1>
          <div className="masthead-sub">
            <div className="label">
              {PAUSED
                ? "SUIVI EN PAUSE — LÈGE-CAP-FERRET, INCENDIE DE JUILLET 2026"
                : "INCENDIE ACTIF — LÈGE-CAP-FERRET"}
            </div>
            <div className="label dim" style={{ marginTop: 4 }}>
              44.75°N 1.20°O · BASSIN D&apos;ARCACHON · NOUVELLE-AQUITAINE
            </div>
          </div>
        </div>
        <div className="masthead-clock">
          <Clock />
          <Freshness
            sources={[
              { key: "FEU", state: fire },
              { key: "VENT", state: wind },
              { key: "TRAFIC", state: traffic },
            ]}
            now={now}
          />
        </div>
      </header>

      <div className="main">
        <div className="col-map">
          <FireMap fire={fire.data} wind={wind.data} traffic={traffic.data} />
        </div>

        <div className="col-modules">
          <FireModule src={fire} history={history.data} now={now} />

          <WindModule src={wind} />

          <TrafficModule src={traffic} />

          {PAUSED ? null : <SitrepModule src={sitrep} />}
        </div>
      </div>
    </>
  );
}
