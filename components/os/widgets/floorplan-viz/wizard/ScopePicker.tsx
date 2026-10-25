"use client";

import React from "react";
import { Layers, View } from "lucide-react";
import type { FloorplanVizScope } from "@/lib/projects/floorplan-viz-scope";

type TFn = (key: string, vars?: Record<string, string>) => string;

/** One overview of the whole plan, or a full booklet with a view for every space. */
export default function ScopePicker({
  t,
  scope,
  onScope,
  disabled,
}: {
  t: TFn;
  scope: FloorplanVizScope;
  onScope: (scope: FloorplanVizScope) => void;
  disabled?: boolean;
}) {
  const option = (value: "overview" | "full", icon: React.ReactNode, title: string, hint: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={scope === value}
      disabled={disabled}
      onClick={() => onScope(value)}
      className={`rounded-xl border px-3 py-2 text-start ${
        scope === value ? "border-violet-500 bg-violet-500/10" : "border-[color:var(--border-main)] bg-[color:var(--background-main)]"
      }`}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-bold">
        {icon}
        {title}
      </span>
      <span className="mt-0.5 block text-[10px] text-[color:var(--foreground-muted)]">{hint}</span>
    </button>
  );
  return (
    <div role="radiogroup" aria-label={t("workspaceWidgets.floorplanViz.scopeLabel")} className="grid gap-2 sm:grid-cols-2">
      {option(
        "overview",
        <View size={14} aria-hidden />,
        t("workspaceWidgets.floorplanViz.scopeOverview"),
        t("workspaceWidgets.floorplanViz.scopeOverviewHint"),
      )}
      {option(
        "full",
        <Layers size={14} aria-hidden />,
        t("workspaceWidgets.floorplanViz.scopeFull"),
        t("workspaceWidgets.floorplanViz.scopeFullHint"),
      )}
    </div>
  );
}
