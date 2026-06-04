"use client";

import React from "react";
import { Link2 } from "lucide-react";
import { TRADE_BAR, parseDependencyIds } from "./utils";
import type { GanttTask } from "./types";
import type { FlatTask } from "./utils";

function barColorClass(task: FlatTask, defaultCls: string): string {
  const now = Date.now();
  const end = new Date(task.endDate ?? "").getTime();
  if (task.status === "DONE" || task.progress >= 100) return "bg-emerald-500";
  if (end && end < now && task.progress < 100) return "bg-rose-500";
  return defaultCls;
}

type Props = {
  task: FlatTask;
  idx: number;
  rowH: number;
  left: number;
  width: number;
  displayProgress: number;
  taskById: Map<string, GanttTask>;
  onDragStart: (e: React.MouseEvent<HTMLDivElement>, task: FlatTask) => void;
};

export function GanttChartRow({
  task, idx, rowH, left, width, displayProgress, taskById, onDragStart,
}: Props) {
  const baseCls = (task.tradeId && TRADE_BAR[task.tradeId]) ?? TRADE_BAR.GENERAL ?? "bg-indigo-500";
  const colorCls = barColorClass(task, baseCls);
  const deps = parseDependencyIds(task.dependencies);
  const isEven = idx % 2 === 0;

  return (
    <div
      className={`relative border-b border-[color:var(--border-main)]/40 transition-colors hover:bg-[color:var(--surface-soft)]/70 ${isEven ? "" : "bg-[color:var(--surface-soft)]/40"}`}
      style={{ height: rowH }}
    >
      <div
        data-bar-id={task.id}
        className={`absolute bottom-3 top-3 z-[2] flex items-center overflow-hidden rounded-md shadow-sm ${colorCls} ${task.hasChildren ? "cursor-default" : "cursor-ew-resize"}`}
        style={{ left: `${left}%`, width: `${width}%`, minWidth: 4 }}
        onMouseDown={task.hasChildren ? undefined : (e) => onDragStart(e, task)}
        title={`${task.title} · ${displayProgress}%`}
      >
        <div className="absolute inset-0 rounded-md bg-black/20"
          style={{ width: `${Math.min(100, Math.max(0, displayProgress))}%` }} />
        {width > 5 ? (
          <span className="pointer-events-none relative z-[1] w-full select-none text-center text-[9px] font-semibold text-white drop-shadow-sm">
            {displayProgress}%
          </span>
        ) : null}
      </div>
      {deps.length > 0 ? (
        <span
          className="absolute end-1 top-1 z-[3] flex items-center gap-0.5 rounded bg-amber-100 px-1 text-[8px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          title={deps.map((id) => taskById.get(id)?.title ?? id).join(" → ")}
        >
          <Link2 size={8} />{deps.length}
        </span>
      ) : null}
    </div>
  );
}
