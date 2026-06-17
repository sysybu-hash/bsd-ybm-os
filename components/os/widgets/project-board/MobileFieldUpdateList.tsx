"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, Clock, PlayCircle } from "lucide-react";
import type { BoardColumnId } from "@/lib/tasks/board-mapping";
import { formatBoardDueDate } from "@/lib/tasks/board-mapping";
import SmartFieldDiaryCapture from "./SmartFieldDiaryCapture";
import type { Task } from "./types";

type MobileFieldUpdateListProps = {
  tasks: Task[];
  t: (key: string, opts?: Record<string, string>) => string;
  boardPrefix: string;
  projectId?: string;
  projectName?: string | null;
  onStatusChange: (taskId: string, status: BoardColumnId) => void;
  onDiaryApplied?: () => void;
};

export default function MobileFieldUpdateList({
  tasks,
  t,
  boardPrefix,
  projectId,
  projectName,
  onStatusChange,
  onDiaryApplied,
}: MobileFieldUpdateListProps) {
  const prefix = `${boardPrefix}.mobileField`;
  const activeTasks = tasks.filter((task) => task.status !== "done" && task.status !== "review");

  return (
    <div className="space-y-4 pb-safe">
      {projectId ? (
        <SmartFieldDiaryCapture
          projectId={projectId}
          projectName={projectName}
          onApplied={onDiaryApplied}
        />
      ) : null}

      {activeTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-window border border-border-main bg-surface-card p-8 text-center">
          <CheckCircle2 className="mb-3 h-12 w-12 text-emerald-500 opacity-50" aria-hidden />
          <h3 className="text-lg font-bold text-foreground-main">{t(`${prefix}.allCaughtUpTitle`)}</h3>
          <p className="text-foreground-muted">{t(`${prefix}.allCaughtUpDesc`)}</p>
        </div>
      ) : (
        activeTasks.map((task) => (
          <div
            key={task.id}
            className="rounded-window border border-border-main bg-surface-card p-4 shadow-window"
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <h3 className="pe-4 text-base font-bold leading-tight text-foreground-main">
                {task.title}
              </h3>
              {task.status === "in-progress" ? (
                <span className="flex shrink-0 items-center rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-xs font-bold text-blue-600 dark:text-blue-400">
                  <span className="me-1.5 h-2 w-2 animate-pulse rounded-full bg-blue-600" aria-hidden />
                  {t(`${prefix}.inProgressBadge`)}
                </span>
              ) : null}
            </div>

            {projectId ? (
              <div className="mb-3">
                <SmartFieldDiaryCapture
                  projectId={projectId}
                  taskId={task.id}
                  taskTitle={task.title}
                  compact
                  onApplied={onDiaryApplied}
                />
              </div>
            ) : null}

            <div className="mb-4 flex items-center text-xs text-foreground-muted">
              <Clock className="me-1 h-3 w-3" aria-hidden />
              {t(`${prefix}.dueLabel`)}{" "}
              {task.dueDate ? formatBoardDueDate(task.dueDate) : t(`${prefix}.dueUnset`)}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border-main pt-4">
              {task.status === "todo" ? (
                <button
                  type="button"
                  onClick={() => onStatusChange(task.id, "in-progress")}
                  className="col-span-2 flex items-center justify-center gap-2 rounded-lg bg-brand-accent py-3 text-sm font-medium text-white shadow-sm transition-transform active:scale-95"
                >
                  <PlayCircle className="h-5 w-5" aria-hidden />
                  {t(`${prefix}.startWork`)}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onStatusChange(task.id, "review")}
                    className="flex items-center justify-center gap-2 rounded-lg border border-border-main bg-surface-soft py-3 text-sm font-medium text-foreground-main transition-transform active:scale-95"
                  >
                    <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden />
                    {t(`${prefix}.blockOrWait`)}
                  </button>
                  <button
                    type="button"
                    onClick={() => onStatusChange(task.id, "done")}
                    className="flex items-center justify-center gap-2 rounded-lg bg-emerald-500 py-3 text-sm font-medium text-white shadow-sm transition-transform active:scale-95"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    {t(`${prefix}.markDone`)}
                  </button>
                </>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
