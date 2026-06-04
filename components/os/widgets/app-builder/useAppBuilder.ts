"use client";

import { useCallback, useEffect, useState } from "react";
import { useCodeHistory } from "@/hooks/use-code-history";
import {
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

/**
 * All state + handlers for the App Builder widget.
 * Extracted from AppBuilderWidget.tsx so the widget stays a thin render layer
 * (mirrors the useProjectDashboard pattern).
 */
export function useAppBuilder() {
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
  const [regenerating, setRegenerating] = useState(false);
  const [sharingIdea, setSharingIdea] = useState(false);

  const isEditing = Boolean(savedSchemaId);

  const refreshSavedApps = useCallback(async () => {
    setLoadingSaved(true);
    try {
      // Race against an 8-second timeout — Neon serverless cold-starts can hang
      // the Promise indefinitely without throwing, leaving the spinner forever.
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 8_000),
      );
      const result = await Promise.race([listAppSchemasAction(), timeout]);
      if (result.ok) {
        setSavedApps(result.schemas);
      }
    } catch {
      // silently ignore — user can retry with the refresh button in SavedAppsPanel
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
      if (result.schema.jsxCode) {
        codeHistory.push(result.schema.jsxCode);
      } else {
        codeHistory.reset();
      }
      setPreviewVersion((v) => v + 1);
      setMobilePane("preview");
      setSuccess(t(`${prefix}.templateLoaded`));
    },
    [codeHistory, prefix, t],
  );

  const handleNewApp = useCallback(() => {
    setAppName("");
    setAppDescription("");
    setUiSchema(null);
    setSavedSchemaId(undefined);
    setReadOnlyLoaded(false);
    setError(null);
    setSuccess(null);
    codeHistory.reset();
  }, [codeHistory]);

  /** Regenerates JSX from the currently-loaded uiSchema + name via the AI chat route. */
  const handleRegenerate = useCallback(async (schema: AppBuilderUiSchema, name: string) => {
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-builder/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          currentUiSchema: schema,
          messages: [{ role: "user", content: `בנה מחדש את האפליקציה "${name}" לפי הסכמה הנוכחית` }],
        }),
      });
      const data = (await res.json()) as { jsxCode?: string; uiSchema?: AppBuilderUiSchema };
      if (data.jsxCode) {
        codeHistory.push(data.jsxCode);
        setPreviewVersion((v) => v + 1);
        setMobilePane("preview");
      } else {
        setError(t(`${prefix}.loadSchemaError`));
      }
    } catch {
      setError(t(`${prefix}.loadSchemaError`));
    } finally {
      setRegenerating(false);
    }
  }, [codeHistory, locale, prefix, t]);

  /** Shares the currently-loaded saved app to the community ideas pool. */
  const handleShareNow = useCallback(async () => {
    if (!uiSchema || !appName.trim()) return;
    setSharingIdea(true);
    try {
      const res = await submitAppIdeaAction({
        appName: appName.trim(),
        appType: uiSchema.type,
        uiSchema,
      });
      if (res.ok) {
        setSuccess(t(`${prefix}.shareIdeaSuccess`));
      } else {
        setError(res.error ?? t(`${prefix}.saveSchemaError`));
      }
    } catch {
      setError(t(`${prefix}.saveSchemaError`));
    } finally {
      setSharingIdea(false);
    }
  }, [appName, prefix, t, uiSchema]);

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
        if (result.schema.jsxCode) {
          codeHistory.push(result.schema.jsxCode);
        } else {
          codeHistory.reset();
        }
        setPreviewVersion((v) => v + 1);
      } catch {
        setError(t(`${prefix}.loadSchemaError`));
      } finally {
        setLoadingSchemaId(null);
      }
    },
    [codeHistory, prefix, t],
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
          jsxCode: generatedCode ?? undefined,
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
          jsxCode: generatedCode ?? undefined,
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
    generatedCode,
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

  return {
    // i18n
    t, dir, prefix,
    // state
    appName, setAppName,
    appDescription, setAppDescription,
    uiSchema,
    savedSchemaId,
    savedApps,
    loadingSaved,
    loadingSchemaId,
    deletingSchemaId,
    saving,
    shareIdea, setShareIdea,
    error,
    success,
    readOnlyLoaded,
    previewVersion,
    codeHistory,
    generatedCode,
    mobilePane, setMobilePane,
    regenerating,
    sharingIdea,
    isEditing,
    // handlers
    refreshSavedApps,
    applyCodeFromAssistant,
    handleUndo,
    handleRedo,
    applySchemaFromAssistant,
    handleUseTemplate,
    handleNewApp,
    handleRegenerate,
    handleShareNow,
    handleLoadSaved,
    handleDeleteSaved,
    handleSaveSchema,
    formatDate,
  };
}
