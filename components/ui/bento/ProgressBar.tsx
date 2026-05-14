export type ProgressAxis = "finance" | "clients" | "ai" | "success" | "warning";

/**
 * ProgressBar — פס התקדמות אופקי עם גרדיאנט לפי ציר.
 * אפשר להוסיף target (דגלון) ו-label מעל/מתחת.
 */
export function ProgressBar({
  value,
  target,
  axis = "finance",
  glow = false,
  height = 8,
  ariaLabel,
}: {
  /** מ-0 עד 100 */
  value: number;
  /** מ-0 עד 100 (אופציונלי - מציג דגלון) */
  target?: number;
  axis?: ProgressAxis;
  glow?: boolean;
  height?: number;
  ariaLabel?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className="progress-bar"
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <div
        className={`progress-bar__fill progress-bar__fill--${axis} ${glow ? "progress-bar__fill--glow" : ""}`}
        style={{ width: `${clamped}%` }}
      />
      {typeof target === "number" ? (
        <div
          className="progress-bar__target"
          style={{ insetInlineStart: `${Math.max(0, Math.min(100, target))}%` }}
        />
      ) : null}
    </div>
  );
}
