"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  HardDrive,
  Search,
  Upload,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  Library,
  Sparkles,
  LayoutList,
  LayoutGrid,
  Rows3,
  Table2,
  CheckSquare,
  Square,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import { type DriveViewMode, loadDriveViewMode, saveDriveViewMode } from "@/lib/google-drive-view-mode";
import KnowledgeVaultAttachButton from "@/components/os/knowledge-vault/KnowledgeVaultAttachButton";
import GoogleDriveDecodeReviewPanel from "@/components/os/widgets/GoogleDriveDecodeReviewPanel";
import ProjectPickerPanel from "@/components/os/widgets/shared/ProjectPickerPanel";
import { useProjectPicker } from "@/hooks/use-project-picker";
import type { GoogleDriveWidgetProps, GoogleFile } from "./google-drive/types";
import { useDriveData } from "./google-drive/useDriveData";
import { DriveFileList, isFile } from "./google-drive/DriveFileList";

export default function GoogleDriveWidget({ liveData = null, openWorkspaceWidget }: GoogleDriveWidgetProps) {
  const { dir, t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<DriveViewMode>("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFileId, setActionFileId] = useState<string | null>(null);
  const [autoDecodeOnSync, setAutoDecodeOnSync] = useState(false);
  const [orgBrowseMode, setOrgBrowseMode] = useState(false);

  const drivePrefix = "workspaceWidgets.googleDrive";

  useEffect(() => { setViewMode(loadDriveViewMode()); }, []);

  useEffect(() => {
    void fetch("/api/os/google-drive/settings", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((data: { settings?: { driveAutoDecodeOnSync?: boolean } }) => {
        if (data.settings?.driveAutoDecodeOnSync) setAutoDecodeOnSync(true);
      })
      .catch(() => undefined);
  }, []);

  const {
    files,
    loading, syncing, uploading,
    workspace, currentFolderId, folderPath,
    driveError, reauthUrl, lastSyncAt,
    decoding, reviewOpen, setReviewOpen, reviewItems, setReviewItems, reviewSaving,
    fetchFiles, handleRefresh, handleFolderClick, navigateToFolder, handleUpload,
    runDecodeBatch, saveReviewItems,
  } = useDriveData(autoDecodeOnSync);

  const {
    resolvedProjectId: boundProjectId,
    selectedProjectName: boundProjectName,
    projectsList,
    projectsListLoading,
    showProjectPicker,
    loadProjectsList,
    selectProject,
    clearProject,
  } = useProjectPicker({
    initialProjectId: typeof liveData?.projectId === "string" ? liveData.projectId : "",
    listErrorKey: `${drivePrefix}.loadFailed`,
  });

  const applyDriveNav = useCallback(
    (view: WidgetViewState) => {
      const mode = view.viewMode as DriveViewMode | undefined;
      if (mode) { setViewMode(mode); saveDriveViewMode(mode); }
      const pid = typeof view.projectId === "string" ? view.projectId : null;
      if (pid) { setOrgBrowseMode(false); selectProject(pid); }
    },
    [selectProject],
  );
  const { pushView: pushDriveView, nav } = useSyncedWidgetNavigation(applyDriveNav);

  useEffect(() => {
    const pid = typeof liveData?.projectId === "string" ? liveData.projectId : "";
    if (pid) { setOrgBrowseMode(false); selectProject(pid); }
  }, [liveData?.projectId, selectProject]);

  useEffect(() => {
    if (showProjectPicker && !orgBrowseMode) void loadProjectsList();
  }, [showProjectPicker, orgBrowseMode, loadProjectsList]);

  useEffect(() => {
    const pid =
      boundProjectId ||
      (typeof nav?.currentView?.projectId === "string" ? nav.currentView.projectId : "");
    if (!pid || orgBrowseMode) return;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(pid)}/drive-folder`, { credentials: "include" });
        const data = await res.json();
        if (!res.ok || !data.driveFolderId) return;
        void fetchFiles(data.driveFolderId);
      } catch { /* ignore */ }
    })();
  }, [boundProjectId, nav?.currentView?.projectId, fetchFiles, orgBrowseMode]);

  const addToNotebook = async (file: GoogleFile) => {
    if (!openWorkspaceWidget) { toast.error("לא ניתן לפתוח את המחברת"); return; }
    setActionFileId(file.id);
    try {
      const res = await fetch("/api/os/google-drive/to-notebook", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id, fileName: file.name, mimeType: file.mimeType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "הוספה למחברת נכשלה");
      openWorkspaceWidget("notebookLM", { notebookId: data.notebookId, title: data.title, preloadSources: data.preloadSources });
      toast.success(file.mimeType === "application/vnd.google-apps.folder" ? `תיקייה «${file.name}» נוספה למחברת` : `«${file.name}» נוסף למחברת`);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "הוספה למחברת נכשלה");
    } finally {
      setActionFileId(null);
    }
  };

  const runAiScan = (file: GoogleFile) => {
    if (file.mimeType === "application/vnd.google-apps.folder") {
      toast.error("לפענוח AI בחרו קובץ בודד, לא תיקייה");
      return;
    }
    if (!openWorkspaceWidget) { toast.error("לא ניתן לפתוח את הסורק"); return; }
    openWorkspaceWidget("aiScanner", {
      projectId: boundProjectId || nav?.currentView?.projectId,
      driveImportFile: { fileId: file.id, fileName: file.name, mimeType: file.mimeType },
    });
    toast.success(`פותח פענוח AI עבור «${file.name}»`);
  };

  const fileActionsSlot = useCallback((file: GoogleFile) => (
    <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
      <button
        type="button"
        disabled={actionFileId === file.id}
        onClick={(e) => { e.stopPropagation(); void addToNotebook(file); }}
        className="p-2 hover:bg-amber-500/10 rounded-lg text-amber-600 transition-all disabled:opacity-50"
        title="הוסף למחברת" aria-label="הוסף למחברת"
      >
        {actionFileId === file.id ? <Loader2 size={16} className="animate-spin" /> : <Library size={16} />}
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); runAiScan(file); }}
        className="p-2 hover:bg-violet-500/10 rounded-lg text-violet-600 transition-all"
        title="פענוח AI" aria-label="פענוח AI"
      >
        <Sparkles size={16} />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); window.open(file.webViewLink, "_blank"); }}
        className="p-2 hover:bg-blue-500/10 rounded-lg text-blue-600 transition-all"
        title="פתח ב-Google Drive" aria-label="פתח ב-Google Drive"
      >
        <ExternalLink size={16} />
      </button>
    </div>
  ), [actionFileId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectProject = (id: string) => {
    setOrgBrowseMode(false);
    selectProject(id);
    pushDriveView({ projectId: id });
  };

  const handleClearProject = () => {
    setOrgBrowseMode(false);
    clearProject();
    void fetchFiles("workspace");
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const selectableFiles = filteredFiles.filter(isFile);

  const setView = (mode: DriveViewMode) => {
    setViewMode(mode);
    saveDriveViewMode(mode);
    pushDriveView({ viewMode: mode });
  };

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
            onClick={() => { setOrgBrowseMode(true); void fetchFiles("workspace"); }}
            className="w-full rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-elevated)]"
          >
            {t(`${drivePrefix}.browseOrg`)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[color:var(--background-main)] text-[color:var(--foreground-main)]" dir={dir}>
      {/* Header */}
      <div className="p-4 border-b border-[color:var(--border-main)] flex items-center justify-between bg-[color:var(--background-main)]/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
            <HardDrive size={24} />
          </div>
          <div className="min-w-0">
            <h3 className="font-black text-sm uppercase tracking-widest truncate">
              {boundProjectName && !orgBrowseMode ? boundProjectName : "Google Drive"}
            </h3>
            <div className="flex items-center gap-1 text-[10px] text-[color:var(--foreground-muted)] font-bold">
              {folderPath.map((folder, i) => (
                <React.Fragment key={folder.id}>
                  <button
                    type="button"
                    onClick={() => navigateToFolder(i)}
                    className="hover:text-[color:var(--foreground-main)] transition-colors"
                  >
                    {folder.name}
                  </button>
                  {i < folderPath.length - 1 && <ChevronLeft size={10} />}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {boundProjectId && !orgBrowseMode ? (
            <button
              type="button"
              onClick={handleClearProject}
              className="rounded-lg border border-[color:var(--border-main)] px-2 py-1.5 text-[10px] font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-elevated)]"
            >
              {t(`${drivePrefix}.switchProject`)}
            </button>
          ) : orgBrowseMode ? (
            <button
              type="button"
              onClick={() => { setOrgBrowseMode(false); void loadProjectsList(); }}
              className="rounded-lg border border-[color:var(--border-main)] px-2 py-1.5 text-[10px] font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-elevated)]"
            >
              {t(`${drivePrefix}.pickProjectTitle`)}
            </button>
          ) : null}
          <KnowledgeVaultAttachButton
            onSelect={(item) => {
              if (item.webViewLink) window.open(item.webViewLink, "_blank", "noopener,noreferrer");
              else toast.success(item.name);
            }}
          />
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="p-2 hover:bg-[color:var(--foreground-muted)]/10 rounded-lg text-[color:var(--foreground-muted)] transition-all"
            title="רענון וסנכרון"
          >
            <RefreshCw size={18} className={loading || syncing ? "animate-spin" : ""} />
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => void handleUpload(e)} />
          <button
            type="button"
            disabled={uploading || Boolean(driveError)}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-900/20 transition-all"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            העלה קובץ
          </button>
        </div>
      </div>

      {/* Search + toolbar */}
      <div className="p-4 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/30">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)]" size={16} />
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
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  className={`p-2 ${viewMode === mode ? "bg-violet-500/15 text-violet-700" : "text-[color:var(--foreground-muted)] hover:bg-black/5"}`}
                  title={mode} aria-label={mode}
                >
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
            <button
              type="button"
              onClick={() =>
                setSelectedIds((prev) =>
                  prev.size === selectableFiles.length
                    ? new Set()
                    : new Set(selectableFiles.map((f) => f.id)),
                )
              }
              className="text-[10px] font-bold text-violet-600 underline"
            >
              {selectedIds.size === selectableFiles.length ? "בטל הכל" : "בחר הכל"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Decode selection bar */}
      {selectedIds.size > 0 ? (
        <div className="flex items-center gap-2 border-b border-violet-500/20 bg-violet-500/10 px-4 py-2">
          <span className="text-xs font-bold">{selectedIds.size} נבחרו</span>
          <button
            type="button"
            disabled={decoding}
            onClick={() => void runDecodeBatch([...selectedIds]).then(() => setSelectedIds(new Set()))}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-[10px] font-black text-white disabled:opacity-50"
          >
            {decoding ? <Loader2 size={12} className="animate-spin inline" /> : "פענח נבחרים"}
          </button>
          <button type="button" onClick={() => setSelectedIds(new Set())} className="text-[10px] font-bold underline">
            נקה
          </button>
        </div>
      ) : null}

      {/* File list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
        <DriveFileList
          files={filteredFiles}
          viewMode={viewMode}
          selectedIds={selectedIds}
          workspace={workspace}
          driveError={driveError}
          reauthUrl={reauthUrl}
          loading={loading}
          actionFileId={actionFileId}
          onFolderClick={handleFolderClick}
          onToggleSelect={toggleSelect}
          fileActionsSlot={fileActionsSlot}
        />
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/30 flex items-center justify-between text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">
        <div className="flex gap-4">
          <span>{filteredFiles.length} פריטים</span>
          <span>•</span>
          <span>
            סנכרון אוטומטי כל 90 שנ׳
            {lastSyncAt ? ` · ${new Date(lastSyncAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </span>
        </div>
        <div className={`flex items-center gap-1 ${driveError ? "text-rose-500" : syncing ? "text-amber-500" : "text-emerald-500"}`}>
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${driveError ? "bg-rose-500" : syncing ? "bg-amber-500" : "bg-emerald-500"}`} />
          {driveError ? "נדרש חיבור Google" : syncing ? "מסנכרן..." : "מחובר ומסונכרן"}
        </div>
      </div>

      <GoogleDriveDecodeReviewPanel
        open={reviewOpen}
        items={reviewItems}
        saving={reviewSaving}
        onClose={() => setReviewOpen(false)}
        onChange={(driveFileId, patch) =>
          setReviewItems((prev) =>
            prev.map((item) => (item.driveFileId === driveFileId ? { ...item, ...patch } : item)),
          )
        }
        onSaveAll={() => void saveReviewItems()}
        onSkip={(driveFileId) =>
          setReviewItems((prev) => prev.filter((item) => item.driveFileId !== driveFileId))
        }
      />
    </div>
  );
}
