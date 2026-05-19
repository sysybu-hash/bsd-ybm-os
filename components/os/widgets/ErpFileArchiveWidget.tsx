"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import OsConfirmDialog from "@/components/os/OsConfirmDialog";
import { downloadIssuedDocumentExport } from "@/lib/invoice-download-client";
import type { ArchiveFileCategory, ArchiveView, ErpArchiveFile } from "@/lib/erp-archive";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import {
  ArrowUpRight,
  RotateCcw,
  Clock,
  Download,
  Eye,
  FileText,
  Folder,
  Grid,
  HardDrive,
  List,
  MoreVertical,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

type ProjectRow = { id: string; name: string };

type ArchiveApiResponse = {
  files: ErpArchiveFile[];
  projects: ProjectRow[];
  totalCount?: number;
  trashCount?: number;
  view?: ArchiveView;
};

type ScanDocPreview = {
  id: string;
  fileName: string;
  type: string;
  lineItems?: Array<{
    id: string;
    description: string;
    quantity: number | null;
    unitPrice: number | null;
    lineTotal: number | null;
  }>;
};

function categoryIconWrap(category: ArchiveFileCategory): string {
  switch (category) {
    case "invoice":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    case "quote":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    case "contract":
      return "bg-purple-500/10 text-purple-600 dark:text-purple-400";
    case "SIGNED_QUOTE":
      return "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300";
    default:
      return "bg-[color:var(--foreground-muted)]/10 text-[color:var(--foreground-muted)]";
  }
}

function CategoryGlyph({ category }: { category: ArchiveFileCategory }) {
  const wrap = categoryIconWrap(category);
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-lg p-2 ${wrap}`}>
      <FileText size={16} aria-hidden />
    </div>
  );
}

function buildArchiveQuery(params: {
  q: string;
  category: ArchiveFileCategory | "all";
  recentOnly: boolean;
  projectId: string | null;
  view: ArchiveView;
}): string {
  const sp = new URLSearchParams();
  const q = params.q.trim();
  if (q) sp.set("q", q);
  if (params.category !== "all") sp.set("type", params.category);
  if (params.recentOnly) sp.set("recent", "1");
  if (params.projectId) sp.set("projectId", params.projectId);
  if (params.view !== "active") sp.set("view", params.view);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default function ErpFileArchiveWidget() {
  const { dir } = useI18n();

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

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(searchQuery.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const fetchArchive = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const qs = buildArchiveQuery({
        q: debouncedQ,
        category,
        recentOnly,
        projectId,
        view: archiveView,
      });
      const res = await fetch(`/api/erp/archive${qs}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        let msg = "לא ניתן לטעון את הארכיון";
        try {
          const body = (await res.json()) as { error?: string };
          if (body?.error) msg = body.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const data = (await res.json()) as ArchiveApiResponse;
      setFiles(Array.isArray(data.files) ? data.files : []);
      setProjects(Array.isArray(data.projects) ? data.projects : []);
      setTotalCount(typeof data.totalCount === "number" ? data.totalCount : data.files?.length ?? 0);
      setTrashCount(typeof data.trashCount === "number" ? data.trashCount : 0);
    } catch (e) {
      console.error(e);
      setLoadError(e instanceof Error ? e.message : "שגיאת טעינה");
      setFiles([]);
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, category, recentOnly, projectId, archiveView]);

  useEffect(() => {
    void fetchArchive();
  }, [fetchArchive]);

  function revokePdfBlob() {
    if (pdfBlobUrlRef.current) {
      URL.revokeObjectURL(pdfBlobUrlRef.current);
      pdfBlobUrlRef.current = null;
    }
    setPdfBlobUrl(null);
  }

  useEffect(() => {
    return () => {
      revokePdfBlob();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ניקוי בסגירת הקומפוננטה בלבד
  }, []);

  useEffect(() => {
    revokePdfBlob();
    setScanDoc(null);
    setPreviewError(null);

    if (!selectedFile) {
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;

    if (selectedFile.source === "issued") {
      setPreviewLoading(true);
      void (async () => {
        try {
          const res = await fetch(
            `/api/documents/issued/${selectedFile.sourceId}/export?format=pdf`,
            { credentials: "include", cache: "no-store" },
          );
          if (!res.ok) {
            throw new Error("לא ניתן לטעון תצוגה מקדימה");
          }
          const blob = await res.blob();
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          pdfBlobUrlRef.current = url;
          setPdfBlobUrl(url);
        } catch {
          if (!cancelled) setPreviewError("שגיאה בטעינת PDF");
        } finally {
          if (!cancelled) setPreviewLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    setPreviewLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/erp/documents/${selectedFile.sourceId}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("מסמך לא נמצא");
        const data = (await res.json()) as { document?: ScanDocPreview };
        if (cancelled) return;
        setScanDoc(data.document ?? null);
      } catch {
        if (!cancelled) setPreviewError("לא ניתן לטעון פרטי סריקה");
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedFile]);

  useEffect(() => {
    if (!openMenuId) return;
    const onDocClick = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement;
      if (t.closest("[data-archive-menu]")) return;
      setOpenMenuId(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openMenuId]);

  const emptyAfterLoad = !loading && !loadError && files.length === 0;

  function categoryChipLabel(cat: ArchiveFileCategory | "all"): string {
    switch (cat) {
      case "all":
        return "הכל";
      case "invoice":
        return "חשבוניות";
      case "quote":
        return "הצעות";
      case "contract":
        return "חוזים";
      case "SIGNED_QUOTE":
        return "חתומים";
      case "other":
        return "אחר";
      default:
        return cat;
    }
  }

  function selectArchiveScope(next: {
    view?: ArchiveView;
    recentOnly?: boolean;
    projectId?: string | null;
  }) {
    let nextView = archiveView;
    let nextRecent = recentOnly;
    let nextProject = projectId;
    if (next.view !== undefined) nextView = next.view;
    if (next.recentOnly !== undefined) nextRecent = next.recentOnly;
    if (next.projectId !== undefined) nextProject = next.projectId;
    if (next.view === "shared" || next.view === "trash") {
      nextRecent = false;
      nextProject = null;
    }
    setArchiveView(nextView);
    setRecentOnly(nextRecent);
    setProjectId(nextProject);
    pushView({
      archiveView: nextView,
      recentOnly: nextRecent,
      projectId: nextProject,
    });
  }

  async function archiveItemAction(
    file: ErpArchiveFile,
    action: "trash" | "restore" | "purge",
  ) {
    const res = await fetch("/api/erp/archive/item", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: file.source,
        sourceId: file.sourceId,
        action,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "הפעולה נכשלה");
    }
  }

  async function handlePreview(file: ErpArchiveFile) {
    setOpenMenuId(null);
    setSelectedFile(file);
  }

  async function handleDownload(file: ErpArchiveFile) {
    setOpenMenuId(null);
    if (file.source === "issued") {
      const r = await downloadIssuedDocumentExport(file.sourceId, "pdf");
      if (!r.ok) toast.error(r.error);
      else toast.success(`הורדה: ${r.filename}`);
      return;
    }
    toast.message("בקרוב", { description: "הורדת קובץ מקור לסריקות תתווסף בהמשך." });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const file = deleteTarget;
    setDeleteTarget(null);
    try {
      await archiveItemAction(file, archiveView === "trash" ? "purge" : "trash");
      toast.success(
        archiveView === "trash" ? "המסמך נמחק לצמיתות" : "המסמך הועבר לפח האשפה",
      );
      if (selectedFile?.id === file.id) setSelectedFile(null);
      void fetchArchive();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "מחיקה נכשלה");
    }
  }

  async function handleRestore(file: ErpArchiveFile) {
    setOpenMenuId(null);
    try {
      await archiveItemAction(file, "restore");
      toast.success("המסמך שוחזר לארכיון");
      if (selectedFile?.id === file.id) setSelectedFile(null);
      void fetchArchive();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "שחזור נכשל");
    }
  }

  function openDeleteDialog(file: ErpArchiveFile) {
    setOpenMenuId(null);
    setDeleteTarget(file);
  }

  function renderActionMenu(file: ErpArchiveFile, menuClassName: string) {
    return (
      <div data-archive-menu className={menuClassName} dir={dir}>
        {archiveView !== "trash" ? (
          <>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-right text-xs hover:bg-[color:var(--foreground-muted)]/10"
              onClick={(e) => {
                e.stopPropagation();
                void handlePreview(file);
              }}
            >
              <Eye size={14} aria-hidden />
              תצוגה מקדימה
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-right text-xs hover:bg-[color:var(--foreground-muted)]/10"
              onClick={(e) => {
                e.stopPropagation();
                void handleDownload(file);
              }}
            >
              <Download size={14} aria-hidden />
              הורדה
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-right text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
              onClick={(e) => {
                e.stopPropagation();
                openDeleteDialog(file);
              }}
            >
              <Trash2 size={14} aria-hidden />
              העבר לפח
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-right text-xs hover:bg-[color:var(--foreground-muted)]/10"
              onClick={(e) => {
                e.stopPropagation();
                void handleRestore(file);
              }}
            >
              <RotateCcw size={14} aria-hidden />
              שחזור לארכיון
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-right text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
              onClick={(e) => {
                e.stopPropagation();
                openDeleteDialog(file);
              }}
            >
              <Trash2 size={14} aria-hidden />
              מחיקה לצמיתות
            </button>
          </>
        )}
      </div>
    );
  }

  const listSourceColumnLabel = archiveView === "shared" ? "משתף" : "מקור";

  const sidebarActiveAll =
    archiveView === "active" && !recentOnly && projectId === null;

  const emptyMessage =
    archiveView === "trash"
      ? "פח האשפה ריק."
      : archiveView === "shared"
        ? "אין מסמכים שחברי צוות שיתפו איתך."
        : "אין מסמכים התואמים לסינון.";

  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)] md:flex-row"
      dir={dir}
    >
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

      <div className="hidden w-64 shrink-0 flex-col border-l border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 md:flex">
        <div className="flex flex-1 flex-col overflow-auto p-6">
          <div className="mb-8 flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <HardDrive size={20} aria-hidden />
            <span className="text-sm font-black uppercase tracking-widest">ארכיון ERP</span>
          </div>

          <nav className="space-y-1">
            <button
              type="button"
              onClick={() =>
                selectArchiveScope({ view: "active", recentOnly: false, projectId: null })
              }
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                sidebarActiveAll
                  ? "border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/80 font-bold text-[color:var(--foreground-main)] shadow-sm"
                  : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/5 hover:text-[color:var(--foreground-main)]"
              }`}
            >
              <Folder size={16} className="text-amber-600 dark:text-amber-400" aria-hidden />
              כל הארכיון
            </button>
            <button
              type="button"
              onClick={() =>
                selectArchiveScope({ view: "active", recentOnly: true, projectId: null })
              }
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                archiveView === "active" && recentOnly && projectId === null
                  ? "border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/80 font-bold text-[color:var(--foreground-main)] shadow-sm"
                  : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/5 hover:text-[color:var(--foreground-main)]"
              }`}
            >
              <Clock size={16} aria-hidden />
              אחרונים
            </button>
            <button
              type="button"
              onClick={() => selectArchiveScope({ view: "shared" })}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                archiveView === "shared"
                  ? "border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/80 font-bold text-[color:var(--foreground-main)] shadow-sm"
                  : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/5 hover:text-[color:var(--foreground-main)]"
              }`}
            >
              <ArrowUpRight size={16} aria-hidden />
              שותפו איתי
            </button>
            <button
              type="button"
              onClick={() => selectArchiveScope({ view: "trash" })}
              className={`flex w-full items-center justify-between gap-3 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                archiveView === "trash"
                  ? "border border-rose-500/30 bg-rose-500/10 font-bold text-rose-700 dark:text-rose-300"
                  : "text-[color:var(--foreground-muted)] hover:bg-rose-600/10 hover:text-rose-600 dark:hover:text-rose-400"
              }`}
            >
              <span className="flex items-center gap-3">
                <Trash2 size={16} aria-hidden />
                פח אשפה
              </span>
              {trashCount > 0 ? (
                <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold">
                  {trashCount}
                </span>
              ) : null}
            </button>
          </nav>

          <div className="mt-10">
            <span className="mb-4 block px-4 text-[10px] font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">
              פרויקטים
            </span>
            <div className="space-y-1">
              {projects.length === 0 ? (
                <p className="px-4 text-xs text-[color:var(--foreground-muted)]">אין פרויקטים</p>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      selectArchiveScope({
                        view: "active",
                        recentOnly: false,
                        projectId: p.id,
                      })
                    }
                    className={`flex w-full max-w-full items-center gap-3 truncate rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                      archiveView === "active" && projectId === p.id
                        ? "border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/80 text-[color:var(--foreground-main)] shadow-sm"
                        : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/5 hover:text-[color:var(--foreground-main)]"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--foreground-muted)] opacity-50" />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-[color:var(--border-main)] p-6">
          <div className="flex items-center justify-between text-[10px] font-bold text-[color:var(--foreground-muted)]">
            <span>קבצים בארגון</span>
            <span className="text-[color:var(--foreground-main)] opacity-90">{totalCount}</span>
          </div>
          <p className="mt-1 text-[10px] text-[color:var(--foreground-muted)] opacity-80">
            תוצאות במסך: {files.length}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 p-4 md:flex-row md:items-center md:justify-between md:p-6">
          <div className="flex w-full flex-col gap-4 md:flex-1 md:flex-row md:items-center">
            <div className="relative w-full md:max-w-md md:flex-1">
              <Search
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)]"
                size={16}
                aria-hidden
              />
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
                <button
                  key={t}
                  type="button"
                  onClick={() => setCategory(t)}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                    category === t
                      ? "bg-[color:var(--surface-card)]/80 text-[color:var(--foreground-main)] shadow-sm dark:shadow-lg"
                      : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
                  }`}
                >
                  {categoryChipLabel(t)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 md:mr-4">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`rounded-lg p-2 transition-all ${
                viewMode === "grid"
                  ? "bg-[color:var(--foreground-muted)]/20 text-[color:var(--foreground-main)]"
                  : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
              }`}
              aria-label="תצוגת רשת"
            >
              <Grid size={18} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`rounded-lg p-2 transition-all ${
                viewMode === "list"
                  ? "bg-[color:var(--foreground-muted)]/20 text-[color:var(--foreground-main)]"
                  : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
              }`}
              aria-label="תצוגת רשימה"
            >
              <List size={18} />
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <div className="custom-scrollbar min-h-0 min-w-0 flex-1 overflow-auto p-4 md:p-6">
            {loading ? (
              <WidgetState variant="loading" message="טוען ארכיון…" />
            ) : loadError ? (
              <WidgetState
                variant="error"
                message={loadError}
                onRetry={() => void fetchArchive()}
              />
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
                      role="button"
                      tabIndex={0}
                      onClick={() => void handlePreview(file)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void handlePreview(file);
                        }
                      }}
                      className={`group relative grid cursor-pointer grid-cols-12 items-center rounded-xl border px-4 py-3 shadow-sm transition-all dark:shadow-none ${
                        selected
                          ? "border-amber-500/50 bg-[color:var(--surface-card)]/90"
                          : "border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80"
                      }`}
                    >
                      <div className="col-span-5 flex min-w-0 items-center gap-3">
                        <CategoryGlyph category={file.category} />
                        <span className="truncate text-sm font-bold text-[color:var(--foreground-main)] group-hover:text-amber-600 dark:group-hover:text-amber-400">
                          {file.name}
                        </span>
                      </div>
                      <div className="col-span-2 truncate text-center text-[11px] font-bold text-[color:var(--foreground-muted)]">
                        {file.projectName}
                      </div>
                      <div className="col-span-2 truncate text-center text-[11px] text-[color:var(--foreground-muted)]">
                        {archiveView === "shared"
                          ? file.ownerName ?? "—"
                          : file.source === "issued"
                            ? "מונפק"
                            : "סריקה"}
                      </div>
                      <div className="col-span-2 text-center text-[11px] text-[color:var(--foreground-muted)]">
                        {new Date(file.updatedAt).toLocaleDateString("he-IL")}
                      </div>
                      <div className="relative col-span-1 flex items-center justify-end gap-1">
                        <span className="text-[10px] text-[color:var(--foreground-muted)] opacity-80">
                          {file.sizeLabel}
                        </span>
                        <div>
                          <button
                            type="button"
                            className="rounded-lg p-1.5 text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/10 hover:text-[color:var(--foreground-main)]"
                            aria-label="תפריט פעולות"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenMenuId((id) => (id === file.id ? null : file.id));
                            }}
                          >
                            <MoreVertical size={16} />
                          </button>
                          {openMenuId === file.id
                            ? renderActionMenu(
                                file,
                                "absolute end-4 top-10 z-30 min-w-[168px] rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] py-1 shadow-xl",
                              )
                            : null}
                        </div>
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
                      role="button"
                      tabIndex={0}
                      onClick={() => void handlePreview(file)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          void handlePreview(file);
                        }
                      }}
                      className={`relative flex cursor-pointer flex-col items-center rounded-2xl border p-4 pt-10 text-center shadow-sm transition-all dark:shadow-none ${
                        selected
                          ? "border-amber-500/50 bg-[color:var(--surface-card)]/90"
                          : "border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80"
                      }`}
                    >
                      <div className="absolute end-2 top-2">
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/15"
                          aria-label="תפריט פעולות"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId((id) => (id === file.id ? null : file.id));
                          }}
                        >
                          <MoreVertical size={16} />
                        </button>
                        {openMenuId === file.id
                          ? renderActionMenu(
                              file,
                              "absolute end-0 top-9 z-30 min-w-[168px] rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] py-1 shadow-xl",
                            )
                          : null}
                      </div>
                      <div
                        className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${categoryIconWrap(file.category)}`}
                      >
                        <FileText size={32} aria-hidden />
                      </div>
                      <div className="mb-1 w-full truncate text-sm font-bold text-[color:var(--foreground-main)]">
                        {file.name}
                      </div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--foreground-muted)]">
                        {file.projectName}
                      </div>
                      {archiveView === "shared" && file.ownerName ? (
                        <div className="mt-1 text-[10px] text-[color:var(--foreground-muted)]">
                          מאת {file.ownerName}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {selectedFile ? (
            <aside className="flex max-h-[55vh] w-full shrink-0 flex-col border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/40 lg:max-h-none lg:w-[min(100%,420px)] lg:border-r lg:border-t-0">
              <div className="flex items-start justify-between gap-2 border-b border-[color:var(--border-main)] p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">
                    תצוגה מקדימה
                  </p>
                  <p className="mt-1 truncate text-sm font-bold text-[color:var(--foreground-main)]">
                    {selectedFile.name}
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">
                    {selectedFile.projectName}
                    {selectedFile.clientName ? ` · ${selectedFile.clientName}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg p-2 text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/10"
                  aria-label="סגור תצוגה"
                  onClick={() => setSelectedFile(null)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
                {previewLoading ? (
                  <WidgetState variant="loading" message="טוען תצוגה…" />
                ) : previewError ? (
                  <WidgetState variant="error" message={previewError} />
                ) : selectedFile.source === "issued" && pdfBlobUrl ? (
                  <iframe title="תצוגת PDF" src={pdfBlobUrl} className="h-full min-h-[480px] w-full rounded-xl border border-[color:var(--border-main)] bg-white" />
                ) : selectedFile.source === "document" && scanDoc ? (
                  <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-auto">
                    <div className="mb-3 text-xs text-[color:var(--foreground-muted)]">
                      <span className="font-bold text-[color:var(--foreground-main)]">סוג: </span>
                      {scanDoc.type}
                    </div>
                    {!scanDoc.lineItems?.length ? (
                      <WidgetState variant="empty" message="אין שורות מפורטות למסמך זה." />
                    ) : (
                      <table className="w-full text-right text-xs">
                        <thead>
                          <tr className="border-b border-[color:var(--border-main)] text-[color:var(--foreground-muted)]">
                            <th className="py-2 font-bold">תיאור</th>
                            <th className="py-2 font-bold">כמות</th>
                            <th className="py-2 font-bold">מחיר</th>
                            <th className="py-2 font-bold">סה״כ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scanDoc.lineItems.map((li) => (
                            <tr key={li.id} className="border-b border-[color:var(--border-main)]/40">
                              <td className="py-2 align-top">{li.description}</td>
                              <td className="py-2 align-top">{li.quantity ?? "—"}</td>
                              <td className="py-2 align-top">{li.unitPrice ?? "—"}</td>
                              <td className="py-2 align-top">{li.lineTotal ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ) : (
                  <WidgetState variant="empty" message="אין תצוגה זמינה." />
                )}
              </div>
            </aside>
          ) : null}
        </div>

      </div>
    </div>
  );
}
