"use client";

import React, { useMemo } from "react";
import { osFieldClassName } from "@/components/os/ui/os-field";

export type GanttTask = {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  progress: number;
};

type Props = {
  tasks: GanttTask[];
  onProgressChange: (taskId: string, progress: number) => void;
  labels: {
    task: string;
    start: string;
    end: string;
    progress: string;
    noTasks: string;
    listView: string;
    chartView: string;
  };
};

function parseTime(iso: string | null, fallback: number): number {
  if (!iso) return fallback;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? fallback : t;
}

export default function ProjectGanttChart({ tasks, onProgressChange, labels }: Props) {
  const [view, setView] = React.useState<"chart" | "table">("chart");

  const range = useMemo(() => {
    if (tasks.length === 0) {
      const now = Date.now();
      return { min: now, max: now + 7 * 86400000 };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const t of tasks) {
      const s = parseTime(t.startDate, Date.now());
      const e = parseTime(t.endDate, s + 7 * 86400000);
      min = Math.min(min, s);
      max = Math.max(max, e);
    }
    if (max <= min) max = min + 86400000;
    return { min, max };
  }, [tasks]);

  const span = range.max - range.min || 1;

  if (tasks.length === 0) {
    return <p className="py-4 text-center text-xs text-[color:var(--foreground-muted)]">{labels.noTasks}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setView("chart")}
          className={`rounded px-2 py-1 ${view === "chart" ? "bg-amber-500/20" : "border border-[color:var(--border-main)]"}`}
        >
          {labels.chartView}
        </button>
        <button
          type="button"
          onClick={() => setView("table")}
          className={`rounded px-2 py-1 ${view === "table" ? "bg-amber-500/20" : "border border-[color:var(--border-main)]"}`}
        >
          {labels.listView}
        </button>
      </div>

      {view === "chart" ? (
        <div className="overflow-x-auto rounded-lg border border-[color:var(--border-main)] p-2" dir="ltr">
          <div className="min-w-[480px] space-y-2">
            {tasks.map((task) => {
              const start = parseTime(task.startDate, range.min);
              const end = parseTime(task.endDate, start + 86400000);
              const left = ((start - range.min) / span) * 100;
              const width = Math.max(2, ((end - start) / span) * 100);
              return (
                <div key={task.id} className="grid grid-cols-[140px_1fr] items-center gap-2 text-xs" dir="rtl">
                  <span className="truncate text-end font-medium" title={task.title}>
                    {task.title}
                  </span>
                  <div className="relative h-6 rounded bg-[color:var(--surface-elevated)]">
                    <div
                      className="absolute top-0 h-full rounded bg-indigo-500/80"
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${task.progress}%`}
                    />
                    <div
                      className="absolute top-0 h-full rounded bg-indigo-300/60"
                      style={{ left: `${left}%`, width: `${(width * task.progress) / 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-xs">
            <thead>
              <tr className="border-b border-[color:var(--border-main)] text-[color:var(--foreground-muted)]">
                <th className="p-2 text-start">{labels.task}</th>
                <th className="p-2 text-start">{labels.start}</th>
                <th className="p-2 text-start">{labels.end}</th>
                <th className="p-2 text-start">{labels.progress}</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-b border-[color:var(--border-main)]/50">
                  <td className="p-2">{task.title}</td>
                  <td className="p-2">
                    {task.startDate ? new Date(task.startDate).toLocaleDateString("he-IL") : "—"}
                  </td>
                  <td className="p-2">
                    {task.endDate ? new Date(task.endDate).toLocaleDateString("he-IL") : "—"}
                  </td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className={`${osFieldClassName} w-16`}
                      defaultValue={task.progress}
                      onBlur={(e) => onProgressChange(task.id, Number(e.target.value))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
