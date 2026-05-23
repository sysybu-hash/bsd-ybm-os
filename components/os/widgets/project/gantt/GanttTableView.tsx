"use client";

import React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { osFieldClassName } from "@/components/os/ui/os-field";
import { PROJECT_SUB_DOMAIN_BY_ID } from "@/lib/project-sub-domains";
import { formatDateHe } from "./utils";
import type { GanttTask, GanttLabels } from "./types";

type GanttTableViewProps = {
  tasks: GanttTask[];
  labels: GanttLabels;
  onEdit: (task: GanttTask) => void;
  onDelete: (taskId: string) => void;
  onProgressChange: (taskId: string, progress: number) => Promise<void>;
};

export function GanttTableView({ tasks, labels, onEdit, onDelete, onProgressChange }: GanttTableViewProps) {
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
          {tasks.map((task) => (
            <tr key={task.id} className="border-t border-[color:var(--border-main)]/50">
              <td className="p-2 font-medium">{task.title}</td>
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
