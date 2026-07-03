"use client";

import React from "react";
import {
  X, Loader2, AlertTriangle, FileSpreadsheet, FileText, Printer, Table2,
} from "lucide-react";
import type { BlueprintAnalysis } from "@/lib/projects/blueprint-analysis-schema";
import { useBlueprintPreviewState } from "./blueprint-preview/useBlueprintPreviewState";
import { TasksSection, MilestonesSection, BoqSection } from "./blueprint-preview/BlueprintSections";

type Props = {
  data: BlueprintAnalysis;
  enginesUsed?: string[];
  projectName?: string;
  onConfirm: (selected: BlueprintAnalysis) => Promise<void>;
  onClose: () => void;
};

export default function BlueprintPreviewModal({ data, enginesUsed, projectName, onConfirm, onClose }: Props) {
  const s = useBlueprintPreviewState({ data, projectName, enginesUsed, onConfirm });

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
            <button type="button" title="ייצוא Excel מעוצב (4 גיליונות)" onClick={() => void s.exportExcel()}
              disabled={s.exportingXlsx}
              className="flex items-center gap-1 rounded-lg border border-emerald-600/50 bg-emerald-600/10 px-2 py-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-600/20 disabled:opacity-50 dark:text-emerald-300">
              {s.exportingXlsx ? <Loader2 size={12} className="animate-spin" /> : <Table2 size={13} />}
              Excel
            </button>
            <button type="button" title="CSV משימות" onClick={s.exportTasksCsv}
              className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-1.5 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300">
              <FileSpreadsheet size={13} />
            </button>
            <button type="button" title="CSV כתב כמויות" onClick={s.exportBoqCsv}
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-1.5 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300">
              <FileSpreadsheet size={13} />
            </button>
            <button type="button" title="ייצוא PDF" disabled={s.exportingPdf} onClick={() => void s.exportPdf()}
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-1.5 text-rose-700 hover:bg-rose-500/20 disabled:opacity-50 dark:text-rose-300">
              {s.exportingPdf ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
            </button>
            <button type="button" title="הדפסה" onClick={s.printDoc}
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
          <TasksSection data={data} s={s} />
          <MilestonesSection data={data} s={s} />
          <BoqSection data={data} s={s} />

          {data.tasks.length === 0 && data.milestones.length === 0 && data.boqLineItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-[color:var(--foreground-muted)]">לא נמצאו נתונים בגרמושקה. נסה קובץ אחר.</p>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-[color:var(--border-main)] px-4 py-3">
          <span className="flex-1 text-[10px] text-[color:var(--foreground-muted)]">
            {s.totalSelected} פריטים נבחרו לייבוא
            {s.boqTotal > 0 ? ` · BOQ: ₪${s.boqTotal.toLocaleString("he-IL")}` : ""}
          </span>
          <button type="button" onClick={onClose} disabled={s.saving}
            className="rounded-lg border border-[color:var(--border-main)] px-3 py-1.5 text-xs">
            בטל
          </button>
          <button type="button" onClick={() => void s.handleConfirm()}
            disabled={s.saving || s.totalSelected === 0}
            className="flex items-center gap-1.5 rounded-lg bg-[color:var(--win-accent,#6366f1)] px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {s.saving ? <Loader2 size={12} className="animate-spin" /> : null}
            אשר והזן
          </button>
        </div>
      </div>
    </div>
  );
}
