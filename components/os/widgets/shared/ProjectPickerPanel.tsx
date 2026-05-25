"use client";

import { ChevronLeft } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";

export type ProjectListItem = { id: string; name: string; isActive?: boolean };

type ProjectPickerPanelProps = {
  projects: ProjectListItem[];
  loading: boolean;
  onSelect: (id: string) => void;
  titleKey: string;
  descKey: string;
  loadingKey: string;
  emptyKey: string;
  openCrmKey?: string;
  onOpenCrm?: () => void;
  statusActiveKey?: string;
  statusInactiveKey?: string;
};

export default function ProjectPickerPanel({
  projects,
  loading,
  onSelect,
  titleKey,
  descKey,
  loadingKey,
  emptyKey,
  openCrmKey,
  onOpenCrm,
  statusActiveKey = "workspaceWidgets.projectPicker.statusActive",
  statusInactiveKey = "workspaceWidgets.projectPicker.statusInactive",
}: ProjectPickerPanelProps) {
  const { t, dir } = useI18n();

  if (loading) {
    return <WidgetState variant="loading" message={t(loadingKey)} />;
  }

  if (projects.length === 0) {
    return (
      <WidgetState
        variant="empty"
        message={t(emptyKey)}
        action={
          onOpenCrm && openCrmKey ? (
            <button
              type="button"
              onClick={onOpenCrm}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500"
            >
              {t(openCrmKey)}
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-[color:var(--foreground-main)]" dir={dir}>
      <header className="shrink-0 border-b border-[color:var(--border-main)] px-3 py-3">
        <h2 className="text-sm font-bold text-[color:var(--foreground-main)]">{t(titleKey)}</h2>
        <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">{t(descKey)}</p>
      </header>
      <div
        role="listbox"
        aria-label={t(titleKey)}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3"
      >
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => onSelect(p.id)}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-elevated)]/40 px-3 py-2.5 text-start text-xs transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/10"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{p.name}</span>
              <span className="mt-0.5 block text-[10px] text-[color:var(--foreground-muted)]">
                {p.isActive === false ? t(statusInactiveKey) : t(statusActiveKey)}
              </span>
            </span>
            <ChevronLeft size={16} className="shrink-0 text-indigo-500/80" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}
