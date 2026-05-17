"use client";

import React from "react";
import { Download, FileText, Save, Trash2 } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { captureProductEvent } from "@/lib/analytics/posthog-client";

type InvoiceActionBarProps = {
  documentId: string;
  saving?: boolean;
  onSave?: () => void;
  onDelete?: () => void;
  showSave?: boolean;
};

export default function InvoiceActionBar({
  documentId,
  saving = false,
  onSave,
  onDelete,
  showSave = true,
}: InvoiceActionBarProps) {
  const { t } = useI18n();

  const exportUrl = (format: "pdf" | "docx") =>
    `/api/documents/issued/${documentId}/export?format=${format}`;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--border-main)] pt-3">
      {showSave && onSave ? (
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          <Save size={14} aria-hidden />
          {t("workspaceWidgets.invoice.save")}
        </button>
      ) : null}
      <a
        href={exportUrl("pdf")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold"
        download
        onClick={() => captureProductEvent("pdf_exported", { document_id: documentId, format: "pdf" })}
      >
        <Download size={14} aria-hidden />
        {t("workspaceWidgets.invoice.exportPdf")}
      </a>
      <a
        href={exportUrl("docx")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold"
        download
      >
        <FileText size={14} aria-hidden />
        {t("workspaceWidgets.invoice.exportWord")}
      </a>
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
