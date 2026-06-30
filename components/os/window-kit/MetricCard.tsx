"use client";

import React from "react";

type MetricCardProps = {
  label: string;
  value: string;
  trend?: { dir: "up" | "down"; text: string };
  icon?: React.ReactNode;
  /** מדגיש את הכרטיס בגוון אקצנט החלון */
  accentValue?: boolean;
};

/**
 * Window Content Kit — כרטיס-מדד (תווית, מספר גדול, טרנד אופציונלי).
 * המספר/אייקון יכולים לאמץ את אקצנט החלון (--win-accent).
 */
export function MetricCard({ label, value, trend, icon, accentValue = false }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] text-[color:var(--foreground-muted)]">{label}</span>
        {icon ? <span className="shrink-0 text-[color:var(--win-accent,var(--accent))]">{icon}</span> : null}
      </div>
      <div
        className={`mt-1 text-[22px] font-bold leading-tight ${accentValue ? "text-[color:var(--win-accent,var(--accent))]" : ""}`}
      >
        {value}
      </div>
      {trend ? (
        <div
          className={`mt-0.5 text-[11px] font-semibold ${
            trend.dir === "up"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}
        >
          {trend.dir === "up" ? "▲" : "▼"} {trend.text}
        </div>
      ) : null}
    </div>
  );
}
