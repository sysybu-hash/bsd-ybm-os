"use client";

import { useCallback, useState } from "react";
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
import { useAppBuilderSavedApps } from "./useAppBuilderSavedApps";
import { useAppBuilderAiActions } from "./useAppBuilderAiActions";
import type { AppBuilderUiSchema } from "@/lib/validation/schemas/app-builder";

/**
 * Editor state for the App Builder widget, plus the save flow. Stored-app
 * access lives in useAppBuilderSavedApps and the AI flows in
 * useAppBuilderAiActions; this composes them and keeps the widget a thin
 * render layer (mirrors the useProjectDashboard pattern).
 */
export function useAppBuilder() {
  const { t, dir, locale } = useI18n();
  const prefix = "workspaceWidgets.appBuilder";

  const [appName, setAppName] = useState("");
  const [appDescription, setAppDescription] = useState("");
  const [uiSchema, setUiSchema] = useState<AppBuilderUiSchema | null>(null);
  const [savedSchemaId, setSavedSchemaId] = useState<string | undefined>();
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

  const {
    regenerating,
    sharingIdea,
    handleRegenerate,
    handleShareNow: shareNow,
  } = useAppBuilderAiActions({
    t,
    prefix,
    locale,
    onError: setError,
    onSuccess: setSuccess,
    onCode: (jsxCode) => codeHistory.push(jsxCode),
    onSchema: setUiSchema,
    onPreviewReady: () => {
      setPreviewVersion((v) => v + 1);
      setMobilePane("preview");
    },
  });

  // Kept arg-less so AppBuilderWidget's call site does not change.
  const handleShareNow = useCallback(
    () => shareNow(appName, uiSchema),
    [appName, shareNow, uiSchema],
  );

  const {
    savedApps,
    loadingSaved,
    deletingSchemaId,
    loadingSchemaId,
    refreshSavedApps,
    handleDeleteSaved,
    handleLoadSaved,
  } = useAppBuilderSavedApps({
    t,
    prefix,
    onError: setError,
    onSuccess: setSuccess,
    isCurrent: (schemaId) => savedSchemaId === schemaId,
    onDeletedCurrent: handleNewApp,
    onLoaded: (schema) => {
      setUiSchema(schema.uiSchema);
      setAppName(schema.name);
      setAppDescription(schema.description ?? "");
      setSavedSchemaId(schema.id);
      setReadOnlyLoaded(schema.isGlobal);
      if (schema.jsxCode) codeHistory.push(schema.jsxCode);
      else codeHistory.reset();
      setPreviewVersion((v) => v + 1);
    },
  });

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
