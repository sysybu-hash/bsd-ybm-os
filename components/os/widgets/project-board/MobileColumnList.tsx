"use client";

import React from "react";
import ItemActions from "@/components/os/ItemActions";
import { columns } from "./constants";
import type { BoardColumnId } from "@/lib/tasks/board-mapping";
import type { Task } from "./types";

type MobileColumnListProps = {
  boardPrefix: string;
  t: (key: string) => string;
  filteredTasks: Task[];
  activeCol: BoardColumnId;
  setActiveCol: (id: BoardColumnId) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
};

/** מובייל ללא פרויקט נבחר — טאבי עמודות + רשימת משימות פשוטה במקום קנבן */
export function MobileColumnList({
  boardPrefix,
  t,
  filteredTasks,
  activeCol,
  setActiveCol,
  onEdit,
  onDelete,
}: MobileColumnListProps) {
  return (
    <>
      <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[color:var(--border-main)] pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {columns.map((col) => {
          const count = filteredTasks.filter((task) => task.status === col.id).length;
          const active = activeCol === col.id;
          return (
            <button
              key={col.id}
              type="button"
              onClick={() => setActiveCol(col.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
                active
                  ? "bg-[color:var(--win-accent,#6366f1)] text-white shadow-sm"
                  : "border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
              }`}
            >
              {t(`${boardPrefix}.columns.${col.titleKey}`)}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                  active ? "bg-white/20" : "bg-[color:var(--foreground-muted)]/10"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2">
        {filteredTasks
          .filter((task) => task.status === activeCol)
          .map((task) => (
            <div
              key={task.id}
              className="flex items-start gap-3 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-3 transition-all hover:bg-[color:var(--surface-card)]/80"
            >
              <div className="min-w-0 flex-1">
                <h4 className="line-clamp-2 text-sm font-bold leading-snug text-[color:var(--foreground-main)]">
                  {task.title}
                </h4>
              </div>
              <ItemActions
                onEdit={() => onEdit(task)}
                onDelete={() => onDelete(task.id)}
                deleteConfirmMessage={t(`${boardPrefix}.deleteConfirm`)}
                deleteTitle={t(`${boardPrefix}.deleteTitle`)}
              />
            </div>
          ))}
      </div>
    </>
  );
}
