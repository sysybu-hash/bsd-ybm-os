export type StackedBarItem = {
  label: string;
  value: number; // 0-100
  color: string;
};

/**
 * StackedBars — כמה עמודות אנכיות זו לצד זו (למשל פרוגרס פרויקטים).
 */
export function StackedBars({
  bars,
  height = 80,
}: {
  bars: StackedBarItem[];
  height?: number;
}) {
  return (
    <div
      className="flex items-end gap-2 w-full"
      style={{ height }}
      role="group"
      aria-label="stacked bars"
    >
      {bars.map((bar) => {
        const pct = Math.max(4, Math.min(100, bar.value));
        return (
          <div key={bar.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div className="relative flex h-full w-full items-end justify-center">
              <div
                className="w-full rounded-t-lg"
                style={{
                  height: `${pct}%`,
                  background: bar.color,
                  opacity: 0.95,
                }}
                title={`${bar.label}: ${bar.value}%`}
              />
            </div>
            <span className="text-[10px] font-black tabular-nums opacity-85">{bar.value}%</span>
            <span className="text-[10px] font-semibold opacity-60 line-clamp-1">{bar.label}</span>
          </div>
        );
      })}
    </div>
  );
}
