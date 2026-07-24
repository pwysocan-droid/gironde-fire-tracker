/**
 * Pure-SVG sparkline in the house style: 1px ink line, no fill gradients, a
 * single accent dot on the latest value. Renders nothing with < 3 points —
 * two points draw a meaningless line, better to stay silent until the
 * history has substance.
 */
export default function Sparkline({
  values,
  width = 148,
  height = 30,
  accent = false,
}: {
  values: number[];
  width?: number;
  height?: number;
  /** Draw the line itself in accent rather than ink. */
  accent?: boolean;
}) {
  if (values.length < 3) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;

  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (width - pad * 2),
    height - pad - ((v - min) / span) * (height - pad * 2),
  ]);

  const d = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join("");

  const [lx, ly] = pts[pts.length - 1];
  const col = accent ? "#E8280A" : "#0A0A08";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      <line
        x1={pad}
        y1={height - pad}
        x2={width - pad}
        y2={height - pad}
        stroke="#0A0A08"
        strokeOpacity="0.15"
        strokeWidth="1"
      />
      <path d={d} fill="none" stroke={col} strokeWidth="1.2" />
      <circle cx={lx} cy={ly} r="2" fill="#E8280A" />
    </svg>
  );
}
