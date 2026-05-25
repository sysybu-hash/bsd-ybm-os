"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import OsConfirmDialog from "@/components/os/OsConfirmDialog";
import React from "react";
import {
  Download,
  Eye,
  Grid,
  List,
  MoreVertical,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import KnowledgeVaultAttachButton from "@/components/os/knowledge-vault/KnowledgeVaultAttachButton";
import WidgetSplitPanels from "@/components/os/layout/WidgetSplitPanels";
import { useArchiveData } from "./erp-file-archive/useArchiveData";
import { ArchiveSidebar } from "./erp-file-archive/ArchiveSidebar";
import { ArchivePreviewPanel } from "./erp-file-archive/ArchivePreviewPanel";
import { CategoryGlyph, categoryChipLabel } from "./erp-file-archive/utils";

export default function ErpFileArchiveWidget() {
  const { dir, t } = useI18n();
  const archive = useArchiveData();

  const {
    files, projects, totalCount, loading, loadError,
    viewMode, setViewMode, searchQuery, setSearchQuery,
    category, setCategory, archiveView, recentOnly, projectId, trashCount,
    selectedFile, setSelectedFile, pdfBlobUrl, scanDoc,
    previewLoading, previewError, openMenuId, setOpenMenuId,
    deleteTarget, setDeleteTarget,
    fetchArchive, selectArchiveScope,
    handlePreview, handleDownload, confirmDelete, handleRestore, openDeleteDialog,
  } = archive;

  const emptyAfterLoad = !loading && !loadError && files.length === 0;
  const listSourceColumnLabel = archiveView === "shared" ? "משתף" : "מקור";
  const emptyMessage =
    archiveView === "trash"
      ? "פח האשפה ריק."
      : archiveView === "shared"
        ? "אין מסמכים שחברי צוות שיתפו איתך."
        : "אין מסמכים התואמים לסינון.";

  function renderActionMenu(file: typeof files[0], menuClassName: string) {
    return (
      <div data-archive-menu className={menuClassName} dir={dir}>
        {archiveView !== "trash" ? (
          <>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-right text-xs hover:bg-[color:var(--foreground-muted)]/10"
              onClick={(e) => { e.stopPropagation(); handlePreview(file); }}>
              <Eye size={14} aria-hidden /> תצוגה מקדימה
            </button>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-right text-xs hover:bg-[color:var(--foreground-muted)]/10"
              onClick={(e) => { e.stopPropagation(); void handleDownload(file); }}>
              <Download size={14} aria-hidden /> הורדה
            </button>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-right text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
              onClick={(e) => { e.stopPropagation(); openDeleteDialog(file); }}>
              <Trash2 size={14} aria-hidden /> העבר לפח
            </button>
          </>
        ) : (
          <>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-right text-xs hover:bg-[color:var(--foreground-muted)]/10"
              onClick={(e) => { e.stopPropagation(); void handleRestore(file); }}>
              <RotateCcw size={14} aria-hidden /> שחזור לארכיון
            </button>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-right text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
              onClick={(e) => { e.stopPropagation(); openDeleteDialog(file); }}>
              <Trash2 size={14} aria-hidden /> מחיקה לצמיתות
            </button>
          </>
        )}
      </div>
    );
  }

  const archiveMain = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 p-4 md:flex-row md:items-center md:justify-between md:p-6">
        <div className="flex w-full flex-col gap-4 md:flex-1 md:flex-row md:items-center">
          <KnowledgeVaultAttachButton
            onSelect={(item) => {
              toast.success(item.name);
              if (item.webViewLink) window.open(item.webViewLink, "_blank", "noopener,noreferrer");
            }}
          />
          <div className="relative w-full md:max-w-md md:flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)]" size={16} aria-hidden />
            <input
              type="search"
              placeholder="חיפוש לפי שם, פרויקט או לקוח..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 py-2 pl-4 pr-10 text-sm text-[color:var(--foreground-main)] shadow-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50 dark:shadow-none"
              aria-label="חיפוש בארכיון"
            />
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 p-1 md:w-auto">
            {(["all", "invoice", "quote", "contract", "SIGNED_QUOTE"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setCategory(t)}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                  category === t
                    ? "bg-[color:var(--surface-card)]/80 text-[color:var(--foreground-main)] shadow-sm dark:shadow-lg"
                    : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
                }`}>
                {categoryChipLabel(t)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 md:mr-4">
          <button type="button" onClick={() => setViewMode("grid")} aria-label="תצוגת רשת"
            className={`rounded-lg p-2 transition-all ${viewMode === "grid" ? "bg-[color:var(--foreground-muted)]/20 text-[color:var(--foreground-main)]" : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"}`}>
            <Grid size={18} />
          </button>
          <button type="button" onClick={() => setViewMode("list")} aria-label="תצוגת רשימה"
            className={`rounded-lg p-2 transition-all ${viewMode === "list" ? "bg-[color:var(--foreground-muted)]/20 text-[color:var(--foreground-main)]" : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"}`}>
            <List size={18} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="custom-scrollbar min-h-0 min-w-0 flex-1 overflow-auto p-4 md:p-6">
          {loading ? (
            <WidgetState variant="loading" message="טוען ארכיון…" />
          ) : loadError ? (
            <WidgetState variant="error" message={loadError} onRetry={() => void fetchArchive()} />
          ) : emptyAfterLoad ? (
            <WidgetState variant="empty" message={emptyMessage} />
          ) : viewMode === "list" ? (
            <div className="min-w-[600px] space-y-2">
              <div className="mb-2 grid grid-cols-12 border-b border-[color:var(--border-main)]/30 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
                <div className="col-span-5">שם</div>
                <div className="col-span-2 text-center">פרויקט</div>
                <div className="col-span-2 text-center">{listSourceColumnLabel}</div>
                <div className="col-span-2 text-center">עודכן</div>
                <div className="col-span-1 text-center">גודל</div>
              </div>
              {files.map((file) => {
                const selected = selectedFile?.id === file.id;
                return (
                  <div
                    key={file.id}
                    className={`group relative grid grid-cols-12 items-center rounded-xl border px-4 py-3 shadow-sm transition-all dark:shadow-none ${
                      selected ? "border-amber-500/50 bg-[color:var(--surface-card)]/90" : "border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handlePreview(file)}
                      aria-label={t("workspaceWidgets.itemActions.previewFile", { name: file.name })}
                      className="col-span-11 grid grid-cols-11 items-center text-start min-w-0"
                    >
                      <span className="col-span-5 flex min-w-0 items-center gap-3">
                        <CategoryGlyph category={file.category} />
                        <span className="truncate text-sm font-bold text-[color:var(--foreground-main)] group-hover:text-amber-600 dark:group-hover:text-amber-400">{file.name}</span>
                      </span>
                      <span className="col-span-2 truncate text-center text-[11px] font-bold text-[color:var(--foreground-muted)]">{file.projectName}</span>
                      <span className="col-span-2 truncate text-center text-[11px] text-[color:var(--foreground-muted)]">
                        {archiveView === "shared" ? file.ownerName ?? "—" : file.source === "issued" ? "מונפק" : "סריקה"}
                      </span>
                      <span className="col-span-1 text-center text-[11px] text-[color:var(--foreground-muted)]">
                        {new Date(file.updatedAt).toLocaleDateString("he-IL")}
                      </span>
                      <span className="col-span-1 text-end text-[10px] text-[color:var(--foreground-muted)] opacity-80">{file.sizeLabel}</span>
                    </button>
                    <div className="relative col-span-1 flex items-center justify-end">
                      <button
                        type="button"
                        aria-label={t("workspaceWidgets.itemActions.actionsMenu")}
                        className="rounded-lg p-1.5 text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/10 hover:text-[color:var(--foreground-main)]"
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId((id) => (id === file.id ? null : file.id)); }}
                      >
                        <MoreVertical size={16} aria-hidden />
                      </button>
                      {openMenuId === file.id ? renderActionMenu(file, "absolute end-4 top-10 z-30 min-w-[168px] rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] py-1 shadow-xl") : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {files.map((file) => {
                const selected = selectedFile?.id === file.id;
                return (
                  <div
                    key={file.id}
                    className={`relative flex flex-col items-center rounded-2xl border p-4 pt-10 text-center shadow-sm transition-all dark:shadow-none ${
                      selected ? "border-amber-500/50 bg-[color:var(--surface-card)]/90" : "border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80"
                    }`}
                  >
                    <div className="absolute end-2 top-2">
                      <button
                        type="button"
                        aria-label={t("workspaceWidgets.itemActions.actionsMenu")}
                        className="rounded-lg p-1.5 text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/15"
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId((id) => (id === file.id ? null : file.id)); }}
                      >
                        <MoreVertical size={16} aria-hidden />
                      </button>
                      {openMenuId === file.id ? renderActionMenu(file, "absolute end-0 top-9 z-30 min-w-[168px] rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] py-1 shadow-xl") : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePreview(file)}
                      aria-label={t("workspaceWidgets.itemActions.previewFile", { name: file.name })}
                      className="flex w-full flex-col items-center text-center"
                    >
                      <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[color:var(--foreground-muted)]/10 text-[color:var(--foreground-muted)]`}>
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
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)]" dir={dir}>
      <OsConfirmDialog
        open={deleteTarget !== null}
        title={archiveView === "trash" ? "מחיקה לצמיתות?" : "להעביר לפח האשפה?"}
        message={
          deleteTarget
            ? archiveView === "trash"
              ? `המסמך «${deleteTarget.name}» יימחק לצמיתות ולא ניתן יהיה לשחזר אותו.`
              : `המסמך «${deleteTarget.name}» יועבר לפח האשפה. ניתן לשחזר משם.`
            : undefined
        }
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />

      <div className="hidden min-h-0 flex-1 md:flex">
        <WidgetSplitPanels
          className="min-h-0 flex-1"
          panels={[
            {
              id: "erp-archive-nav",
              defaultSize: 22,
              minSize: 16,
              className: "flex min-h-0 min-w-0 flex-col border-l border-[color:var(--border-main)] bg-[color:var(--background-main)]/50",
              children: (
                <ArchiveSidebar
                  archiveView={archiveView}
                  recentOnly={recentOnly}
                  projectId={projectId}
                  projects={projects}
                  totalCount={totalCount}
                  filesCount={files.length}
                  trashCount={trashCount}
                  onSelectScope={selectArchiveScope}
                />
              ),
            },
            {
              id: "erp-archive-main",
              defaultSize: 78,
              minSize: 45,
              className: "flex min-h-0 min-w-0 flex-col",
              children: archiveMain,
            },
          ]}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:hidden">{archiveMain}</div>
    </div>
  );
}
