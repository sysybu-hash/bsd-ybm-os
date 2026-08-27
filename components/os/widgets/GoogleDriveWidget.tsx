"use client";

import React, { useCallback } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { Loader2, LayoutList, LayoutGrid, Rows3, Table2, Sparkles, Library, ExternalLink } from "lucide-react";
import ProjectPickerPanel from "@/components/os/widgets/shared/ProjectPickerPanel";
import GoogleDriveDecodeReviewPanel from "@/components/os/widgets/GoogleDriveDecodeReviewPanel";
import { OsButton, OsIconButton, OsSearchInput } from "@/components/os/ui";
import type { GoogleDriveWidgetProps, GoogleFile } from "./google-drive/types";
import { useGoogleDriveWidget } from "./google-drive/useGoogleDriveWidget";
import { DriveFileList } from "./google-drive/DriveFileList";
import { DriveHeader } from "./google-drive/DriveHeader";

export default function GoogleDriveWidget({ liveData = null, openWorkspaceWidget }: GoogleDriveWidgetProps) {
  const { locale } = useI18n();
  const s = useGoogleDriveWidget({ liveData, openWorkspaceWidget });
  const {
    dir, t, drivePrefix,
    fileInputRef, viewMode, setView,
    selectedIds, setSelectedIds,
    searchQuery, setSearchQuery,
    actionFileId,
    autoDecodeOnSync, setAutoDecodeOnSync,
    orgBrowseMode, setOrgBrowseMode,
    files, loading, syncing, uploading,
    workspace, folderPath, driveError, reauthUrl, lastSyncAt,
    decoding, reviewOpen, setReviewOpen, reviewItems, setReviewItems, reviewSaving,
    handleRefresh, handleFolderClick, navigateToFolder, handleUpload,
    runDecodeBatch, saveReviewItems,
    boundProjectId, boundProjectName,
    projectsList, projectsListLoading, showProjectPicker, loadProjectsList, addToNotebook, runAiScan,
    handleSelectProject, handleClearProject, toggleSelect,
    selectableFiles, handleBrowseOrg,
  } = s;

  const fileActionsSlot = useCallback((file: GoogleFile) => (
    <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
      <button
        type="button"
        disabled={actionFileId === file.id}
        onClick={(e) => { e.stopPropagation(); void addToNotebook(file); }}
        className="p-2 hover:bg-amber-500/10 rounded-lg text-amber-600 transition-all disabled:opacity-50"
        title={t("workspaceWidgets.googleDrive.addToNotebook")} aria-label={t("workspaceWidgets.googleDrive.addToNotebook")}
      >
        {actionFileId === file.id ? <Loader2 size={16} className="animate-spin" /> : <Library size={16} />}
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); runAiScan(file); }}
        className="p-2 hover:bg-violet-500/10 rounded-lg text-violet-600 transition-all"
        title={t("workspaceWidgets.googleDrive.aiDecode")} aria-label={t("workspaceWidgets.googleDrive.aiDecode")}
      >
        <Sparkles size={16} />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); window.open(file.webViewLink, "_blank"); }}
        className="p-2 hover:bg-blue-500/10 rounded-lg text-blue-600 transition-all"
        title={t("workspaceWidgets.googleDrive.openInDrive")} aria-label={t("workspaceWidgets.googleDrive.openInDrive")}
      >
        <ExternalLink size={16} />
      </button>
    </div>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [actionFileId]);

  if (showProjectPicker && !orgBrowseMode) {
    return (
      <div className="flex h-full min-h-0 flex-col" dir={dir}>
        <ProjectPickerPanel
          projects={projectsList}
          loading={projectsListLoading}
          onSelect={handleSelectProject}
          titleKey={`${drivePrefix}.pickProjectTitle`}
          descKey={`${drivePrefix}.pickProjectDesc`}
          loadingKey={`${drivePrefix}.pickProjectLoading`}
          emptyKey={`${drivePrefix}.noProjects`}
          openCrmKey={openWorkspaceWidget ? `${drivePrefix}.openCrm` : undefined}
          onOpenCrm={openWorkspaceWidget ? () => openWorkspaceWidget("crmTable", null) : undefined}
        />
        <div className="shrink-0 border-t border-[color:var(--border-main)] p-3">
          <OsButton variant="secondary" className="w-full justify-center" onClick={handleBrowseOrg}>
            {t(`${drivePrefix}.browseOrg`)}
          </OsButton>
        </div>
      </div>
    );
  }

  return (
    <div data-widget-sticky-chrome className="flex h-full min-h-0 flex-col overflow-x-hidden bg-[color:var(--background-main)] text-[color:var(--foreground-main)]" dir={dir}>
      <DriveHeader
        t={t} drivePrefix={drivePrefix}
        boundProjectName={boundProjectName}
        boundProjectId={boundProjectId}
        orgBrowseMode={orgBrowseMode}
        folderPath={folderPath}
        loading={loading} syncing={syncing} uploading={uploading}
        driveError={driveError}
        fileInputRef={fileInputRef}
        setOrgBrowseMode={setOrgBrowseMode}
        loadProjectsList={loadProjectsList}
        handleClearProject={handleClearProject}
        handleRefresh={handleRefresh}
        handleUpload={handleUpload}
        navigateToFolder={navigateToFolder}
      />

      {/* Search + toolbar */}
      <div className="p-4 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/30">
        <OsSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          label={t("workspaceWidgets.googleDrive.searchPlaceholder")}
        />
        {workspace ? (
          <p className="mt-2 text-[10px] text-[color:var(--foreground-muted)] font-semibold">
            {t("workspaceWidgets.googleDrive.syncFolder", { folder: workspace.folderName })}
            {lastSyncAt ? ` · ${t("workspaceWidgets.googleDrive.syncedAt", { time: new Date(lastSyncAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) })}` : ""}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[color:var(--border-main)] overflow-hidden">
            {([["list", LayoutList], ["grid", LayoutGrid], ["compact", Rows3], ["details", Table2]] as const).map(
              ([mode, Icon]) => (
                <OsIconButton key={mode} label={mode} size="sm" active={viewMode === mode} onClick={() => setView(mode)}>
                  <Icon size={16} aria-hidden />
                </OsIconButton>
              ),
            )}
          </div>
          <label className="flex items-center gap-2 text-[10px] font-bold text-[color:var(--foreground-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={autoDecodeOnSync}
              onChange={(e) => {
                const v = e.target.checked;
                setAutoDecodeOnSync(v);
                void fetch("/api/os/google-drive/settings", {
                  method: "PATCH", credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ driveAutoDecodeOnSync: v }),
                });
              }}
            />
            {t("workspaceWidgets.googleDrive.autoDecode")}
          </label>
          {selectableFiles.length > 0 ? (
            <button type="button"
              onClick={() => setSelectedIds((prev) =>
                prev.size === selectableFiles.length ? new Set() : new Set(selectableFiles.map((f) => f.id))
              )}
              className="text-[10px] font-bold text-violet-600 underline">
              {t(selectedIds.size === selectableFiles.length ? "workspaceWidgets.googleDrive.deselectAll" : "workspaceWidgets.googleDrive.selectAll")}
            </button>
          ) : null}
        </div>
      </div>

      {/* Decode selection bar */}
      {selectedIds.size > 0 ? (
        <div className="flex items-center gap-2 border-b border-violet-500/20 bg-violet-500/10 px-4 py-2">
          <span className="text-xs font-bold">{t("workspaceWidgets.googleDrive.selectedCount", { count: String(selectedIds.size) })}</span>
          <OsButton
            variant="primary"
            size="sm"
            loading={decoding}
            onClick={() => void runDecodeBatch([...selectedIds]).then(() => setSelectedIds(new Set()))}
          >
            {t("workspaceWidgets.googleDrive.decodeSelected")}
          </OsButton>
          <OsButton variant="quiet" size="sm" className="underline" onClick={() => setSelectedIds(new Set())}>
            {t("workspaceWidgets.googleDrive.clear")}
          </OsButton>
        </div>
      ) : null}

      {/* File list */}
      <div data-widget-scroll-pane className="custom-scrollbar">
        <DriveFileList
          files={files} viewMode={viewMode} selectedIds={selectedIds}
          workspace={workspace} driveError={driveError} reauthUrl={reauthUrl}
          loading={loading} actionFileId={actionFileId}
          onFolderClick={handleFolderClick} onToggleSelect={toggleSelect}
          fileActionsSlot={fileActionsSlot}
        />
      </div>

      {/* Footer */}
      <div className="p-3 md:p-4 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/30 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">
        <div className="flex flex-wrap gap-2">
          <span>{t("workspaceWidgets.googleDrive.itemsCount", { count: String(files.length) })}</span>
          <span>•</span>
          <span>{t("workspaceWidgets.googleDrive.autoSyncEvery")}{lastSyncAt ? ` · ${new Date(lastSyncAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
        </div>
        <div className={`flex items-center gap-1 ${driveError ? "text-rose-500" : syncing ? "text-amber-500" : "text-emerald-500"}`}>
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${driveError ? "bg-rose-500" : syncing ? "bg-amber-500" : "bg-emerald-500"}`} />
          {t(driveError ? "workspaceWidgets.googleDrive.needsConnection" : syncing ? "workspaceWidgets.googleDrive.syncing" : "workspaceWidgets.googleDrive.connected")}
        </div>
      </div>

      <GoogleDriveDecodeReviewPanel
        open={reviewOpen} items={reviewItems} saving={reviewSaving}
        onClose={() => setReviewOpen(false)}
        onChange={(driveFileId, patch) =>
          setReviewItems((prev) => prev.map((item) => (item.driveFileId === driveFileId ? { ...item, ...patch } : item)))
        }
        onSaveAll={() => void saveReviewItems()}
        onSkip={(driveFileId) => setReviewItems((prev) => prev.filter((item) => item.driveFileId !== driveFileId))}
      />
    </div>
  );
}
