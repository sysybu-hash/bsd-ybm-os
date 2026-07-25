"use client";

import React, { useState } from "react";
import { Download, FileText, Mail, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { captureProductEvent } from "@/lib/analytics/posthog-client";
import { downloadIssuedDocumentExport } from "@/lib/invoice-download-client";
import { OsButton } from "@/components/os/ui";

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
        <OsButton variant="primary" size="sm" loading={saving} icon={<Save size={14} aria-hidden />} onClick={onSave}>
          {t("workspaceWidgets.invoice.save")}
        </OsButton>
      ) : null}
      {onSendReminder ? (
        <OsButton
          variant="secondary"
          size="sm"
          className="border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          loading={sendingReminder}
          icon={<Mail size={14} aria-hidden />}
          onClick={onSendReminder}
        >
          {t("workspaceWidgets.invoice.sendReminder")}
        </OsButton>
      ) : null}
      <OsButton
        variant="secondary"
        size="sm"
        disabled={exporting !== null}
        loading={exporting === "pdf"}
        icon={<Download size={14} aria-hidden />}
        onClick={() => void onExport("pdf")}
      >
        {t("workspaceWidgets.invoice.exportPdf")}
      </OsButton>
      <OsButton
        variant="secondary"
        size="sm"
        disabled={exporting !== null}
        loading={exporting === "docx"}
        icon={<FileText size={14} aria-hidden />}
        onClick={() => void onExport("docx")}
      >
        {t("workspaceWidgets.invoice.exportWord")}
      </OsButton>
      {onDelete ? (
        <OsButton
          variant="secondary"
          size="sm"
          className="border-rose-200 text-rose-700"
          icon={<Trash2 size={14} aria-hidden />}
          onClick={onDelete}
        >
          {t("workspaceWidgets.invoice.delete")}
        </OsButton>
      ) : null}
    </div>
  );
}
