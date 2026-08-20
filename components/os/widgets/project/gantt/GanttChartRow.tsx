"use client";

import React from "react";
import { Link2 } from "lucide-react";
import { TRADE_BAR, parseDependencyIds } from "./utils";
import type { GanttTask } from "./types";
import type { FlatTask } from "./utils";
import { DraggableGanttBar } from "./DraggableGanttBar";

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
  pixelsPerDay: number;
  taskById: Map<string, GanttTask>;
  onDatesChange: (taskId: string, startDate: string, endDate: string) => void;
  onProgressPointerDown?: (e: React.PointerEvent<HTMLDivElement>, task: FlatTask) => void;
};

export function GanttChartRow({
  task,
  idx,
  rowH,
  left,
  width,
  displayProgress,
  pixelsPerDay,
  taskById,
  onDatesChange,
  onProgressPointerDown,
}: Props) {
  const baseCls = (task.tradeId && TRADE_BAR[task.tradeId]) ?? TRADE_BAR.GENERAL ?? "bg-[color:var(--win-accent,#6366f1)]";
  const colorCls = barColorClass(task, baseCls);
  const deps = parseDependencyIds(task.dependencies);
  const isEven = idx % 2 === 0;

  return (
    <div
      className={`relative border-b border-[color:var(--border-main)]/40 transition-colors hover:bg-[color:var(--surface-soft)]/70 ${isEven ? "" : "bg-[color:var(--surface-soft)]/40"}`}
      style={{ height: rowH }}
    >
      <div
        className="absolute bottom-0 top-0 z-[2]"
        style={{ left: `${left}%`, width: `${width}%`, minWidth: 4 }}
      >
        {task.hasChildren ? (
          <div
            className={`absolute inset-y-3 inset-x-0 overflow-hidden rounded-md shadow-sm ${colorCls} cursor-default opacity-80`}
          >
            <div
              className="absolute inset-0 rounded-md bg-black/20"
              style={{ width: `${Math.min(100, Math.max(0, displayProgress))}%` }}
            />
            {width > 5 ? (
              <span className="pointer-events-none relative z-[1] flex h-full w-full items-center justify-center text-center text-[9px] font-semibold text-white drop-shadow-sm">
                {displayProgress}%
              </span>
            ) : null}
          </div>
        ) : (
          <DraggableGanttBar
            task={task}
            displayProgress={displayProgress}
            pixelsPerDay={pixelsPerDay}
            colorCls={colorCls}
            showLabel={width > 5}
            onDatesChange={onDatesChange}
            onProgressPointerDown={
              onProgressPointerDown
                ? (e) => onProgressPointerDown(e, task)
                : undefined
            }
          />
        )}
      </div>
      {deps.length > 0 ? (
        <span
          className="absolute end-1 top-1 z-[3] flex items-center gap-0.5 rounded bg-amber-100 px-1 text-[8px] text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          title={deps.map((id) => taskById.get(id)?.title ?? id).join(" → ")}
        >
          <Link2 size={8} />
          {deps.length}
        </span>
      ) : null}
    </div>
  );
}
