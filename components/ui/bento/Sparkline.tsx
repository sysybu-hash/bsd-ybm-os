import { useId } from "react";

export type SparkAxis = "finance" | "clients" | "ai" | "success" | "neutral";

const colorByAxis: Record<SparkAxis, string> = {
  finance: "var(--axis-finance)",
  clients: "var(--axis-clients)",
  ai: "var(--axis-ai)",
  success: "var(--state-success)",
  neutral: "var(--ink-700)",
};

/**
 * Sparkline — גרף קו מיני ללא צירים. פשוט יפה.
 * מקבל values ובונה path על בסיס viewBox 100x30.
 */
export function Sparkline({
  values,
  axis = "neutral",
  height = 30,
  filled = true,
  className,
}: {
  values: number[];
  axis?: SparkAxis;
  height?: number;
  filled?: boolean;
  className?: string;
}) {
  const reactId = useId().replace(/:/g, "");
  if (values.length < 2) {
    return <svg className={className} height={height} />;
  }
  const w = 100;
  const h = 30;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => ({
    x: i * step,
    y: h - ((v - min) / range) * (h - 4) - 2,
  }));
  const lineD = points.reduce(
    (acc, p, i) => acc + `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)} `,
    "",
  );
  const fillD = `${lineD} L ${w} ${h} L 0 ${h} Z`;
  const color = colorByAxis[axis];
  const gradientId = `spark-${axis}-${reactId}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={className}
      height={height}
      style={{ width: "100%", display: "block" }}
      aria-hidden
    >
      {filled ? (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={fillD} fill={`url(#${gradientId})`} />
        </>
      ) : null}
      <path d={lineD} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
