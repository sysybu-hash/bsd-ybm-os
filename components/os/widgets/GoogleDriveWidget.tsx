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
} from "lucide-react";
import { toast } from "sonner";
import type { WidgetType } from "@/hooks/use-window-manager";

interface GoogleFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink: string;
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
    await runSync(false);
    await fetchFiles(currentFolderId);
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

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()),
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
      </div>

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
        ) : (
          <div className="grid grid-cols-1 divide-y divide-[color:var(--border-main)]">
            {filteredFiles.map((file) => (
              <div
                key={file.id}
                className="group flex items-center justify-between p-4 hover:bg-[color:var(--foreground-muted)]/5 transition-all cursor-pointer"
                onClick={() =>
                  file.mimeType === "application/vnd.google-apps.folder"
                    ? handleFolderClick(file)
                    : window.open(file.webViewLink, "_blank")
                }
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-[color:var(--surface-card)] border border-[color:var(--border-main)] flex items-center justify-center shadow-sm">
                    {getFileIcon(file.mimeType)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold truncate group-hover:text-blue-500 transition-colors">
                      {file.name}
                    </h4>
                    <p className="text-[10px] text-[color:var(--foreground-muted)] font-mono uppercase tracking-tighter">
                      {file.mimeType === "application/vnd.google-apps.folder"
                        ? "תיקייה"
                        : file.mimeType.split("/").pop()?.toUpperCase()}
                    </p>
                  </div>
                </div>

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
              </div>
            ))}
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
    </div>
  );
}
