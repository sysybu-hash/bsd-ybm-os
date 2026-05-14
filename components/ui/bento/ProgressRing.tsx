import { useId, type ReactNode } from "react";

export type RingAxis = "finance" | "clients" | "ai" | "success" | "warning";

const gradientByAxis: Record<RingAxis, [string, string]> = {
  finance: ["#D9A13E", "#B8811A"],
  clients: ["#14A4AE", "#0E7C86"],
  ai:      ["#9B7DFF", "#6D51D1"],
  success: ["#28A765", "#1F7A4C"],
  warning: ["#E0A13A", "#B87A1C"],
};

/**
 * ProgressRing — טבעת התקדמות עגולה עם גרדיאנט.
 */
export function ProgressRing({
  value,
  axis = "ai",
  size = 140,
  strokeWidth = 10,
  trackColor,
  children,
}: {
  value: number;
  axis?: RingAxis;
  size?: number;
  strokeWidth?: number;
  trackColor?: string;
  children?: ReactNode;
}) {
  const reactId = useId().replace(/:/g, "");
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const gradientId = `ring-${axis}-${reactId}`;
  const [c1, c2] = gradientByAxis[axis];

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor ?? "rgba(148, 163, 184, 0.18)"}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}
