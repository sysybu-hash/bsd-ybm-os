"use client";

import React from "react";
import { parseDependencyIds, parseTime } from "./utils";
import type { GanttTask } from "./types";
import type { FlatTask } from "./utils";

type Props = {
  flatTasks: FlatTask[];
  taskById: Map<string, GanttTask>;
  range: { min: number; max: number };
  rowH: number;
};

export function GanttDependencyArrows({ flatTasks, taskById, range, rowH }: Props) {
  const span = range.max - range.min || 1;
  const rowIndexMap = new Map(flatTasks.map((t, i) => [t.id, i]));

  return (
    <svg
      className="pointer-events-none absolute inset-x-0 z-[5]"
      style={{ top: rowH, height: flatTasks.length * rowH }}
      overflow="visible"
    >
      {flatTasks.flatMap((task) => {
        const deps = parseDependencyIds(task.dependencies);
        return deps.map((depId) => {
          const pred = taskById.get(depId);
          if (!pred) return null;
          const predRowIdx = rowIndexMap.get(depId);
          const taskRowIdx = rowIndexMap.get(task.id);
          if (predRowIdx === undefined || taskRowIdx === undefined) return null;

          const predEnd   = parseTime(pred.endDate,   range.min);
          const taskStart = parseTime(task.startDate, range.min);
          const x1pct = ((predEnd   - range.min) / span) * 100;
          const x2pct = ((taskStart - range.min) / span) * 100;
          const y1 = predRowIdx * rowH + rowH / 2;
          const y2 = taskRowIdx * rowH + rowH / 2;
          const cx = (x1pct + x2pct) / 2;

          return (
            <g key={`${task.id}-${depId}`}>
              <path
                d={`M ${x1pct}% ${y1} C ${cx}% ${y1}, ${cx}% ${y2}, ${x2pct}% ${y2}`}
                fill="none"
                className="stroke-amber-400/60 dark:stroke-amber-400/50"
                strokeWidth="1.5"
                strokeDasharray="5 3"
              />
              <circle cx={`${x2pct}%`} cy={y2} r="3" className="fill-amber-400/70" />
            </g>
          );
        });
      })}
    </svg>
  );
}
