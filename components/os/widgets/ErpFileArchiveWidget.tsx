"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import OsConfirmDialog from "@/components/os/OsConfirmDialog";
import React, { useState } from "react";
import { Grid, List, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import KnowledgeVaultAttachButton from "@/components/os/knowledge-vault/KnowledgeVaultAttachButton";
import WidgetSplitPanels from "@/components/os/layout/WidgetSplitPanels";
import { OsButton, OsIconButton, OsSearchInput } from "@/components/os/ui";
import { useArchiveData } from "./erp-file-archive/useArchiveData";
import { ArchiveSidebar } from "./erp-file-archive/ArchiveSidebar";
import { ArchiveFilesSection } from "./erp-file-archive/ArchiveFilesSection";
import { categoryChipLabelKey } from "./erp-file-archive/utils";

export default function ErpFileArchiveWidget() {
  const { dir, t } = useI18n();
  const archive = useArchiveData();
  const [mobilePane, setMobilePane] = useState<"nav" | "files">("files");

  const {
    files, projects, totalCount, loading, loadError,
    viewMode, setViewMode, searchQuery, setSearchQuery,
    category, setCategory, archiveView, recentOnly, projectId, trashCount,
    selectedFile, setSelectedFile, pdfBlobUrl, scanDoc,
    previewLoading, previewError, openMenuId, setOpenMenuId,
    deleteTarget, setDeleteTarget,
    fetchArchive, selectArchiveScope,
    handlePreview, handleDownload, confirmDelete, handleRestore, openDeleteDialog,
    selectionMode, setSelectionMode, selectedKeys, toggleSelected, clearSelection,
    bulkExporting, handleBulkExport, fileKey,
    emptyTrashTarget, setEmptyTrashTarget, emptyingTrash, confirmEmptyRecycleBin,
  } = archive;

  const listSourceColumnLabel = t(archiveView === "shared" ? "workspaceWidgets.erpArchive.colSharer" : "workspaceWidgets.erpArchive.colSource");
  const emptyMessage =
    archiveView === "trash" ? t("workspaceWidgets.erpArchive.emptyTrash")
      : archiveView === "shared" ? t("workspaceWidgets.erpArchive.emptyShared")
        : t("workspaceWidgets.erpArchive.emptyFiltered");

  const filesSectionProps = {
    files, loading, loadError, emptyMessage, viewMode, archiveView, listSourceColumnLabel,
    selectedFile, selectedKeys, selectionMode, openMenuId, pdfBlobUrl, scanDoc,
    previewLoading, previewError, dir, fileKey, t,
    setSelectedFile, setOpenMenuId, toggleSelected, fetchArchive,
    handlePreview, handleDownload, openDeleteDialog, handleRestore,
  };

  const archiveMain = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 p-4 md:flex-row md:items-center md:justify-between md:p-6">
        <div className="flex w-full flex-col gap-4 md:flex-1 md:flex-row md:items-center">
          <KnowledgeVaultAttachButton
            onSelect={(item) => { toast.success(item.name); if (item.webViewLink) window.open(item.webViewLink, "_blank", "noopener,noreferrer"); }}
          />
          <OsSearchInput
            className="w-full md:max-w-md md:flex-1"
            value={searchQuery}
            onChange={setSearchQuery}
            label={t("workspaceWidgets.erpArchive.searchAria")}
            placeholder={t("workspaceWidgets.erpArchive.searchPlaceholder")}
          />
          <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 p-1 md:w-auto">
            {(["all", "invoice", "quote", "contract", "SIGNED_QUOTE"] as const).map((cat) => (
              <button key={cat} type="button" onClick={() => setCategory(cat)}
                className={`min-h-[44px] touch-manipulation rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all md:min-h-0 md:py-1.5 ${category === cat ? "bg-[color:var(--surface-card)]/80 text-[color:var(--foreground-main)] shadow-sm dark:shadow-lg" : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"}`}>
                {t(categoryChipLabelKey(cat))}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:mr-4">
          {archiveView === "trash" && trashCount > 0 ? (
            <OsButton variant="danger" size="sm" disabled={emptyingTrash} onClick={() => setEmptyTrashTarget(true)}>
              {t("workspaceWidgets.erpArchive.emptyRecycleBin")}
            </OsButton>
          ) : null}
          {archiveView === "active" ? (
            selectionMode ? (
              <>
                <OsButton variant="primary" size="sm" disabled={bulkExporting || selectedKeys.size === 0} onClick={() => void handleBulkExport()}>
                  {t("workspaceWidgets.erpArchive.exportSelected")} ({selectedKeys.size})
                </OsButton>
                <OsButton variant="secondary" size="sm" onClick={clearSelection}>
                  {t("workspaceWidgets.erpArchive.cancelSelect")}
                </OsButton>
              </>
            ) : (
              <OsButton variant="secondary" size="sm" onClick={() => setSelectionMode(true)}>
                {t("workspaceWidgets.erpArchive.selectMode")}
              </OsButton>
            )
          ) : null}
          <OsIconButton label={t("common.refresh")} active={false} onClick={() => void fetchArchive()}>
            <RefreshCw size={16} aria-hidden />
          </OsIconButton>
          <OsIconButton label={t("workspaceWidgets.erpArchive.viewGrid")} active={viewMode === "grid"} onClick={() => setViewMode("grid")}>
            <Grid size={18} aria-hidden />
          </OsIconButton>
          <OsIconButton label={t("workspaceWidgets.erpArchive.viewList")} active={viewMode === "list"} onClick={() => setViewMode("list")}>
            <List size={18} aria-hidden />
          </OsIconButton>
        </div>
      </div>

      <ArchiveFilesSection {...filesSectionProps} />
    </div>
  );

  const archiveSidebar = (
    <ArchiveSidebar archiveView={archiveView} recentOnly={recentOnly} projectId={projectId}
      projects={projects} totalCount={totalCount} filesCount={files.length} trashCount={trashCount}
      onSelectScope={(scope) => { selectArchiveScope(scope); setMobilePane("files"); }} />
  );

  return (
    <div data-widget-sticky-chrome className="flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)]" dir={dir}>
      <OsConfirmDialog
        open={emptyTrashTarget}
        title={t("workspaceWidgets.erpArchive.emptyRecycleBinTitle")}
        message={t("workspaceWidgets.erpArchive.emptyRecycleBinMessage", { count: String(trashCount) })}
        destructive confirmLabel={t("workspaceWidgets.erpArchive.emptyRecycleBinConfirm")}
        onCancel={() => setEmptyTrashTarget(false)} onConfirm={() => void confirmEmptyRecycleBin()}
      />
      <OsConfirmDialog
        open={deleteTarget !== null}
        title={t(archiveView === "trash" ? "workspaceWidgets.erpArchive.confirmDeleteForeverTitle" : "workspaceWidgets.erpArchive.confirmTrashTitle")}
        message={deleteTarget
          ? archiveView === "trash"
            ? t("workspaceWidgets.erpArchive.confirmDeleteForeverBody", { name: deleteTarget.name })
            : t("workspaceWidgets.erpArchive.confirmTrashBody", { name: deleteTarget.name })
          : undefined}
        destructive onCancel={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()}
      />

      <div className="hidden min-h-0 flex-1 md:flex">
        <WidgetSplitPanels className="min-h-0 flex-1" panels={[
          { id: "erp-archive-nav", defaultSize: 22, minSize: 16, className: "flex min-h-0 min-w-0 flex-col border-l border-[color:var(--border-main)] bg-[color:var(--background-main)]/50", children: archiveSidebar },
          { id: "erp-archive-main", defaultSize: 78, minSize: 45, className: "flex min-h-0 min-w-0 flex-col", children: archiveMain },
        ]} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        <div className="flex shrink-0 gap-1 border-b border-[color:var(--border-main)] p-1.5" role="tablist">
          {(["nav", "files"] as const).map((pane) => (
            <button key={pane} type="button" role="tab" aria-selected={mobilePane === pane} onClick={() => setMobilePane(pane)}
              className={`min-h-[44px] flex-1 rounded-lg text-sm font-bold transition ${mobilePane === pane ? "bg-[color:var(--win-accent,var(--accent))] text-white" : "bg-[color:var(--surface-soft)] text-[color:var(--foreground-muted)]"}`}>
              {pane === "nav" ? t("workspaceWidgets.erpArchive.mobileTabNav") : t("workspaceWidgets.erpArchive.mobileTabFiles")}
            </button>
          ))}
        </div>
        <div data-widget-scroll-pane className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {mobilePane === "nav" ? <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">{archiveSidebar}</div> : archiveMain}
        </div>
      </div>
    </div>
  );
}
