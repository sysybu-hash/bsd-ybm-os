"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import type { BoardColumnId, BoardPriorityId } from "@/lib/tasks/board-mapping";
import type { Task } from "./types";
import { columns, emptyForm } from "./constants";
import type { TaskFormState } from "./types";
import { DraggableTaskCard } from "./TaskCard";

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
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", status: column.id },
  });

  return (
    <div className="flex h-full min-h-0 w-72 shrink-0 flex-col gap-3">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${column.color}`}>
            {t(`${boardPrefix}.columns.${column.titleKey}`)}
          </span>
          <span className="text-xs text-slate-500 font-bold">{tasks.length}</span>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-2xl p-1 transition-colors ${
          isOver ? "bg-indigo-500/5 ring-2 ring-indigo-500/20" : ""
        }`}
      >
        {tasks.map((task) => (
          <DraggableTaskCard
            key={task.id}
            task={task}
            boardPrefix={boardPrefix}
            t={t}
            priorityLabel={priorityLabel}
            onEdit={onEdit}
            onDelete={onDelete}
            onStatusChange={onStatusChange}
            onBudgetChange={onBudgetChange}
          />
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
