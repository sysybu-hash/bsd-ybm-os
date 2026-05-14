export type DonutSlice = {
  label: string;
  value: number;
  color: string;
};

/**
 * Donut — טבעת מחולקת פרוסות עם תוויות.
 */
export function Donut({
  slices,
  size = 140,
  strokeWidth = 18,
  centerLabel,
  centerValue,
  trackColor = "rgba(148, 163, 184, 0.12)",
}: {
  slices: DonutSlice[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerValue?: string;
  trackColor?: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let cumulative = 0;
  const arcs = slices.map((slice) => {
    const fraction = slice.value / total;
    const dashLength = fraction * circumference;
    const offset = -(cumulative * circumference);
    cumulative += fraction;
    return {
      ...slice,
      dashArray: `${dashLength} ${circumference - dashLength}`,
      offset,
    };
  });

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {arcs.map((arc) => (
          <circle
            key={arc.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={strokeWidth}
            strokeDasharray={arc.dashArray}
            strokeDashoffset={arc.offset}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      {centerValue || centerLabel ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerValue ? (
            <span className="text-xl font-black tabular-nums" style={{ color: "inherit" }}>
              {centerValue}
            </span>
          ) : null}
          {centerLabel ? (
            <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">
              {centerLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
