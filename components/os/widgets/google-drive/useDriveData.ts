"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { parseJsonResponse } from "@/lib/client/parse-json-response";
import type { ReviewEditableItem } from "@/components/os/widgets/GoogleDriveDecodeReviewPanel";
import type { GoogleFile, WorkspaceInfo } from "./types";
import { useI18n } from "@/components/os/system/I18nProvider";

function driveApiError(
  data: { error?: string } | undefined,
  parseError: string | undefined,
  fallback: string,
): string {
  if (typeof data?.error === "string" && data.error.length > 0) return data.error;
  if (parseError) return parseError;
  return fallback;
}

export function useDriveData(autoDecodeOnSync: boolean) {
  const { t } = useI18n();
  const [files, setFiles] = useState<GoogleFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState("workspace");
  const [folderPath, setFolderPath] = useState<{ id: string; name: string }[]>([]);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [reauthUrl, setReauthUrl] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState<ReviewEditableItem[]>([]);
  const [reviewSaving, setReviewSaving] = useState(false);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSync = useCallback(async (silent = false) => {
    setSyncing(true);
    try {
      const res = await fetch("/api/os/google-drive/sync", { method: "POST", credentials: "include" });
      const { ok, data, parseError } = await parseJsonResponse<{ error?: string; lastSyncAt?: string }>(res);
      if (!ok) throw new Error(driveApiError(data, parseError, "סנכרון נכשל"));
      if (!data) throw new Error(parseError ?? "סנכרון נכשל");
      setLastSyncAt(data.lastSyncAt ?? new Date().toISOString());
      if (!silent) toast.success(t("workspaceWidgets.googleDrive.syncDone"));
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "סנכרון נכשל";
      if (!silent) toast.error(message);
      return false;
    } finally {
      setSyncing(false);
    }
  }, [t]);

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
        const { ok, data, parseError } = await parseJsonResponse<{
          error?: string;
          reauthUrl?: string;
          files?: GoogleFile[];
          workspaceFolderId?: string;
          workspaceFolderName?: string;
        }>(res);
        if (ok) {
          if (!data) {
            const msg = driveApiError(data, parseError, "שגיאה בטעינת קבצים");
            setDriveError(msg);
            throw new Error(msg);
          }
          setFiles(data.files ?? []);
          if (data.workspaceFolderId && data.workspaceFolderName) {
            setWorkspace({ folderId: data.workspaceFolderId, folderName: data.workspaceFolderName });
          }
        } else {
          const msg = driveApiError(data, parseError, "שגיאה בטעינת קבצים");
          setDriveError(msg);
          if (typeof data?.reauthUrl === "string") setReauthUrl(data.reauthUrl);
          throw new Error(msg);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "שגיאה בטעינת קבצים";
        setDriveError((prev) => prev ?? message);
        toast.error(t("workspaceWidgets.googleDrive.loadError") + ": " + message);
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  const initWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/os/google-drive/workspace", { credentials: "include", cache: "no-store" });
      const { ok, data, parseError } = await parseJsonResponse<{
        error?: string;
        reauthUrl?: string;
        workspace?: WorkspaceInfo;
        sync?: { lastSyncAt?: string };
      }>(res);
      if (!ok) {
        const msg = driveApiError(data, parseError, "שגיאה באתחול Drive");
        setDriveError(msg);
        if (typeof data?.reauthUrl === "string") setReauthUrl(data.reauthUrl);
        throw new Error(msg);
      }
      if (!data) {
        throw new Error(driveApiError(data, parseError, "שגיאה באתחול Drive"));
      }
      const ws = data.workspace;
      if (!ws?.folderId || !ws.folderName) {
        throw new Error("שגיאה באתחול Drive");
      }
      setWorkspace(ws);
      setFolderPath([{ id: ws.folderId, name: ws.folderName }]);
      setCurrentFolderId(ws.folderId);
      if (data.sync?.lastSyncAt) setLastSyncAt(data.sync.lastSyncAt);
      await fetchFiles(ws.folderId);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("workspaceWidgets.googleDrive.initError"));
    } finally {
      setLoading(false);
    }
  }, [fetchFiles, t]);

  const handleRefresh = useCallback(async () => {
    const ok = await runSync(false);
    await fetchFiles(currentFolderId);
    if (ok && autoDecodeOnSync) {
      const res = await fetch(
        `/api/os/google-drive/files?folderId=${encodeURIComponent(currentFolderId)}`,
        { credentials: "include", cache: "no-store" },
      );
      const { data, parseError } = await parseJsonResponse<{ files?: GoogleFile[] }>(res);
      const pending = (data?.files as GoogleFile[] | undefined)?.filter(
        (f) =>
          f.mimeType !== "application/vnd.google-apps.folder" &&
          (!f.decodeStatus || f.decodeStatus === "PENDING" || f.decodeStatus === "FAILED"),
      );
      if (pending?.length) void runDecodeBatch(pending.map((f) => f.id));
    }
  }, [runSync, fetchFiles, currentFolderId, autoDecodeOnSync]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFolderClick = useCallback(
    (folder: GoogleFile) => {
      if (folder.mimeType === "application/vnd.google-apps.folder") {
        setCurrentFolderId(folder.id);
        setFolderPath((prev) => [...prev, { id: folder.id, name: folder.name }]);
        void fetchFiles(folder.id);
      }
    },
    [fetchFiles],
  );

  const navigateToFolder = useCallback(
    (index: number) => {
      const newPath = folderPath.slice(0, index + 1);
      setFolderPath(newPath);
      const id = newPath[newPath.length - 1]!.id;
      setCurrentFolderId(id);
      void fetchFiles(id);
    },
    [folderPath, fetchFiles],
  );

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("folderId", currentFolderId);
        const res = await fetch("/api/os/google-drive/upload", {
          method: "POST", credentials: "include", body: form,
        });
        const { ok, data, parseError } = await parseJsonResponse<{ error?: string }>(res);
        if (!ok) throw new Error(driveApiError(data, parseError, "העלאה נכשלה"));
        toast.success(`${t("workspaceWidgets.googleDrive.uploaded")}: ${file.name}`);
        await handleRefresh();
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : t("workspaceWidgets.googleDrive.uploadFailed"));
      } finally {
        setUploading(false);
        if (e.target) e.target.value = "";
      }
    },
    [currentFolderId, handleRefresh, t],
  );

  const runDecodeBatch = useCallback(
    async (fileIds: string[]) => {
      if (!fileIds.length) return;
      setDecoding(true);
      try {
        const res = await fetch("/api/os/google-drive/decode-batch", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "preview", fileIds }),
        });
        const { ok, data, parseError } = await parseJsonResponse<{ error?: string; results?: ReviewEditableItem[] }>(res);
        if (!ok) throw new Error(driveApiError(data, parseError, "פענוח נכשל"));
        if (!data) throw new Error(parseError ?? "פענוח נכשל");
        const results = (data.results ?? []) as ReviewEditableItem[];
        const editable: ReviewEditableItem[] = results.map((r) => ({
          ...r,
          editedClientName: r.detectedClientName,
          editedDocType: r.detectedDocType,
          editedTarget: r.targetModule === "CRM" ? "CRM" : "ERP",
        }));
        if (editable.some((r) => r.needsReview || r.decodeStatus === "NEEDS_REVIEW")) {
          setReviewItems(editable);
          setReviewOpen(true);
        } else {
          toast.success(`${t("workspaceWidgets.googleDrive.decodedN").replace("{n}", String(results.length))}`);
        }
        await fetchFiles(currentFolderId);
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : t("workspaceWidgets.googleDrive.decodeFailed"));
      } finally {
        setDecoding(false);
      }
    },
    [fetchFiles, currentFolderId, t],
  );

  const saveReviewItems = useCallback(async () => {
    const pending = reviewItems.filter((i) => i.needsReview || i.decodeStatus === "NEEDS_REVIEW");
    if (!pending.length) { setReviewOpen(false); return; }
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
      const { ok, data, parseError } = await parseJsonResponse<{ error?: string }>(res);
      if (!ok) throw new Error(driveApiError(data, parseError, "שמירה נכשלה"));
      toast.success(t("workspaceWidgets.googleDrive.docsSaved"));
      setReviewOpen(false);
      setReviewItems([]);
      await fetchFiles(currentFolderId);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("workspaceWidgets.googleDrive.saveFailed"));
    } finally {
      setReviewSaving(false);
    }
  }, [reviewItems, fetchFiles, currentFolderId, t]);

  // Init on mount
  useEffect(() => { void initWorkspace(); }, [initWorkspace]);

  // URL param reconnect handling
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("google_reconnected") === "1") {
      toast.success(t("workspaceWidgets.googleDrive.googleUpdated"));
      params.delete("google_reconnected");
      window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
      void initWorkspace();
    } else if (params.get("google_reconnect") === "missing_refresh") {
      toast.error(
        "Google לא הנפיק refresh token. הסירו גישה לאפליקציה בחשבון Google (ניהול חשבון → אבטחה → גישה של צד שלישי), ואז לחצו שוב «התחברות מחדש».",
        { duration: 12_000 },
      );
      params.delete("google_reconnect");
      window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
    }
  }, [initWorkspace, t]);

  // Auto-sync every 90 seconds
  useEffect(() => {
    syncIntervalRef.current = setInterval(() => {
      void runSync(true).then((ok) => {
        if (ok) void fetchFiles(currentFolderId);
      });
    }, 90_000);
    return () => { if (syncIntervalRef.current) clearInterval(syncIntervalRef.current); };
  }, [runSync, fetchFiles, currentFolderId]);

  return {
    files, setFiles,
    loading, syncing, uploading,
    workspace,
    currentFolderId, setCurrentFolderId,
    folderPath, setFolderPath,
    driveError, reauthUrl,
    lastSyncAt,
    decoding,
    reviewOpen, setReviewOpen,
    reviewItems, setReviewItems,
    reviewSaving,
    // actions
    runSync, fetchFiles, initWorkspace, handleRefresh,
    handleFolderClick, navigateToFolder, handleUpload,
    runDecodeBatch, saveReviewItems,
  };
}
