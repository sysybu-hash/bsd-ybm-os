"use client";

import React, { useCallback, useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, ListTree, Pencil } from "lucide-react";
import { PROJECT_SUB_DOMAIN_BY_ID } from "@/lib/project-sub-domains";
import {
  buildWeekendBands,
  flattenTaskTree,
  computeAggregateProgress,
  parseTime,
  type FlatTask,
} from "./utils";
import type { GanttTask, GanttLabels, Scale } from "./types";
import { GanttDependencyArrows } from "./GanttDependencyArrows";
import { GanttChartRow } from "./GanttChartRow";

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

const NAME_W = 220;
const ROW_H  = 44;

function barColorClass(task: FlatTask, defaultCls: string): string {
  const now = Date.now();
  const end = new Date(task.endDate ?? "").getTime();
  if (task.status === "DONE" || task.progress >= 100) return "bg-emerald-500";
  if (end && end < now && task.progress < 100) return "bg-rose-500";
  return defaultCls;
}

type StatusMeta = { label: string; dot: string };
function getStatusMeta(task: FlatTask): StatusMeta | null {
  const now = Date.now();
  const end = new Date(task.endDate ?? "").getTime();
  if (task.status === "DONE" || task.progress >= 100)
    return { label: "הושלם", dot: "bg-emerald-500" };
  if (end && end < now && task.progress < 100)
    return { label: "באיחור", dot: "bg-rose-500" };
  if (task.status === "IN_PROGRESS")
    return { label: "בביצוע", dot: "bg-blue-500" };
  return null;
}

export function GanttChartView({
  tasks, range, ticks, todayLeft, taskById,
  hideConstructionFeatures, scale, labels,
  onEdit, onProgressChange, onOpenDiary, onCreateDiary,
}: GanttChartViewProps) {
  const span = range.max - range.min || 1;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState<{ taskId: string; progress: number } | null>(null);

  const weekendBands = scale === "days" ? buildWeekendBands(range.min, range.max) : [];
  const flatTasks = flattenTaskTree(tasks, collapsed);

  const toggleCollapse = (id: string) =>
    setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleDragStart = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, task: FlatTask) => {
      if (task.hasChildren) return;
      e.preventDefault();
      const bar = document.querySelector<HTMLDivElement>(`[data-bar-id="${task.id}"]`);
      if (!bar) return;

      const getProgress = (clientX: number) => {
        const r = bar.getBoundingClientRect();
        return Math.min(100, Math.max(0, Math.round(((clientX - r.left) / r.width) * 100)));
      };

      setDragging({ taskId: task.id, progress: getProgress(e.clientX) });

      const onMove = (mv: MouseEvent) => setDragging({ taskId: task.id, progress: getProgress(mv.clientX) });
      const onUp   = (uv: MouseEvent) => {
        const p = getProgress(uv.clientX);
        setDragging(null);
        void onProgressChange(task.id, p);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [onProgressChange],
  );

  const rowIndexMap = new Map(flatTasks.map((t, i) => [t.id, i]));

  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-sm">
      <div className="flex" style={{ minWidth: 560 }}>

        {/* ── Sticky name column ── */}
        <div
          className="sticky start-0 z-20 shrink-0 border-e border-[color:var(--border-main)] bg-[color:var(--surface-card)]"
          style={{ width: NAME_W }}
        >
          {/* Header */}
          <div
            className="flex items-center border-b border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-3"
            style={{ height: ROW_H }}
          >
            <span className="text-[11px] font-semibold text-[color:var(--foreground-muted)] tracking-wide uppercase">
              {labels.task}
            </span>
          </div>

          {flatTasks.map((task, idx) => {
            const statusMeta = getStatusMeta(task);
            const trade = task.tradeId ? PROJECT_SUB_DOMAIN_BY_ID[task.tradeId] : null;
            const isEven = idx % 2 === 0;
            return (
              <div
                key={task.id}
                dir="rtl"
                className={`group flex items-center gap-1.5 border-b border-[color:var(--border-main)]/40 px-2 transition-colors hover:bg-[color:var(--surface-soft)] ${isEven ? "" : "bg-[color:var(--surface-soft)]/50"}`}
                style={{ height: ROW_H, paddingInlineStart: 8 + task.depth * 14 }}
              >
                {/* Expand/collapse */}
                {task.hasChildren ? (
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-[color:var(--foreground-muted)] hover:bg-[color:var(--border-main)] hover:text-[color:var(--foreground-main)]"
                    onClick={() => toggleCollapse(task.id)}
                  >
                    {collapsed.has(task.id) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  </button>
                ) : (
                  <span className="shrink-0" style={{ width: 21 }} />
                )}

                {/* Name */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-[color:var(--foreground-main)]" title={task.title}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {statusMeta ? (
                      <span className="flex items-center gap-0.5 text-[9px] text-[color:var(--foreground-muted)]">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${statusMeta.dot}`} />
                        {statusMeta.label}
                      </span>
                    ) : null}
                    {trade ? (
                      <span className="text-[9px] text-[color:var(--foreground-muted)]">{trade.labelHe}</span>
                    ) : null}
                  </div>
                </div>

                {/* Actions — shown on hover */}
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  {!hideConstructionFeatures && task.linkedBoqLineId ? (
                    <span className="rounded bg-emerald-100 p-0.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      title={task.linkedBoqLabel ?? labels.linkedBoq}>
                      <ListTree size={10} />
                    </span>
                  ) : null}
                  {!hideConstructionFeatures && task.linkedWorkDiaryId ? (
                    <button type="button"
                      className="rounded bg-sky-100 p-0.5 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                      title={labels.workDiary} onClick={() => onOpenDiary?.(task)}>
                      <BookOpen size={10} />
                    </button>
                  ) : !hideConstructionFeatures && onCreateDiary ? (
                    <button type="button"
                      className="rounded p-0.5 text-[color:var(--foreground-muted)] hover:text-sky-600"
                      title={labels.createDiary} onClick={() => void onCreateDiary(task)}>
                      <BookOpen size={10} />
                    </button>
                  ) : null}
                  <button type="button"
                    className="rounded p-0.5 text-[color:var(--foreground-muted)] hover:bg-[color:var(--border-main)] hover:text-[color:var(--foreground-main)]"
                    onClick={() => onEdit(task)} aria-label={labels.editTask}>
                    <Pencil size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Scrollable chart ── */}
        <div className="relative min-w-0 flex-1 overflow-x-auto" dir="ltr">

          {/* Weekend shade */}
          {weekendBands.map((band, i) => (
            <span key={i}
              className="pointer-events-none absolute top-0 bottom-0 bg-[color:var(--surface-soft)]/60"
              style={{ left: `${band.left}%`, width: `${band.width}%` }}
            />
          ))}

          {/* Today line */}
          {todayLeft >= 0 && todayLeft <= 100 ? (
            <span
              className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-blue-500/70"
              style={{ left: `${todayLeft}%` }}
            >
              <span className="absolute top-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-blue-500 px-1.5 py-0.5 text-[8px] font-semibold text-white shadow">
                {labels.ganttToday ?? "היום"}
              </span>
            </span>
          ) : null}

          {/* Tick header */}
          <div
            className="relative border-b border-[color:var(--border-main)] bg-[color:var(--surface-soft)]"
            style={{ height: ROW_H }}
          >
            <div className="absolute inset-0 flex items-center">
              {ticks.map((tick, i) => (
                <span key={`${tick.label}-${i}`}
                  className="absolute -translate-x-1/2 select-none whitespace-nowrap text-[10px] font-medium text-[color:var(--foreground-muted)]"
                  style={{ left: `${tick.left}%` }}>
                  {tick.label}
                </span>
              ))}
            </div>
            {/* Tick lines */}
            {ticks.map((tick, i) => (
              <span key={`line-${i}`}
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-[color:var(--border-main)]/50"
                style={{ left: `${tick.left}%` }}
              />
            ))}
          </div>

          {/* SVG dependency arrows */}
          <GanttDependencyArrows flatTasks={flatTasks} taskById={taskById} range={range} rowH={ROW_H} />

          {/* Tick vertical lines behind rows */}
          <div className="pointer-events-none absolute inset-x-0 z-0" style={{ top: ROW_H, bottom: 0 }}>
            {ticks.map((tick, i) => (
              <span key={`vline-${i}`}
                className="absolute top-0 bottom-0 w-px bg-[color:var(--border-main)]/30"
                style={{ left: `${tick.left}%` }}
              />
            ))}
          </div>

          {/* Rows */}
          <div className="relative z-[1]">
            {flatTasks.map((task, idx) => {
              const start = parseTime(task.startDate, range.min);
              const end   = Math.max(parseTime(task.endDate, start + 86400000), start + 86400000);
              const left  = ((start - range.min) / span) * 100;
              const width = Math.max(1, ((end - start) / span) * 100);
              const displayProgress = task.hasChildren
                ? computeAggregateProgress(task.id, tasks)
                : dragging?.taskId === task.id ? dragging.progress : task.progress;
              return (
                <GanttChartRow key={task.id} task={task} idx={idx} rowH={ROW_H}
                  left={left} width={width} displayProgress={displayProgress}
                  taskById={taskById} onDragStart={handleDragStart} />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
