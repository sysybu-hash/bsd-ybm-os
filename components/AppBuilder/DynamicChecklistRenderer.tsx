"use client";

import { useState } from "react";
import { CheckCircle2, Circle, ClipboardCheck, RotateCcw } from "lucide-react";
import { saveAppDataAction } from "@/app/actions/app-builder";
import { toast } from "sonner";
import type { AppBuilderChecklistUI } from "@/lib/validation/schemas/app-builder";

type Props = {
  schema: AppBuilderChecklistUI;
  schemaId?: string;
};

type ItemState = {
  checked: boolean;
  note: string;
};

export default function DynamicChecklistRenderer({ schema, schemaId }: Props) {
  const [items, setItems] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(schema.items.map((i) => [i.id, { checked: false, note: "" }])),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const checkedCount = Object.values(items).filter((v) => v.checked).length;
  const total = schema.items.length;
  const progress = total > 0 ? Math.round((checkedCount / total) * 100) : 0;
  const allRequired = schema.items
    .filter((i) => i.required)
    .every((i) => items[i.id]?.checked);

  const toggle = (id: string) =>
    setItems((prev) => ({
      ...prev,
      [id]: { ...prev[id]!, checked: !prev[id]!.checked },
    }));

  const setNote = (id: string, note: string) =>
    setItems((prev) => ({ ...prev, [id]: { ...prev[id]!, note } }));

  const handleReset = () => {
    setItems(Object.fromEntries(schema.items.map((i) => [i.id, { checked: false, note: "" }])));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!schemaId) {
      toast.error("שמרו את האפליקציה לפני שמירת ביצוע הצ'ק-ליסט");
      return;
    }
    setSaving(true);
    try {
      const formData: Record<string, unknown> = { completedAt: new Date().toISOString() };
      for (const item of schema.items) {
        formData[`${item.id}_checked`] = items[item.id]?.checked ?? false;
        if (items[item.id]?.note) formData[`${item.id}_note`] = items[item.id]!.note;
      }
      const res = await saveAppDataAction({ schemaId, formData });
      if (res.ok) {
        setSaved(true);
        toast.success("הצ'ק-ליסט נשמר בהצלחה ✓");
      } else {
        toast.error(res.error ?? "שמירה נכשלה");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 shrink-0 text-indigo-400" aria-hidden />
          <div>
            <h2 className="text-base font-bold text-[color:var(--foreground-main)]">{schema.title}</h2>
            {schema.description ? (
              <p className="text-xs text-[color:var(--foreground-muted)]">{schema.description}</p>
            ) : null}
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-bold text-indigo-300">
          {checkedCount}/{total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--surface-soft)]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            progress === 100 ? "bg-emerald-500" : "bg-indigo-500"
          }`}
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>

      {/* Items */}
      <ul className="flex flex-col gap-2">
        {schema.items.map((item) => {
          const state = items[item.id] ?? { checked: false, note: "" };
          return (
            <li key={item.id} className={`rounded-xl border transition-colors ${
              state.checked
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-[color:var(--border-main)] bg-[color:var(--surface-card)]"
            }`}>
              <button
                type="button"
                className="flex w-full items-start gap-3 p-3 text-start"
                onClick={() => toggle(item.id)}
              >
                {state.checked ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--foreground-muted)]" aria-hidden />
                )}
                <span className={`flex-1 text-sm ${state.checked ? "text-[color:var(--foreground-muted)] line-through" : "text-[color:var(--foreground-main)]"}`}>
                  {item.label}
                  {item.required && !state.checked ? (
                    <span className="ms-1 text-[10px] font-bold text-rose-400">*חובה</span>
                  ) : null}
                </span>
              </button>
              {item.allowNote && (
                <div className="border-t border-[color:var(--border-main)]/50 px-3 pb-2">
                  <input
                    type="text"
                    value={state.note}
                    onChange={(e) => setNote(item.id, e.target.value)}
                    placeholder="הוסף הערה…"
                    className="w-full bg-transparent py-1 text-xs text-[color:var(--foreground-muted)] placeholder:text-[color:var(--foreground-muted)]/50 focus:outline-none"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1.5 rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)]"
        >
          <RotateCcw size={12} aria-hidden />
          אפס
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || saved || !allRequired}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "שומר…" : saved ? "✓ נשמר" : "שמור ביצוע"}
        </button>
      </div>
      {!allRequired && (
        <p className="text-[10px] text-rose-400">יש לסמן את כל הפריטים החובה לפני שמירה</p>
      )}
    </div>
  );
}
