"use client";

import React from "react";
import { BarChart3, Plus, ArrowRight, RefreshCw } from "lucide-react";
import { OsButton, OsIconButton, OsSearchInput } from "@/components/os/ui";

type BoardHeaderProps = {
  embedded: boolean;
  boardPrefix: string;
  t: (key: string) => string;
  selectedProjectName: string | null;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  onNewTask: () => void;
  onSwitchProject: () => void;
  onRefresh?: () => void;
};

/** כותרת לוח המשימות — גרסה מלאה (עם החלפת פרויקט) או קומפקטית ל-embedded */
export function BoardHeader({
  embedded,
  boardPrefix,
  t,
  selectedProjectName,
  searchQuery,
  setSearchQuery,
  onNewTask,
  onSwitchProject,
  onRefresh,
}: BoardHeaderProps) {
  const searchInput = (
    <OsSearchInput
      value={searchQuery}
      onChange={setSearchQuery}
      label={t(`${boardPrefix}.searchPlaceholder`)}
      className="min-w-0 flex-1"
    />
  );

  const newTaskButton = (
    <OsButton variant="primary" size="sm" icon={<Plus size={15} aria-hidden />} onClick={onNewTask}>
      {t(`${boardPrefix}.newTask`)}
    </OsButton>
  );

  const refreshButton = onRefresh ? (
    <OsIconButton label={t("common.refresh")} size="sm" onClick={onRefresh}>
      <RefreshCw size={16} aria-hidden />
    </OsIconButton>
  ) : null;

  if (embedded) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--border-main)] px-3 py-2">
        {searchInput}
        {refreshButton}
        {newTaskButton}
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50">
      {/* Top row: icon + title + new task */}
      <div className="flex items-center gap-3 px-3 py-2.5 sm:px-6 sm:py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--win-accent,#6366f1)]/10 text-[color:var(--win-accent,#6366f1)] sm:h-10 sm:w-10">
          <BarChart3 size={20} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold sm:text-xl">
            {selectedProjectName ?? t(`${boardPrefix}.headerTitle`)}
          </h2>
        </div>
        {newTaskButton}
      </div>

      {/* Bottom row: search + switch */}
      <div className="flex items-center gap-2 px-3 pb-2.5 sm:px-6">
        {searchInput}
        {refreshButton}
        <OsButton
          variant="secondary"
          size="sm"
          icon={<ArrowRight size={13} className="rtl:rotate-180" aria-hidden />}
          onClick={onSwitchProject}
        >
          <span className="hidden sm:inline">{t(`${boardPrefix}.switchProject`)}</span>
        </OsButton>
      </div>
    </div>
  );
}
