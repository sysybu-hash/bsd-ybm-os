"use client";

import React from "react";
import { BarChart3, Plus, Search, ArrowRight } from "lucide-react";

type BoardHeaderProps = {
  embedded: boolean;
  boardPrefix: string;
  t: (key: string) => string;
  selectedProjectName: string | null;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  onNewTask: () => void;
  onSwitchProject: () => void;
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
}: BoardHeaderProps) {
  const searchInput = (
    <div className="relative min-w-0 flex-1">
      <Search
        className="absolute end-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)]"
        size={14}
        aria-hidden
      />
      <input
        type="text"
        placeholder={t(`${boardPrefix}.searchPlaceholder`)}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 py-2 pe-9 ps-3 text-sm text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
      />
    </div>
  );

  const newTaskButton = (
    <button
      type="button"
      onClick={onNewTask}
      className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[color:var(--win-accent,#6366f1)] px-3 py-2 text-xs font-bold text-white hover:opacity-90 transition-all"
    >
      <Plus size={15} aria-hidden />
      {t(`${boardPrefix}.newTask`)}
    </button>
  );

  if (embedded) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--border-main)] px-3 py-2">
        {searchInput}
        {newTaskButton}
      </div>
    );
  }

  return (
    <div className="shrink-0 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50">
      {/* Top row: icon + title + new task */}
      <div className="flex items-center gap-3 px-3 py-2.5 sm:px-6 sm:py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-[color:var(--win-accent,#6366f1)] dark:text-indigo-400 sm:h-10 sm:w-10">
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
        <button
          type="button"
          onClick={onSwitchProject}
          className="flex shrink-0 items-center gap-1 rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)] transition-all"
        >
          <ArrowRight size={13} className="rtl:rotate-180" aria-hidden />
          <span className="hidden sm:inline">{t(`${boardPrefix}.switchProject`)}</span>
        </button>
      </div>
    </div>
  );
}
