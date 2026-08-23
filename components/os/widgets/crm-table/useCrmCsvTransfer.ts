"use client";

import React, { useCallback, useState } from "react";
import { toast } from "sonner";
import Papa from "papaparse";
import { downloadAuthenticatedFile } from "@/lib/client/download-api-file";
import { importContactsApi } from "./crm-table-api";

/**
 * CSV import/export for the CRM table hook.
 *
 * Extracted from useCrmTable (456 lines) alongside useCrmGoogleImport, which
 * set the pattern: the transfer flows own their own busy flags and talk to
 * crm-table-api, so the parent hook keeps only table state.
 */
export function useCrmCsvTransfer(options: {
  t: (key: string) => string;
  onImported: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { t, onImported, fileInputRef } = options;
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleImportCSV = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsImporting(true);
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const data = results.data as Record<string, string>[];
          if (!data.length) {
            toast.error(t("workspaceWidgets.crmTable.importEmpty"));
            setIsImporting(false);
            return;
          }
          try {
            const result = await importContactsApi(data);
            if (result.ok) {
              toast.success(result.message ?? t("workspaceWidgets.crmTable.importSuccess"));
              onImported();
            } else throw new Error(result.error || t("workspaceWidgets.crmTable.importFailed"));
          } catch (err: unknown) {
            toast.error(
              err instanceof Error ? err.message : t("workspaceWidgets.crmTable.importFailed"),
            );
          } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }
        },
        error: () => {
          toast.error(t("workspaceWidgets.crmTable.importCsvError"));
          setIsImporting(false);
        },
      });
    },
    [t, onImported, fileInputRef],
  );

  const handleExportCsv = useCallback(async () => {
    setIsExporting(true);
    try {
      await downloadAuthenticatedFile("/api/crm/contacts/export", "crm-contacts.csv");
      toast.success(t("workspaceWidgets.crmTable.exportSuccess"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("workspaceWidgets.crmTable.exportFailed"));
    } finally {
      setIsExporting(false);
    }
  }, [t]);

  return { isImporting, isExporting, handleImportCSV, handleExportCsv };
}
