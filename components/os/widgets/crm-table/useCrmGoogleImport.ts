"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import {
  fetchGoogleContactsPreviewApi,
  importGoogleContactsApi,
} from "./crm-table-api";

/** Google Contacts preview/import helpers for the CRM table hook. */
export function useCrmGoogleImport(options: {
  t: (key: string) => string;
  onImported: () => void;
}) {
  const { t, onImported } = options;

  const fetchGooglePreview = useCallback(async () => {
    return fetchGoogleContactsPreviewApi(t("workspaceWidgets.crmTable.googleImportFailed"));
  }, [t]);

  const runGoogleImport = useCallback(
    async (payload: { importAll?: boolean; ids?: string[] }) => {
      const result = await importGoogleContactsApi(payload);
      if (result.ok) {
        toast.success(result.message ?? t("workspaceWidgets.crmTable.googleImportSuccess"));
      }
      return result;
    },
    [t],
  );

  const handleGoogleImported = useCallback(() => {
    onImported();
  }, [onImported]);

  return { fetchGooglePreview, runGoogleImport, handleGoogleImported };
}
