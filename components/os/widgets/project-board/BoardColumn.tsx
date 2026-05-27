"use client";

import React from "react";
import { Plus, Clock, User } from "lucide-react";
import ItemActions from "@/components/os/ItemActions";
import { formatBoardDueDate, type BoardColumnId, type BoardPriorityId } from "@/lib/tasks/board-mapping";
import type { Task } from "./types";
import { columns, emptyForm } from "./constants";
import type { TaskFormState } from "./types";

type BoardColumnProps = {
  column: (typeof columns)[number];
  tasks: Task[];
  boardPrefix: string;
  t: (key: string) => string;
  priorityLabel: (p: BoardPriorityId) => string;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, status: BoardColumnId) => void;
  onBudgetChange: (taskId: string, budget: number) => void;
  onAddInColumn: (form: TaskFormState) => void;
  selectedProjectName?: string | null;
};

export function BoardColumn({
  column, tasks, boardPrefix, t, priorityLabel,
  onEdit, onDelete, onStatusChange, onBudgetChange, onAddInColumn, selectedProjectName,
}: BoardColumnProps) {
  return (
    <div className="flex-shrink-0 w-72 flex flex-col gap-4">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${column.color}`}>
            {t(`${boardPrefix}.columns.${column.titleKey}`)}
          </span>
          <span className="text-xs text-slate-500 font-bold">{tasks.length}</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-2xl p-4 hover:bg-[color:var(--surface-card)]/80 transition-all group shadow-sm dark:shadow-none"
          >
            <div className="flex justify-between items-start mb-3 gap-2">
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${
                  task.priority === "high"
                    ? "bg-rose-500/20 text-rose-600 dark:text-rose-400"
                    : task.priority === "medium"
                      ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                      : "bg-[color:var(--foreground-muted)]/20 text-[color:var(--foreground-muted)]"
                }`}
              >
                {priorityLabel(task.priority)}
              </span>
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <ItemActions
                    onEdit={() => onEdit(task)}
                    onDelete={() => onDelete(task.id)}
                    deleteConfirmMessage={t(`${boardPrefix}.deleteConfirm`)}
                    deleteTitle={t(`${boardPrefix}.deleteTitle`)}
                  />
                </div>
                <span className="text-[10px] font-bold text-[color:var(--foreground-muted)]">₪</span>
                <input
                  type="number"
                  inputMode="decimal"
                  defaultValue={task.budget}
                  onBlur={(e) => onBudgetChange(task.id, parseFloat(e.target.value) || 0)}
                  className="w-16 bg-transparent border-none text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold focus:ring-0 p-0 text-left"
                  aria-label={t(`${boardPrefix}.fields.budget`)}
                />
              </div>
            </div>

            <h4 className="text-sm font-bold text-[color:var(--foreground-main)] mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">
              {task.title}
            </h4>

            {task.description ? (
              <p className="text-[10px] text-[color:var(--foreground-muted)] mb-2 line-clamp-2">
                {task.description}
              </p>
            ) : null}

            <div className="flex items-center gap-2 mb-3">
              <select
                value={task.status}
                onChange={(e) => onStatusChange(task.id, e.target.value as BoardColumnId)}
                className="bg-[color:var(--surface-card)] border border-[color:var(--border-main)] rounded-lg px-2 py-1 text-[10px] font-bold text-[color:var(--foreground-muted)] outline-none focus:ring-1 focus:ring-indigo-500/50"
                aria-label={t(`${boardPrefix}.fields.status`)}
              >
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {t(`${boardPrefix}.columns.${col.titleKey}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-0.5 mb-4">
              <div className="flex items-center gap-1.5 text-[10px] text-[color:var(--foreground-muted)] opacity-80">
                <User size={10} aria-hidden />
                <span>{task.clientName || "—"}</span>
              </div>
            </div>

            <div className="flex justify-between items-center border-t border-[color:var(--border-main)]/30 pt-3">
              <div className="flex items-center gap-1.5 text-[color:var(--foreground-muted)]">
                <Clock size={12} aria-hidden />
                <span className="text-[10px] font-medium">{formatBoardDueDate(task.dueDate)}</span>
              </div>
              <button
                type="button"
                onClick={() => onEdit(task)}
                className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              >
                {t("workspaceWidgets.itemActions.edit")}
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => onAddInColumn({ ...emptyForm(selectedProjectName ?? ""), status: column.id })}
          className="w-full py-3 border-2 border-dashed border-[color:var(--border-main)] rounded-2xl text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] hover:border-[color:var(--foreground-muted)] transition-all text-xs font-bold flex items-center justify-center gap-2"
        >
          <Plus size={14} /> {t(`${boardPrefix}.addCard`)}
        </button>
      </div>
    </div>
  );
}
