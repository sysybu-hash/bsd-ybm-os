"use client";

import React, { useState } from "react";
import { CheckSquare, Square, X, Loader2, AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import type { BlueprintAnalysis } from "@/lib/projects/blueprint-analysis-schema";

type Props = {
  data: BlueprintAnalysis;
  onConfirm: (selected: BlueprintAnalysis) => Promise<void>;
  onClose: () => void;
};

function ConfidenceChip({ value }: { value?: number }) {
  if (value === undefined) return null;
  if (value >= 0.8) return (
    <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] text-emerald-200">
      <CheckCircle2 size={9} />דיוק גבוה
    </span>
  );
  if (value >= 0.5) return (
    <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-200">
      <Circle size={9} />דיוק בינוני
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] text-rose-300">
      <AlertTriangle size={9} />בדוק בעצמך
    </span>
  );
}

export default function BlueprintPreviewModal({ data, onConfirm, onClose }: Props) {
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

  // Editable task fields
  const [taskEdits, setTaskEdits] = useState(
    data.tasks.map((t) => ({ name: t.name, startDate: t.startDate ?? "", endDate: t.endDate ?? "" })),
  );

  const toggleAll = (set: Set<number>, setFn: (s: Set<number>) => void, total: number) => {
    if (set.size === total) setFn(new Set());
    else setFn(new Set(Array.from({ length: total }, (_, i) => i)));
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm({
        tasks: taskEdits
          .filter((_, i) => selectedTasks.has(i))
          .map((e) => ({ name: e.name, startDate: e.startDate || undefined, endDate: e.endDate || undefined })),
        milestones: data.milestones.filter((_, i) => selectedMilestones.has(i)),
        boqLineItems: data.boqLineItems.filter((_, i) => selectedBoq.has(i)),
        requiresReview: false,
      });
    } finally {
      setSaving(false);
    }
  };

  const totalSelected = selectedTasks.size + selectedMilestones.size + selectedBoq.size;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm" dir="rtl">
      <div className="flex h-full max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-[color:var(--border-main)] px-4 py-3">
          <div className="flex-1">
            <h2 className="text-sm font-bold text-[color:var(--foreground)]">תוצאות פענוח גרמושקה</h2>
            <p className="text-[10px] text-[color:var(--foreground-muted)]">בדוק, ערוך ובחר מה לייבא לפרויקט</p>
          </div>
          {data.requiresReview ? (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-200">
              <AlertTriangle size={10} />דורש בדיקה
            </span>
          ) : null}
          <button type="button" className="rounded-lg p-1.5 hover:bg-[color:var(--surface-elevated)]" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">

          {/* Tasks */}
          {data.tasks.length > 0 ? (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-xs font-semibold text-[color:var(--foreground)]">משימות לגנט</h3>
                <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[9px] text-indigo-200">{data.tasks.length}</span>
                <button
                  type="button"
                  className="mr-auto text-[9px] text-[color:var(--foreground-muted)] underline"
                  onClick={() => toggleAll(selectedTasks, setSelectedTasks, data.tasks.length)}
                >
                  {selectedTasks.size === data.tasks.length ? "בטל הכל" : "בחר הכל"}
                </button>
              </div>
              <div className="space-y-1.5">
                {data.tasks.map((_, i) => {
                  const edit = taskEdits[i]!;
                  const checked = selectedTasks.has(i);
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${checked ? "border-indigo-500/40 bg-indigo-500/5" : "border-[color:var(--border-main)]/40 opacity-60"}`}
                    >
                      <button
                        type="button"
                        className="mt-0.5 shrink-0 text-indigo-300"
                        onClick={() => setSelectedTasks((prev) => {
                          const n = new Set(prev);
                          if (n.has(i)) n.delete(i); else n.add(i);
                          return n;
                        })}
                      >
                        {checked ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                      <div className="min-w-0 flex-1 space-y-1">
                        <input
                          className="w-full rounded border border-[color:var(--border-main)]/60 bg-transparent px-1.5 py-0.5 text-xs focus:border-indigo-500/60 focus:outline-none"
                          value={edit.name}
                          onChange={(e) => setTaskEdits((prev) => prev.map((t, j) => j === i ? { ...t, name: e.target.value } : t))}
                        />
                        <div className="flex gap-2">
                          <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                            התחלה
                            <input type="date" className="rounded border border-[color:var(--border-main)]/40 bg-transparent px-1 text-[9px]"
                              value={edit.startDate}
                              onChange={(e) => setTaskEdits((prev) => prev.map((t, j) => j === i ? { ...t, startDate: e.target.value } : t))}
                            />
                          </label>
                          <label className="flex items-center gap-1 text-[9px] text-[color:var(--foreground-muted)]">
                            סיום
                            <input type="date" className="rounded border border-[color:var(--border-main)]/40 bg-transparent px-1 text-[9px]"
                              value={edit.endDate}
                              onChange={(e) => setTaskEdits((prev) => prev.map((t, j) => j === i ? { ...t, endDate: e.target.value } : t))}
                            />
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
                <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] text-amber-200">{data.milestones.length}</span>
                <button
                  type="button"
                  className="mr-auto text-[9px] text-[color:var(--foreground-muted)] underline"
                  onClick={() => toggleAll(selectedMilestones, setSelectedMilestones, data.milestones.length)}
                >
                  {selectedMilestones.size === data.milestones.length ? "בטל הכל" : "בחר הכל"}
                </button>
              </div>
              <div className="space-y-1">
                {data.milestones.map((m, i) => {
                  const checked = selectedMilestones.has(i);
                  return (
                    <div key={i} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${checked ? "border-amber-500/40 bg-amber-500/5" : "border-[color:var(--border-main)]/40 opacity-60"}`}>
                      <button type="button" className="shrink-0 text-amber-300"
                        onClick={() => setSelectedMilestones((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
                        {checked ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                      <span className="flex-1 truncate">{m.name}</span>
                      <span className="shrink-0 font-mono text-amber-200">
                        {"percent" in m && m.percent != null
                          ? `${m.percent}%`
                          : typeof m.amount === "number" && m.amount > 0 && m.amount <= 100
                            ? `${m.amount}%`
                            : typeof m.amount === "number"
                              ? m.amount.toLocaleString("he-IL", {
                                  style: "currency",
                                  currency: "ILS",
                                  maximumFractionDigits: 0,
                                })
                              : String(m.amount ?? "—")}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* BOQ line items */}
          {data.boqLineItems.length > 0 ? (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-xs font-semibold text-[color:var(--foreground)]">סעיפי כתב כמויות</h3>
                <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] text-emerald-200">{data.boqLineItems.length}</span>
                <button
                  type="button"
                  className="mr-auto text-[9px] text-[color:var(--foreground-muted)] underline"
                  onClick={() => toggleAll(selectedBoq, setSelectedBoq, data.boqLineItems.length)}
                >
                  {selectedBoq.size === data.boqLineItems.length ? "בטל הכל" : "בחר הכל"}
                </button>
              </div>
              <div className="space-y-1">
                {data.boqLineItems.map((b, i) => {
                  const checked = selectedBoq.has(i);
                  return (
                    <div key={i} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${checked ? "border-emerald-500/40 bg-emerald-500/5" : "border-[color:var(--border-main)]/40 opacity-60"}`}>
                      <button type="button" className="shrink-0 text-emerald-300"
                        onClick={() => setSelectedBoq((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; })}>
                        {checked ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                      <span className="min-w-0 flex-1 truncate">{b.description}</span>
                      {b.quantity ? (
                        <span className="shrink-0 text-[10px] text-[color:var(--foreground-muted)]">
                          {b.quantity} {b.unit ?? ""}
                        </span>
                      ) : null}
                      <ConfidenceChip value={b.confidence} />
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
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[color:var(--border-main)] px-3 py-1.5 text-xs"
            disabled={saving}
          >
            בטל
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={saving || totalSelected === 0}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : null}
            אשר והזן
          </button>
        </div>
      </div>
    </div>
  );
}
