"use client";

import React, { useState } from "react";
import {
  CheckSquare, Square, X, Loader2, AlertTriangle,
  CheckCircle2, Circle, FileSpreadsheet, FileText, Printer, Table2,
} from "lucide-react";
import type { BlueprintAnalysis } from "@/lib/projects/blueprint-analysis-schema";
import { downloadBlob, rowsToCsv } from "@/lib/export-file";

type Props = {
  data: BlueprintAnalysis;
  enginesUsed?: string[];
  projectName?: string;
  onConfirm: (selected: BlueprintAnalysis) => Promise<void>;
  onClose: () => void;
};

function ConfidenceChip({ value }: { value?: number }) {
  if (value === undefined) return null;
  if (value >= 0.8) return (
    <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] text-emerald-700 dark:text-emerald-200">
      <CheckCircle2 size={9} />דיוק גבוה
    </span>
  );
  if (value >= 0.5) return (
    <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-200">
      <Circle size={9} />דיוק בינוני
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] text-rose-700 dark:text-rose-300">
      <AlertTriangle size={9} />בדוק בעצמך
    </span>
  );
}

export default function BlueprintPreviewModal({ data, enginesUsed, projectName, onConfirm, onClose }: Props) {
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(
    new Set(data.tasks.map((_, i) => i)),
  );
  const [selectedMilestones, setSelectedMilestones] = useState<Set<number>>(
    new Set(data.milestones.map((_, i) => i)),
  );
  const [selectedBoq, setSelectedBoq] = useState<Set<number>>(
    new Set(data.boqLineItems.map((_, i) => i)),
  );
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const [taskEdits, setTaskEdits] = useState(
    data.tasks.map((t) => ({
      name: t.name,
      startDate: t.startDate ?? "",
      endDate: t.endDate ?? "",
      durationDays: t.durationDays != null ? String(t.durationDays) : "",
      tradeCategory: t.tradeCategory ?? "",
    })),
  );
  const [milestoneEdits, setMilestoneEdits] = useState(
    data.milestones.map((m) => ({
      name: m.name,
      percent: m.percent != null ? String(m.percent) : "",
      amount: m.amount != null ? String(m.amount) : "",
      description: m.description ?? "",
    })),
  );
  const [boqEdits, setBoqEdits] = useState(
    data.boqLineItems.map((b) => ({
      description: b.description,
      unit: b.unit ?? "",
      quantity: b.quantity != null ? String(b.quantity) : "",
      unitPrice: b.unitPrice != null ? String(b.unitPrice) : "",
      lineTotal: b.lineTotal != null ? String(b.lineTotal) : "",
      tradeCategory: b.tradeCategory ?? "",
      drawingRef: b.drawingRef ?? "",
      note: b.note ?? "",
      confidence: b.confidence,
    })),
  );

  function buildCurrentAnalysis(): BlueprintAnalysis {
    return {
      tasks: taskEdits.filter((_, i) => selectedTasks.has(i)).map((e) => ({
        name: e.name,
        startDate: e.startDate || undefined,
        endDate: e.endDate || undefined,
        durationDays: e.durationDays ? Number(e.durationDays) : undefined,
        tradeCategory: e.tradeCategory || undefined,
      })),
      milestones: milestoneEdits.filter((_, i) => selectedMilestones.has(i)).map((e) => ({
        name: e.name,
        percent: e.percent ? Number(e.percent) : undefined,
        amount: e.amount ? Number(e.amount) : undefined,
        description: e.description || undefined,
      })),
      boqLineItems: boqEdits.filter((_, i) => selectedBoq.has(i)).map((e) => ({
        description: e.description,
        unit: e.unit || undefined,
        quantity: e.quantity ? Number(e.quantity) : undefined,
        unitPrice: e.unitPrice ? Number(e.unitPrice) : undefined,
        lineTotal: e.lineTotal ? Number(e.lineTotal) : undefined,
        tradeCategory: e.tradeCategory || undefined,
        drawingRef: e.drawingRef || undefined,
        note: e.note || undefined,
        confidence: e.confidence,
      })),
      projectSummary: data.projectSummary,
      totalEstimatedCost: data.totalEstimatedCost,
      requiresReview: false,
    };
  }

  const exportTasksCsv = () => {
    const rows = taskEdits.filter((_, i) => selectedTasks.has(i))
      .map((t) => [t.name, t.tradeCategory, t.durationDays, t.startDate, t.endDate]);
    downloadBlob("blueprint-tasks.csv",
      rowsToCsv([["שם משימה", "קטגוריה", "משך (ימים)", "תחילה", "סיום"], ...rows]),
      "text/csv");
  };

  const exportBoqCsv = () => {
    const rows = boqEdits.filter((_, i) => selectedBoq.has(i))
      .map((b) => [b.description, b.tradeCategory, b.drawingRef, b.unit, b.quantity, b.unitPrice, b.lineTotal, b.note, String(b.confidence ?? "")]);
    downloadBlob("blueprint-boq.csv",
      rowsToCsv([["תיאור", "קטגוריה", "תוכנית", "יחידה", "כמות", "מחיר/יח'", "סה\"כ", "הערות", "ביטחון"], ...rows]),
      "text/csv");
  };

  const exportExcel = async () => {
    setExportingXlsx(true);
    try {
      const res = await fetch("/api/projects/export-blueprint-excel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis: buildCurrentAnalysis(),
          projectName,
          enginesUsed,
        }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `blueprint-${projectName ?? "export"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingXlsx(false);
    }
  };

  const exportPdf = async () => {
    setExportingPdf(true);
    try {
      const res = await fetch("/api/projects/export-blueprint-pdf", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: buildCurrentAnalysis(), projectName }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `blueprint-${projectName ?? "export"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingPdf(false);
    }
  };

  const printDoc = () => setTimeout(() => window.print(), 100);

  const toggleAll = (set: Set<number>, setFn: (s: Set<number>) => void, total: number) => {
    if (set.size === total) setFn(new Set());
    else setFn(new Set(Array.from({ length: total }, (_, i) => i)));
  };

  const handleConfirm = async () => {
    setSaving(true);
    try { await onConfirm(buildCurrentAnalysis()); }
    finally { setSaving(false); }
  };

  // Live BOQ totals
  const boqTotal = boqEdits.reduce((sum, b, i) => {
    if (!selectedBoq.has(i)) return sum;
    const lt = b.lineTotal ? Number(b.lineTotal)
      : (b.quantity && b.unitPrice ? Number(b.quantity) * Number(b.unitPrice) : 0);
    return sum + lt;
  }, 0);

  const totalSelected = selectedTasks.size + selectedMilestones.size + selectedBoq.size;

  const inputCls = "rounded border border-[color:var(--border-main)]/60 bg-transparent px-1.5 py-0.5 text-xs focus:outline-none";
  const numInputCls = `${inputCls} w-20 text-left ltr`;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" dir="rtl">
      <div className="flex h-full max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] shadow-2xl">

        {/* Header */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[color:var(--border-main)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-[color:var(--foreground)]">תוצאות פענוח גרמושקה</h2>
            <p className="text-[10px] text-[color:var(--foreground-muted)]">בדוק, ערוך ובחר מה לייבא לפרויקט</p>
          </div>

          {enginesUsed && enginesUsed.length > 0 ? (
            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[9px] text-indigo-700 dark:text-indigo-300">
              {enginesUsed.join(" • ")}
            </span>
          ) : null}
          {data.requiresReview ? (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-200">
              <AlertTriangle size={10} />דורש בדיקה
            </span>
          ) : null}

          {/* Export toolbar */}
          <div className="flex items-center gap-1">
            <button type="button" title="ייצוא Excel מעוצב (4 גיליונות)" onClick={() => void exportExcel()}
              disabled={exportingXlsx}
              className="flex items-center gap-1 rounded-lg border border-emerald-600/50 bg-emerald-600/10 px-2 py-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-600/20 disabled:opacity-50 dark:text-emerald-300">
              {exportingXlsx ? <Loader2 size={12} className="animate-spin" /> : <Table2 size={13} />}
              Excel
            </button>
            <button type="button" title="CSV משימות" onClick={exportTasksCsv}
              className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-1.5 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300">
              <FileSpreadsheet size={13} />
            </button>
            <button type="button" title="CSV כתב כמויות" onClick={exportBoqCsv}
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-1.5 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300">
              <FileSpreadsheet size={13} />
            </button>
            <button type="button" title="ייצוא PDF" disabled={exportingPdf} onClick={() => void exportPdf()}
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-1.5 text-rose-700 hover:bg-rose-500/20 disabled:opacity-50 dark:text-rose-300">
              {exportingPdf ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
            </button>
            <button type="button" title="הדפסה" onClick={printDoc}
              className="rounded-lg border border-slate-500/40 bg-slate-500/10 p-1.5 text-slate-700 hover:bg-slate-500/20 dark:text-slate-300">
              <Printer size={13} />
            </button>
          </div>

          <button type="button" className="rounded-lg p-1.5 hover:bg-[color:var(--surface-elevated)]" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Project summary banner */}
        {data.projectSummary ? (
          <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-[11px] text-amber-800 dark:text-amber-200">
            {data.projectSummary}
            {data.totalEstimatedCost ? (
              <span className="ms-2 font-bold">
                · עלות משוערת: ₪{data.totalEstimatedCost.toLocaleString("he-IL")}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Body — scrollable */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">

          {/* Tasks */}
          {data.tasks.length > 0 ? (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-xs font-semibold text-[color:var(--foreground)]">משימות לגנט</h3>
                <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[9px] text-indigo-700 dark:text-indigo-200">{data.tasks.length}</span>
                <button type="button" className="mr-auto text-[9px] text-[color:var(--foreground-muted)] underline"
                  onClick={() => toggleAll(selectedTasks, setSelectedTasks, data.tasks.length)}>
                  {selectedTasks.size === data.tasks.length ? "בטל הכל" : "בחר הכל"}
                </button>
              </div>
              <div className="space-y-1.5">
                {data.tasks.map((_, i) => {
                  const edit = taskEdits[i]!;
                  const checked = selectedTasks.has(i);
                  return (
                    <div key={i}
                      className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${checked ? "border-indigo-500/40 bg-indigo-500/5" : "border-[color:var(--border-main)]/40 opacity-60"}`}>
                      <button type="button" className="mt-0.5 shrink-0 text-indigo-700 dark:text-indigo-300"
                        onClick={() => setSelectedTasks((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
                        {checked ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                      <div className="min-w-0 flex-1 space-y-1">
                        <input className={`w-full ${inputCls} focus:border-indigo-500/60`}
                          value={edit.name}
                          onChange={(e) => setTaskEdits((prev) => prev.map((t, j) => j === i ? { ...t, name: e.target.value } : t))} />
                        <div className="flex flex-wrap gap-2">
                          <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                            קטגוריה
                            <input type="text" className={`w-24 ${inputCls}`} value={edit.tradeCategory}
                              onChange={(e) => setTaskEdits((prev) => prev.map((t, j) => j === i ? { ...t, tradeCategory: e.target.value } : t))} />
                          </label>
                          <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                            משך
                            <input type="number" className={`w-12 ${inputCls} ltr text-left`} value={edit.durationDays}
                              onChange={(e) => setTaskEdits((prev) => prev.map((t, j) => j === i ? { ...t, durationDays: e.target.value } : t))} />
                            ימים
                          </label>
                          <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                            התחלה
                            <input type="date" className={`${inputCls}`} value={edit.startDate}
                              onChange={(e) => setTaskEdits((prev) => prev.map((t, j) => j === i ? { ...t, startDate: e.target.value } : t))} />
                          </label>
                          <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                            סיום
                            <input type="date" className={`${inputCls}`} value={edit.endDate}
                              onChange={(e) => setTaskEdits((prev) => prev.map((t, j) => j === i ? { ...t, endDate: e.target.value } : t))} />
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Milestones */}
          {data.milestones.length > 0 ? (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-xs font-semibold text-[color:var(--foreground)]">אבני דרך ותשלום</h3>
                <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-200">{data.milestones.length}</span>
                <button type="button" className="mr-auto text-[9px] text-[color:var(--foreground-muted)] underline"
                  onClick={() => toggleAll(selectedMilestones, setSelectedMilestones, data.milestones.length)}>
                  {selectedMilestones.size === data.milestones.length ? "בטל הכל" : "בחר הכל"}
                </button>
              </div>
              <div className="space-y-1.5">
                {data.milestones.map((_, i) => {
                  const edit = milestoneEdits[i]!;
                  const checked = selectedMilestones.has(i);
                  return (
                    <div key={i} className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${checked ? "border-amber-500/40 bg-amber-500/5" : "border-[color:var(--border-main)]/40 opacity-60"}`}>
                      <button type="button" className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"
                        onClick={() => setSelectedMilestones((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
                        {checked ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                      <div className="min-w-0 flex-1 space-y-1">
                        <input className={`w-full ${inputCls} focus:border-amber-500/60`}
                          value={edit.name}
                          onChange={(e) => setMilestoneEdits((prev) => prev.map((m, j) => j === i ? { ...m, name: e.target.value } : m))} />
                        <div className="flex flex-wrap gap-2">
                          <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                            אחוז
                            <input type="number" min={0} max={100} className={numInputCls}
                              value={edit.percent}
                              onChange={(e) => setMilestoneEdits((prev) => prev.map((m, j) => j === i ? { ...m, percent: e.target.value } : m))} />
                            %
                          </label>
                          <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                            סכום ₪
                            <input type="number" min={0} className={numInputCls}
                              value={edit.amount}
                              onChange={(e) => setMilestoneEdits((prev) => prev.map((m, j) => j === i ? { ...m, amount: e.target.value } : m))} />
                          </label>
                          <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                            תיאור
                            <input type="text" className={`w-40 ${inputCls}`}
                              value={edit.description}
                              onChange={(e) => setMilestoneEdits((prev) => prev.map((m, j) => j === i ? { ...m, description: e.target.value } : m))} />
                          </label>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* BOQ */}
          {data.boqLineItems.length > 0 ? (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-xs font-semibold text-[color:var(--foreground)]">סעיפי כתב כמויות</h3>
                <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] text-emerald-700 dark:text-emerald-200">{data.boqLineItems.length}</span>
                {boqTotal > 0 ? (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-800 dark:text-emerald-200">
                    {`סה"כ: ₪${boqTotal.toLocaleString("he-IL")}`}
                  </span>
                ) : null}
                <button type="button" className="mr-auto text-[9px] text-[color:var(--foreground-muted)] underline"
                  onClick={() => toggleAll(selectedBoq, setSelectedBoq, data.boqLineItems.length)}>
                  {selectedBoq.size === data.boqLineItems.length ? "בטל הכל" : "בחר הכל"}
                </button>
              </div>
              <div className="space-y-1.5">
                {data.boqLineItems.map((b, i) => {
                  const edit = boqEdits[i]!;
                  const checked = selectedBoq.has(i);
                  const lineTotal = edit.lineTotal
                    ? Number(edit.lineTotal)
                    : (edit.quantity && edit.unitPrice ? Number(edit.quantity) * Number(edit.unitPrice) : null);
                  return (
                    <div key={i} className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${checked ? "border-emerald-500/40 bg-emerald-500/5" : "border-[color:var(--border-main)]/40 opacity-60"}`}>
                      <button type="button" className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-300"
                        onClick={() => setSelectedBoq((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
                        {checked ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                      <div className="min-w-0 flex-1 space-y-1">
                        <input className={`w-full ${inputCls} focus:border-emerald-500/60`}
                          value={edit.description}
                          onChange={(e) => setBoqEdits((prev) => prev.map((q, j) => j === i ? { ...q, description: e.target.value } : q))} />
                        <div className="flex flex-wrap gap-2">
                          <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                            קטגוריה
                            <input type="text" className={`w-24 ${inputCls}`} value={edit.tradeCategory}
                              onChange={(e) => setBoqEdits((prev) => prev.map((q, j) => j === i ? { ...q, tradeCategory: e.target.value } : q))} />
                          </label>
                          <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                            תוכנית
                            <input type="text" className={`w-16 ${inputCls}`} value={edit.drawingRef}
                              onChange={(e) => setBoqEdits((prev) => prev.map((q, j) => j === i ? { ...q, drawingRef: e.target.value } : q))} />
                          </label>
                          <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                            יחידה
                            <input type="text" className={`w-12 ${inputCls}`} value={edit.unit}
                              onChange={(e) => setBoqEdits((prev) => prev.map((q, j) => j === i ? { ...q, unit: e.target.value } : q))} />
                          </label>
                          <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                            כמות
                            <input type="number" min={0} className={numInputCls} value={edit.quantity}
                              onChange={(e) => setBoqEdits((prev) => prev.map((q, j) => j === i ? { ...q, quantity: e.target.value } : q))} />
                          </label>
                          <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                            {`מחיר/יח'`}
                            <input type="number" min={0} className={numInputCls} value={edit.unitPrice}
                              onChange={(e) => setBoqEdits((prev) => prev.map((q, j) => j === i ? { ...q, unitPrice: e.target.value } : q))} />
                          </label>
                          {lineTotal != null && lineTotal > 0 ? (
                            <span className="flex items-center gap-0.5 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 dark:text-emerald-200">
                              ₪{lineTotal.toLocaleString("he-IL")}
                            </span>
                          ) : null}
                          <ConfidenceChip value={b.confidence} />
                        </div>
                        {edit.note ? (
                          <p className="text-[9px] text-[color:var(--foreground-muted)] italic">{edit.note}</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {data.tasks.length === 0 && data.milestones.length === 0 && data.boqLineItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-[color:var(--foreground-muted)]">לא נמצאו נתונים בגרמושקה. נסה קובץ אחר.</p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-[color:var(--border-main)] px-4 py-3">
          <span className="flex-1 text-[10px] text-[color:var(--foreground-muted)]">
            {totalSelected} פריטים נבחרו לייבוא
            {boqTotal > 0 ? ` · BOQ: ₪${boqTotal.toLocaleString("he-IL")}` : ""}
          </span>
          <button type="button" onClick={onClose} disabled={saving}
            className="rounded-lg border border-[color:var(--border-main)] px-3 py-1.5 text-xs">
            בטל
          </button>
          <button type="button" onClick={() => void handleConfirm()}
            disabled={saving || totalSelected === 0}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin" /> : null}
            אשר והזן
          </button>
        </div>
      </div>
    </div>
  );
}
