"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import { type DriveViewMode, loadDriveViewMode, saveDriveViewMode } from "@/lib/google-drive-view-mode";
import { useProjectPicker } from "@/hooks/use-project-picker";
import type { GoogleDriveWidgetProps, GoogleFile } from "./types";
import { useDriveData } from "./useDriveData";
import { isFile } from "./DriveFileList";

export function useGoogleDriveWidget({ liveData = null, openWorkspaceWidget }: GoogleDriveWidgetProps) {
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

  const driveData = useDriveData(autoDecodeOnSync);
  const {
    files, loading, syncing, uploading,
    workspace, folderPath,
    driveError, reauthUrl, lastSyncAt,
    decoding, reviewOpen, setReviewOpen, reviewItems, setReviewItems, reviewSaving,
    fetchFiles, handleRefresh, handleFolderClick, navigateToFolder, handleUpload,
    runDecodeBatch, saveReviewItems,
  } = driveData;

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
    const pid = boundProjectId || (typeof nav?.currentView?.projectId === "string" ? nav.currentView.projectId : "");
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
      toast.success(file.mimeType === "application/vnd.google-apps.folder"
        ? `תיקייה «${file.name}» נוספה למחברת`
        : `«${file.name}» נוסף למחברת`);
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
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const setView = (mode: DriveViewMode) => {
    setViewMode(mode);
    saveDriveViewMode(mode);
    pushDriveView({ viewMode: mode });
  };

  const filteredFiles = files.filter((f) => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const selectableFiles = filteredFiles.filter(isFile);

  const handleBrowseOrg = () => {
    setOrgBrowseMode(true);
    void fetchFiles("workspace");
  };

  return {
    dir, t, drivePrefix,
    fileInputRef,
    viewMode, setView,
    selectedIds, setSelectedIds,
    searchQuery, setSearchQuery,
    actionFileId,
    autoDecodeOnSync, setAutoDecodeOnSync,
    orgBrowseMode, setOrgBrowseMode,
    // driveData
    files: filteredFiles, loading, syncing, uploading,
    workspace, folderPath,
    driveError, reauthUrl, lastSyncAt,
    decoding, reviewOpen, setReviewOpen, reviewItems, setReviewItems, reviewSaving,
    handleRefresh, handleFolderClick, navigateToFolder, handleUpload,
    runDecodeBatch, saveReviewItems,
    handleBrowseOrg,
    // project
    boundProjectId, boundProjectName,
    projectsList, projectsListLoading, showProjectPicker, loadProjectsList, selectProject,
    // handlers
    addToNotebook, runAiScan,
    handleSelectProject, handleClearProject, toggleSelect,
    selectableFiles,
    openWorkspaceWidget,
  };
}
