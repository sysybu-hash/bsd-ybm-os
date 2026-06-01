"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  Calculator,
  CalendarDays,
  CheckSquare,
  Database,
  FileText,
  FolderOpen,
  Kanban,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Table2,
  Trash2,
  Wand2,
} from "lucide-react";
import DynamicRenderer from "@/components/AppBuilder/DynamicRenderer";
import AppBuilderAssistantPanel from "@/components/os/widgets/app-builder/AppBuilderAssistantPanel";
import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetSplitPanels from "@/components/os/layout/WidgetSplitPanels";
import {
  deleteAppSchemaAction,
  listAppSchemasAction,
  loadAppSchemaAction,
  saveAppSchemaAction,
  updateAppSchemaAction,
  type AppSchemaListItem,
} from "@/app/actions/app-builder";
import { submitAppIdeaAction } from "@/app/actions/app-ideas";
import type { AppBuilderUiSchema } from "@/lib/validation/schemas/app-builder";

function schemaTypeIcon(appType: AppSchemaListItem["appType"]) {
  if (appType === "dashboard") return BarChart3;
  if (appType === "composer") return LayoutGrid;
  if (appType === "full_app") return Database;
  if (appType === "checklist") return CheckSquare;
  if (appType === "calculator") return Calculator;
  if (appType === "kanban") return Kanban;
  if (appType === "calendar") return CalendarDays;
  if (appType === "table") return Table2;
  return FileText;
}

function syncUiSchemaTitle(schema: AppBuilderUiSchema, title: string): AppBuilderUiSchema {
  // All non-form/table types have a required `title`
  if (
    schema.type === "dashboard" ||
    schema.type === "composer" ||
    schema.type === "full_app" ||
    schema.type === "checklist" ||
    schema.type === "calculator" ||
    schema.type === "kanban" ||
    schema.type === "calendar"
  ) {
    return { ...schema, title } as AppBuilderUiSchema;
  }
  // form / table have optional title
  return { ...schema, title: title || schema.title } as AppBuilderUiSchema;
}

function mapActionError(error: string, t: (key: string) => string, prefix: string): string {
  if (error === "schema_not_found_or_readonly") {
    return t(`${prefix}.globalAppReadOnly`);
  }
  if (error === "generate_failed") {
    return t(`${prefix}.generateError`);
  }
  return error;
}

export default function AppBuilderWidget() {
  const { t, dir, locale } = useI18n();
  const prefix = "workspaceWidgets.appBuilder";

  const [appName, setAppName] = useState("");
  const [appDescription, setAppDescription] = useState("");
  const [uiSchema, setUiSchema] = useState<AppBuilderUiSchema | null>(null);
  const [savedSchemaId, setSavedSchemaId] = useState<string | undefined>();
  const [savedApps, setSavedApps] = useState<AppSchemaListItem[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [loadingSchemaId, setLoadingSchemaId] = useState<string | null>(null);
  const [deletingSchemaId, setDeletingSchemaId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [shareIdea, setShareIdea] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [readOnlyLoaded, setReadOnlyLoaded] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [mobilePane, setMobilePane] = useState<"build" | "preview">("build");

  const isEditing = Boolean(savedSchemaId);

  const refreshSavedApps = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const result = await listAppSchemasAction();
      if (result.ok) {
        setSavedApps(result.schemas);
      }
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    void refreshSavedApps();
  }, [refreshSavedApps]);

  const applySchemaFromAssistant = useCallback((schema: AppBuilderUiSchema) => {
    setUiSchema(schema);
    setPreviewVersion((v) => v + 1);
    setError(null);
    if (schema.title && !appName.trim()) {
      setAppName(schema.title);
    }
    setMobilePane("preview");
    setSuccess(t(`${prefix}.previewUpdated`));
  }, [appName, prefix, t]);

  /** טוען תבנית גלובלית לעריכה — יוצר עותק חדש בשמירה (לא עורך המקור) */
  const handleUseTemplate = useCallback(
    async (schemaId: string) => {
      setError(null);
      const result = await loadAppSchemaAction(schemaId);
      if (!result.ok) { setError(t(`${prefix}.loadSchemaError`)); return; }
      setUiSchema(result.schema.uiSchema);
      setAppName(result.schema.name);
      setAppDescription(result.schema.description ?? "");
      setSavedSchemaId(undefined); // clone — not editing the global original
      setReadOnlyLoaded(false);
      setPreviewVersion((v) => v + 1);
      setMobilePane("preview");
      setSuccess(t(`${prefix}.templateLoaded`));
    },
    [prefix, t],
  );

  const handleNewApp = useCallback(() => {
    setAppName("");
    setAppDescription("");
    setUiSchema(null);
    setSavedSchemaId(undefined);
    setReadOnlyLoaded(false);
    setError(null);
    setSuccess(null);
  }, []);

  const handleLoadSaved = useCallback(
    async (schemaId: string) => {
      setLoadingSchemaId(schemaId);
      setError(null);
      setSuccess(null);
      try {
        const result = await loadAppSchemaAction(schemaId);
        if (!result.ok) {
          setError(t(`${prefix}.loadSchemaError`));
          return;
        }
        setUiSchema(result.schema.uiSchema);
        setAppName(result.schema.name);
        setAppDescription(result.schema.description ?? "");
        setSavedSchemaId(result.schema.id);
        setReadOnlyLoaded(result.schema.isGlobal);
        setPreviewVersion((v) => v + 1);
      } catch {
        setError(t(`${prefix}.loadSchemaError`));
      } finally {
        setLoadingSchemaId(null);
      }
    },
    [prefix, t],
  );

  const handleDeleteSaved = useCallback(
    async (app: AppSchemaListItem) => {
      if (app.isGlobal) {
        setError(t(`${prefix}.globalAppReadOnly`));
        return;
      }
      if (!window.confirm(t(`${prefix}.deleteAppConfirm`, { name: app.name }))) {
        return;
      }

      setDeletingSchemaId(app.id);
      setError(null);
      setSuccess(null);

      try {
        const result = await deleteAppSchemaAction(app.id);
        if (!result.ok) {
          setError(result.error ?? t(`${prefix}.deleteSchemaError`));
          return;
        }
        if (savedSchemaId === app.id) {
          handleNewApp();
        }
        setSuccess(t(`${prefix}.deleteSchemaSuccess`));
        await refreshSavedApps();
      } catch {
        setError(t(`${prefix}.deleteSchemaError`));
      } finally {
        setDeletingSchemaId(null);
      }
    },
    [handleNewApp, prefix, refreshSavedApps, savedSchemaId, t],
  );

  const handleSaveSchema = useCallback(async () => {
    if (readOnlyLoaded) {
      setError(t(`${prefix}.globalAppReadOnly`));
      return;
    }
    if (!uiSchema) {
      setError(t(`${prefix}.noPreview`));
      return;
    }
    const name = appName.trim();
    if (!name) {
      setError(t(`${prefix}.nameRequired`));
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const schemaToSave = syncUiSchemaTitle(uiSchema, name);

      if (savedSchemaId) {
        const result = await updateAppSchemaAction({
          schemaId: savedSchemaId,
          name,
          description: appDescription.trim() || undefined,
          uiSchema: schemaToSave,
        });

        if (!result.ok) {
          setError(mapActionError(result.error ?? "", t, prefix) || t(`${prefix}.updateSchemaError`));
          return;
        }

        setUiSchema(schemaToSave);
        setPreviewVersion((v) => v + 1);
        setSuccess(t(`${prefix}.updateSchemaSuccess`));
      } else {
        const result = await saveAppSchemaAction({
          name,
          description: appDescription.trim() || undefined,
          uiSchema: schemaToSave,
        });

        if (!result.ok) {
          setError(result.error ?? t(`${prefix}.saveSchemaError`));
          return;
        }

        setSavedSchemaId(result.id);
        setUiSchema(schemaToSave);
        setPreviewVersion((v) => v + 1);
        setSuccess(
          t(
            schemaToSave.type === "dashboard"
              ? `${prefix}.saveDashboardSuccess`
              : schemaToSave.type === "full_app"
                ? `${prefix}.saveFullAppSuccess`
                : `${prefix}.saveSchemaSuccess`,
          ),
        );

        if (shareIdea) {
          void submitAppIdeaAction({
            appName: name,
            appType: schemaToSave.type,
            uiSchema: schemaToSave,
          }).then((res) => {
            if (res.ok) setSuccess(t(`${prefix}.shareIdeaSuccess`));
          });
          setShareIdea(false);
        }
      }

      await refreshSavedApps();
    } catch {
      setError(savedSchemaId ? t(`${prefix}.updateSchemaError`) : t(`${prefix}.saveSchemaError`));
    } finally {
      setSaving(false);
    }
  }, [
    appDescription,
    appName,
    prefix,
    readOnlyLoaded,
    refreshSavedApps,
    savedSchemaId,
    shareIdea,
    t,
    uiSchema,
  ]);

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));

  const promptPane = (
    <div dir={dir} className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-[color:var(--border-main)] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-sm font-bold text-[color:var(--foreground-main)]">
            {t(`${prefix}.title`)}
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleNewApp}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/10"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {t(`${prefix}.newApp`)}
            </button>
            <button
              type="button"
              onClick={() => void refreshSavedApps()}
              disabled={loadingSaved}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)] disabled:opacity-60"
              aria-label={t(`${prefix}.refreshSavedApps`)}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingSaved ? "animate-spin" : ""}`} aria-hidden />
            </button>
          </div>
        </div>
        <p className="mt-1 hidden line-clamp-2 text-[11px] leading-snug text-[color:var(--foreground-muted)] sm:block">
          {t(`${prefix}.subtitle`)}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3">

        {/* ── גלריית השראה ── */}
        {(() => {
          const templates = savedApps.filter((a) => a.isGlobal);
          if (templates.length === 0) return null;
          return (
            <section className="shrink-0 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-2">
              <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
                <Wand2 className="h-3.5 w-3.5" aria-hidden />
                {t(`${prefix}.galleryTitle`)}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((tpl) => {
                  const Icon = schemaTypeIcon(tpl.appType);
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => void handleUseTemplate(tpl.id)}
                      className="flex items-center gap-1.5 rounded-lg border border-indigo-500/20 bg-[color:var(--surface-card)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--foreground-main)] transition hover:border-indigo-500/40 hover:bg-indigo-500/10"
                      title={tpl.name}
                    >
                      <Icon className="h-3 w-3 shrink-0 text-indigo-400" aria-hidden />
                      <span className="max-w-[8rem] truncate">{tpl.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })()}

        <section className="shrink-0 rounded-lg border border-[color:var(--border-main)] p-2">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[color:var(--foreground-main)]">
            <FolderOpen className="h-3.5 w-3.5 text-indigo-400" aria-hidden />
            {t(`${prefix}.savedAppsTitle`)}
          </h3>

          {loadingSaved ? (
            <div className="flex items-center gap-2 py-1 text-xs text-[color:var(--foreground-muted)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t(`${prefix}.loadingSavedApps`)}
            </div>
          ) : savedApps.length === 0 ? (
            <p className="py-1 text-xs text-[color:var(--foreground-muted)]">{t(`${prefix}.noSavedApps`)}</p>
          ) : (
            <ul className="flex max-h-20 flex-col gap-0.5 overflow-y-auto sm:max-h-24">
            {savedApps.map((app) => {
              const Icon = schemaTypeIcon(app.appType);
              const isActive = savedSchemaId === app.id;
              const isLoading = loadingSchemaId === app.id;
              const isDeleting = deletingSchemaId === app.id;
              return (
                <li key={app.id} className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => void handleLoadSaved(app.id)}
                    disabled={isLoading || isDeleting}
                    className={`flex min-w-0 flex-1 items-start gap-2 rounded-lg border px-3 py-2 text-start transition ${
                      isActive
                        ? "border-indigo-500/50 bg-indigo-500/10"
                        : "border-transparent hover:border-[color:var(--border-main)] hover:bg-[color:var(--surface-soft)]"
                    }`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[color:var(--foreground-main)]">
                        {app.name}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[color:var(--foreground-muted)]">
                        <span>{t(`${prefix}.appType.${app.appType}`)}</span>
                        {app.isGlobal ? (
                          <>
                            <span aria-hidden>·</span>
                            <span>{t(`${prefix}.globalBadge`)}</span>
                          </>
                        ) : null}
                        <span aria-hidden>·</span>
                        <span>{formatDate(app.createdAt)}</span>
                      </span>
                    </span>
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-400" aria-hidden />
                    ) : null}
                  </button>
                  {!app.isGlobal ? (
                    <button
                      type="button"
                      onClick={() => void handleDeleteSaved(app)}
                      disabled={isDeleting || isLoading}
                      className="inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent px-2 text-red-400 transition hover:border-red-500/30 hover:bg-red-500/10 disabled:opacity-60"
                      aria-label={t(`${prefix}.deleteAppAria`, { name: app.name })}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

        <div className="flex h-0 min-h-0 flex-1 flex-col overflow-hidden">
          <AppBuilderAssistantPanel currentUiSchema={uiSchema} onSchemaApplied={applySchemaFromAssistant} />
        </div>
      </div>

      <div className="shrink-0 space-y-2 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/80 p-3">
        {uiSchema ? (
          <div className="space-y-2">
            {isEditing ? (
              <p className="text-[10px] font-medium text-indigo-300">
                {readOnlyLoaded ? t(`${prefix}.globalAppReadOnly`) : t(`${prefix}.editingApp`)}
              </p>
            ) : null}
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">{t(`${prefix}.appNameLabel`)}</span>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">{t(`${prefix}.appDescriptionLabel`)}</span>
              <input
                type="text"
                value={appDescription}
                onChange={(e) => setAppDescription(e.target.value)}
                className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2.5 py-1.5 text-sm"
              />
            </label>
            {!isEditing ? (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2">
                <input
                  type="checkbox"
                  checked={shareIdea}
                  onChange={(e) => setShareIdea(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 accent-indigo-500"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium text-[color:var(--foreground-main)]">
                    {t(`${prefix}.shareIdeaLabel`)}
                  </span>
                  <span className="text-[10px] text-[color:var(--foreground-muted)]">
                    {t(`${prefix}.shareIdeaHint`)}
                  </span>
                </span>
              </label>
            ) : null}
            <button
              type="button"
              onClick={() => void handleSaveSchema()}
              disabled={saving || readOnlyLoaded}
              className={`w-full rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                isEditing
                  ? "bg-indigo-600 text-white hover:bg-indigo-500"
                  : "border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20"
              }`}
            >
              {saving ? t(`${prefix}.saving`) : isEditing ? t(`${prefix}.updateApp`) : t(`${prefix}.saveApp`)}
            </button>
          </div>
        ) : null}

        {success ? (
          <p className="text-xs text-emerald-400" role="status">
            {success}
          </p>
        ) : null}
        {error ? (
          <p className="text-xs text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );

  const previewPane = (
    <div dir={dir} className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-b border-[color:var(--border-main)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[color:var(--foreground-main)]">{t(`${prefix}.previewTitle`)}</h3>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {uiSchema ? (
          <DynamicRenderer
            key={`app-preview-${previewVersion}`}
            uiSchema={uiSchema}
            schemaId={savedSchemaId}
          />
        ) : (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 p-6 text-center">
            <Sparkles className="h-8 w-8 text-[color:var(--foreground-muted)]" aria-hidden />
            <p className="text-sm text-[color:var(--foreground-muted)]">{t(`${prefix}.emptyPreview`)}</p>
          </div>
        )}
      </div>
    </div>
  );

  const mobilePaneSwitcher = (
    <div
      className="flex shrink-0 gap-1 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/90 p-2 md:hidden"
      role="tablist"
      aria-label={t(`${prefix}.mobilePaneAria`)}
    >
      {(["build", "preview"] as const).map((pane) => {
        const selected = mobilePane === pane;
        const label =
          pane === "build" ? t(`${prefix}.mobilePaneBuild`) : t(`${prefix}.mobilePanePreview`);
        return (
          <button
            key={pane}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setMobilePane(pane)}
            className={`min-h-[44px] flex-1 rounded-lg px-3 text-sm font-bold transition ${
              selected
                ? "bg-indigo-600 text-white"
                : "bg-[color:var(--surface-soft)] text-[color:var(--foreground-muted)]"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  const renderMobileLayout = (body: ReactNode) => (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:hidden">
      {mobilePaneSwitcher}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{body}</div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden text-[color:var(--foreground-main)]" dir={dir}>
      <div className="hidden min-h-0 flex-1 md:flex">
        <WidgetSplitPanels
          className="min-h-0 flex-1"
          direction="horizontal"
          stackBelowPx={768}
          layoutStorageKey="bsd-app-builder-split-v3"
          panels={[
            {
              id: "app-builder-sidebar",
              defaultSize: 32,
              minSize: 24,
              maxSize: 44,
              className:
                "flex min-h-0 min-w-0 flex-col border-s border-[color:var(--border-main)] bg-[color:var(--background-main)]/40",
              children: promptPane,
            },
            {
              id: "app-builder-preview",
              defaultSize: 68,
              minSize: 40,
              children: previewPane,
            },
          ]}
        />
      </div>
      {renderMobileLayout(mobilePane === "build" ? promptPane : previewPane)}
    </div>
  );
}
