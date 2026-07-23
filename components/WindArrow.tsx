/**
 * Wind direction arrow, pure SVG — no icon dependency.
 *
 * `from` is the meteorological direction the wind blows FROM. The arrow points
 * the way the air (and therefore the fire) is travelling, i.e. from + 180,
 * because "where is it pushing the fire" is the only question that matters
 * here. The compass ring is labelled in French cardinals.
 */
export default function WindArrow({
  from,
  size = 74,
  accent = "#E8280A",
  ink = "#0A0A08",
}: {
  from: number;
  size?: number;
  accent?: string;
  ink?: string;
}) {
  const heading = (from + 180) % 360;
  const c = size / 2;
  const r = c - 11;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Vent de ${Math.round(from)} degrés, poussant vers ${Math.round(heading)} degrés`}
    >
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={ink}
        strokeOpacity="0.25"
        strokeWidth="1"
      />

      {/* cardinal ticks */}
      {[0, 90, 180, 270].map((d) => {
        const rad = ((d - 90) * Math.PI) / 180;
        return (
          <line
            key={d}
            x1={c + Math.cos(rad) * (r - 3)}
            y1={c + Math.sin(rad) * (r - 3)}
            x2={c + Math.cos(rad) * r}
            y2={c + Math.sin(rad) * r}
            stroke={ink}
            strokeWidth="1"
          />
        );
      })}

      <text
        x={c}
        y={8}
        textAnchor="middle"
        fontSize="7"
        fontFamily="var(--mono)"
        fill={ink}
        fillOpacity="0.6"
        letterSpacing="0.1em"
      >
        N
      </text>

      {/* the arrow itself, rotated to the direction of travel */}
      <g transform={`rotate(${heading} ${c} ${c})`}>
        <line
          x1={c}
          y1={c + r - 5}
          x2={c}
          y2={c - r + 8}
          stroke={accent}
          strokeWidth="2"
        />
        <polygon
          points={`${c},${c - r + 1} ${c - 4.5},${c - r + 11} ${c + 4.5},${c - r + 11}`}
          fill={accent}
        />
      </g>

      <circle cx={c} cy={c} r="1.6" fill={ink} />
    </svg>
  );
}
