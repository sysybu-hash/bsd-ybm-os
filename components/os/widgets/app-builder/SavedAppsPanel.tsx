"use client";

import { FolderOpen, Loader2, Plus, RefreshCw, Trash2, Wand2 } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { AppSchemaListItem } from "@/app/actions/app-builder";
import { schemaTypeIcon } from "@/components/os/widgets/app-builder/app-builder-helpers";

const PREFIX = "workspaceWidgets.appBuilder";

interface SavedAppsPanelProps {
  savedApps: AppSchemaListItem[];
  loadingSaved: boolean;
  savedSchemaId: string | undefined;
  loadingSchemaId: string | null;
  deletingSchemaId: string | null;
  onNewApp: () => void;
  onRefresh: () => void;
  onUseTemplate: (schemaId: string) => void;
  onLoadSaved: (schemaId: string) => void;
  onDeleteSaved: (app: AppSchemaListItem) => void;
  formatDate: (date: Date) => string;
}

/** Header controls, template gallery, and the list of saved apps. */
export function SavedAppsPanel({
  savedApps,
  loadingSaved,
  savedSchemaId,
  loadingSchemaId,
  deletingSchemaId,
  onNewApp,
  onRefresh,
  onUseTemplate,
  onLoadSaved,
  onDeleteSaved,
  formatDate,
}: SavedAppsPanelProps) {
  const { t } = useI18n();
  const templates = savedApps.filter((a) => a.isGlobal);

  return (
    <>
      {/* Title + controls */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="min-w-0 truncate text-sm font-bold text-[color:var(--foreground-main)]">
            {t(`${PREFIX}.title`)}
          </h2>
          <p className="mt-0.5 hidden text-[11px] leading-snug text-[color:var(--foreground-muted)] sm:block">
            {t(`${PREFIX}.subtitle`)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onNewApp}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[color:var(--accent)] dark:text-indigo-300 transition hover:bg-indigo-500/10">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {t(`${PREFIX}.newApp`)}
          </button>
          <button type="button" onClick={onRefresh} disabled={loadingSaved}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)] disabled:opacity-60"
            aria-label={t(`${PREFIX}.refreshSavedApps`)}>
            <RefreshCw className={`h-3.5 w-3.5 ${loadingSaved ? "animate-spin" : ""}`} aria-hidden />
          </button>
        </div>
      </div>

      {/* Gallery */}
      {templates.length > 0 ? (
        <section className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-2">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[color:var(--accent)] dark:text-indigo-300">
            <Wand2 className="h-3.5 w-3.5" aria-hidden />
            {t(`${PREFIX}.galleryTitle`)}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((tpl) => {
              const Icon = schemaTypeIcon(tpl.appType);
              return (
                <button key={tpl.id} type="button" onClick={() => onUseTemplate(tpl.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-500/20 bg-[color:var(--surface-card)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--foreground-main)] transition hover:border-indigo-500/40 hover:bg-indigo-500/10"
                  title={tpl.name}>
                  <Icon className="h-3 w-3 shrink-0 text-indigo-400" aria-hidden />
                  <span className="max-w-[8rem] truncate">{tpl.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Saved apps */}
      <section className="rounded-lg border border-[color:var(--border-main)] p-2">
        <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[color:var(--foreground-main)]">
          <FolderOpen className="h-3.5 w-3.5 text-indigo-400" aria-hidden />
          {t(`${PREFIX}.savedAppsTitle`)}
        </h3>
        {loadingSaved ? (
          <div className="flex items-center gap-2 py-1 text-xs text-[color:var(--foreground-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            {t(`${PREFIX}.loadingSavedApps`)}
          </div>
        ) : savedApps.length === 0 ? (
          <p className="py-1 text-xs text-[color:var(--foreground-muted)]">{t(`${PREFIX}.noSavedApps`)}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {savedApps.map((app) => {
              const Icon = schemaTypeIcon(app.appType);
              const isActive = savedSchemaId === app.id;
              const isLoading = loadingSchemaId === app.id;
              const isDeleting = deletingSchemaId === app.id;
              return (
                <li key={app.id} className="flex items-stretch gap-1">
                  <button type="button" onClick={() => onLoadSaved(app.id)}
                    disabled={isLoading || isDeleting}
                    className={`flex min-w-0 flex-1 items-start gap-2 rounded-lg border px-3 py-2 text-start transition ${isActive ? "border-indigo-500/50 bg-indigo-500/10" : "border-transparent hover:border-[color:var(--border-main)] hover:bg-[color:var(--surface-soft)]"}`}>
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[color:var(--foreground-main)]">{app.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[color:var(--foreground-muted)]">
                        <span>{t(`${PREFIX}.appType.${app.appType}`)}</span>
                        {app.isGlobal ? <><span aria-hidden>·</span><span>{t(`${PREFIX}.globalBadge`)}</span></> : null}
                        <span aria-hidden>·</span>
                        <span>{formatDate(app.createdAt)}</span>
                      </span>
                    </span>
                    {isLoading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-400" aria-hidden /> : null}
                  </button>
                  {!app.isGlobal ? (
                    <button type="button" onClick={() => onDeleteSaved(app)}
                      disabled={isDeleting || isLoading}
                      className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent px-2 text-red-400 transition hover:border-red-500/30 hover:bg-red-500/10 disabled:opacity-60"
                      aria-label={t(`${PREFIX}.deleteAppAria`, { name: app.name })}>
                      {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
