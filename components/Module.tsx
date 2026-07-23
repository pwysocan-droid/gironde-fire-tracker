import type { ReactNode } from "react";

/**
 * A numbered module frame. Every data source lives inside one of these, and a
 * source failing greys out only its own module — it must never blank the page.
 */
export default function Module({
  num,
  title,
  meta,
  down,
  downLabel = "SOURCE INDISPONIBLE",
  detail,
  children,
  grow,
}: {
  num: string;
  title: string;
  meta?: ReactNode;
  down?: boolean;
  downLabel?: string;
  /** Shown under the down label — usually the error reason. */
  detail?: string;
  children: ReactNode;
  /** Let this module absorb leftover vertical space (used by 03). */
  grow?: boolean;
}) {
  return (
    <section
      className={`module${down ? " down" : ""}`}
      style={grow ? { minHeight: 0 } : undefined}
    >
      <div className="module-head">
        <span className="module-num">{num}</span>
        <span className="module-title">{title}</span>
        {meta ? <span className="module-meta">{meta}</span> : null}
      </div>
      {down ? (
        <div className="source-down">
          <div className="label">{downLabel}</div>
          {detail ? (
            <div
              className="label dim"
              style={{ marginTop: 6, letterSpacing: "0.06em" }}
            >
              {detail}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="module-body" style={grow ? { display: "flex", flexDirection: "column", minHeight: 0 } : undefined}>
          {children}
        </div>
      )}
    </section>
  );
}
