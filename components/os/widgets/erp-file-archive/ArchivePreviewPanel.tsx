"use client";

import React from "react";
import { ExternalLink, X } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import CommentsThread from "@/components/os/shared/CommentsThread";
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

function isImageFileName(fileName: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|heic|heif|tiff?)$/i.test(fileName);
}

function driveEmbedUrl(fileDriveId: string): string {
  return `https://drive.google.com/file/d/${fileDriveId}/preview`;
}

function ArchiveFilePreview({
  fileName,
  pdfBlobUrl,
  fileDriveId,
  fileDriveWebViewLink,
  t,
}: {
  fileName: string;
  pdfBlobUrl: string | null;
  fileDriveId?: string | null;
  fileDriveWebViewLink?: string | null;
  t: (key: string) => string;
}) {
  const FA = "workspaceWidgets.fileArchive";

  if (pdfBlobUrl) {
    if (isImageFileName(fileName)) {
      return (
        // eslint-disable-next-line @next/next/no-img-element -- blob URL preview
        <img
          src={pdfBlobUrl}
          alt={fileName}
          className="max-h-full w-full rounded-xl border border-[color:var(--border-main)] bg-white object-contain"
        />
      );
    }
    return (
      <iframe
        title={t(`${FA}.pdfTitle`)}
        src={pdfBlobUrl}
        className="h-full min-h-[220px] w-full rounded-xl border border-[color:var(--border-main)] bg-white"
      />
    );
  }

  if (fileDriveId) {
    return (
      <iframe
        title={t(`${FA}.pdfTitle`)}
        src={driveEmbedUrl(fileDriveId)}
        className="h-full min-h-[220px] w-full rounded-xl border border-[color:var(--border-main)] bg-white"
        allow="autoplay"
      />
    );
  }

  if (fileDriveWebViewLink) {
    return (
      <a
        href={fileDriveWebViewLink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 px-4 py-8 text-sm font-bold text-amber-700 hover:bg-[color:var(--surface-card)] dark:text-amber-300"
      >
        <ExternalLink size={16} aria-hidden />
        {t(`${FA}.openInDrive`)}
      </a>
    );
  }

  return (
    <WidgetState variant="empty" message={t(`${FA}.fileUnavailable`)} />
  );
}

export function ArchivePreviewPanel({
  file,
  pdfBlobUrl,
  scanDoc,
  previewLoading,
  previewError,
  onClose,
}: ArchivePreviewPanelProps) {
  const { t } = useI18n();
  const FA = "workspaceWidgets.fileArchive";
  const isScanDoc = file.source === "document";
  const commentTargetId = isScanDoc && scanDoc ? scanDoc.id : file.source === "issued" ? file.sourceId : null;

  return (
    <aside className="flex max-h-[55vh] w-full shrink-0 flex-col border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/40 lg:max-h-none lg:w-[min(100%,420px)] lg:border-r lg:border-t-0">
      <div className="flex items-start justify-between gap-2 border-b border-[color:var(--border-main)] p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">{t(`${FA}.previewTitle`)}</p>
          <p className="mt-1 truncate text-sm font-bold text-[color:var(--foreground-main)]">{file.name}</p>
          <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">
            {file.projectName}{file.clientName ? ` · ${file.clientName}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg p-2 text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/10"
          aria-label={t(`${FA}.closeAria`)}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        {previewLoading ? (
          <WidgetState variant="loading" message={t(`${FA}.loadingPreview`)} />
        ) : previewError ? (
          <WidgetState variant="error" message={previewError} />
        ) : file.source === "issued" && pdfBlobUrl ? (
          <iframe title={t(`${FA}.pdfTitle`)} src={pdfBlobUrl} className="h-full min-h-[480px] w-full rounded-xl border border-[color:var(--border-main)] bg-white" />
        ) : isScanDoc && scanDoc ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <div className="flex min-h-[200px] max-h-[45%] shrink-0 flex-col overflow-hidden">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">
                {t(`${FA}.fileSectionTitle`)}
              </p>
              <div className="min-h-0 flex-1 overflow-hidden">
                <ArchiveFilePreview
                  fileName={scanDoc.fileName}
                  pdfBlobUrl={pdfBlobUrl}
                  fileDriveId={scanDoc.fileDriveId}
                  fileDriveWebViewLink={scanDoc.fileDriveWebViewLink}
                  t={t}
                />
              </div>
            </div>
            <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-auto border-t border-[color:var(--border-main)]/50 pt-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">
                {t(`${FA}.decodeSectionTitle`)}
              </p>
              <div className="mb-3 text-xs text-[color:var(--foreground-muted)]">
                <span className="font-bold text-[color:var(--foreground-main)]">{t(`${FA}.typeLabel`)}</span>
                {scanDoc.type}
              </div>
              {!scanDoc.lineItems?.length ? (
                <ScanDocSummary aiData={scanDoc.aiData} fileName={scanDoc.fileName} t={t} />
              ) : (
                <table className="w-full text-start text-xs">
                  <thead>
                    <tr className="border-b border-[color:var(--border-main)] text-[color:var(--foreground-muted)]">
                      <th className="py-2 font-bold">{t("workspaceWidgets.fileArchive.colDescription")}</th>
                      <th className="py-2 font-bold">{t("workspaceWidgets.fileArchive.colQuantity")}</th>
                      <th className="py-2 font-bold">{t("workspaceWidgets.fileArchive.colPrice")}</th>
                      <th className="py-2 font-bold">{t("workspaceWidgets.fileArchive.colTotal")}</th>
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
          </div>
        ) : (
          <WidgetState variant="empty" message={t(`${FA}.noPreview`)} />
        )}
        {commentTargetId ? (
          <div className="mt-3 shrink-0 border-t border-[color:var(--border-main)]/50 pt-3">
            <CommentsThread targetId={commentTargetId} targetType="DOC" />
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function ScanDocSummary({
  aiData,
  fileName,
  t,
}: {
  aiData?: Record<string, unknown> | null;
  fileName: string;
  t: (key: string) => string;
}) {
  const FA = "workspaceWidgets.fileArchive";
  const vendor =
    typeof aiData?.vendor === "string"
      ? aiData.vendor
      : typeof aiData?.supplier === "string"
        ? aiData.supplier
        : null;
  const total = typeof aiData?.total === "number" ? aiData.total : null;
  const summary = typeof aiData?.summary === "string" ? aiData.summary : null;

  if (!vendor && total == null && !summary) {
    return (
      <WidgetState
        variant="empty"
        message={t(`${FA}.noLineItems`)}
      />
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-3 text-xs">
      <p className="font-bold text-[color:var(--foreground-main)]">{fileName}</p>
      {vendor ? (
        <p>
          <span className="text-[color:var(--foreground-muted)]">{t(`${FA}.vendorLabel`)}</span>
          {vendor}
        </p>
      ) : null}
      {total != null ? (
        <p>
          <span className="text-[color:var(--foreground-muted)]">{t(`${FA}.totalLabel`)}</span>
          ₪{total.toLocaleString("he-IL")}
        </p>
      ) : null}
      {summary ? (
        <p className="text-[color:var(--foreground-muted)] leading-relaxed">{summary}</p>
      ) : null}
    </div>
  );
}
