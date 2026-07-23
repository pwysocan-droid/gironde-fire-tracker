"use client";

import { useEffect, useState } from "react";
import FireMap from "./FireMap";
import FireModule from "./FireModule";
import Module from "./Module";
import Freshness from "./Freshness";
import { useSource } from "@/lib/useSource";
import type { FireData } from "@/lib/types";

/**
 * Owns every data source and hands each one to exactly one module. Sources are
 * independent by construction: one erroring never unmounts another.
 */
export default function Dashboard() {
  const fire = useSource<FireData>("/api/fire", 5 * 60 * 1000);

  // A single ticking clock drives every relative "age" label on the page, so
  // they all advance together instead of drifting per-component.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <Freshness
        sources={[
          { key: "FEU", state: fire },
          { key: "VENT", state: null },
          { key: "TRAFIC", state: null },
        ]}
        now={now}
      />

      <div className="main">
        <div className="col-map">
          <FireMap fire={fire.data} />
        </div>

        <div className="col-modules">
          <FireModule src={fire} now={now} />

          <Module num="02" title="VENT" meta="OPEN-METEO">
            <div className="label dim">EN ATTENTE DE DONNÉES</div>
          </Module>

          <Module num="03" title="TRAFIC AÉRIEN" meta="OPENSKY" grow>
            <div className="label dim">EN ATTENTE DE DONNÉES</div>
          </Module>
        </div>
      </div>
    </>
  );
}
