"use client";

import React, { useMemo } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { osFieldClassName } from "@/components/os/ui/os-field";
import { PROJECT_SUB_DOMAIN_BY_ID } from "@/lib/project-sub-domains";
import { formatDateHe, flattenTaskTree } from "./utils";
import type { GanttTask, GanttLabels } from "./types";

type GanttTableViewProps = {
  tasks: GanttTask[];
  labels: GanttLabels;
  onEdit: (task: GanttTask) => void;
  onDelete: (taskId: string) => void;
  onProgressChange: (taskId: string, progress: number) => Promise<void>;
};

type StatusMeta = { label: string; cls: string };
function getStatusMeta(task: GanttTask): StatusMeta | null {
  const now = Date.now();
  const end = new Date(task.endDate ?? "").getTime();
  if (task.status === "DONE" || task.progress >= 100)
    return { label: "הושלם", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" };
  if (end && end < now && task.progress < 100)
    return { label: "באיחור", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" };
  if (task.status === "IN_PROGRESS")
    return { label: "בביצוע", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" };
  return null;
}

export function GanttTableView({ tasks, labels, onEdit, onDelete, onProgressChange }: GanttTableViewProps) {
  const flatTasks = useMemo(() => flattenTaskTree(tasks, new Set()), [tasks]);

  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-sm">
      <table className="w-full min-w-[540px] text-xs">
        <thead>
          <tr className="border-b border-[color:var(--border-main)] bg-[color:var(--surface-soft)]">
            <th className="px-3 py-2.5 text-start text-[11px] font-semibold uppercase tracking-wide text-[color:var(--foreground-muted)]">{labels.task}</th>
            <th className="px-3 py-2.5 text-start text-[11px] font-semibold uppercase tracking-wide text-[color:var(--foreground-muted)]">{labels.trade}</th>
            <th className="px-3 py-2.5 text-start text-[11px] font-semibold uppercase tracking-wide text-[color:var(--foreground-muted)]">{labels.start}</th>
            <th className="px-3 py-2.5 text-start text-[11px] font-semibold uppercase tracking-wide text-[color:var(--foreground-muted)]">{labels.end}</th>
            <th className="px-3 py-2.5 text-start text-[11px] font-semibold uppercase tracking-wide text-[color:var(--foreground-muted)]">{labels.progress}</th>
            <th className="px-2 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {flatTasks.map((task, idx) => {
            const badge = getStatusMeta(task);
            return (
              <tr
                key={task.id}
                className={`border-b border-[color:var(--border-main)]/40 transition-colors hover:bg-[color:var(--surface-soft)]/60 ${idx % 2 === 1 ? "bg-[color:var(--surface-soft)]/40" : ""}`}
              >
                <td className="px-3 py-2.5" style={{ paddingInlineStart: 12 + task.depth * 16 }}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[color:var(--foreground-main)]">{task.title}</span>
                    {badge ? (
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-[color:var(--foreground-muted)]">
                  {task.tradeId ? PROJECT_SUB_DOMAIN_BY_ID[task.tradeId]?.labelHe : "—"}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-[color:var(--foreground-muted)]">
                  {formatDateHe(task.startDate)}
                </td>
                <td className="px-3 py-2.5 tabular-nums text-[color:var(--foreground-muted)]">
                  {formatDateHe(task.endDate)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <input
                      type="number" min={0} max={100}
                      className={`${osFieldClassName} w-16`}
                      defaultValue={task.progress}
                      onBlur={(e) => void onProgressChange(task.id, Number(e.target.value))}
                    />
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[color:var(--border-main)]">
                      <div
                        className="h-full rounded-full bg-indigo-500 transition-all"
                        style={{ width: `${Math.min(100, task.progress)}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded-md border border-[color:var(--border-main)] p-1.5 text-[color:var(--foreground-muted)] transition-colors hover:border-indigo-300 hover:text-indigo-600 dark:hover:border-indigo-700 dark:hover:text-indigo-400"
                      onClick={() => onEdit(task)}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-[color:var(--border-main)] p-1.5 text-[color:var(--foreground-muted)] transition-colors hover:border-rose-300 hover:text-rose-600 dark:hover:border-rose-700 dark:hover:text-rose-400"
                      onClick={() => { if (confirm(labels.deleteConfirm)) onDelete(task.id); }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
