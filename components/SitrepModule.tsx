"use client";

import Module from "./Module";
import { parisTime } from "@/lib/format";
import type { SitrepData } from "@/lib/types";
import type { SourceState } from "@/lib/useSource";

/**
 * 04 SITUATION — the Claude-written bulletin. The attribution line is not
 * decoration: a machine-written situation report on a live emergency must
 * say what wrote it and when, every time.
 */
export default function SitrepModule({ src }: { src: SourceState<SitrepData> }) {
  const d = src.data;
  const down = !!src.error && !d;

  return (
    <Module
      num="04"
      title="SITUATION"
      meta={d ? `GÉNÉRÉ ${parisTime(d.generatedAt)}` : "SYNTHÈSE IA"}
      down={down}
      detail={src.error ?? undefined}
    >
      {d ? (
        <>
          <div style={{ fontSize: 12, lineHeight: 1.55 }}>{d.bulletin}</div>
          <div
            className="label dim"
            style={{
              marginTop: 10,
              paddingTop: 7,
              borderTop: "1px solid rgba(10,10,8,0.12)",
              letterSpacing: "0.08em",
              lineHeight: 1.6,
            }}
          >
            SYNTHÈSE AUTOMATIQUE ({d.model.toUpperCase()}) À PARTIR DES
            SOURCES CI-DESSUS — INDICATIVE, NON OFFICIELLE. EN CAS D&apos;URGENCE :
            PRÉFECTURE DE LA GIRONDE / 112.
          </div>
          {src.error ? (
            <div className="label accent" style={{ marginTop: 8 }}>
              BULLETIN PÉRIMÉ — {src.error}
            </div>
          ) : null}
        </>
      ) : (
        <div className="label dim">GÉNÉRATION…</div>
      )}
    </Module>
  );
}
