"use client";

import React from "react";
import { BookOpen, Link2, ListTree, Pencil } from "lucide-react";
import { PROJECT_SUB_DOMAIN_BY_ID } from "@/lib/project-sub-domains";
import { TRADE_BAR, formatDateHe, parseDependencyIds, parseTime } from "./utils";
import type { GanttTask, GanttLabels } from "./types";

type GanttChartViewProps = {
  tasks: GanttTask[];
  range: { min: number; max: number };
  ticks: { label: string; left: number }[];
  todayLeft: number;
  taskById: Map<string, GanttTask>;
  hideConstructionFeatures: boolean;
  labels: GanttLabels;
  onEdit: (task: GanttTask) => void;
  onOpenDiary?: (task: GanttTask) => void;
  onCreateDiary?: (task: GanttTask) => Promise<void>;
};

export function GanttChartView({
  tasks, range, ticks, todayLeft, taskById,
  hideConstructionFeatures, labels, onEdit, onOpenDiary, onCreateDiary,
}: GanttChartViewProps) {
  const span = range.max - range.min || 1;

  return (
    <div className="overflow-x-auto rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/40 p-2 shadow-inner" dir="ltr">
      <div className="min-w-[560px]">
        {/* Tick header */}
        <div className="relative mb-1 grid grid-cols-[minmax(120px,160px)_1fr] gap-2 text-[10px] text-[color:var(--foreground-muted)]">
          <span />
          <div className="relative h-5 border-b border-[color:var(--border-main)]">
            {ticks.map((tick, i) => (
              <span key={`${tick.label}-${i}`} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${tick.left}%` }}>
                {tick.label}
              </span>
            ))}
            {todayLeft >= 0 && todayLeft <= 100 ? (
              <span className="absolute top-0 bottom-0 w-px bg-rose-400/80" style={{ left: `${todayLeft}%` }} title="היום" />
            ) : null}
          </div>
        </div>

        {/* Rows */}
        <div className="space-y-1.5">
          {tasks.map((task) => {
            const start = parseTime(task.startDate, range.min);
            const end = Math.max(parseTime(task.endDate, start + 86400000), start + 86400000);
            const left = ((start - range.min) / span) * 100;
            const width = Math.max(1.5, ((end - start) / span) * 100);
            const trade = task.tradeId ? PROJECT_SUB_DOMAIN_BY_ID[task.tradeId] : null;
            const deps = parseDependencyIds(task.dependencies);
            const barGrad = (task.tradeId && TRADE_BAR[task.tradeId]) || TRADE_BAR.GENERAL || "from-indigo-600/90 to-violet-600/80";
            const tooltip = [
              task.title, `${task.progress}%`,
              `${formatDateHe(task.startDate)} – ${formatDateHe(task.endDate)}`,
              trade?.labelHe,
              task.linkedBoqLabel ? `BOQ: ${task.linkedBoqLabel}` : null,
              deps.length ? `תלוי ב: ${deps.map((id) => taskById.get(id)?.title ?? id).join(", ")}` : null,
            ].filter(Boolean).join("\n");

            return (
              <div key={task.id} className="grid grid-cols-[minmax(120px,160px)_1fr] items-center gap-2 text-xs" dir="rtl" style={{ minHeight: 28 }}>
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  <span className="truncate font-medium" title={tooltip}>{task.title}</span>
                  {trade ? <span className="shrink-0 rounded bg-[color:var(--surface-elevated)] px-1 text-[9px] text-amber-200/90">{trade.labelHe}</span> : null}
                  {!hideConstructionFeatures && task.linkedBoqLineId ? (
                    <span className="shrink-0 rounded bg-emerald-500/15 px-1 text-[9px] text-emerald-200" title={task.linkedBoqLabel ?? labels.linkedBoq}>
                      <ListTree size={8} className="inline" />
                    </span>
                  ) : null}
                  {!hideConstructionFeatures && task.linkedWorkDiaryId ? (
                    <button type="button" className="shrink-0 rounded bg-sky-500/15 p-0.5 text-sky-200" title={labels.workDiary} onClick={() => onOpenDiary?.(task)}>
                      <BookOpen size={9} />
                    </button>
                  ) : !hideConstructionFeatures && onCreateDiary ? (
                    <button type="button" className="shrink-0 rounded p-0.5 text-[color:var(--foreground-muted)] hover:text-sky-300" title={labels.createDiary} onClick={() => void onCreateDiary(task)}>
                      <BookOpen size={9} />
                    </button>
                  ) : null}
                  <button type="button" className="shrink-0 rounded p-0.5 hover:bg-[color:var(--surface-elevated)]" onClick={() => onEdit(task)} aria-label={labels.editTask}>
                    <Pencil size={11} />
                  </button>
                </div>

                {/* Bar */}
                <div className="relative h-7 rounded-md bg-[color:var(--surface-elevated)]/80">
                  {todayLeft >= 0 && todayLeft <= 100 ? (
                    <span className="pointer-events-none absolute top-0 bottom-0 z-0 w-px bg-rose-400/50" style={{ left: `${todayLeft}%` }} />
                  ) : null}
                  <div
                    className={`absolute top-0.5 bottom-0.5 z-[1] rounded-md border border-white/10 bg-gradient-to-r shadow-sm ${barGrad}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={tooltip}
                  >
                    <div className="h-full rounded-md bg-emerald-400/45" style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }} />
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-white drop-shadow">
                      {task.progress}%
                    </span>
                  </div>
                  {deps.map((depId) => {
                    const pred = taskById.get(depId);
                    if (!pred) return null;
                    const predEnd = parseTime(pred.endDate, start);
                    const predLeft = ((predEnd - range.min) / span) * 100;
                    if (predLeft >= left) return null;
                    return (
                      <span key={depId}
                        className="pointer-events-none absolute top-1/2 z-[2] h-px -translate-y-1/2 border-t border-dashed border-amber-400/70"
                        style={{ left: `${predLeft}%`, width: `${Math.max(0.5, left - predLeft)}%` }}
                        title={`${pred.title} → ${task.title}`}
                      />
                    );
                  })}
                  {deps.length > 0 ? (
                    <span className="absolute -top-1 end-0 z-[3] flex items-center gap-0.5 rounded bg-amber-500/20 px-1 text-[9px] text-amber-100"
                      title={deps.map((id) => taskById.get(id)?.title ?? id).join(" → ")}>
                      <Link2 size={9} />{deps.length}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
