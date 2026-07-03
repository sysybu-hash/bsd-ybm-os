"use client";

import React from "react";
import { CheckSquare, Square, AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import type { BlueprintAnalysis } from "@/lib/projects/blueprint-analysis-schema";
import type { BlueprintPreviewState } from "./useBlueprintPreviewState";

const inputCls = "rounded border border-[color:var(--border-main)]/60 bg-transparent px-1.5 py-0.5 text-xs focus:outline-none";
const numInputCls = `${inputCls} w-20 text-left ltr`;

export function ConfidenceChip({ value }: { value?: number }) {
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

function toggleIndex(setFn: React.Dispatch<React.SetStateAction<Set<number>>>, i: number) {
  setFn((prev) => {
    const n = new Set(prev);
    if (n.has(i)) n.delete(i);
    else n.add(i);
    return n;
  });
}

type SectionsProps = { data: BlueprintAnalysis; s: BlueprintPreviewState };

export function TasksSection({ data, s }: SectionsProps) {
  if (data.tasks.length === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold text-[color:var(--foreground)]">משימות לגנט</h3>
        <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[9px] text-indigo-700 dark:text-indigo-200">{data.tasks.length}</span>
        <button type="button" className="mr-auto text-[9px] text-[color:var(--foreground-muted)] underline"
          onClick={() => s.toggleAll(s.selectedTasks, s.setSelectedTasks, data.tasks.length)}>
          {s.selectedTasks.size === data.tasks.length ? "בטל הכל" : "בחר הכל"}
        </button>
      </div>
      <div className="space-y-1.5">
        {data.tasks.map((_, i) => {
          const edit = s.taskEdits[i]!;
          const checked = s.selectedTasks.has(i);
          return (
            <div key={i}
              className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${checked ? "border-indigo-500/40 bg-indigo-500/5" : "border-[color:var(--border-main)]/40 opacity-60"}`}>
              <button type="button" className="mt-0.5 shrink-0 text-indigo-700 dark:text-indigo-300"
                onClick={() => toggleIndex(s.setSelectedTasks, i)}>
                {checked ? <CheckSquare size={14} /> : <Square size={14} />}
              </button>
              <div className="min-w-0 flex-1 space-y-1">
                <input className={`w-full ${inputCls} focus:border-indigo-500/60`}
                  value={edit.name}
                  onChange={(e) => s.setTaskEdits((prev) => prev.map((t, j) => j === i ? { ...t, name: e.target.value } : t))} />
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                    קטגוריה
                    <input type="text" className={`w-24 ${inputCls}`} value={edit.tradeCategory}
                      onChange={(e) => s.setTaskEdits((prev) => prev.map((t, j) => j === i ? { ...t, tradeCategory: e.target.value } : t))} />
                  </label>
                  <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                    משך
                    <input type="number" className={`w-12 ${inputCls} ltr text-left`} value={edit.durationDays}
                      onChange={(e) => s.setTaskEdits((prev) => prev.map((t, j) => j === i ? { ...t, durationDays: e.target.value } : t))} />
                    ימים
                  </label>
                  <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                    התחלה
                    <input type="date" className={inputCls} value={edit.startDate}
                      onChange={(e) => s.setTaskEdits((prev) => prev.map((t, j) => j === i ? { ...t, startDate: e.target.value } : t))} />
                  </label>
                  <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                    סיום
                    <input type="date" className={inputCls} value={edit.endDate}
                      onChange={(e) => s.setTaskEdits((prev) => prev.map((t, j) => j === i ? { ...t, endDate: e.target.value } : t))} />
                  </label>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function MilestonesSection({ data, s }: SectionsProps) {
  if (data.milestones.length === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold text-[color:var(--foreground)]">אבני דרך ותשלום</h3>
        <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-200">{data.milestones.length}</span>
        <button type="button" className="mr-auto text-[9px] text-[color:var(--foreground-muted)] underline"
          onClick={() => s.toggleAll(s.selectedMilestones, s.setSelectedMilestones, data.milestones.length)}>
          {s.selectedMilestones.size === data.milestones.length ? "בטל הכל" : "בחר הכל"}
        </button>
      </div>
      <div className="space-y-1.5">
        {data.milestones.map((_, i) => {
          const edit = s.milestoneEdits[i]!;
          const checked = s.selectedMilestones.has(i);
          return (
            <div key={i} className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${checked ? "border-amber-500/40 bg-amber-500/5" : "border-[color:var(--border-main)]/40 opacity-60"}`}>
              <button type="button" className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"
                onClick={() => toggleIndex(s.setSelectedMilestones, i)}>
                {checked ? <CheckSquare size={14} /> : <Square size={14} />}
              </button>
              <div className="min-w-0 flex-1 space-y-1">
                <input className={`w-full ${inputCls} focus:border-amber-500/60`}
                  value={edit.name}
                  onChange={(e) => s.setMilestoneEdits((prev) => prev.map((m, j) => j === i ? { ...m, name: e.target.value } : m))} />
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                    אחוז
                    <input type="number" min={0} max={100} className={numInputCls}
                      value={edit.percent}
                      onChange={(e) => s.setMilestoneEdits((prev) => prev.map((m, j) => j === i ? { ...m, percent: e.target.value } : m))} />
                    %
                  </label>
                  <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                    סכום ₪
                    <input type="number" min={0} className={numInputCls}
                      value={edit.amount}
                      onChange={(e) => s.setMilestoneEdits((prev) => prev.map((m, j) => j === i ? { ...m, amount: e.target.value } : m))} />
                  </label>
                  <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                    תיאור
                    <input type="text" className={`w-40 ${inputCls}`}
                      value={edit.description}
                      onChange={(e) => s.setMilestoneEdits((prev) => prev.map((m, j) => j === i ? { ...m, description: e.target.value } : m))} />
                  </label>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function BoqSection({ data, s }: SectionsProps) {
  if (data.boqLineItems.length === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-xs font-semibold text-[color:var(--foreground)]">סעיפי כתב כמויות</h3>
        <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] text-emerald-700 dark:text-emerald-200">{data.boqLineItems.length}</span>
        {s.boqTotal > 0 ? (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-800 dark:text-emerald-200">
            {`סה"כ: ₪${s.boqTotal.toLocaleString("he-IL")}`}
          </span>
        ) : null}
        <button type="button" className="mr-auto text-[9px] text-[color:var(--foreground-muted)] underline"
          onClick={() => s.toggleAll(s.selectedBoq, s.setSelectedBoq, data.boqLineItems.length)}>
          {s.selectedBoq.size === data.boqLineItems.length ? "בטל הכל" : "בחר הכל"}
        </button>
      </div>
      <div className="space-y-1.5">
        {data.boqLineItems.map((b, i) => {
          const edit = s.boqEdits[i]!;
          const checked = s.selectedBoq.has(i);
          const lineTotal = edit.lineTotal
            ? Number(edit.lineTotal)
            : (edit.quantity && edit.unitPrice ? Number(edit.quantity) * Number(edit.unitPrice) : null);
          return (
            <div key={i} className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${checked ? "border-emerald-500/40 bg-emerald-500/5" : "border-[color:var(--border-main)]/40 opacity-60"}`}>
              <button type="button" className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-300"
                onClick={() => toggleIndex(s.setSelectedBoq, i)}>
                {checked ? <CheckSquare size={14} /> : <Square size={14} />}
              </button>
              <div className="min-w-0 flex-1 space-y-1">
                <input className={`w-full ${inputCls} focus:border-emerald-500/60`}
                  value={edit.description}
                  onChange={(e) => s.setBoqEdits((prev) => prev.map((q, j) => j === i ? { ...q, description: e.target.value } : q))} />
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                    קטגוריה
                    <input type="text" className={`w-24 ${inputCls}`} value={edit.tradeCategory}
                      onChange={(e) => s.setBoqEdits((prev) => prev.map((q, j) => j === i ? { ...q, tradeCategory: e.target.value } : q))} />
                  </label>
                  <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                    תוכנית
                    <input type="text" className={`w-16 ${inputCls}`} value={edit.drawingRef}
                      onChange={(e) => s.setBoqEdits((prev) => prev.map((q, j) => j === i ? { ...q, drawingRef: e.target.value } : q))} />
                  </label>
                  <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                    יחידה
                    <input type="text" className={`w-12 ${inputCls}`} value={edit.unit}
                      onChange={(e) => s.setBoqEdits((prev) => prev.map((q, j) => j === i ? { ...q, unit: e.target.value } : q))} />
                  </label>
                  <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                    כמות
                    <input type="number" min={0} className={numInputCls} value={edit.quantity}
                      onChange={(e) => s.setBoqEdits((prev) => prev.map((q, j) => j === i ? { ...q, quantity: e.target.value } : q))} />
                  </label>
                  <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                    {`מחיר/יח'`}
                    <input type="number" min={0} className={numInputCls} value={edit.unitPrice}
                      onChange={(e) => s.setBoqEdits((prev) => prev.map((q, j) => j === i ? { ...q, unitPrice: e.target.value } : q))} />
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
  );
}
