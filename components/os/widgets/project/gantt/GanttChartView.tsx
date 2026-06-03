"use client";

import React, { useCallback, useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Link2, ListTree, Pencil } from "lucide-react";
import { PROJECT_SUB_DOMAIN_BY_ID } from "@/lib/project-sub-domains";
import {
  TRADE_BAR,
  buildWeekendBands,
  flattenTaskTree,
  computeAggregateProgress,
  parseDependencyIds,
  parseTime,
  type FlatTask,
} from "./utils";
import type { GanttTask, GanttLabels, Scale } from "./types";

type GanttChartViewProps = {
  tasks: GanttTask[];
  range: { min: number; max: number };
  ticks: { label: string; left: number }[];
  todayLeft: number;
  taskById: Map<string, GanttTask>;
  hideConstructionFeatures: boolean;
  scale: Scale;
  labels: GanttLabels;
  onEdit: (task: GanttTask) => void;
  onProgressChange: (taskId: string, progress: number) => Promise<void>;
  onOpenDiary?: (task: GanttTask) => void;
  onCreateDiary?: (task: GanttTask) => Promise<void>;
};

function taskBarColor(task: GanttTask, defaultGrad: string): string {
  const now = Date.now();
  const end = new Date(task.endDate ?? "").getTime();
  if (task.status === "DONE" || task.progress >= 100) {
    return "from-emerald-600/90 to-green-500/80";
  }
  if (end && end < now && task.progress < 100) {
    return "from-rose-600/90 to-red-500/80";
  }
  return defaultGrad;
}

function statusChip(task: GanttTask): { label: string; cls: string } | null {
  const now = Date.now();
  const end = new Date(task.endDate ?? "").getTime();
  if (task.status === "DONE" || task.progress >= 100) {
    return { label: "הושלם", cls: "bg-emerald-500/20 text-emerald-200" };
  }
  if (end && end < now && task.progress < 100) {
    return { label: "באיחור", cls: "bg-rose-500/20 text-rose-300" };
  }
  if (task.status === "IN_PROGRESS") {
    return { label: "בביצוע", cls: "bg-indigo-500/20 text-indigo-200" };
  }
  return null;
}

export function GanttChartView({
  tasks,
  range,
  ticks,
  todayLeft,
  taskById,
  hideConstructionFeatures,
  scale,
  labels,
  onEdit,
  onProgressChange,
  onOpenDiary,
  onCreateDiary,
}: GanttChartViewProps) {
  const span = range.max - range.min || 1;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<{ taskId: string; progress: number } | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const weekendBands = scale === "days" ? buildWeekendBands(range.min, range.max) : [];
  const flatTasks = flattenTaskTree(tasks, collapsed);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleProgressDragStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, task: FlatTask, barLeft: number, barWidth: number) => {
      if (task.hasChildren) return; // aggregate — not draggable
      e.preventDefault();
      const rect = e.currentTarget.closest<HTMLDivElement>("[data-bar-container]")?.getBoundingClientRect();
      if (!rect) return;
      const pct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
      const clamped = Math.min(100, Math.max(0, pct));
      setDragging({ taskId: task.id, progress: clamped });

      const onMove = (mv: MouseEvent) => {
        const r = document.querySelector<HTMLDivElement>(`[data-bar-id="${task.id}"]`)?.getBoundingClientRect();
        if (!r) return;
        const p = Math.round(((mv.clientX - r.left) / r.width) * 100);
        setDragging({ taskId: task.id, progress: Math.min(100, Math.max(0, p)) });
      };
      const onUp = (uv: MouseEvent) => {
        const r = document.querySelector<HTMLDivElement>(`[data-bar-id="${task.id}"]`)?.getBoundingClientRect();
        const finalPct = r
          ? Math.min(100, Math.max(0, Math.round(((uv.clientX - r.left) / r.width) * 100)))
          : clamped;
        setDragging(null);
        void onProgressChange(task.id, finalPct);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [onProgressChange],
  );

  // Build SVG dependency arrows
  const rowIndexMap = new Map(flatTasks.map((t, i) => [t.id, i]));
  const ROW_H = 36; // px per row
  const NAME_W = 168; // px — must match the sticky column width

  return (
    <div className="overflow-x-auto rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/40 shadow-inner">
      <div className="flex min-w-[600px]" ref={chartRef}>

        {/* ── Sticky name column ── */}
        <div
          className="sticky start-0 z-20 flex shrink-0 flex-col border-e border-[color:var(--border-main)]/60 bg-[color:var(--surface-card)]"
          style={{ width: NAME_W }}
        >
          {/* Tick header spacer */}
          <div className="h-7 border-b border-[color:var(--border-main)]/60 bg-[color:var(--surface-elevated)]/60" />

          {flatTasks.map((task, idx) => {
            const chip = statusChip(task);
            const trade = task.tradeId ? PROJECT_SUB_DOMAIN_BY_ID[task.tradeId] : null;
            return (
              <div
                key={task.id}
                dir="rtl"
                className={`flex items-center gap-1 border-b border-[color:var(--border-main)]/30 px-1 text-xs transition-colors hover:bg-indigo-500/5 ${idx % 2 === 1 ? "bg-[color:var(--surface-elevated)]/10" : ""}`}
                style={{ height: ROW_H, paddingInlineStart: 4 + task.depth * 12 }}
              >
                {task.hasChildren ? (
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 hover:bg-[color:var(--surface-elevated)]"
                    onClick={() => toggleCollapse(task.id)}
                    aria-label={collapsed.has(task.id) ? "הרחב" : "כווץ"}
                  >
                    {collapsed.has(task.id) ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                  </button>
                ) : (
                  <span className="w-[15px] shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium leading-tight" title={task.title}>
                  {task.title}
                </span>
                {chip ? (
                  <span className={`shrink-0 rounded px-1 text-[8px] ${chip.cls}`}>{chip.label}</span>
                ) : null}
                {trade ? (
                  <span className="shrink-0 rounded bg-[color:var(--surface-elevated)] px-1 text-[8px] text-amber-200/90 hidden xl:inline">
                    {trade.labelHe}
                  </span>
                ) : null}
                {!hideConstructionFeatures && task.linkedBoqLineId ? (
                  <span className="shrink-0 rounded bg-emerald-500/15 p-0.5 text-emerald-200" title={task.linkedBoqLabel ?? labels.linkedBoq}>
                    <ListTree size={9} />
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
                  <Pencil size={10} />
                </button>
              </div>
            );
          })}
        </div>

        {/* ── Scrollable chart area ── */}
        <div className="relative flex-1 overflow-x-auto" dir="ltr">
          {/* Weekend shade bands */}
          {weekendBands.map((band, i) => (
            <span
              key={i}
              className="pointer-events-none absolute top-0 bottom-0 bg-[color:var(--surface-elevated)]/25"
              style={{ left: `${band.left}%`, width: `${band.width}%` }}
            />
          ))}

          {/* Today line — full height */}
          {todayLeft >= 0 && todayLeft <= 100 ? (
            <>
              <span
                className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-rose-400/70"
                style={{ left: `${todayLeft}%` }}
              />
              <span
                className="pointer-events-none absolute top-1 z-10 rounded bg-rose-500/80 px-1 text-[8px] text-white -translate-x-1/2"
                style={{ left: `${todayLeft}%` }}
              >
                {labels.ganttToday ?? "היום"}
              </span>
            </>
          ) : null}

          {/* Tick header */}
          <div className="relative h-7 border-b border-[color:var(--border-main)]/60 bg-[color:var(--surface-elevated)]/60">
            {ticks.map((tick, i) => (
              <span
                key={`${tick.label}-${i}`}
                className="absolute top-1 -translate-x-1/2 whitespace-nowrap text-[9px] text-[color:var(--foreground-muted)]"
                style={{ left: `${tick.left}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>

          {/* SVG dependency arrows overlay */}
          <svg
            className="pointer-events-none absolute top-7 start-0 w-full"
            style={{ height: flatTasks.length * ROW_H }}
            overflow="visible"
          >
            {flatTasks.map((task) => {
              const deps = parseDependencyIds(task.dependencies);
              return deps.map((depId) => {
                const pred = taskById.get(depId);
                if (!pred) return null;
                const predRowIdx = rowIndexMap.get(depId);
                const taskRowIdx = rowIndexMap.get(task.id);
                if (predRowIdx === undefined || taskRowIdx === undefined) return null;

                const predEnd = parseTime(pred.endDate, range.min);
                const taskStart = parseTime(task.startDate, range.min);
                const predLeft = ((predEnd - range.min) / span) * 100;
                const taskLeft = ((taskStart - range.min) / span) * 100;

                const x1 = `${predLeft}%`;
                const y1 = predRowIdx * ROW_H + ROW_H / 2;
                const x2 = `${taskLeft}%`;
                const y2 = taskRowIdx * ROW_H + ROW_H / 2;

                return (
                  <g key={`${task.id}-${depId}`}>
                    <path
                      d={`M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`}
                      fill="none"
                      stroke="rgb(251 191 36 / 0.6)"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                    />
                    <circle cx={x2} cy={y2} r="3" fill="rgb(251 191 36 / 0.7)" />
                  </g>
                );
              });
            })}
          </svg>

          {/* Rows */}
          <div>
            {flatTasks.map((task, idx) => {
              const start = parseTime(task.startDate, range.min);
              const end = Math.max(parseTime(task.endDate, start + 86400000), start + 86400000);
              const left = ((start - range.min) / span) * 100;
              const width = Math.max(1.5, ((end - start) / span) * 100);

              const barGrad = (task.tradeId && TRADE_BAR[task.tradeId]) || TRADE_BAR.GENERAL || "from-indigo-600/90 to-violet-600/80";
              const coloredGrad = taskBarColor(task, barGrad);

              const displayProgress = task.hasChildren
                ? computeAggregateProgress(task.id, tasks)
                : dragging?.taskId === task.id
                  ? dragging.progress
                  : task.progress;

              return (
                <div
                  key={task.id}
                  className={`relative border-b border-[color:var(--border-main)]/30 transition-colors hover:bg-indigo-500/5 ${idx % 2 === 1 ? "bg-[color:var(--surface-elevated)]/10" : ""}`}
                  style={{ height: ROW_H }}
                >
                  <div
                    data-bar-container
                    data-bar-id={task.id}
                    className={`absolute top-1.5 bottom-1.5 z-[1] rounded-md border border-white/10 bg-gradient-to-r shadow-sm ${coloredGrad} ${task.hasChildren ? "" : "cursor-ew-resize"}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    onMouseDown={
                      task.hasChildren ? undefined : (e) => handleProgressDragStart(e, task, left, width)
                    }
                  >
                    <div
                      className="h-full rounded-md bg-white/20"
                      style={{ width: `${Math.min(100, Math.max(0, displayProgress))}%` }}
                    />
                    {width > 4 ? (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[8px] font-semibold text-white drop-shadow select-none">
                        {displayProgress}%
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
