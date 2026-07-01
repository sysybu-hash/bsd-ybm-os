"use client";

import { useState } from "react";
import { ChevronLeft, FolderPlus, Trash2, X } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";

export type ProjectListItem = { id: string; name: string; isActive?: boolean };

type ProjectPickerPanelProps = {
  projects: ProjectListItem[];
  loading: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => Promise<void>;
  titleKey: string;
  descKey: string;
  loadingKey: string;
  emptyKey: string;
  openCrmKey?: string;
  onOpenCrm?: () => void;
  onAddProject?: () => void;
  addProjectLabelKey?: string;
  statusActiveKey?: string;
  statusInactiveKey?: string;
};

export default function ProjectPickerPanel({
  projects,
  loading,
  onSelect,
  onDelete,
  titleKey,
  descKey,
  loadingKey,
  emptyKey,
  openCrmKey,
  onOpenCrm,
  onAddProject,
  addProjectLabelKey = "workspaceWidgets.hubs.projects.addProject.cta",
  statusActiveKey = "workspaceWidgets.projectPicker.statusActive",
  statusInactiveKey = "workspaceWidgets.projectPicker.statusInactive",
}: ProjectPickerPanelProps) {
  const { t, dir } = useI18n();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const addProjectButton =
    onAddProject != null ? (
      <button
        type="button"
        onClick={onAddProject}
        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--win-accent,#6366f1)] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-colors hover:opacity-90 sm:w-auto"
      >
        <FolderPlus size={16} aria-hidden />
        {t(addProjectLabelKey)}
      </button>
    ) : null;

  if (loading) {
    return <WidgetState variant="loading" message={t(loadingKey)} />;
  }

  if (projects.length === 0) {
    return (
      <WidgetState
        variant="empty"
        message={t(emptyKey)}
        action={
          <div className="flex w-full max-w-xs flex-col gap-2">
            {addProjectButton}
            {onOpenCrm && openCrmKey ? (
              <button
                type="button"
                onClick={onOpenCrm}
                className="rounded-lg border border-[color:var(--border-main)] px-4 py-2 text-xs font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-elevated)]"
              >
                {t(openCrmKey)}
              </button>
            ) : null}
          </div>
        }
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-[color:var(--foreground-main)]" dir={dir}>
      <header className="shrink-0 border-b border-[color:var(--border-main)] px-3 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-[color:var(--foreground-main)]">{t(titleKey)}</h2>
            <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">{t(descKey)}</p>
          </div>
          {addProjectButton}
        </div>
      </header>
      <div
        role="listbox"
        aria-label={t(titleKey)}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3"
      >
        {projects.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-1 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-elevated)]/40 transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/10"
          >
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => onSelect(p.id)}
              className="min-w-0 flex-1 px-3 py-2.5 text-start text-xs"
            >
              <span className="block truncate font-bold">{p.name}</span>
              <span className="mt-0.5 block text-[10px] text-[color:var(--foreground-muted)]">
                {p.isActive === false ? t(statusInactiveKey) : t(statusActiveKey)}
              </span>
            </button>
            <ChevronLeft size={16} className="shrink-0 text-indigo-500/80" aria-hidden />
            {onDelete ? (
              <button
                type="button"
                title="מחק פרויקט"
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(p.id); }}
                className="me-2 shrink-0 rounded-lg p-1.5 text-rose-500/70 hover:bg-rose-500/10 hover:text-rose-600"
              >
                <Trash2 size={13} />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {/* Confirm delete dialog */}
      {confirmDeleteId ? (() => {
        const project = projects.find((p) => p.id === confirmDeleteId);
        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xs rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] p-5 shadow-2xl" dir={dir}>
              <div className="mb-3 flex items-start gap-2">
                <Trash2 size={18} className="mt-0.5 shrink-0 text-rose-500" />
                <div>
                  <p className="text-sm font-bold text-[color:var(--foreground)]">מחיקת פרויקט</p>
                  <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">
                    האם למחוק את <strong>{project?.name}</strong>?<br />
                    כל הנתונים (משימות, BOQ, מילסטונים) יימחקו לצמיתות.
                  </p>
                </div>
                <button type="button" onClick={() => setConfirmDeleteId(null)} className="ms-auto shrink-0 rounded-lg p-1 hover:bg-[color:var(--surface-elevated)]">
                  <X size={14} />
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  disabled={deleting}
                  className="flex-1 rounded-lg border border-[color:var(--border-main)] py-2 text-xs font-bold disabled:opacity-50"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={async () => {
                    if (!onDelete) return;
                    setDeleting(true);
                    try {
                      await onDelete(confirmDeleteId);
                      setConfirmDeleteId(null);
                    } finally {
                      setDeleting(false);
                    }
                  }}
                  className="flex-1 rounded-lg bg-rose-600 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-50"
                >
                  {deleting ? "מוחק…" : "מחק"}
                </button>
              </div>
            </div>
          </div>
        );
      })() : null}
    </div>
  );
}
