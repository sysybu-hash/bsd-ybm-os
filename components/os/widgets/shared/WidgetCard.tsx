"use client";

import React from "react";

// ── StatCard ──────────────────────────────────────────────────────────────────
export function StatCard({
  title,
  value,
  detail,
  trend,
  trendLabel,
  icon: Icon,
  valueClassName,
  children,
}: {
  title: string;
  value: React.ReactNode;
  detail?: string;
  trend?: number;
  trendLabel?: string;
  icon?: React.ElementType;
  valueClassName?: string;
  children?: React.ReactNode;
}) {
  const isPositive = (trend ?? 0) >= 0;

  return (
    <div className="flex flex-col p-5 bg-surface-card rounded-xl border border-border-main shadow-glass transition-all duration-200 hover:shadow-window hover:border-border-strong">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground-muted">{title}</h3>
        {Icon && (
          <div className="p-2 bg-surface-soft rounded-lg text-foreground-muted">
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className={`text-2xl font-bold tracking-tight ${valueClassName ?? "text-foreground-main"}`}>
        {value}
      </div>

      {detail && (
        <p className="mt-1 text-xs text-foreground-muted">{detail}</p>
      )}

      {(trend !== undefined || trendLabel) && (
        <div className="mt-3 flex items-center gap-2">
          {trend !== undefined && (
            <StatusBadge variant={isPositive ? "green" : "red"}>
              {isPositive ? "+" : ""}{trend}%
            </StatusBadge>
          )}
          {trendLabel && (
            <span className="text-xs text-foreground-muted">{trendLabel}</span>
          )}
        </div>
      )}

      {children}
    </div>
  );
}

// ── ChartContainer ────────────────────────────────────────────────────────────
export function ChartContainer({
  title,
  subtitle,
  actionElement,
  children,
  className,
  minHeight = 200,
}: {
  title: React.ReactNode;
  subtitle?: string;
  actionElement?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  minHeight?: number;
}) {
  return (
    <div className={`flex flex-col w-full p-6 bg-surface-card rounded-xl border border-border-main shadow-glass ${className ?? ""}`}>
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground-main">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-foreground-muted">{subtitle}</p>
          )}
        </div>
        {actionElement && <div className="shrink-0">{actionElement}</div>}
      </div>
      <div className="w-full flex-1 min-w-0" style={{ minHeight }}>
        {children}
      </div>
    </div>
  );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
type BadgeVariant = "green" | "red" | "amber" | "blue" | "indigo" | "slate";

// Semantic state colors stay as explicit Tailwind utilities — they are not
// part of the OS glass design system and do not need CSS variable mapping.
const badgeClasses: Record<BadgeVariant, string> = {
  green:  "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  red:    "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  amber:  "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  blue:   "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  indigo: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400",
  slate:  "bg-surface-soft text-foreground-muted",
};

export function StatusBadge({
  children,
  variant = "slate",
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
}) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeClasses[variant]}`}>
      {children}
    </span>
  );
}
