"use client";

import React from "react";
import { ArrowUpRight, Clock, Folder, HardDrive, Trash2 } from "lucide-react";
import type { ArchiveView, ErpArchiveFile, ProjectRow } from "./types";
import AccountingExportPanel from "@/components/os/widgets/AccountingExportPanel";

type ArchiveSidebarProps = {
  archiveView: ArchiveView;
  recentOnly: boolean;
  projectId: string | null;
  projects: ProjectRow[];
  totalCount: number;
  filesCount: number;
  trashCount: number;
  onSelectScope: (next: { view?: ArchiveView; recentOnly?: boolean; projectId?: string | null }) => void;
};

export function ArchiveSidebar({
  archiveView,
  recentOnly,
  projectId,
  projects,
  totalCount,
  filesCount,
  trashCount,
  onSelectScope,
}: ArchiveSidebarProps) {
  const sidebarActiveAll = archiveView === "active" && !recentOnly && projectId === null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-1 min-h-0 flex-col overflow-auto p-3 sm:p-6">
        <div className="mb-8 flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <HardDrive size={20} aria-hidden />
          <span className="text-sm font-black uppercase tracking-widest">ארכיון ERP</span>
        </div>

        <nav className="space-y-1">
          <button
            type="button"
            onClick={() => onSelectScope({ view: "active", recentOnly: false, projectId: null })}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
              sidebarActiveAll
                ? "border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/80 font-bold text-[color:var(--foreground-main)] shadow-sm"
                : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/5 hover:text-[color:var(--foreground-main)]"
            }`}
          >
            <Folder size={16} className="text-amber-600 dark:text-amber-400" aria-hidden />
            כל הארכיון
          </button>
          <button
            type="button"
            onClick={() => onSelectScope({ view: "active", recentOnly: true, projectId: null })}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
              archiveView === "active" && recentOnly && projectId === null
                ? "border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/80 font-bold text-[color:var(--foreground-main)] shadow-sm"
                : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/5 hover:text-[color:var(--foreground-main)]"
            }`}
          >
            <Clock size={16} aria-hidden />
            אחרונים
          </button>
          <button
            type="button"
            onClick={() => onSelectScope({ view: "shared" })}
            className={`flex w-full items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
              archiveView === "shared"
                ? "border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/80 font-bold text-[color:var(--foreground-main)] shadow-sm"
                : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/5 hover:text-[color:var(--foreground-main)]"
            }`}
          >
            <ArrowUpRight size={16} aria-hidden />
            שותפו איתי
          </button>
          <button
            type="button"
            onClick={() => onSelectScope({ view: "trash" })}
            className={`flex w-full items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
              archiveView === "trash"
                ? "border border-rose-500/30 bg-rose-500/10 font-bold text-rose-700 dark:text-rose-300"
                : "text-[color:var(--foreground-muted)] hover:bg-rose-600/10 hover:text-rose-600 dark:hover:text-rose-400"
            }`}
          >
            <span className="flex items-center gap-3">
              <Trash2 size={16} aria-hidden />
              פח אשפה
            </span>
            {trashCount > 0 ? (
              <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold">{trashCount}</span>
            ) : null}
          </button>
        </nav>

        <div className="mt-10">
          <span className="mb-4 block px-4 text-[10px] font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">
            פרויקטים
          </span>
          <div className="space-y-1">
            {projects.length === 0 ? (
              <p className="px-4 text-xs text-[color:var(--foreground-muted)]">אין פרויקטים</p>
            ) : (
              projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectScope({ view: "active", recentOnly: false, projectId: p.id })}
                  className={`flex w-full max-w-full items-center gap-3 truncate rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                    archiveView === "active" && projectId === p.id
                      ? "border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/80 text-[color:var(--foreground-main)] shadow-sm"
                      : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/5 hover:text-[color:var(--foreground-main)]"
                  }`}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--foreground-muted)] opacity-50" />
                  <span className="truncate">{p.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-[color:var(--border-main)] p-4">
        <AccountingExportPanel />
      </div>

      <div className="border-t border-[color:var(--border-main)] p-6">
        <div className="flex items-center justify-between text-[10px] font-bold text-[color:var(--foreground-muted)]">
          <span>קבצים בארגון</span>
          <span className="text-[color:var(--foreground-main)] opacity-90">{totalCount}</span>
        </div>
        <p className="mt-1 text-[10px] text-[color:var(--foreground-muted)] opacity-80">
          תוצאות במסך: {filesCount}
        </p>
      </div>
    </div>
  );
}
