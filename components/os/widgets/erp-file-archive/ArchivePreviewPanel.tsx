"use client";

import React from "react";
import { X } from "lucide-react";
import WidgetState from "@/components/os/WidgetState";
import type { ErpArchiveFile, ScanDocPreview } from "./types";

type ArchivePreviewPanelProps = {
  file: ErpArchiveFile;
  pdfBlobUrl: string | null;
  scanDoc: ScanDocPreview | null;
  previewLoading: boolean;
  previewError: string | null;
  onClose: () => void;
};

export function ArchivePreviewPanel({
  file,
  pdfBlobUrl,
  scanDoc,
  previewLoading,
  previewError,
  onClose,
}: ArchivePreviewPanelProps) {
  return (
    <aside className="flex max-h-[55vh] w-full shrink-0 flex-col border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/40 lg:max-h-none lg:w-[min(100%,420px)] lg:border-r lg:border-t-0">
      <div className="flex items-start justify-between gap-2 border-b border-[color:var(--border-main)] p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">תצוגה מקדימה</p>
          <p className="mt-1 truncate text-sm font-bold text-[color:var(--foreground-main)]">{file.name}</p>
          <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">
            {file.projectName}{file.clientName ? ` · ${file.clientName}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg p-2 text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/10"
          aria-label="סגור תצוגה"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        {previewLoading ? (
          <WidgetState variant="loading" message="טוען תצוגה…" />
        ) : previewError ? (
          <WidgetState variant="error" message={previewError} />
        ) : file.source === "issued" && pdfBlobUrl ? (
          <iframe title="תצוגת PDF" src={pdfBlobUrl} className="h-full min-h-[480px] w-full rounded-xl border border-[color:var(--border-main)] bg-white" />
        ) : file.source === "document" && scanDoc ? (
          <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-auto">
            <div className="mb-3 text-xs text-[color:var(--foreground-muted)]">
              <span className="font-bold text-[color:var(--foreground-main)]">סוג: </span>{scanDoc.type}
            </div>
            {!scanDoc.lineItems?.length ? (
              <WidgetState variant="empty" message="אין שורות מפורטות למסמך זה." />
            ) : (
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-[color:var(--border-main)] text-[color:var(--foreground-muted)]">
                    <th className="py-2 font-bold">תיאור</th>
                    <th className="py-2 font-bold">כמות</th>
                    <th className="py-2 font-bold">מחיר</th>
                    <th className="py-2 font-bold">סה״כ</th>
                  </tr>
                </thead>
                <tbody>
                  {scanDoc.lineItems.map((li) => (
                    <tr key={li.id} className="border-b border-[color:var(--border-main)]/40">
                      <td className="py-2 align-top">{li.description}</td>
                      <td className="py-2 align-top">{li.quantity ?? "—"}</td>
                      <td className="py-2 align-top">{li.unitPrice ?? "—"}</td>
                      <td className="py-2 align-top">{li.lineTotal ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <WidgetState variant="empty" message="אין תצוגה זמינה." />
        )}
      </div>
    </aside>
  );
}
