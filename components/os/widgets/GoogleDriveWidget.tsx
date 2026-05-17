"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  HardDrive,
  Folder,
  File,
  Search,
  Upload,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  FileText,
  Image as ImageIcon,
  FileCode,
  Loader2,
  Library,
  Sparkles,
  LayoutList,
  LayoutGrid,
  Rows3,
  Table2,
  CheckSquare,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import type { WidgetType } from "@/hooks/use-window-manager";
import type { DriveDecodeStatus } from "@prisma/client";
import {
  type DriveViewMode,
  loadDriveViewMode,
  saveDriveViewMode,
} from "@/lib/google-drive-view-mode";
import { decodeStatusLabel } from "@/lib/google-drive-decode-routing";
import GoogleDriveDecodeReviewPanel, {
  type ReviewEditableItem,
} from "@/components/os/widgets/GoogleDriveDecodeReviewPanel";

interface GoogleFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink: string;
  modifiedTime?: string | null;
  decodeStatus?: DriveDecodeStatus | null;
  decodeError?: string | null;
  detectedClientName?: string | null;
  detectedDocType?: string | null;
}

type WorkspaceInfo = {
  folderId: string;
  folderName: string;
};

type GoogleDriveWidgetProps = {
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
};

export default function GoogleDriveWidget({ openWorkspaceWidget }: GoogleDriveWidgetProps) {
  const { dir } = useI18n();
  const [files, setFiles] = useState<GoogleFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState("workspace");
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([]);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [reauthUrl, setReauthUrl] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [actionFileId, setActionFileId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<DriveViewMode>("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [decoding, setDecoding] = useState(false);
  const [autoDecodeOnSync, setAutoDecodeOnSync] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState<ReviewEditableItem[]>([]);
  const [reviewSaving, setReviewSaving] = useState(false);

  useEffect(() => {
    setViewMode(loadDriveViewMode());
  }, []);

  useEffect(() => {
    void fetch("/api/os/google-drive/settings", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((data: { settings?: { driveAutoDecodeOnSync?: boolean } }) => {
        if (data.settings?.driveAutoDecodeOnSync) setAutoDecodeOnSync(true);
      })
      .catch(() => undefined);
  }, []);

  const runSync = useCallback(async (silent = false) => {
    setSyncing(true);
    try {
      const res = await fetch("/api/os/google-drive/sync", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "סנכרון נכשל");
      setLastSyncAt(data.lastSyncAt ?? new Date().toISOString());
      if (!silent) toast.success("סנכרון הושלם");
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "סנכרון נכשל";
      if (!silent) toast.error(message);
      return false;
    } finally {
      setSyncing(false);
    }
  }, []);

  const fetchFiles = useCallback(
    async (folderId: string = "workspace") => {
      setLoading(true);
      setDriveError(null);
      setReauthUrl(null);
      try {
        const res = await fetch(
          `/api/os/google-drive/files?folderId=${encodeURIComponent(folderId)}`,
          { credentials: "include", cache: "no-store" },
        );
        const data = await res.json();
        if (res.ok) {
          setFiles(data.files ?? []);
          if (data.workspaceFolderId && data.workspaceFolderName) {
            setWorkspace({
              folderId: data.workspaceFolderId,
              folderName: data.workspaceFolderName,
            });
          }
        } else {
          const msg = typeof data.error === "string" ? data.error : "שגיאה בטעינת קבצים";
          setDriveError(msg);
          if (typeof data.reauthUrl === "string") setReauthUrl(data.reauthUrl);
          throw new Error(msg);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "שגיאה בטעינת קבצים";
        if (!driveError) setDriveError(message);
        toast.error("שגיאה בטעינת קבצים: " + message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const initWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/os/google-drive/workspace", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : "שגיאה באתחול Drive";
        setDriveError(msg);
        if (typeof data.reauthUrl === "string") setReauthUrl(data.reauthUrl);
        throw new Error(msg);
      }
      const ws = data.workspace as WorkspaceInfo;
      setWorkspace(ws);
      setFolderPath([{ id: ws.folderId, name: ws.folderName }]);
      setCurrentFolderId(ws.folderId);
      if (data.sync?.lastSyncAt) setLastSyncAt(data.sync.lastSyncAt);
      await fetchFiles(ws.folderId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "שגיאה באתחול";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [fetchFiles]);

  useEffect(() => {
    void initWorkspace();
  }, [initWorkspace]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_reconnected") === "1") {
      toast.success("חיבור Google עודכן — טוען מחדש את Drive");
      params.delete("google_reconnected");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
      window.history.replaceState({}, "", next);
      void initWorkspace();
    } else if (params.get("google_reconnect") === "missing_refresh") {
      toast.error(
        "Google לא הנפיק refresh token. הסירו גישה לאפליקציה בחשבון Google (ניהול חשבון → אבטחה → גישה של צד שלישי), ואז לחצו שוב «התחברות מחדש».",
        { duration: 12_000 },
      );
      params.delete("google_reconnect");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
      window.history.replaceState({}, "", next);
    }
  }, [initWorkspace]);

  useEffect(() => {
    syncIntervalRef.current = setInterval(() => {
      void runSync(true).then((ok) => {
        if (ok) void fetchFiles(currentFolderId);
      });
    }, 90_000);
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [runSync, fetchFiles, currentFolderId]);

  const handleFolderClick = (folder: GoogleFile) => {
    if (folder.mimeType === "application/vnd.google-apps.folder") {
      setCurrentFolderId(folder.id);
      setFolderPath((prev) => [...prev, { id: folder.id, name: folder.name }]);
      void fetchFiles(folder.id);
    }
  };

  const navigateToFolder = (index: number) => {
    const newPath = folderPath.slice(0, index + 1);
    setFolderPath(newPath);
    const id = newPath[newPath.length - 1].id;
    setCurrentFolderId(id);
    void fetchFiles(id);
  };

  const handleRefresh = async () => {
    const ok = await runSync(false);
    await fetchFiles(currentFolderId);
    if (ok && autoDecodeOnSync) {
      const res = await fetch(
        `/api/os/google-drive/files?folderId=${encodeURIComponent(currentFolderId)}`,
        { credentials: "include", cache: "no-store" },
      );
      const data = await res.json();
      const pending = (data.files as GoogleFile[] | undefined)?.filter(
        (f) =>
          f.mimeType !== "application/vnd.google-apps.folder" &&
          (!f.decodeStatus || f.decodeStatus === "PENDING" || f.decodeStatus === "FAILED"),
      );
      if (pending?.length) {
        void runDecodeBatch(pending.map((f) => f.id));
      }
    }
  };

  const isFile = (f: GoogleFile) => f.mimeType !== "application/vnd.google-apps.folder";

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const selectableFiles = filteredFiles.filter(isFile);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === selectableFiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableFiles.map((f) => f.id)));
    }
  };

  const runDecodeBatch = async (fileIds: string[]) => {
    if (!fileIds.length) return;
    setDecoding(true);
    try {
      const res = await fetch("/api/os/google-drive/decode-batch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", fileIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "פענוח נכשל");

      const results = (data.results ?? []) as ReviewEditableItem[];
      const editable: ReviewEditableItem[] = results.map((r) => ({
        ...r,
        editedClientName: r.detectedClientName,
        editedDocType: r.detectedDocType,
        editedTarget: r.targetModule === "CRM" ? "CRM" : "ERP",
      }));

      const needsReview = editable.filter(
        (r) => r.needsReview || r.decodeStatus === "NEEDS_REVIEW",
      );
      if (needsReview.length > 0) {
        setReviewItems(editable);
        setReviewOpen(true);
      } else {
        toast.success(`פוענחו ${results.length} קבצים`);
      }
      setSelectedIds(new Set());
      await fetchFiles(currentFolderId);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "פענוח נכשל");
    } finally {
      setDecoding(false);
    }
  };

  const saveReviewItems = async () => {
    const pending = reviewItems.filter((i) => i.needsReview || i.decodeStatus === "NEEDS_REVIEW");
    if (!pending.length) {
      setReviewOpen(false);
      return;
    }
    setReviewSaving(true);
    try {
      const res = await fetch("/api/os/google-drive/decode-batch", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "save",
          items: pending.map((item) => ({
            driveFileId: item.driveFileId,
            fileName: item.fileName,
            targetModule: item.editedTarget,
            aiData: {
              ...(item.aiData ?? {}),
              docType: item.editedDocType,
              vendor: item.editedClientName,
              metadata: { client: item.editedClientName },
            },
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "שמירה נכשלה");
      toast.success("המסמכים נשמרו");
      setReviewOpen(false);
      setReviewItems([]);
      await fetchFiles(currentFolderId);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "שמירה נכשלה");
    } finally {
      setReviewSaving(false);
    }
  };

  const statusBadge = (status: DriveDecodeStatus | null | undefined) => {
    const label = decodeStatusLabel(status);
    const color =
      status === "COMPLETED"
        ? "bg-emerald-500/15 text-emerald-700"
        : status === "FAILED"
          ? "bg-rose-500/15 text-rose-600"
          : status === "PROCESSING"
            ? "bg-amber-500/15 text-amber-700"
            : status === "NEEDS_REVIEW"
              ? "bg-violet-500/15 text-violet-700"
              : "bg-slate-500/10 text-slate-500";
    return (
      <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${color}`}>
        {label}
      </span>
    );
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folderId", currentFolderId);
      const res = await fetch("/api/os/google-drive/upload", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "העלאה נכשלה");
      toast.success(`הועלה: ${file.name}`);
      await handleRefresh();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "העלאה נכשלה");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const addToNotebook = async (file: GoogleFile) => {
    if (!openWorkspaceWidget) {
      toast.error("לא ניתן לפתוח את המחברת");
      return;
    }
    setActionFileId(file.id);
    try {
      const res = await fetch("/api/os/google-drive/to-notebook", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "הוספה למחברת נכשלה");
      openWorkspaceWidget("notebookLM", {
        notebookId: data.notebookId,
        title: data.title,
        preloadSources: data.preloadSources,
      });
      toast.success(
        file.mimeType === "application/vnd.google-apps.folder"
          ? `תיקייה «${file.name}» נוספה למחברת`
          : `«${file.name}» נוסף למחברת`,
      );
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
    if (!openWorkspaceWidget) {
      toast.error("לא ניתן לפתוח את הסורק");
      return;
    }
    openWorkspaceWidget("aiScanner", {
      driveImportFile: {
        fileId: file.id,
        fileName: file.name,
        mimeType: file.mimeType,
      },
    });
    toast.success(`פותח פענוח AI עבור «${file.name}»`);
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType === "application/vnd.google-apps.folder")
      return <Folder className="text-amber-500" size={20} />;
    if (mimeType.includes("pdf")) return <FileText className="text-rose-500" size={20} />;
    if (mimeType.includes("image")) return <ImageIcon className="text-emerald-500" size={20} />;
    if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
      return <FileText className="text-green-600" size={20} />;
    if (mimeType.includes("presentation") || mimeType.includes("powerpoint"))
      return <FileText className="text-orange-500" size={20} />;
    if (mimeType.includes("javascript") || mimeType.includes("json") || mimeType.includes("html"))
      return <FileCode className="text-blue-500" size={20} />;
    return <File className="text-slate-400" size={20} />;
  };

  const setView = (mode: DriveViewMode) => {
    setViewMode(mode);
    saveDriveViewMode(mode);
  };

  const fileActions = (file: GoogleFile) => (
    <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
      <button
        type="button"
        disabled={actionFileId === file.id}
        onClick={(e) => {
          e.stopPropagation();
          void addToNotebook(file);
        }}
        className="p-2 hover:bg-amber-500/10 rounded-lg text-amber-600 transition-all disabled:opacity-50"
        title="הוסף למחברת"
        aria-label="הוסף למחברת"
      >
        {actionFileId === file.id ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Library size={16} />
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          runAiScan(file);
        }}
        className="p-2 hover:bg-violet-500/10 rounded-lg text-violet-600 transition-all"
        title="פענוח AI"
        aria-label="פענוח AI"
      >
        <Sparkles size={16} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          window.open(file.webViewLink, "_blank");
        }}
        className="p-2 hover:bg-blue-500/10 rounded-lg text-blue-600 transition-all"
        title="פתח ב-Google Drive"
        aria-label="פתח ב-Google Drive"
      >
        <ExternalLink size={16} />
      </button>
    </div>
  );

  const renderFileRow = (file: GoogleFile, compact = false) => (
    <div
      key={file.id}
      className={`group flex items-center justify-between hover:bg-[color:var(--foreground-muted)]/5 transition-all cursor-pointer ${
        compact ? "px-3 py-2" : "p-4"
      } ${selectedIds.has(file.id) ? "bg-violet-500/5" : ""}`}
      onClick={() =>
        file.mimeType === "application/vnd.google-apps.folder"
          ? handleFolderClick(file)
          : window.open(file.webViewLink, "_blank")
      }
    >
      <div className="flex items-center gap-3 min-w-0">
        {isFile(file) ? (
          <button
            type="button"
            className="shrink-0 p-1"
            onClick={(e) => {
              e.stopPropagation();
              toggleSelect(file.id);
            }}
            aria-label={selectedIds.has(file.id) ? "בטל בחירה" : "בחר"}
          >
            {selectedIds.has(file.id) ? (
              <CheckSquare size={18} className="text-violet-600" />
            ) : (
              <Square size={18} className="text-[color:var(--foreground-muted)]" />
            )}
          </button>
        ) : (
          <span className="w-[26px]" />
        )}
        <div
          className={`rounded-lg bg-[color:var(--surface-card)] border border-[color:var(--border-main)] flex items-center justify-center shadow-sm ${
            compact ? "w-8 h-8" : "w-10 h-10"
          }`}
        >
          {getFileIcon(file.mimeType)}
        </div>
        <div className="min-w-0">
          <h4 className={`font-bold truncate group-hover:text-blue-500 transition-colors ${compact ? "text-xs" : "text-sm"}`}>
            {file.name}
          </h4>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[10px] text-[color:var(--foreground-muted)] font-mono uppercase tracking-tighter">
              {file.mimeType === "application/vnd.google-apps.folder"
                ? "תיקייה"
                : file.mimeType.split("/").pop()?.toUpperCase()}
            </p>
            {isFile(file) ? statusBadge(file.decodeStatus) : null}
          </div>
        </div>
      </div>
      {fileActions(file)}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[color:var(--background-main)] text-[color:var(--foreground-main)]" dir={dir}>
      <div className="p-4 border-b border-[color:var(--border-main)] flex items-center justify-between bg-[color:var(--background-main)]/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
            <HardDrive size={24} />
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-widest">Google Drive</h3>
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
          <button
            type="button"
            onClick={() => void handleRefresh()}
            className="p-2 hover:bg-[color:var(--foreground-muted)]/10 rounded-lg text-[color:var(--foreground-muted)] transition-all"
            title="רענון וסנכרון"
          >
            <RefreshCw size={18} className={loading || syncing ? "animate-spin" : ""} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => void handleUpload(e)}
          />
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

      <div className="p-4 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/30">
        <div className="relative">
          <Search
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)]"
            size={16}
          />
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
            {lastSyncAt
              ? ` · סונכרן ${new Date(lastSyncAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[color:var(--border-main)] overflow-hidden">
            {(
              [
                ["list", LayoutList],
                ["grid", LayoutGrid],
                ["compact", Rows3],
                ["details", Table2],
              ] as const
            ).map(([mode, Icon]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={`p-2 ${viewMode === mode ? "bg-violet-500/15 text-violet-700" : "text-[color:var(--foreground-muted)] hover:bg-black/5"}`}
                title={mode}
                aria-label={mode}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[10px] font-bold text-[color:var(--foreground-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={autoDecodeOnSync}
              onChange={(e) => {
                const v = e.target.checked;
                setAutoDecodeOnSync(v);
                void fetch("/api/os/google-drive/settings", {
                  method: "PATCH",
                  credentials: "include",
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
              onClick={toggleSelectAll}
              className="text-[10px] font-bold text-violet-600 underline"
            >
              {selectedIds.size === selectableFiles.length ? "בטל הכל" : "בחר הכל"}
            </button>
          ) : null}
        </div>
      </div>

      {selectedIds.size > 0 ? (
        <div className="flex items-center gap-2 border-b border-violet-500/20 bg-violet-500/10 px-4 py-2">
          <span className="text-xs font-bold">{selectedIds.size} נבחרו</span>
          <button
            type="button"
            disabled={decoding}
            onClick={() => void runDecodeBatch([...selectedIds])}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-[10px] font-black text-white disabled:opacity-50"
          >
            {decoding ? <Loader2 size={12} className="animate-spin inline" /> : "פענח נבחרים"}
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-[10px] font-bold underline"
          >
            נקה
          </button>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
        {driveError && !loading ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-4">
            <p className="text-sm font-bold text-rose-500 max-w-md leading-relaxed">{driveError}</p>
            {reauthUrl ? (
              <button
                type="button"
                onClick={() => {
                  window.location.assign(reauthUrl);
                }}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black shadow-lg transition-all"
              >
                התחברות מחדש עם Google
              </button>
            ) : null}
          </div>
        ) : loading ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40">
            <Loader2 size={40} className="text-blue-600 animate-spin mb-4" />
            <p className="text-sm font-bold uppercase tracking-widest">טוען קבצים...</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40 p-8">
            <div className="w-20 h-20 rounded-full bg-slate-500/10 flex items-center justify-center mb-6">
              <Folder size={40} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-bold mb-2">לא נמצאו קבצים</h3>
            <p className="text-xs text-[color:var(--foreground-muted)] max-w-xs leading-relaxed font-medium">
              העלו קובץ או המתינו לסנכרון מתיקיית {workspace?.folderName ?? "BSD-YBM"} ב-Drive.
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                className={`group relative rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-3 hover:shadow-md transition-all cursor-pointer ${
                  selectedIds.has(file.id) ? "ring-2 ring-violet-500/40" : ""
                }`}
                onClick={() =>
                  file.mimeType === "application/vnd.google-apps.folder"
                    ? handleFolderClick(file)
                    : window.open(file.webViewLink, "_blank")
                }
              >
                {isFile(file) ? (
                  <button
                    type="button"
                    className="absolute top-2 left-2 z-10"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(file.id);
                    }}
                  >
                    {selectedIds.has(file.id) ? (
                      <CheckSquare size={16} className="text-violet-600" />
                    ) : (
                      <Square size={16} className="text-[color:var(--foreground-muted)]" />
                    )}
                  </button>
                ) : null}
                <div className="flex flex-col items-center text-center gap-2 pt-4">
                  <div className="w-12 h-12 rounded-lg bg-[color:var(--background-main)] border border-[color:var(--border-main)] flex items-center justify-center">
                    {getFileIcon(file.mimeType)}
                  </div>
                  <h4 className="text-xs font-bold truncate w-full">{file.name}</h4>
                  {isFile(file) ? statusBadge(file.decodeStatus) : null}
                </div>
                <div className="mt-2 flex justify-center">{fileActions(file)}</div>
              </div>
            ))}
          </div>
        ) : viewMode === "details" ? (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[color:var(--background-main)] border-b border-[color:var(--border-main)] text-[10px] uppercase tracking-wider text-[color:var(--foreground-muted)]">
              <tr>
                <th className="p-3 w-10" />
                <th className="p-3 text-right">שם</th>
                <th className="p-3 text-right">סוג</th>
                <th className="p-3 text-right">סטטוס</th>
                <th className="p-3 text-right">עודכן</th>
                <th className="p-3 w-28" />
              </tr>
            </thead>
            <tbody>
              {filteredFiles.map((file) => (
                <tr
                  key={file.id}
                  className={`border-b border-[color:var(--border-main)] hover:bg-[color:var(--foreground-muted)]/5 cursor-pointer ${
                    selectedIds.has(file.id) ? "bg-violet-500/5" : ""
                  }`}
                  onClick={() =>
                    file.mimeType === "application/vnd.google-apps.folder"
                      ? handleFolderClick(file)
                      : window.open(file.webViewLink, "_blank")
                  }
                >
                  <td className="p-3">
                    {isFile(file) ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(file.id);
                        }}
                      >
                        {selectedIds.has(file.id) ? (
                          <CheckSquare size={16} className="text-violet-600" />
                        ) : (
                          <Square size={16} />
                        )}
                      </button>
                    ) : null}
                  </td>
                  <td className="p-3 font-bold truncate max-w-[200px]">{file.name}</td>
                  <td className="p-3 text-[10px] font-mono text-[color:var(--foreground-muted)]">
                    {file.mimeType === "application/vnd.google-apps.folder"
                      ? "תיקייה"
                      : file.mimeType.split("/").pop()}
                  </td>
                  <td className="p-3">{isFile(file) ? statusBadge(file.decodeStatus) : "—"}</td>
                  <td className="p-3 text-[10px] text-[color:var(--foreground-muted)]">
                    {file.modifiedTime
                      ? new Date(file.modifiedTime).toLocaleDateString("he-IL")
                      : "—"}
                  </td>
                  <td className="p-3">{fileActions(file)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="divide-y divide-[color:var(--border-main)]">
            {filteredFiles.map((file) => renderFileRow(file, viewMode === "compact"))}
          </div>
        )}


      </div>

      <div className="p-4 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/30 flex items-center justify-between text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">
        <div className="flex gap-4">
          <span>{filteredFiles.length} פריטים</span>
          <span>•</span>
          <span>
            סנכרון אוטומטי כל 90 שנ׳
            {lastSyncAt
              ? ` · ${new Date(lastSyncAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`
              : ""}
          </span>
        </div>
        <div
          className={`flex items-center gap-1 ${driveError ? "text-rose-500" : syncing ? "text-amber-500" : "text-emerald-500"}`}
        >
          <div
            className={`w-1.5 h-1.5 rounded-full animate-pulse ${driveError ? "bg-rose-500" : syncing ? "bg-amber-500" : "bg-emerald-500"}`}
          />
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
            prev.map((item) =>
              item.driveFileId === driveFileId ? { ...item, ...patch } : item,
            ),
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
