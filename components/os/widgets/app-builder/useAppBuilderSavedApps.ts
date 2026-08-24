"use client";

import { useCallback, useEffect, useState } from "react";
import {
  deleteAppSchemaAction,
  listAppSchemasAction,
  loadAppSchemaAction,
  type AppSchemaListItem,
} from "@/app/actions/app-builder";
import type { AppBuilderUiSchema } from "@/lib/validation/schemas/app-builder";

export type LoadedAppSchema = {
  id: string;
  name: string;
  description: string | null;
  uiSchema: AppBuilderUiSchema;
  jsxCode: string | null;
  isGlobal: boolean;
};

type Options = {
  t: (key: string, vars?: Record<string, string>) => string;
  prefix: string;
  onError: (message: string | null) => void;
  onSuccess: (message: string | null) => void;
  /** True when the given id is the app currently open in the editor. */
  isCurrent: (schemaId: string) => boolean;
  /** Called when the app currently open in the editor was the one deleted. */
  onDeletedCurrent: () => void;
  /** Applies a freshly loaded schema to the editor. */
  onLoaded: (schema: LoadedAppSchema) => void;
};

/**
 * Everything the App Builder does with *stored* apps: list, load, delete.
 * Split out of useAppBuilder, which is now only the editor's own state.
 *
 * Loading returns through the `onLoaded` callback rather than writing editor
 * state directly — this hook fetches, the editor decides what to do with the
 * result. Saving deliberately stayed behind: it reads six pieces of editor
 * state to build its payload, so moving it would mean passing a bag of
 * setters, which is a relocation rather than a boundary.
 */
export function useAppBuilderSavedApps({
  t,
  prefix,
  onError,
  onSuccess,
  isCurrent,
  onDeletedCurrent,
  onLoaded,
}: Options) {
  const [savedApps, setSavedApps] = useState<AppSchemaListItem[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [deletingSchemaId, setDeletingSchemaId] = useState<string | null>(null);
  const [loadingSchemaId, setLoadingSchemaId] = useState<string | null>(null);

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
      } else {
        onError(result.error ?? t(`${prefix}.loadSchemaError`));
      }
    } catch {
      onError(t(`${prefix}.loadSchemaError`));
    } finally {
      setLoadingSaved(false);
    }
  }, [onError, prefix, t]);

  useEffect(() => {
    void refreshSavedApps();
  }, [refreshSavedApps]);

  const handleDeleteSaved = useCallback(
    async (app: AppSchemaListItem) => {
      if (app.isGlobal) {
        onError(t(`${prefix}.globalAppReadOnly`));
        return;
      }
      if (!window.confirm(t(`${prefix}.deleteAppConfirm`, { name: app.name }))) {
        return;
      }

      setDeletingSchemaId(app.id);
      onError(null);
      onSuccess(null);

      try {
        const result = await deleteAppSchemaAction(app.id);
        if (!result.ok) {
          onError(result.error ?? t(`${prefix}.deleteSchemaError`));
          return;
        }
        if (isCurrent(app.id)) {
          onDeletedCurrent();
        }
        onSuccess(t(`${prefix}.deleteSchemaSuccess`));
        await refreshSavedApps();
      } catch {
        onError(t(`${prefix}.deleteSchemaError`));
      } finally {
        setDeletingSchemaId(null);
      }
    },
    [isCurrent, onDeletedCurrent, onError, onSuccess, prefix, refreshSavedApps, t],
  );

  const handleLoadSaved = useCallback(
    async (schemaId: string) => {
      setLoadingSchemaId(schemaId);
      onError(null);
      onSuccess(null);
      try {
        const result = await loadAppSchemaAction(schemaId);
        if (!result.ok) {
          onError(t(`${prefix}.loadSchemaError`));
          return;
        }
        onLoaded(result.schema);
      } catch {
        onError(t(`${prefix}.loadSchemaError`));
      } finally {
        setLoadingSchemaId(null);
      }
    },
    [onError, onLoaded, onSuccess, prefix, t],
  );

  return {
    savedApps,
    loadingSaved,
    deletingSchemaId,
    loadingSchemaId,
    refreshSavedApps,
    handleDeleteSaved,
    handleLoadSaved,
  };
}
