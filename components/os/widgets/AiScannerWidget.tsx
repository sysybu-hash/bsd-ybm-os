"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ScanLine,
  Upload,
  FileText,
  CheckCircle2,
  Loader2,
  History,
  ArrowRight,
  Bot,
  Zap,
  Save,
  X,
  Building2,
  Hash,
  Calendar,
  DollarSign,
  Settings2,
} from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import ItemActions from "@/components/os/ItemActions";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { TriEngineTelemetry } from "@/lib/tri-engine-extract";
import {
  buildScanFileAcceptAttribute,
  inferMimeFromFileName,
  isSupportedScanMime,
  MAX_SCAN_FILE_BYTES,
  SCAN_ACCEPT_SUMMARY,
} from "@/lib/scan-mime";

type EngineMeta = {
  configured: { documentAI: boolean; gemini: boolean; openai: boolean };
  gemini?: { primaryLabel?: string };
  openai?: { defaultModelId?: string };
};

interface DocumentAnalysis {
  amount: number;
  vendor: string;
  taxId?: string;
  projectSuggestion: string;
  confidence: number;
  summary: string;
  date?: string;
  documentId?: string;
  rawAiData?: Record<string, unknown>;
  v5?: ScanExtractionV5;
}

interface ScanHistoryItem {
  id: string;
  fileName: string;
  vendor: string;
  amount: number;
  date: string;
  status: "success" | "warning" | "error";
}

type QueueStatus = "pending" | "processing" | "done" | "error";

interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  error?: string;
}

function formatMsg(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    template,
  );
}

const ENGINE_MODES: { id: TriEngineRunMode; labelKey: string; fallback: string }[] = [
  { id: "AUTO", labelKey: "scanner.modeAuto", fallback: "אוטומטי" },
  { id: "MULTI_PARALLEL", labelKey: "scanner.modeMulti", fallback: "ריבוי מנועים" },
  { id: "SINGLE_GEMINI", labelKey: "scanner.modeGemini", fallback: "Gemini" },
  { id: "SINGLE_OPENAI", labelKey: "scanner.modeOpenai", fallback: "OpenAI" },
  { id: "SINGLE_DOCUMENT_AI", labelKey: "scanner.modeDocAi", fallback: "Document AI" },
];

function mapV5ToAnalysis(v5: ScanExtractionV5, aiData?: Record<string, unknown>): DocumentAnalysis {
  const meta = v5.documentMetadata;
  return {
    amount: Number(v5.total ?? 0),
    vendor: v5.vendor || "לא צוין",
    taxId: v5.taxId ?? undefined,
    projectSuggestion: meta?.project ?? meta?.client ?? "",
    confidence: 0.92,
    summary: v5.summary || v5.docType,
    date: v5.date ?? meta?.documentDate ?? new Date().toISOString().split("T")[0],
    rawAiData: aiData ?? (v5 as unknown as Record<string, unknown>),
    v5,
  };
}

async function readNdjsonStream(
  res: Response,
  onLine: (obj: Record<string, unknown>) => void,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No body");
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        onLine(JSON.parse(t) as Record<string, unknown>);
      } catch {
        /* skip malformed */
      }
    }
  }
  const tail = buf.trim();
  if (tail) {
    try {
      onLine(JSON.parse(tail) as Record<string, unknown>);
    } catch {
      /* */
    }
  }
}

function telemetryLabel(t: TriEngineTelemetry | null): string {
  if (!t) return "—";
  const parts: string[] = [];
  if (t.documentAI?.phase && t.documentAI.phase !== "idle") parts.push(`DocAI: ${t.documentAI.phase}`);
  if (t.gemini?.phase && t.gemini.phase !== "idle") parts.push(`Gemini: ${t.gemini.phase}`);
  if (t.gpt?.phase && t.gpt.phase !== "idle") parts.push(`GPT: ${t.gpt.phase}`);
  return parts.length ? parts.join(" · ") : "—";
}

export default function AiScannerWidget() {
  const { t, dir } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileAccept = useMemo(() => buildScanFileAcceptAttribute(), []);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [queueProgress, setQueueProgress] = useState<{ current: number; total: number; name: string } | null>(
    null,
  );
  const [engineMeta, setEngineMeta] = useState<EngineMeta | null>(null);
  const [engineRunMode, setEngineRunMode] = useState<TriEngineRunMode>("AUTO");
  const [telemetry, setTelemetry] = useState<TriEngineTelemetry | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultJson, setResultJson] = useState<string>("");
  const [pendingAnalysis, setPendingAnalysis] = useState<DocumentAnalysis | null>(null);
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);

  const tr = useCallback(
    (key: string, fallback: string) => {
      const v = t(key);
      return v !== key ? v : fallback;
    },
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/scan/engine-meta");
        if (res.ok && !cancelled) setEngineMeta((await res.json()) as EngineMeta);
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const activeEngineLabel = useMemo(() => {
    if (!engineMeta) return tr("scanner.processing", "מעבד…");
    if (engineRunMode === "SINGLE_GEMINI") return engineMeta.gemini?.primaryLabel ?? "Gemini";
    if (engineRunMode === "SINGLE_OPENAI") return engineMeta.openai?.defaultModelId ?? "OpenAI";
    if (engineRunMode === "SINGLE_DOCUMENT_AI") return "Document AI";
    if (engineRunMode === "MULTI_PARALLEL") return tr("scanner.modeMulti", "ריבוי מנועים");
    return tr("scanner.modeAuto", "אוטומטי");
  }, [engineMeta, engineRunMode, tr]);

  const validateScanFile = useCallback(
    (file: File): string | null => {
      if (file.size > MAX_SCAN_FILE_BYTES) {
        return formatMsg(tr("scanner.fileTooLarge", "קובץ גדול מדי: {name}"), { name: file.name });
      }
      const mime = inferMimeFromFileName(file.name, file.type || "application/octet-stream");
      if (!isSupportedScanMime(mime)) {
        return formatMsg(tr("scanner.unsupportedFile", "לא נתמך: {name}"), { name: file.name });
      }
      return null;
    },
    [tr],
  );

  const scanSingleFile = async (file: File): Promise<DocumentAnalysis> => {
    setPendingAnalysis(null);
    setResultJson("");
    setTelemetry(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const mime = inferMimeFromFileName(file.name, file.type || "application/octet-stream");
    if (mime.startsWith("image/")) setPreviewUrl(URL.createObjectURL(file));
    else setPreviewUrl(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("scanMode", "INVOICE_FINANCIAL");
      formData.append("persist", "false");
      formData.append("engineRunMode", engineRunMode);

      const res = await fetch("/api/scan/tri-engine/stream", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(String((err as { error?: string }).error ?? res.status));
      }

      let finalV5: ScanExtractionV5 | null = null;
      let finalAi: Record<string, unknown> | undefined;

      await readNdjsonStream(res, (obj) => {
        if (obj.type === "telemetry" && obj.telemetry) {
          setTelemetry(obj.telemetry as TriEngineTelemetry);
        }
        if (obj.type === "partial_v5" && obj.v5) {
          finalV5 = obj.v5 as ScanExtractionV5;
          setResultJson(JSON.stringify(obj.v5, null, 2));
        }
        if (obj.type === "done" && obj.ok) {
          if (obj.aiData) finalAi = obj.aiData as Record<string, unknown>;
          if (obj.aiData && typeof obj.aiData === "object") {
            const nested = (obj.aiData as { v5?: ScanExtractionV5 }).v5;
            if (nested) finalV5 = nested;
          }
        }
        if (obj.type === "error" || (obj.error && !obj.ok)) {
          throw new Error(String(obj.error ?? "Scan failed"));
        }
      });

      if (finalV5) {
        const analysis = mapV5ToAnalysis(finalV5, finalAi);
        setPendingAnalysis(analysis);
        setResultJson(JSON.stringify(finalV5, null, 2));
        return analysis;
      }
      throw new Error("No extraction result");
    } catch (err) {
      throw err instanceof Error ? err : new Error(tr("scanner.scanError", "שגיאה בסריקה"));
    }
  };

  const runFileQueue = useCallback(
    async (files: File[]) => {
      if (!files.length || isProcessing) return;

      const valid: File[] = [];
      for (const file of files) {
        const err = validateScanFile(file);
        if (err) toast.error(err);
        else valid.push(file);
      }
      if (!valid.length) return;

      const initialQueue: QueueItem[] = valid.map((file) => ({
        id: `${Date.now()}-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        status: "pending",
      }));
      setQueue(initialQueue);
      setIsProcessing(true);

      let ok = 0;
      let fail = 0;

      for (let i = 0; i < valid.length; i++) {
        const file = valid[i];
        const qid = initialQueue[i].id;
        setQueueProgress({ current: i + 1, total: valid.length, name: file.name });
        setQueue((prev) => prev.map((q) => (q.id === qid ? { ...q, status: "processing" } : q)));
        toast.info(
          formatMsg(tr("scanner.scanProgress", "סורק {current} מתוך {total}: {name}"), {
            current: i + 1,
            total: valid.length,
            name: file.name,
          }),
        );

        try {
          const analysis = await scanSingleFile(file);
          ok++;
          setQueue((prev) => prev.map((q) => (q.id === qid ? { ...q, status: "done" } : q)));
          setHistory((prev) => [
            {
              id: qid,
              fileName: file.name,
              vendor: analysis.vendor,
              amount: analysis.amount,
              date: analysis.date || new Date().toISOString().split("T")[0],
              status: "success",
            },
            ...prev,
          ]);
        } catch (err) {
          fail++;
          const msg = err instanceof Error ? err.message : tr("scanner.scanError", "שגיאה");
          setQueue((prev) => prev.map((q) => (q.id === qid ? { ...q, status: "error", error: msg } : q)));
          toast.error(`${file.name}: ${msg}`);
        }
      }

      setQueueProgress(null);
      setIsProcessing(false);
      toast.success(
        formatMsg(tr("scanner.scanBatchDone", "הושלם: {ok} הצליחו, {fail} נכשלו"), { ok, fail }),
      );
    },
    [isProcessing, validateScanFile, tr, engineRunMode],
  );

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

  const confirmAnalysis = async () => {
    if (!pendingAnalysis) return;
    const raw = pendingAnalysis.rawAiData as DocumentAnalysis | undefined;
    const isCorrected =
      raw &&
      (pendingAnalysis.vendor !== raw.vendor ||
        pendingAnalysis.amount !== raw.amount ||
        pendingAnalysis.taxId !== raw.taxId ||
        pendingAnalysis.date !== raw.date);

    if (isCorrected && pendingAnalysis.documentId) {
      try {
        await fetch("/api/ai/corrections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId: pendingAnalysis.documentId,
            originalAiData: raw,
            correctedData: {
              vendor: pendingAnalysis.vendor,
              amount: pendingAnalysis.amount,
              taxId: pendingAnalysis.taxId,
              date: pendingAnalysis.date,
            },
            correctionSource: "USER_MANUAL",
          }),
        });
      } catch {
        /* */
      }
    }

    try {
      await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "confirm-expense",
          amount: pendingAnalysis.amount,
          vendor: pendingAnalysis.vendor,
          taxId: pendingAnalysis.taxId,
          date: pendingAnalysis.date,
          projectName: pendingAnalysis.projectSuggestion,
        }),
      });
    } catch {
      /* */
    }

    setHistory((prev) => [
      {
        id: Date.now().toString(),
        fileName: tr("scanner.results", "סריקה"),
        vendor: pendingAnalysis.vendor,
        amount: pendingAnalysis.amount,
        date: pendingAnalysis.date || new Date().toISOString().split("T")[0],
        status: "success",
      },
      ...prev,
    ]);
    setPendingAnalysis(null);
    toast.success(tr("scanner.confirmExpense", "ההוצאה נשמרה"));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)] md:flex-row" dir={dir}>
      <div className="flex h-36 shrink-0 flex-col border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 md:h-auto md:w-56 md:border-b-0 md:border-l">
        <div className="border-b border-[color:var(--border-main)] p-3">
          <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
            <History size={16} />
            <span className="text-[10px] font-black uppercase tracking-widest">
              {tr("scanner.historyTitle", "היסטוריה")}
            </span>
          </div>
        </div>
        <div className="custom-scrollbar flex-1 overflow-y-auto p-2 space-y-2">
          {history.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[10px] font-bold">{item.vendor}</div>
                <div className="text-[10px] font-mono text-emerald-600">₪{(item.amount || 0).toLocaleString()}</div>
              </div>
              <ItemActions onDelete={() => setHistory((prev) => prev.filter((h) => h.id !== item.id))} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border-main)] p-3">
          <div className="flex items-center gap-3">
            <ScanLine className="text-orange-500" size={22} />
            <div>
              <h2 className="text-sm font-black">{t("scanner.title")}</h2>
              <p className="text-[10px] text-[color:var(--foreground-muted)]">{t("scanner.subtitle")}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Settings2 size={14} className="text-[color:var(--foreground-muted)]" aria-hidden />
            <select
              value={engineRunMode}
              onChange={(e) => setEngineRunMode(e.target.value as TriEngineRunMode)}
              className="rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-1.5 text-[10px] font-bold"
              aria-label={tr("scanner.configAi", "מנועים")}
            >
              {ENGINE_MODES.map((m) => (
                <option key={m.id} value={m.id} disabled={m.id === "SINGLE_DOCUMENT_AI" && !engineMeta?.configured.documentAI}>
                  {tr(m.labelKey, m.fallback)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {pendingAnalysis ? (
          <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
            <div className="mx-auto max-w-xl rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-bold">
                  <CheckCircle2 className="text-emerald-500" size={20} />
                  {tr("scanner.results", "אישור")}
                </h3>
                <button type="button" onClick={() => setPendingAnalysis(null)} className="rounded-lg p-1 hover:bg-black/5">
                  <X size={18} />
                </button>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <label className="text-[10px] font-bold text-[color:var(--foreground-muted)]">
                  <Building2 size={10} className="inline" /> ספק
                  <input
                    value={pendingAnalysis.vendor}
                    onChange={(e) => setPendingAnalysis({ ...pendingAnalysis, vendor: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs"
                  />
                </label>
                <label className="text-[10px] font-bold text-[color:var(--foreground-muted)]">
                  <Hash size={10} className="inline" /> ח&quot;פ
                  <input
                    value={pendingAnalysis.taxId || ""}
                    onChange={(e) => setPendingAnalysis({ ...pendingAnalysis, taxId: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs"
                  />
                </label>
                <label className="text-[10px] font-bold text-[color:var(--foreground-muted)]">
                  <DollarSign size={10} className="inline" /> סכום
                  <input
                    type="number"
                    value={pendingAnalysis.amount}
                    onChange={(e) => setPendingAnalysis({ ...pendingAnalysis, amount: parseFloat(e.target.value) || 0 })}
                    className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-mono"
                  />
                </label>
                <label className="text-[10px] font-bold text-[color:var(--foreground-muted)]">
                  <Calendar size={10} className="inline" /> תאריך
                  <input
                    type="date"
                    value={pendingAnalysis.date}
                    onChange={(e) => setPendingAnalysis({ ...pendingAnalysis, date: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={confirmAnalysis}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-black text-white"
              >
                <Save size={18} /> {tr("scanner.confirmExpense", "אשר ושמור")}
              </button>
            </div>
          </div>
        ) : (
          <Group orientation="horizontal" className="min-h-0 flex-1">
            <Panel defaultSize={48} minSize={28} className="flex min-h-0 flex-col">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                className={`m-3 flex flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed transition ${
                  isDragging ? "border-orange-500/50 bg-orange-500/5" : "border-[color:var(--border-main)]"
                }`}
              >
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="animate-spin text-orange-500" size={40} />
                    {queueProgress ? (
                      <p className="px-4 text-center text-[10px] font-bold text-[color:var(--foreground-muted)]">
                        {formatMsg(tr("scanner.scanProgress", "סורק {current} מתוך {total}: {name}"), {
                          current: queueProgress.current,
                          total: queueProgress.total,
                          name: queueProgress.name,
                        })}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <Upload size={36} className="mb-3 text-[color:var(--foreground-muted)]" />
                    <p className="px-4 text-center text-xs font-bold">{t("scanner.drop")}</p>
                    <p className="mt-1 px-4 text-center text-[9px] text-[color:var(--foreground-muted)]">
                      {tr("scanner.acceptHint", SCAN_ACCEPT_SUMMARY)}
                    </p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-4 flex items-center gap-2 rounded-xl border border-[color:var(--border-main)] px-4 py-2 text-xs font-bold"
                    >
                      {tr("scanner.selectFiles", "בחר קבצים")} <ArrowRight size={14} />
                    </button>
                    {queue.length > 0 ? (
                      <p className="mt-2 text-[10px] font-bold text-orange-500">
                        {queue.filter((q) => q.status === "done").length}/{queue.length}{" "}
                        {tr("scanner.filesQueued", "קבצים בתור")}
                      </p>
                    ) : null}
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept={fileAccept}
                  onChange={onFileInputChange}
                />
                {queue.length > 0 && !pendingAnalysis ? (
                  <ul className="custom-scrollbar mt-3 max-h-28 w-full max-w-sm space-y-1 overflow-y-auto px-4">
                    {queue.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/60 px-2 py-1 text-[9px]"
                      >
                        <span className="truncate font-bold">{item.file.name}</span>
                        <span
                          className={
                            item.status === "done"
                              ? "text-emerald-500"
                              : item.status === "error"
                                ? "text-red-500"
                                : item.status === "processing"
                                  ? "text-orange-500"
                                  : "text-[color:var(--foreground-muted)]"
                          }
                        >
                          {item.status === "done"
                            ? tr("scanner.queueStatusDone", "הושלם")
                            : item.status === "error"
                              ? tr("scanner.queueStatusError", "שגיאה")
                              : item.status === "processing"
                                ? tr("scanner.queueStatusProcessing", "מעבד")
                                : tr("scanner.queueStatusPending", "ממתין")}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {previewUrl ? (
                  <img src={previewUrl} alt={tr("scanner.preview", "תצוגה")} className="mt-4 max-h-32 rounded-lg object-contain" />
                ) : null}
              </div>
            </Panel>
            <Separator className="w-1.5 bg-[color:var(--border-main)] hover:bg-orange-500/40" />
            <Panel defaultSize={52} minSize={28} className="flex min-h-0 flex-col p-3">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
                {t("scanner.results")}
              </p>
              <p className="mb-2 text-[10px] font-mono text-[color:var(--foreground-muted)]">
                {tr("scanner.telemetry", "טלמטריה")}: {telemetryLabel(telemetry)}
              </p>
              <pre className="custom-scrollbar flex-1 overflow-auto rounded-xl border border-[color:var(--border-main)] bg-black/20 p-3 text-[10px] leading-relaxed">
                {resultJson || tr("scanner.noPreview", "אין תוצאה עדיין")}
              </pre>
            </Panel>
          </Group>
        )}

        <div className="grid grid-cols-3 gap-2 border-t border-[color:var(--border-main)] p-2">
          <div className="rounded-xl border border-[color:var(--border-main)] p-2 text-center">
            <Zap size={14} className="mx-auto text-blue-500" />
            <div className="text-[9px] font-bold text-[color:var(--foreground-muted)]">{tr("scanner.engineActive", "מנוע")}</div>
            <div className="text-[10px] font-black truncate">{activeEngineLabel}</div>
          </div>
          <div className="rounded-xl border border-[color:var(--border-main)] p-2 text-center">
            <Bot size={14} className="mx-auto text-purple-500" />
            <div className="text-[9px] font-bold">{engineMeta?.configured.gemini ? "Gemini ✓" : "—"}</div>
          </div>
          <div className="rounded-xl border border-[color:var(--border-main)] p-2 text-center">
            <FileText size={14} className="mx-auto text-emerald-500" />
            <div className="text-[9px] font-bold">{engineMeta?.configured.openai ? "OpenAI ✓" : "—"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
