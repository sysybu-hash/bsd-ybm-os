"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downloadIssuedDocumentExport } from "@/lib/invoice-download-client";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import { toast } from "sonner";
import type { ArchiveApiResponse, ArchiveView, ErpArchiveFile, ProjectRow, ScanDocPreview } from "./types";
import type { ArchiveFileCategory } from "./types";
import { buildArchiveQuery } from "./utils";

export function useArchiveData() {
  const { t } = useI18n();
  const [files, setFiles] = useState<ErpArchiveFile[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [category, setCategory] = useState<ArchiveFileCategory | "all">("all");
  const [archiveView, setArchiveView] = useState<ArchiveView>("active");
  const [recentOnly, setRecentOnly] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [trashCount, setTrashCount] = useState(0);
  const [selectedFile, setSelectedFile] = useState<ErpArchiveFile | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const pdfBlobUrlRef = useRef<string | null>(null);
  const [scanDoc, setScanDoc] = useState<ScanDocPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ErpArchiveFile | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [bulkExporting, setBulkExporting] = useState(false);
  const [emptyTrashTarget, setEmptyTrashTarget] = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);

  // Sync nav
  const applyArchiveNav = useCallback((view: WidgetViewState) => {
    if (view.archiveView) setArchiveView(view.archiveView as ArchiveView);
    if (view.recentOnly !== undefined) setRecentOnly(Boolean(view.recentOnly));
    if (view.projectId !== undefined) setProjectId((view.projectId as string | null) ?? null);
    if (view.q !== undefined) {
      const q = String(view.q);
      setSearchQuery(q);
      setDebouncedQ(q);
    }
  }, []);
  const { pushView } = useSyncedWidgetNavigation(applyArchiveNav);

  // Debounce search
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(searchQuery.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const fetchArchive = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = buildArchiveQuery({ q: debouncedQ, category, recentOnly, projectId, view: archiveView });
      const res = await fetch(`/api/erp/archive${qs}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        let msg = "לא ניתן לטעון את הארכיון";
        try { const body = (await res.json()) as { error?: string }; if (body?.error) msg = body.error; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const data = (await res.json()) as ArchiveApiResponse;
      setFiles(Array.isArray(data.files) ? data.files : []);
      setProjects(Array.isArray(data.projects) ? data.projects : []);
      setTotalCount(typeof data.totalCount === "number" ? data.totalCount : data.files?.length ?? 0);
      setTrashCount(typeof data.trashCount === "number" ? data.trashCount : 0);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "שגיאת טעינה");
      setFiles([]);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, category, recentOnly, projectId, archiveView]);

  useEffect(() => { void fetchArchive(); }, [fetchArchive]);

  // PDF blob management
  function revokePdfBlob() {
    if (pdfBlobUrlRef.current) { URL.revokeObjectURL(pdfBlobUrlRef.current); pdfBlobUrlRef.current = null; }
    setPdfBlobUrl(null);
  }
  useEffect(() => () => { revokePdfBlob(); }, []);

  // Preview effect
  useEffect(() => {
    revokePdfBlob();
    setScanDoc(null);
    setPreviewError(null);
    if (!selectedFile) { setPreviewLoading(false); return; }
    let cancelled = false;
    if (selectedFile.source === "issued") {
      setPreviewLoading(true);
      void (async () => {
        try {
          const res = await fetch(`/api/documents/issued/${selectedFile.sourceId}/export?format=pdf`, { credentials: "include", cache: "no-store" });
          if (!res.ok) throw new Error("לא ניתן לטעון תצוגה מקדימה");
          const blob = await res.blob();
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          pdfBlobUrlRef.current = url;
          setPdfBlobUrl(url);
        } catch { if (!cancelled) setPreviewError("שגיאה בטעינת PDF"); }
        finally { if (!cancelled) setPreviewLoading(false); }
      })();
      return () => { cancelled = true; };
    }
    setPreviewLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/erp/documents/${selectedFile.sourceId}`, { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error("מסמך לא נמצא");
        const data = (await res.json()) as {
          document?: ScanDocPreview & { aiData?: unknown };
        };
        if (cancelled) return;
        const doc = data.document;
        if (!doc) {
          setScanDoc(null);
        } else {
          const aiRaw = doc.aiData;
          const aiData =
            aiRaw && typeof aiRaw === "object" && !Array.isArray(aiRaw)
              ? (aiRaw as Record<string, unknown>)
              : null;
          setScanDoc({ ...doc, aiData });
        }
      } catch { if (!cancelled) setPreviewError("לא ניתן לטעון פרטי סריקה"); }
      finally { if (!cancelled) setPreviewLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [selectedFile]);

  // Close menu on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const onDocClick = (ev: MouseEvent) => {
      if ((ev.target as HTMLElement).closest("[data-archive-menu]")) return;
      setOpenMenuId(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openMenuId]);

  function selectArchiveScope(next: { view?: ArchiveView; recentOnly?: boolean; projectId?: string | null }) {
    let nextView = archiveView, nextRecent = recentOnly, nextProject = projectId;
    if (next.view !== undefined) nextView = next.view;
    if (next.recentOnly !== undefined) nextRecent = next.recentOnly;
    if (next.projectId !== undefined) nextProject = next.projectId;
    if (next.view === "shared" || next.view === "trash") { nextRecent = false; nextProject = null; }
    setArchiveView(nextView); setRecentOnly(nextRecent); setProjectId(nextProject);
    pushView({ archiveView: nextView, recentOnly: nextRecent, projectId: nextProject });
  }

  async function archiveItemAction(file: ErpArchiveFile, action: "trash" | "restore" | "purge") {
    const res = await fetch("/api/erp/archive/item", {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: file.source, sourceId: file.sourceId, action }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "הפעולה נכשלה");
    }
  }

  const handlePreview = (file: ErpArchiveFile) => { setOpenMenuId(null); setSelectedFile(file); };

  const handleDownload = async (file: ErpArchiveFile) => {
    setOpenMenuId(null);
    if (file.source === "issued") {
      const r = await downloadIssuedDocumentExport(file.sourceId, "pdf");
      if (!r.ok) toast.error(r.error); else toast.success(`הורדה: ${r.filename}`);
      return;
    }
    toast.message("בקרוב", { description: "הורדת קובץ מקור לסריקות תתווסף בהמשך." });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const file = deleteTarget;
    setDeleteTarget(null);
    try {
      await archiveItemAction(file, archiveView === "trash" ? "purge" : "trash");
      toast.success(archiveView === "trash" ? "המסמך נמחק לצמיתות" : "המסמך הועבר לפח האשפה");
      if (selectedFile?.id === file.id) setSelectedFile(null);
      void fetchArchive();
    } catch (e) { toast.error(e instanceof Error ? e.message : "מחיקה נכשלה"); }
  };

  const handleRestore = async (file: ErpArchiveFile) => {
    setOpenMenuId(null);
    try {
      await archiveItemAction(file, "restore");
      toast.success("המסמך שוחזר לארכיון");
      if (selectedFile?.id === file.id) setSelectedFile(null);
      void fetchArchive();
    } catch (e) { toast.error(e instanceof Error ? e.message : "שחזור נכשל"); }
  };

  const openDeleteDialog = (file: ErpArchiveFile) => { setOpenMenuId(null); setDeleteTarget(file); };

  const fileKey = (file: ErpArchiveFile) => `${file.source}:${file.sourceId}`;

  const toggleSelected = (file: ErpArchiveFile) => {
    const key = fileKey(file);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedKeys(new Set());
    setSelectionMode(false);
  };

  const confirmEmptyRecycleBin = async () => {
    setEmptyingTrash(true);
    try {
      const res = await fetch("/api/erp/archive/empty-trash", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? t("workspaceWidgets.erpArchive.emptyRecycleBinFailed"));
      }
      const body = (await res.json()) as { total?: number };
      toast.success(
        t("workspaceWidgets.erpArchive.emptyRecycleBinSuccess", {
          count: String(body.total ?? 0),
        }),
      );
      setSelectedFile(null);
      setEmptyTrashTarget(false);
      void fetchArchive();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("workspaceWidgets.erpArchive.emptyRecycleBinFailed"));
    } finally {
      setEmptyingTrash(false);
    }
  };

  const handleBulkExport = async () => {
    if (selectedKeys.size === 0) {
      toast.message(t("workspaceWidgets.erpArchive.selectForExport"));
      return;
    }
    setBulkExporting(true);
    try {
      const items = files
        .filter((f) => selectedKeys.has(fileKey(f)))
        .map((f) => ({ source: f.source, sourceId: f.sourceId }));
      const res = await fetch("/api/erp/archive/bulk-export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? t("workspaceWidgets.erpArchive.bulkExportFailed"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `erp-archive-${new Date().toISOString().slice(0, 10)}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success(t("workspaceWidgets.erpArchive.bulkExportSuccess"));
      clearSelection();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("workspaceWidgets.erpArchive.bulkExportFailed"));
    } finally {
      setBulkExporting(false);
    }
  };

  return {
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
  };
}
