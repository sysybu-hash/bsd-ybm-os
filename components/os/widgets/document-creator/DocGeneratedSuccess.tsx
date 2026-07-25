"use client";

import React from "react";
import { CheckCircle2, Copy, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { OsButton, OsIconButton } from "@/components/os/ui";
import type { GeneratedDocState } from "./types";

type DocGeneratedSuccessProps = {
  generatedDoc: GeneratedDocState;
  docTypeLabel: string;
  onDownloadPDF: () => void;
  onReset: () => void;
};

export function DocGeneratedSuccess({ generatedDoc, docTypeLabel, onDownloadPDF, onReset }: DocGeneratedSuccessProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 bg-transparent text-[color:var(--foreground-main)]">
      <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
        <CheckCircle2 className="w-10 h-10 text-[color:var(--accent)] dark:text-emerald-400" />
      </div>
      <h2 className="text-2xl font-bold mb-2 text-[color:var(--foreground-main)]">
        {t("workspaceWidgets.documentCreator.docGenerated", { type: docTypeLabel, number: String(generatedDoc.documentNumber) })}
      </h2>
      <p className="text-[color:var(--foreground-muted)] mb-8 text-center">
        {t("workspaceWidgets.documentCreator.savedReady")}
      </p>

      <div className="w-full max-w-md space-y-4">
        <OsButton
          variant="secondary"
          className="w-full justify-center py-4"
          icon={<Download size={20} className="text-blue-600 dark:text-blue-400" aria-hidden />}
          onClick={onDownloadPDF}
        >
          {t("workspaceWidgets.documentCreator.downloadPdf")}
        </OsButton>

        <div className="bg-[color:var(--background-main)]/50 border border-[color:var(--border-main)] rounded-2xl p-4 shadow-sm dark:shadow-none">
          <label className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest block mb-2">
            {t("workspaceWidgets.documentCreator.signatureLink")}
          </label>
          <div className="flex gap-2">
            <input
              readOnly
              value={generatedDoc.signUrl || "#"}
              className="flex-1 bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-lg px-3 py-2 text-xs text-[color:var(--foreground-muted)] outline-none"
            />
            <OsIconButton
              label={t("workspaceWidgets.documentCreator.urlCopied")}
              className="bg-emerald-500/10 text-[color:var(--accent)] hover:bg-emerald-500/20 border-emerald-500/20 dark:text-emerald-400"
              onClick={() => { navigator.clipboard.writeText(generatedDoc.signUrl || ""); toast.success(t("workspaceWidgets.documentCreator.urlCopied")); }}
            >
              <Copy size={16} aria-hidden />
            </OsIconButton>
          </div>
        </div>

        <div className="flex gap-4 pt-4">
          <OsButton variant="primary" className="flex-1 justify-center py-3" onClick={onReset}>
            {t("workspaceWidgets.documentCreator.createAnother")}
          </OsButton>
          {generatedDoc.signUrl && (
            <a
              href={generatedDoc.signUrl}
              target="_blank"
              className="p-3 bg-[color:var(--accent)] hover:bg-[color:var(--accent-strong)] text-[color:var(--accent-contrast)] rounded-xl transition-all flex items-center justify-center"
            >
              <ExternalLink size={20} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
