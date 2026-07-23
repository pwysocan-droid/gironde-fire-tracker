"use client";

import { useEffect, useState } from "react";
import Clock from "./Clock";
import FireMap from "./FireMap";
import FireModule from "./FireModule";
import WindModule from "./WindModule";
import TrafficModule from "./TrafficModule";
import Freshness from "./Freshness";
import { useSource } from "@/lib/useSource";
import type { FireData, TrafficData, WindData } from "@/lib/types";

/**
 * Owns every data source and hands each one to exactly one module. Sources are
 * independent by construction: one erroring never unmounts another.
 */
export default function Dashboard() {
  const fire = useSource<FireData>("/api/fire", 5 * 60 * 1000);
  const wind = useSource<WindData>("/api/wind", 10 * 60 * 1000);
  // 60 s to match the route cache; anonymous OpenSky is credit-limited.
  const traffic = useSource<TrafficData>("/api/traffic", 60 * 1000);

  // A single ticking clock drives every relative "age" label on the page, so
  // they all advance together instead of drifting per-component.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <header className="masthead">
        <div className="masthead-title">
          <h1>
            Suivi Feu <span className="accent">/</span> Gironde
          </h1>
          <div className="masthead-sub">
            <div className="label">INCENDIE ACTIF — LÈGE-CAP-FERRET</div>
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
          <FireModule src={fire} now={now} />

          <WindModule src={wind} />

          <TrafficModule src={traffic} />
        </div>
      </div>
    </>
  );
}
