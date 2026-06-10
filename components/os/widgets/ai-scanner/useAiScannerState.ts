"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import { useProjectPicker } from "@/hooks/use-project-picker";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useIndustryConfig } from "@/hooks/use-industry-config";
import { defaultScanModeForIndustry, getScanModesForUi } from "@/lib/scan-modes-for-ui";
import { buildScanFileAcceptAttribute } from "@/lib/scan-mime";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { ScanModeV5 } from "@/lib/scan-schema-v5";
import { useScanQueue } from "./useScanQueue";
import { ENGINE_MODES, SCAN_INSTRUCTION_KEY } from "./constants";
import type { AiScannerWidgetProps } from "./types";

const scannerPrefix = "workspaceWidgets.aiScanner";

export function useAiScannerState({ liveData, openWorkspaceWidget }: AiScannerWidgetProps) {
  const { t, dir } = useI18n();
  const industryConfig = useIndustryConfig();
  const industryId = industryConfig.id;
  const scanModes = useMemo(() => getScanModesForUi(industryId), [industryId]);
  const fileInputRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement>;
  const cameraInputRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement>;
  const driveImportDoneRef = useRef<string | null>(null);
  const fileAccept = useMemo(() => buildScanFileAcceptAttribute(), []);

  const [isDragging, setIsDragging] = useState(false);
  const [engineMeta, setEngineMeta] = useState<{
    configured: { documentAI: boolean; gemini: boolean; openai: boolean; mistral: boolean };
    gemini?: { primaryLabel?: string };
    openai?: { defaultModelId?: string };
    mistral?: { primaryLabel?: string };
  } | null>(null);
  const [engineRunMode, setEngineRunMode] = useState<TriEngineRunMode>("AUTO");
  const [scanModeOverride, setScanModeOverride] = useState<ScanModeV5>(() => defaultScanModeForIndustry(industryId));
  const [userInstruction, setUserInstruction] = useState("");
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [previewPanelOpen, setPreviewPanelOpen] = useState(false);
  const [resultsPanelOpen, setResultsPanelOpen] = useState(false);
  const [stackScannerPanels, setStackScannerPanels] = useState(false);

  const tr = useCallback((key: string, fallback: string) => {
    const v = t(key);
    return v !== key ? v : fallback;
  }, [t]);

  const { resolvedProjectId: boundProjectId, selectedProjectName: boundProjectName, projectsList, projectsListLoading, showProjectPicker, loadProjectsList, selectProject, clearProject } =
    useProjectPicker({ initialProjectId: typeof liveData?.projectId === "string" ? liveData.projectId : "", listErrorKey: `${scannerPrefix}.loadFailed` });

  const scanQueue = useScanQueue({ engineRunMode, scanModeOverride, boundProjectId, userInstruction, industryId, openWorkspaceWidget, tr });
  const { queue, previewUrl, applyFilePreview, runFileQueue, addFiles, startScan, pendingFiles, confirmAnalysis, saveToNotebook, pendingAnalysis, setPendingAnalysis, setLastScanV5, setLastScanFileName, lastScanV5, lastScanFileName } = scanQueue;

  // ── nav ───────────────────────────────────────────────────────────────────
  const applyScannerNav = useCallback((view: WidgetViewState) => {
    if (view.openPreviewPanel) setPreviewPanelOpen(true);
    if (view.openResultsPanel) setResultsPanelOpen(true);
  }, []);
  const { pushView: pushScannerView } = useSyncedWidgetNavigation(applyScannerNav);

  // ── effects ───────────────────────────────────────────────────────────────
  useEffect(() => { setScanModeOverride(defaultScanModeForIndustry(industryId)); }, [industryId]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setStackScannerPanels(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { fetchEngineMetaCached } = await import("@/lib/scan-engine-meta-cache");
      const data = await fetchEngineMetaCached();
      if (!cancelled && data) setEngineMeta(data as typeof engineMeta);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }; }, [previewUrl]);

  useEffect(() => {
    try { const saved = localStorage.getItem(SCAN_INSTRUCTION_KEY); if (saved) setUserInstruction(saved); } catch { /* ignore */ }
    const inst = liveData?.userInstruction;
    if (typeof inst === "string" && inst.trim()) setUserInstruction(inst.trim());
    if (liveData?.openInstructions) setInstructionsOpen(true);
    const mode = liveData?.engineRunMode;
    if (typeof mode === "string" && ["AUTO", "MULTI_PARALLEL", "SINGLE_GEMINI", "SINGLE_OPENAI", "SINGLE_DOCUMENT_AI"].includes(mode)) setEngineRunMode(mode as TriEngineRunMode);
    const sm = liveData?.scanMode;
    if (typeof sm === "string") setScanModeOverride(sm as ScanModeV5);
    const pid = liveData?.projectId;
    if (typeof pid === "string") selectProject(pid);
   
  }, [liveData, selectProject]);

  useEffect(() => {
    if (liveData?.v5 && typeof liveData.fileName === "string") {
      setLastScanV5(liveData.v5 as import("@/lib/scan-schema-v5").ScanExtractionV5);
      setLastScanFileName(liveData.fileName);
    }
  }, [liveData, setLastScanV5, setLastScanFileName]);

  useEffect(() => {
    if (!liveData?.triggerSaveToNotebook || !lastScanV5 || !lastScanFileName) return;
    void saveToNotebook();
  }, [liveData?.triggerSaveToNotebook, lastScanV5, lastScanFileName, saveToNotebook]);

  useEffect(() => {
    const imp = liveData?.driveImportFile;
    if (!imp || typeof imp !== "object") return;
    const fileId = (imp as { fileId?: unknown }).fileId;
    const fileName = (imp as { fileName?: unknown }).fileName;
    const mimeType = (imp as { mimeType?: unknown }).mimeType;
    if (typeof fileId !== "string" || typeof fileName !== "string") return;
    if (driveImportDoneRef.current === fileId) return;

    let cancelled = false;
    driveImportDoneRef.current = fileId;
    void (async () => {
      const { toast } = await import("sonner");
      toast.info(`מוריד מ-Drive: ${fileName}`);
      try {
        const { inferMimeFromFileName } = await import("@/lib/scan-mime");
        const params = new URLSearchParams({ fileId, fileName, mimeType: typeof mimeType === "string" ? mimeType : "application/octet-stream" });
        const res = await fetch(`/api/os/google-drive/download?${params}`, { credentials: "include" });
        if (!res.ok) { const data = (await res.json().catch(() => ({}))) as { error?: string }; throw new Error(data.error ?? "הורדה מ-Google Drive נכשלה"); }
        const blob = await res.blob();
        if (cancelled) return;
        const headerName = res.headers.get("X-Drive-File-Name");
        const resolvedName = headerName ? decodeURIComponent(headerName) : fileName;
        const resolvedMime = inferMimeFromFileName(resolvedName, blob.type);
        const file = new File([blob], resolvedName, { type: resolvedMime });
        await runFileQueue([file]);
      } catch (err) {
        if (driveImportDoneRef.current === fileId) driveImportDoneRef.current = null;
        const { toast: t2 } = await import("sonner");
        t2.error(err instanceof Error ? err.message : "ייבוא מ-Drive נכשל");
      }
    })();
    return () => { cancelled = true; };
  }, [liveData?.driveImportFile, runFileQueue]);

  // ── PWA Share Target: auto-load file shared from another app ─────────────
  // When the user shares a file to BSD-YBM from Android/iOS, the server saves it
  // to Drive and redirects with ?sharedDriveId=<fileId>&sharedFileName=<name>.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sharedDriveId = params.get("sharedDriveId");
    const sharedFileName = params.get("sharedFileName") ?? "shared-document";
    if (!sharedDriveId) return;
    if (driveImportDoneRef.current === sharedDriveId) return;
    driveImportDoneRef.current = sharedDriveId;
    // Clean URL so refresh doesn't re-trigger
    const clean = new URL(window.location.href);
    clean.searchParams.delete("sharedDriveId");
    clean.searchParams.delete("sharedFileName");
    window.history.replaceState(null, "", clean.toString());
    // Download and scan
    void (async () => {
      const { toast } = await import("sonner");
      toast.info(`טוען קובץ משותף: ${sharedFileName}`);
      try {
        const { inferMimeFromFileName } = await import("@/lib/scan-mime");
        const urlParams = new URLSearchParams({ fileId: sharedDriveId, fileName: sharedFileName, mimeType: inferMimeFromFileName(sharedFileName, "") });
        const res = await fetch(`/api/os/google-drive/download?${urlParams}`, { credentials: "include" });
        if (!res.ok) throw new Error("הורדת קובץ משותף נכשלה");
        const blob = await res.blob();
        const resolvedMime = inferMimeFromFileName(sharedFileName, blob.type);
        const file = new File([blob], sharedFileName, { type: resolvedMime });
        await runFileQueue([file]);
      } catch (err) {
        driveImportDoneRef.current = null;
        const { toast: t2 } = await import("sonner");
        t2.error(err instanceof Error ? err.message : "טעינת קובץ משותף נכשלה");
      }
    })();
  }, [runFileQueue]);

  useEffect(() => { if (showProjectPicker) void loadProjectsList(); }, [showProjectPicker, loadProjectsList]);

  // ── handlers ──────────────────────────────────────────────────────────────
  const persistInstruction = (value: string) => {
    setUserInstruction(value);
    try { localStorage.setItem(SCAN_INSTRUCTION_KEY, value); } catch { /* ignore */ }
  };

  const openPreviewPanel = useCallback(() => {
    if (!previewUrl && queue.length > 0) {
      const active = queue.find((q) => q.status === "processing") ?? [...queue].reverse().find((q) => q.status === "done") ?? queue[queue.length - 1];
      if (active) applyFilePreview(active.file);
    }
    setPreviewPanelOpen(true);
    pushScannerView({ openPreviewPanel: true });
  }, [applyFilePreview, previewUrl, queue, pushScannerView]);

  const activeEngineLabel = useMemo(() => {
    if (!engineMeta) return tr("scanner.processing", "מעבד…");
    if (engineRunMode === "SINGLE_GEMINI") return engineMeta.gemini?.primaryLabel ?? "Gemini";
    if (engineRunMode === "SINGLE_OPENAI") return engineMeta.openai?.defaultModelId ?? "OpenAI";
    if (engineRunMode === "SINGLE_DOCUMENT_AI") return "Document AI";
    if (engineRunMode === "SINGLE_MISTRAL") return engineMeta.mistral?.primaryLabel ?? "Pixtral";
    if (engineRunMode === "MULTI_PARALLEL") return tr("scanner.modeMulti", "ריבוי מנועים");
    return tr("scanner.modeAuto", "אוטומטי");
  }, [engineMeta, engineRunMode, tr]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) addFiles(files); // stage — scan only when "Scan" is pressed
  }, [addFiles]);

  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) addFiles(files); // stage — scan only when "Scan" is pressed
  }, [addFiles]);

  return {
    t, dir, scannerPrefix,
    scanModes, fileInputRef, cameraInputRef, fileAccept,
    isDragging, setIsDragging,
    engineMeta, engineRunMode, setEngineRunMode,
    scanModeOverride, setScanModeOverride,
    userInstruction, persistInstruction,
    instructionsOpen, setInstructionsOpen,
    previewPanelOpen, setPreviewPanelOpen,
    resultsPanelOpen, setResultsPanelOpen,
    stackScannerPanels,
    boundProjectId, boundProjectName,
    projectsList, projectsListLoading, showProjectPicker, loadProjectsList, selectProject, clearProject,
    scanQueue,
    activeEngineLabel,
    openPreviewPanel, onDrop, onFileInputChange,
    pushScannerView,
    ENGINE_MODES, tr,
  };
}
