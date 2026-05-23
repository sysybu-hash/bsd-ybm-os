"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import ProjectPickerPanel from "@/components/os/widgets/shared/ProjectPickerPanel";
import { useProjectPicker } from "@/hooks/use-project-picker";
import {
  ScanLine,
  FileText,
  ArrowRight,
  Zap,
  Bot,
  Settings2,
  Eye,
} from "lucide-react";
import OsFloatingPanel from "@/components/os/layout/OsFloatingPanel";
import { OS_MODAL_PANEL_Z } from "@/lib/os-modal-z-index";
import ScanFilePreview from "@/components/os/widgets/scan/ScanFilePreview";
import ScanResultsPanel from "@/components/os/widgets/scan/ScanResultsPanel";
import { buildScanFileAcceptAttribute } from "@/lib/scan-mime";
import { formatTelemetrySummaryHe } from "@/lib/scan-telemetry-display";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useIndustryConfig } from "@/hooks/use-industry-config";
import { defaultScanModeForIndustry, getScanModesForUi } from "@/lib/scan-modes-for-ui";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { ScanModeV5 } from "@/lib/scan-schema-v5";
import type { AiScannerWidgetProps } from "./ai-scanner/types";
import { ENGINE_MODES, SCAN_INSTRUCTION_KEY } from "./ai-scanner/constants";
import { useScanQueue } from "./ai-scanner/useScanQueue";
import { ScanDropZone } from "./ai-scanner/ScanDropZone";
import { ScanConfirmPanel } from "./ai-scanner/ScanConfirmPanel";
import { ScanHistorySidebar } from "./ai-scanner/ScanHistorySidebar";

export default function AiScannerWidget({ liveData = null, openWorkspaceWidget }: AiScannerWidgetProps) {
  const { t, dir } = useI18n();
  const industryConfig = useIndustryConfig();
  const industryId = industryConfig.id;
  const scanModes = useMemo(() => getScanModesForUi(industryId), [industryId]);
  const fileInputRef = useRef<HTMLInputElement>(null) as React.RefObject<HTMLInputElement>;
  const driveImportDoneRef = useRef<string | null>(null);
  const fileAccept = useMemo(() => buildScanFileAcceptAttribute(), []);

  const [isDragging, setIsDragging] = useState(false);
  const [engineMeta, setEngineMeta] = useState<{
    configured: { documentAI: boolean; gemini: boolean; openai: boolean };
    gemini?: { primaryLabel?: string };
    openai?: { defaultModelId?: string };
  } | null>(null);
  const [engineRunMode, setEngineRunMode] = useState<TriEngineRunMode>("AUTO");
  const [scanModeOverride, setScanModeOverride] = useState<ScanModeV5>(() =>
    defaultScanModeForIndustry(industryId),
  );
  const [userInstruction, setUserInstruction] = useState("");
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [previewPanelOpen, setPreviewPanelOpen] = useState(false);
  const [resultsPanelOpen, setResultsPanelOpen] = useState(false);
  const [stackScannerPanels, setStackScannerPanels] = useState(false);

  const scannerPrefix = "workspaceWidgets.aiScanner";

  useEffect(() => {
    const next = defaultScanModeForIndustry(industryId);
    setScanModeOverride(next);
  }, [industryId]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setStackScannerPanels(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const tr = useCallback(
    (key: string, fallback: string) => {
      const v = t(key);
      return v !== key ? v : fallback;
    },
    [t],
  );

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
    listErrorKey: `${scannerPrefix}.loadFailed`,
  });

  const {
    queue,
    isProcessing,
    queueProgress,
    pendingAnalysis,
    setPendingAnalysis,
    history,
    setHistory,
    telemetry,
    resultJson,
    scanClassification,
    lastScanV5,
    setLastScanV5,
    lastScanFileName,
    setLastScanFileName,
    savingNotebook,
    previewUrl,
    previewMime,
    previewFileName,
    applyFilePreview,
    runFileQueue,
    confirmAnalysis,
    saveToNotebook,
  } = useScanQueue({
    engineRunMode,
    scanModeOverride,
    boundProjectId,
    userInstruction,
    industryId,
    openWorkspaceWidget,
    tr,
  });

  const applyScannerNav = useCallback((view: WidgetViewState) => {
    if (view.openPreviewPanel) setPreviewPanelOpen(true);
    if (view.openResultsPanel) setResultsPanelOpen(true);
  }, []);
  const { pushView: pushScannerView } = useSyncedWidgetNavigation(applyScannerNav);

  // Load engine meta
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { fetchEngineMetaCached } = await import("@/lib/scan-engine-meta-cache");
      const data = await fetchEngineMetaCached();
      if (!cancelled && data)
        setEngineMeta(
          data as {
            configured: { documentAI: boolean; gemini: boolean; openai: boolean };
            gemini?: { primaryLabel?: string };
            openai?: { defaultModelId?: string };
          },
        );
    })();
    return () => { cancelled = true; };
  }, []);

  // Revoke preview URL on unmount
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  // liveData overrides
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SCAN_INSTRUCTION_KEY);
      if (saved) setUserInstruction(saved);
    } catch { /* ignore */ }
    const inst = liveData?.userInstruction;
    if (typeof inst === "string" && inst.trim()) setUserInstruction(inst.trim());
    if (liveData?.openInstructions) setInstructionsOpen(true);
    const mode = liveData?.engineRunMode;
    if (
      typeof mode === "string" &&
      ["AUTO", "MULTI_PARALLEL", "SINGLE_GEMINI", "SINGLE_OPENAI", "SINGLE_DOCUMENT_AI"].includes(mode)
    ) {
      setEngineRunMode(mode as TriEngineRunMode);
    }
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

  // Google Drive import
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

    (async () => {
      const { toast } = await import("sonner");
      toast.info(`מוריד מ-Drive: ${fileName}`);
      try {
        const { inferMimeFromFileName } = await import("@/lib/scan-mime");
        const params = new URLSearchParams({
          fileId,
          fileName,
          mimeType: typeof mimeType === "string" ? mimeType : "application/octet-stream",
        });
        const res = await fetch(`/api/os/google-drive/download?${params}`, {
          credentials: "include",
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "הורדה מ-Google Drive נכשלה");
        }
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

  const persistInstruction = (value: string) => {
    setUserInstruction(value);
    try { localStorage.setItem(SCAN_INSTRUCTION_KEY, value); } catch { /* ignore */ }
  };

  const openPreviewPanel = useCallback(() => {
    if (!previewUrl && queue.length > 0) {
      const active =
        queue.find((q) => q.status === "processing") ??
        [...queue].reverse().find((q) => q.status === "done") ??
        queue[queue.length - 1];
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
    if (engineRunMode === "MULTI_PARALLEL") return tr("scanner.modeMulti", "ריבוי מנועים");
    return tr("scanner.modeAuto", "אוטומטי");
  }, [engineMeta, engineRunMode, tr]);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) await runFileQueue(files);
    },
    [runFileQueue],
  );

  const onFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (files.length) await runFileQueue(files);
    },
    [runFileQueue],
  );

  useEffect(() => {
    if (showProjectPicker) void loadProjectsList();
  }, [showProjectPicker, loadProjectsList]);

  if (showProjectPicker) {
    return (
      <ProjectPickerPanel
        projects={projectsList}
        loading={projectsListLoading}
        onSelect={selectProject}
        titleKey={`${scannerPrefix}.pickProjectTitle`}
        descKey={`${scannerPrefix}.pickProjectDesc`}
        loadingKey={`${scannerPrefix}.pickProjectLoading`}
        emptyKey={`${scannerPrefix}.noProjects`}
        openCrmKey={openWorkspaceWidget ? `${scannerPrefix}.openCrm` : undefined}
        onOpenCrm={openWorkspaceWidget ? () => openWorkspaceWidget("crmTable", null) : undefined}
      />
    );
  }

  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)] md:flex-row"
      dir={dir}
    >
      <ScanHistorySidebar
        history={history}
        onDelete={(id) => setHistory((prev) => prev.filter((h) => h.id !== id))}
        tr={tr}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border-main)] p-3">
          <div className="flex items-center gap-3 min-w-0">
            <ScanLine className="text-orange-500 shrink-0" size={22} />
            <div className="min-w-0">
              <h2 className="text-sm font-black truncate">
                {boundProjectName || t("scanner.title")}
              </h2>
              <p className="text-[10px] text-[color:var(--foreground-muted)]">
                {boundProjectName ? t(`${scannerPrefix}.subtitleScoped`) : t("scanner.subtitle")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={clearProject}
              className="flex items-center gap-1.5 rounded-lg border border-[color:var(--border-main)] px-2 py-1.5 text-[10px] font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-elevated)]"
            >
              <ArrowRight size={12} aria-hidden />
              {t(`${scannerPrefix}.switchProject`)}
            </button>
            <input
              type="text"
              value={userInstruction}
              onChange={(e) => persistInstruction(e.target.value)}
              placeholder={tr("scanner.instructionPlaceholder", "הנחיות ל-AI…")}
              className="max-w-[12rem] rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-1.5 text-[10px] font-semibold"
            />
            <button
              type="button"
              onClick={() => setInstructionsOpen(true)}
              className="rounded-lg border border-[color:var(--border-main)] px-2 py-1.5 text-[10px] font-bold"
            >
              {tr("scanner.instructionsBtn", "הנחיות")}
            </button>
            <button
              type="button"
              onClick={openPreviewPanel}
              disabled={queue.length === 0 && !previewUrl}
              className="rounded-lg border border-[color:var(--border-main)] p-1.5 disabled:opacity-40"
              aria-label={tr("scanner.preview", "תצוגה מקדימה")}
            >
              <Eye size={14} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => {
                setResultsPanelOpen(true);
                pushScannerView({ openResultsPanel: true });
              }}
              disabled={!lastScanV5}
              className="rounded-lg border border-[color:var(--border-main)] p-1.5 disabled:opacity-40"
              aria-label={tr("scanner.resultsPanel", "תוצאות")}
            >
              <FileText size={14} aria-hidden />
            </button>
            <Settings2 size={14} className="text-[color:var(--foreground-muted)]" aria-hidden />
            {scanClassification && engineRunMode === "AUTO" ? (
              <span
                className="max-w-[8rem] truncate rounded-lg bg-indigo-500/10 px-2 py-1 text-[9px] font-bold text-indigo-700 dark:text-indigo-300"
                title={scanClassification.rationale}
              >
                {tr("scanner.classification", "סיווג")}: {scanClassification.scanMode} (
                {Math.round(scanClassification.confidence * 100)}%)
              </span>
            ) : null}
            <select
              value={scanModeOverride}
              onChange={(e) => setScanModeOverride(e.target.value as ScanModeV5)}
              className="rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-1.5 text-[10px] font-bold"
              aria-label="מצב סריקה"
            >
              {scanModes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={engineRunMode}
              onChange={(e) => setEngineRunMode(e.target.value as TriEngineRunMode)}
              className="rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-1.5 text-[10px] font-bold"
              aria-label={tr("scanner.configAi", "מנועים")}
            >
              {ENGINE_MODES.map((m) => (
                <option
                  key={m.id}
                  value={m.id}
                  disabled={
                    m.id === "SINGLE_DOCUMENT_AI" && !engineMeta?.configured.documentAI
                  }
                >
                  {tr(m.labelKey, m.fallback)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Body */}
        {pendingAnalysis ? (
          <ScanConfirmPanel
            analysis={pendingAnalysis}
            onChange={setPendingAnalysis}
            onClose={() => setPendingAnalysis(null)}
            onConfirm={() => void confirmAnalysis()}
            tr={tr}
          />
        ) : (
          <Group
            orientation={stackScannerPanels ? "vertical" : "horizontal"}
            className="min-h-0 flex-1"
          >
            <Panel
              defaultSize={stackScannerPanels ? 42 : 48}
              minSize={stackScannerPanels ? 24 : 28}
              className="flex min-h-0 flex-col"
            >
              <ScanDropZone
                isDragging={isDragging}
                setIsDragging={setIsDragging}
                isProcessing={isProcessing}
                queue={queue}
                queueProgress={queueProgress}
                hasPendingAnalysis={!!pendingAnalysis}
                previewUrl={previewUrl}
                previewMime={previewMime}
                previewFileName={previewFileName}
                fileAccept={fileAccept}
                fileInputRef={fileInputRef}
                onDrop={onDrop}
                onFileInputChange={onFileInputChange}
                applyFilePreview={applyFilePreview}
                t={t}
                tr={tr}
              />
            </Panel>
            <Separator
              className={
                stackScannerPanels
                  ? "h-1.5 bg-[color:var(--border-main)] hover:bg-orange-500/40"
                  : "w-1.5 bg-[color:var(--border-main)] hover:bg-orange-500/40"
              }
            />
            <Panel
              defaultSize={stackScannerPanels ? 58 : 52}
              minSize={stackScannerPanels ? 28 : 28}
              className="flex min-h-0 flex-col p-3"
            >
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
                {t("scanner.results")}
              </p>
              <p className="mb-2 text-[10px] font-mono text-[color:var(--foreground-muted)]">
                {tr("scanner.telemetry", "טלמטריה")}: {formatTelemetrySummaryHe(telemetry)}
              </p>
              <pre className="custom-scrollbar flex-1 overflow-auto rounded-xl border border-[color:var(--border-main)] bg-black/20 p-3 text-[10px] leading-relaxed">
                {resultJson || tr("scanner.noPreview", "אין תוצאה עדיין")}
              </pre>
            </Panel>
          </Group>
        )}

        {/* Engine status bar */}
        <div className="grid grid-cols-3 gap-1.5 border-t border-[color:var(--border-main)] p-2 sm:gap-2">
          <div className="rounded-xl border border-[color:var(--border-main)] p-2 text-center">
            <Zap size={14} className="mx-auto text-blue-500" />
            <div className="text-[9px] font-bold text-[color:var(--foreground-muted)]">
              {tr("scanner.engineActive", "מנוע")}
            </div>
            <div className="text-[10px] font-black truncate">{activeEngineLabel}</div>
          </div>
          <div className="rounded-xl border border-[color:var(--border-main)] p-2 text-center">
            <Bot size={14} className="mx-auto text-purple-500" />
            <div className="text-[9px] font-bold">
              {engineMeta?.configured.gemini ? "Gemini ✓" : "—"}
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--border-main)] p-2 text-center">
            <FileText size={14} className="mx-auto text-emerald-500" />
            <div className="text-[9px] font-bold">
              {engineMeta?.configured.openai ? "OpenAI ✓" : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Floating panels */}
      <OsFloatingPanel
        open={instructionsOpen}
        onClose={() => setInstructionsOpen(false)}
        title={tr("scanner.instructionsTitle", "הנחיות לפענוח")}
      >
        <textarea
          value={userInstruction}
          onChange={(e) => persistInstruction(e.target.value)}
          rows={6}
          className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3 text-sm"
          placeholder={tr("scanner.instructionPlaceholder", "לדוגמה: הדגש מע״מ ושורות מע״מ")}
        />
      </OsFloatingPanel>

      <OsFloatingPanel
        open={previewPanelOpen}
        onClose={() => setPreviewPanelOpen(false)}
        title={tr("scanner.preview", "תצוגה מקדימה")}
        panelWidth={640}
        zIndex={OS_MODAL_PANEL_Z + 10}
      >
        <ScanFilePreview
          url={previewUrl}
          mime={previewMime}
          fileName={previewFileName}
          emptyLabel={tr("scanner.noPreview", "אין תצוגה מקדימה לסוג קובץ זה")}
        />
        {previewFileName ? (
          <p className="mt-2 truncate text-center text-[10px] font-bold text-[color:var(--foreground-muted)]">
            {previewFileName}
          </p>
        ) : null}
        {queue.length > 0 ? (
          <ul className="mt-3 space-y-1 border-t border-[color:var(--border-main)] pt-3 text-xs">
            {queue.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => applyFilePreview(q.file)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 px-2 py-1.5 text-start transition hover:bg-[color:var(--surface-soft)]"
                >
                  <span className="truncate font-semibold">{q.file.name}</span>
                  <span
                    className={
                      q.status === "done"
                        ? "text-emerald-500"
                        : q.status === "error"
                          ? "text-red-500"
                          : q.status === "processing"
                            ? "text-orange-500"
                            : "text-[color:var(--foreground-muted)]"
                    }
                  >
                    {q.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </OsFloatingPanel>

      <OsFloatingPanel
        open={resultsPanelOpen}
        onClose={() => setResultsPanelOpen(false)}
        title={tr("scanner.resultsPanel", "תוצאות סריקה")}
        panelWidth={560}
        zIndex={OS_MODAL_PANEL_Z + 20}
      >
        {lastScanV5 && lastScanFileName ? (
          <ScanResultsPanel
            v5={lastScanV5}
            fileName={lastScanFileName}
            telemetry={telemetry}
            onConfirmErp={() => pendingAnalysis && void confirmAnalysis()}
            onSaveNotebook={() => void saveToNotebook()}
            savingNotebook={savingNotebook}
          />
        ) : (
          <p className="text-sm text-[color:var(--foreground-muted)]">
            {tr("scanner.noPreview", "אין תוצאה")}
          </p>
        )}
      </OsFloatingPanel>
    </div>
  );
}
