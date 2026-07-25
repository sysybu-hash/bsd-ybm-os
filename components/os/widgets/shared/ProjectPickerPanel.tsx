"use client";

import { useState } from "react";
import { ChevronRight, FolderPlus, Trash2 } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import OsConfirmDialog from "@/components/os/OsConfirmDialog";
import { OsButton, OsIconButton } from "@/components/os/ui";

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
      <OsButton
        variant="primary"
        className="w-full justify-center sm:w-auto"
        icon={<FolderPlus size={16} aria-hidden />}
        onClick={onAddProject}
      >
        {t(addProjectLabelKey)}
      </OsButton>
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
              <OsButton variant="secondary" onClick={onOpenCrm}>
                {t(openCrmKey)}
              </OsButton>
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
            <ChevronRight size={16} className="shrink-0 rtl:rotate-180 text-[color:var(--win-accent,#6366f1)]/80" aria-hidden />
            {onDelete ? (
              <OsIconButton
                label={t("workspaceWidgets.sharedUi.deleteProject")}
                size="sm"
                className="me-2 text-rose-500/70 hover:bg-rose-500/10 hover:text-rose-600"
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(p.id); }}
              >
                <Trash2 size={13} aria-hidden />
              </OsIconButton>
            ) : null}
          </div>
        ))}
      </div>

      {/* Confirm delete dialog */}
      {(() => {
        const project = confirmDeleteId ? projects.find((p) => p.id === confirmDeleteId) : undefined;
        return (
          <OsConfirmDialog
            open={confirmDeleteId !== null}
            title={t("workspaceWidgets.sharedUi.deleteProjectTitle")}
            message={`${t("workspaceWidgets.sharedUi.deleteProjectQuestion")} ${project?.name ?? ""}? ${t("workspaceWidgets.sharedUi.deleteProjectWarning")}`}
            destructive
            confirmLabel={t(deleting ? "workspaceWidgets.sharedUi.deleting" : "workspaceWidgets.sharedUi.delete")}
            cancelLabel={t("workspaceWidgets.sharedUi.cancel")}
            onCancel={() => setConfirmDeleteId(null)}
            onConfirm={async () => {
              if (!onDelete || !confirmDeleteId) return;
              setDeleting(true);
              try {
                await onDelete(confirmDeleteId);
                setConfirmDeleteId(null);
              } finally {
                setDeleting(false);
              }
            }}
          />
        );
      })()}
    </div>
  );
}
