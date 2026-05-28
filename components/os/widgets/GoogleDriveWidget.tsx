"use client";

import React, { useCallback } from "react";
import { Loader2, LayoutList, LayoutGrid, Rows3, Table2, Sparkles, Library, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import ProjectPickerPanel from "@/components/os/widgets/shared/ProjectPickerPanel";
import GoogleDriveDecodeReviewPanel from "@/components/os/widgets/GoogleDriveDecodeReviewPanel";
import type { GoogleDriveWidgetProps, GoogleFile } from "./google-drive/types";
import { useGoogleDriveWidget } from "./google-drive/useGoogleDriveWidget";
import { DriveFileList } from "./google-drive/DriveFileList";
import { DriveHeader } from "./google-drive/DriveHeader";

export default function GoogleDriveWidget({ liveData = null, openWorkspaceWidget }: GoogleDriveWidgetProps) {
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
    projectsList, projectsListLoading, showProjectPicker, loadProjectsList, selectProject,
    addToNotebook, runAiScan,
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
          <button
            type="button"
            onClick={handleBrowseOrg}
            className="w-full rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-elevated)]"
          >
            {t(`${drivePrefix}.browseOrg`)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--background-main)] text-[color:var(--foreground-main)]" dir={dir}>
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
        <div className="relative">
          <input
            type="text"
            placeholder="חפש בדרייב..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)]"
          />
        </div>
        {workspace ? (
          <p className="mt-2 text-[10px] text-[color:var(--foreground-muted)] font-semibold">
            תיקיית סנכרון: {workspace.folderName}
            {lastSyncAt ? ` · סונכרן ${new Date(lastSyncAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[color:var(--border-main)] overflow-hidden">
            {([["list", LayoutList], ["grid", LayoutGrid], ["compact", Rows3], ["details", Table2]] as const).map(
              ([mode, Icon]) => (
                <button key={mode} type="button" onClick={() => setView(mode)}
                  className={`p-2 ${viewMode === mode ? "bg-violet-500/15 text-violet-700" : "text-[color:var(--foreground-muted)] hover:bg-black/5"}`}
                  title={mode} aria-label={mode}>
                  <Icon size={16} />
                </button>
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
            פענוח אוטומטי אחרי סנכרון
          </label>
          {selectableFiles.length > 0 ? (
            <button type="button"
              onClick={() => setSelectedIds((prev) =>
                prev.size === selectableFiles.length ? new Set() : new Set(selectableFiles.map((f) => f.id))
              )}
              className="text-[10px] font-bold text-violet-600 underline">
              {selectedIds.size === selectableFiles.length ? "בטל הכל" : "בחר הכל"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Decode selection bar */}
      {selectedIds.size > 0 ? (
        <div className="flex items-center gap-2 border-b border-violet-500/20 bg-violet-500/10 px-4 py-2">
          <span className="text-xs font-bold">{selectedIds.size} נבחרו</span>
          <button type="button" disabled={decoding}
            onClick={() => void runDecodeBatch([...selectedIds]).then(() => setSelectedIds(new Set()))}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-[10px] font-black text-white disabled:opacity-50">
            {decoding ? <Loader2 size={12} className="animate-spin inline" /> : "פענח נבחרים"}
          </button>
          <button type="button" onClick={() => setSelectedIds(new Set())} className="text-[10px] font-bold underline">נקה</button>
        </div>
      ) : null}

      {/* File list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
        <DriveFileList
          files={files} viewMode={viewMode} selectedIds={selectedIds}
          workspace={workspace} driveError={driveError} reauthUrl={reauthUrl}
          loading={loading} actionFileId={actionFileId}
          onFolderClick={handleFolderClick} onToggleSelect={toggleSelect}
          fileActionsSlot={fileActionsSlot}
        />
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/30 flex items-center justify-between text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">
        <div className="flex gap-4">
          <span>{files.length} פריטים</span>
          <span>•</span>
          <span>סנכרון אוטומטי כל 90 שנ׳{lastSyncAt ? ` · ${new Date(lastSyncAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
        </div>
        <div className={`flex items-center gap-1 ${driveError ? "text-rose-500" : syncing ? "text-amber-500" : "text-emerald-500"}`}>
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${driveError ? "bg-rose-500" : syncing ? "bg-amber-500" : "bg-emerald-500"}`} />
          {driveError ? "נדרש חיבור Google" : syncing ? "מסנכרן..." : "מחובר ומסונכרן"}
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
