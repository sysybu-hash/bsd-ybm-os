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

function statusBadge(task: GanttTask): { label: string; cls: string } | null {
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

export function GanttTableView({ tasks, labels, onEdit, onDelete, onProgressChange }: GanttTableViewProps) {
  const flatTasks = useMemo(() => flattenTaskTree(tasks, new Set()), [tasks]);

  return (
    <div className="overflow-x-auto rounded-xl border border-[color:var(--border-main)]">
      <table className="w-full min-w-[520px] text-xs">
        <thead>
          <tr className="bg-[color:var(--surface-elevated)]/60 text-[color:var(--foreground-muted)]">
            <th className="p-2 text-start">{labels.task}</th>
            <th className="p-2 text-start">{labels.trade}</th>
            <th className="p-2 text-start">{labels.start}</th>
            <th className="p-2 text-start">{labels.end}</th>
            <th className="p-2 text-start">{labels.progress}</th>
            <th className="p-2 text-start" />
          </tr>
        </thead>
        <tbody>
          {flatTasks.map((task, idx) => {
            const badge = statusBadge(task);
            return (
              <tr
                key={task.id}
                className={`border-t border-[color:var(--border-main)]/50 ${idx % 2 === 1 ? "bg-[color:var(--surface-elevated)]/10" : ""}`}
              >
                <td className="p-2" style={{ paddingInlineStart: 8 + task.depth * 14 }}>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{task.title}</span>
                    {badge ? (
                      <span className={`rounded px-1 text-[9px] ${badge.cls}`}>{badge.label}</span>
                    ) : null}
                  </div>
                </td>
                <td className="p-2 text-[color:var(--foreground-muted)]">
                  {task.tradeId ? PROJECT_SUB_DOMAIN_BY_ID[task.tradeId]?.labelHe : "—"}
                </td>
                <td className="p-2">{formatDateHe(task.startDate)}</td>
                <td className="p-2">{formatDateHe(task.endDate)}</td>
                <td className="p-2">
                  <input
                    type="number" min={0} max={100}
                    className={`${osFieldClassName} w-14`}
                    defaultValue={task.progress}
                    onBlur={(e) => void onProgressChange(task.id, Number(e.target.value))}
                  />
                </td>
                <td className="p-2">
                  <div className="flex gap-1">
                    <button type="button" className="rounded border border-[color:var(--border-main)] p-1" onClick={() => onEdit(task)}>
                      <Pencil size={12} />
                    </button>
                    <button type="button" className="rounded border border-rose-500/40 p-1 text-rose-300"
                      onClick={() => { if (confirm(labels.deleteConfirm)) onDelete(task.id); }}>
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
