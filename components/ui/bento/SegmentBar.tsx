/**
 * SegmentBar — פס מחולק לסגמנטים (כמו pipeline: Lead/Active/Won).
 * המידה של כל סגמנט מחושבת לפי values; הצבעים נמשכים מ-palette.
 */
export type SegmentBarItem = {
  label: string;
  value: number;
  color: string;
};

export function SegmentBar({
  segments,
  height = 10,
  showLabels = true,
}: {
  segments: SegmentBarItem[];
  height?: number;
  showLabels?: boolean;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  return (
    <div>
      <div className="segment-bar" style={{ height }}>
        {segments.map((seg) => (
          <div
            key={seg.label}
            className="segment-bar__part"
            style={{
              flex: seg.value > 0 ? seg.value : 0.01,
              background: seg.color,
              opacity: seg.value === 0 ? 0.3 : 1,
            }}
            title={`${seg.label}: ${seg.value}`}
          />
        ))}
      </div>
      {showLabels ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {segments.map((seg) => (
            <div key={seg.label} className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: seg.color }}
                aria-hidden
              />
              <span className="opacity-80">{seg.label}</span>
              <span className="font-black tabular-nums">{seg.value}</span>
            </div>
          ))}
          <span className="ms-auto text-[11px] font-semibold tabular-nums opacity-60">
            {total}
          </span>
        </div>
      ) : null}
    </div>
  );
}
