"use client";

import React from "react";
import WidgetState from "@/components/os/WidgetState";
import { ArchivePreviewPanel } from "./ArchivePreviewPanel";
import { ArchiveMenuTrigger } from "./ArchiveMenuTrigger";
import { CategoryGlyph } from "./utils";
import type { ErpArchiveFile, ScanDocPreview } from "./types";

type Props = {
  files: ErpArchiveFile[];
  loading: boolean;
  loadError: string | null;
  emptyMessage: string;
  viewMode: "list" | "grid";
  archiveView: string;
  listSourceColumnLabel: string;
  selectedFile: ErpArchiveFile | null;
  selectedKeys: Set<string>;
  selectionMode: boolean;
  openMenuId: string | null;
  pdfBlobUrl: string | null;
  scanDoc: ScanDocPreview | null;
  previewLoading: boolean;
  previewError: string | null;
  dir: string;
  fileKey: (f: ErpArchiveFile) => string;
  t: (key: string, vars?: Record<string, string>) => string;
  setSelectedFile: (f: ErpArchiveFile | null) => void;
  setOpenMenuId: (fn: (id: string | null) => string | null) => void;
  toggleSelected: (f: ErpArchiveFile) => void;
  fetchArchive: () => void;
  handlePreview: (f: ErpArchiveFile) => void;
  handleDownload: (f: ErpArchiveFile) => Promise<void>;
  openDeleteDialog: (f: ErpArchiveFile) => void;
  handleRestore: (f: ErpArchiveFile) => Promise<void>;
};

export function ArchiveFilesSection({
  files, loading, loadError, emptyMessage, viewMode, archiveView, listSourceColumnLabel,
  selectedFile, selectedKeys, selectionMode, openMenuId, pdfBlobUrl, scanDoc,
  previewLoading, previewError, dir, fileKey, t,
  setSelectedFile, setOpenMenuId, toggleSelected, fetchArchive,
  handlePreview, handleDownload, openDeleteDialog, handleRestore,
}: Props) {
  const actionMenuProps = { archiveView, dir, onPreview: handlePreview, onDownload: handleDownload, onDelete: openDeleteDialog, onRestore: handleRestore };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="custom-scrollbar min-h-0 min-w-0 flex-1 overflow-auto p-4 md:p-6">
        {loading ? (
          <WidgetState variant="loading" message="טוען ארכיון…" />
        ) : loadError ? (
          <WidgetState variant="error" message={loadError} onRetry={fetchArchive} />
        ) : files.length === 0 ? (
          <WidgetState variant="empty" message={emptyMessage} />
        ) : viewMode === "list" ? (
          <div className="overflow-x-auto">
            <div className="min-w-[420px] space-y-2">
              <div className="mb-2 grid grid-cols-12 border-b border-[color:var(--border-main)]/30 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
                <div className="col-span-5">שם</div>
                <div className="col-span-2 text-center">פרויקט</div>
                <div className="col-span-2 text-center">{listSourceColumnLabel}</div>
                <div className="col-span-2 text-center">עודכן</div>
                <div className="col-span-1 text-center">גודל</div>
              </div>
              {files.map((file) => {
                const selected = selectedFile?.id === file.id;
                const checked = selectedKeys.has(fileKey(file));
                return (
                  <div key={file.id} className={`group relative grid grid-cols-12 items-center rounded-xl border px-4 py-3 shadow-sm transition-all dark:shadow-none ${selected ? "border-amber-500/50 bg-[color:var(--surface-card)]/90" : "border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80"}`}>
                    {selectionMode ? (
                      <div className="absolute start-2 top-1/2 z-10 -translate-y-1/2">
                        <input type="checkbox" checked={checked} onChange={() => toggleSelected(file)} onClick={(e) => e.stopPropagation()} aria-label={file.name} />
                      </div>
                    ) : null}
                    <button type="button" onClick={() => handlePreview(file)} aria-label={t("workspaceWidgets.itemActions.previewFile", { name: file.name })} className="col-span-11 grid min-w-0 grid-cols-11 items-center text-start">
                      <span className="col-span-5 flex min-w-0 items-center gap-3">
                        <CategoryGlyph category={file.category} />
                        <span className="truncate text-sm font-bold text-[color:var(--foreground-main)] group-hover:text-amber-600 dark:group-hover:text-amber-400">{file.name}</span>
                      </span>
                      <span className="col-span-2 truncate text-center text-[11px] font-bold text-[color:var(--foreground-muted)]">{file.projectName}</span>
                      <span className="col-span-2 truncate text-center text-[11px] text-[color:var(--foreground-muted)]">
                        {archiveView === "shared" ? file.ownerName ?? "—" : file.source === "issued" ? "מונפק" : "סריקה"}
                      </span>
                      <span className="col-span-1 text-center text-[11px] text-[color:var(--foreground-muted)]">{new Date(file.updatedAt).toLocaleDateString("he-IL")}</span>
                      <span className="col-span-1 text-end text-[10px] text-[color:var(--foreground-muted)] opacity-80">{file.sizeLabel}</span>
                    </button>
                    <div className="relative col-span-1 flex items-center justify-end">
                      <ArchiveMenuTrigger
                        {...actionMenuProps}
                        file={file}
                        isOpen={openMenuId === file.id}
                        onToggle={() => setOpenMenuId((id) => (id === file.id ? null : file.id))}
                        menuLabel={t("workspaceWidgets.itemActions.actionsMenu")}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {files.map((file) => {
              const selected = selectedFile?.id === file.id;
              return (
                <div key={file.id} className={`relative flex flex-col items-center rounded-2xl border p-4 pt-10 text-center shadow-sm transition-all dark:shadow-none ${selected ? "border-amber-500/50 bg-[color:var(--surface-card)]/90" : "border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80"}`}>
                  <div className="absolute end-2 top-2">
                    <ArchiveMenuTrigger
                      {...actionMenuProps}
                      file={file}
                      isOpen={openMenuId === file.id}
                      onToggle={() => setOpenMenuId((id) => (id === file.id ? null : file.id))}
                      menuLabel={t("workspaceWidgets.itemActions.actionsMenu")}
                      buttonClassName="rounded-lg p-1.5 text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/15"
                    />
                  </div>
                  <button type="button" onClick={() => handlePreview(file)} aria-label={t("workspaceWidgets.itemActions.previewFile", { name: file.name })} className="flex w-full flex-col items-center text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--foreground-muted)]/10 text-[color:var(--foreground-muted)]">
                      <CategoryGlyph category={file.category} />
                    </div>
                    <div className="mb-1 w-full truncate text-sm font-bold text-[color:var(--foreground-main)]">{file.name}</div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--foreground-muted)]">{file.projectName}</div>
                    {archiveView === "shared" && file.ownerName ? (
                      <div className="mt-1 text-[10px] text-[color:var(--foreground-muted)]">מאת {file.ownerName}</div>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedFile ? (
        <ArchivePreviewPanel
          file={selectedFile}
          pdfBlobUrl={pdfBlobUrl}
          scanDoc={scanDoc}
          previewLoading={previewLoading}
          previewError={previewError}
          onClose={() => setSelectedFile(null)}
        />
      ) : null}
    </div>
  );
}
