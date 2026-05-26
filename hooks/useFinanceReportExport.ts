"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { downloadAuthenticatedFile } from "@/lib/client/download-api-file";

type UseFinanceReportExportOptions = {
  t: (key: string) => string;
};

export function useFinanceReportExport({ t }: UseFinanceReportExportOptions) {
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const exportCsv = useCallback(async () => {
    setExporting("csv");
    try {
      await downloadAuthenticatedFile("/api/reports/finance-csv", "finance-export.csv");
      toast.success(t("workspaceWidgets.dashboard.exportCsvSuccess"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("workspaceWidgets.dashboard.exportFailed");
      toast.error(msg);
    } finally {
      setExporting(null);
    }
  }, [t]);

  const exportPdf = useCallback(async () => {
    setExporting("pdf");
    try {
      await downloadAuthenticatedFile("/api/reports/finance-pdf", "finance-export.pdf");
      toast.success(t("workspaceWidgets.dashboard.exportPdfSuccess"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("workspaceWidgets.dashboard.exportFailed");
      toast.error(msg);
    } finally {
      setExporting(null);
    }
  }, [t]);

  return { exporting, exportCsv, exportPdf };
}
