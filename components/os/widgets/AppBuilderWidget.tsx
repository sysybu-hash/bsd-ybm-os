"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { DynamicSandpackRenderer } from "@/components/os/widgets/shared/DynamicSandpackRenderer";
import { PreviewToolbar } from "@/components/os/widgets/app-builder/PreviewToolbar";
import { SavedAppsPanel } from "@/components/os/widgets/app-builder/SavedAppsPanel";
import { SaveAppForm } from "@/components/os/widgets/app-builder/SaveAppForm";
import AppBuilderAssistantPanel from "@/components/os/widgets/app-builder/AppBuilderAssistantPanel";
import { useCodeHistory } from "@/hooks/use-code-history";
import {
  SANDPACK_PLACEHOLDER,
  mapActionError,
  syncUiSchemaTitle,
} from "@/components/os/widgets/app-builder/app-builder-helpers";
import { useI18n } from "@/components/os/system/I18nProvider";
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
  // Undo/redo history of AI-generated code versions.
  const codeHistory = useCodeHistory();
  const generatedCode = codeHistory.current;
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

  const applyCodeFromAssistant = useCallback((code: string) => {
    codeHistory.push(code);
    setPreviewVersion((v) => v + 1);
    setMobilePane("preview");
  }, [codeHistory]);

  const handleUndo = useCallback(() => {
    codeHistory.undo();
    setPreviewVersion((v) => v + 1);
  }, [codeHistory]);

  const handleRedo = useCallback(() => {
    codeHistory.redo();
    setPreviewVersion((v) => v + 1);
  }, [codeHistory]);

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

  // ── Raw content fragments — no wrapper divs, no scroll containers ────────
  // Each pane's scroll container is defined ONCE in the return below.

  const buildContent = (
    <>
      <SavedAppsPanel
        savedApps={savedApps}
        loadingSaved={loadingSaved}
        savedSchemaId={savedSchemaId}
        loadingSchemaId={loadingSchemaId}
        deletingSchemaId={deletingSchemaId}
        onNewApp={handleNewApp}
        onRefresh={() => void refreshSavedApps()}
        onUseTemplate={(id) => void handleUseTemplate(id)}
        onLoadSaved={(id) => void handleLoadSaved(id)}
        onDeleteSaved={(app) => void handleDeleteSaved(app)}
        formatDate={formatDate}
      />

      {/* Chat — embedded (flat) mode: grows naturally, no internal scroll */}
      <AppBuilderAssistantPanel
        embedded
        currentUiSchema={uiSchema}
        onSchemaApplied={applySchemaFromAssistant}
        onCodeApplied={applyCodeFromAssistant}
      />

      {/* Save form */}
      {uiSchema ? (
        <SaveAppForm
          appName={appName}
          appDescription={appDescription}
          isEditing={isEditing}
          readOnlyLoaded={readOnlyLoaded}
          shareIdea={shareIdea}
          saving={saving}
          onNameChange={setAppName}
          onDescriptionChange={setAppDescription}
          onShareIdeaChange={setShareIdea}
          onSave={() => void handleSaveSchema()}
        />
      ) : null}

      {success ? <p className="text-xs text-emerald-400" role="status">{success}</p> : null}
      {error   ? <p className="text-xs text-red-400"     role="alert">{error}</p>    : null}
    </>
  );

  // Undo/redo toolbar — lets the user revert a generation that made things worse.
  const previewToolbar = codeHistory.total > 0 ? (
    <PreviewToolbar
      canUndo={codeHistory.canUndo}
      canRedo={codeHistory.canRedo}
      index={codeHistory.index}
      total={codeHistory.total}
      onUndo={handleUndo}
      onRedo={handleRedo}
    />
  ) : null;

  // previewContent is used only on mobile (build/preview toggle)
  const previewContent = (
    <div className="flex h-full min-h-0 flex-col">
      {previewToolbar}
      <DynamicSandpackRenderer
        key={`sandbox-mobile-${previewVersion}`}
        code={generatedCode ?? SANDPACK_PLACEHOLDER}
      />
    </div>
  );

  const mobilePaneSwitcher = (
    <div className="flex shrink-0 gap-1 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/90 p-2"
      role="tablist" aria-label={t(`${prefix}.mobilePaneAria`)}>
      {(["build", "preview"] as const).map((pane) => {
        const selected = mobilePane === pane;
        const label = pane === "build" ? t(`${prefix}.mobilePaneBuild`) : t(`${prefix}.mobilePanePreview`);
        return (
          <button key={pane} type="button" role="tab" aria-selected={selected}
            onClick={() => setMobilePane(pane)}
            className={`min-h-[44px] flex-1 rounded-lg px-3 text-sm font-bold transition ${selected ? "bg-indigo-600 text-white" : "bg-[color:var(--surface-soft)] text-[color:var(--foreground-muted)]"}`}>
            {label}
          </button>
        );
      })}
    </div>
  );

  // ── Full structural reset — exact boilerplate as specified ────────────────
  return (
    <div className="flex flex-row w-full h-full min-h-0 min-w-0 overflow-hidden bg-surface-bg" dir={dir}>

      {/* RIGHT PANE (Builder / Chat): Fixed width on desktop, hidden on mobile */}
      <div className="hidden md:flex flex-col w-[350px] shrink-0 h-full min-h-0 border-s border-border-main">
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
          {buildContent}
        </div>
      </div>

      {/* LEFT PANE (Preview): Takes remaining space — NO extra scroll wrapper,
          Sandpack owns its own iframe scroll context */}
      <div className="flex flex-col flex-1 min-w-0 h-full min-h-0 relative">
        {/* Mobile: pane switcher */}
        <div className="shrink-0 md:hidden">{mobilePaneSwitcher}</div>

        {/* Mobile content area (scrollable for build list, flex for preview) */}
        <div className="flex-1 min-h-0 md:hidden overflow-y-auto custom-scrollbar p-2">
          {mobilePane === "build" ? buildContent : previewContent}
        </div>

        {/* Desktop: toolbar + Sandpack fill the pane directly */}
        <div className="hidden md:flex flex-col flex-1 min-h-0">
          {previewToolbar}
          <div className="flex flex-col flex-1 min-h-0 p-4">
            <DynamicSandpackRenderer
              key={`sandbox-${previewVersion}`}
              code={generatedCode ?? SANDPACK_PLACEHOLDER}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
