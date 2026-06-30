"use client";

import React, { useState } from "react";
import { Download, FileText, Loader2, Mail, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { captureProductEvent } from "@/lib/analytics/posthog-client";
import { downloadIssuedDocumentExport } from "@/lib/invoice-download-client";

type InvoiceActionBarProps = {
  documentId: string;
  saving?: boolean;
  onSave?: () => void;
  onDelete?: () => void;
  onSendReminder?: () => void;
  sendingReminder?: boolean;
  showSave?: boolean;
};

export default function InvoiceActionBar({
  documentId,
  saving = false,
  onSave,
  onDelete,
  onSendReminder,
  sendingReminder = false,
  showSave = true,
}: InvoiceActionBarProps) {
  const { t } = useI18n();
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);

  const onExport = async (format: "pdf" | "docx") => {
    setExporting(format);
    try {
      const result = await downloadIssuedDocumentExport(documentId, format);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (format === "pdf") {
        captureProductEvent("pdf_exported", { document_id: documentId, format: "pdf" });
      }
      toast.success(t("workspaceWidgets.invoice.exportSuccess"));
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--border-main)] pt-3">
      {showSave && onSave ? (
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--win-accent,#6366f1)] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          <Save size={14} aria-hidden />
          {t("workspaceWidgets.invoice.save")}
        </button>
      ) : null}
      {onSendReminder ? (
        <button
          type="button"
          onClick={onSendReminder}
          disabled={sendingReminder}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 disabled:opacity-50 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <Mail size={14} aria-hidden />
          {t("workspaceWidgets.invoice.sendReminder")}
        </button>
      ) : null}
      <button
        type="button"
        disabled={exporting !== null}
        onClick={() => void onExport("pdf")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold disabled:opacity-50"
      >
        {exporting === "pdf" ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : (
          <Download size={14} aria-hidden />
        )}
        {t("workspaceWidgets.invoice.exportPdf")}
      </button>
      <button
        type="button"
        disabled={exporting !== null}
        onClick={() => void onExport("docx")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold disabled:opacity-50"
      >
        {exporting === "docx" ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : (
          <FileText size={14} aria-hidden />
        )}
        {t("workspaceWidgets.invoice.exportWord")}
      </button>
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700"
        >
          <Trash2 size={14} aria-hidden />
          {t("workspaceWidgets.invoice.delete")}
        </button>
      ) : null}
    </div>
  );
}
