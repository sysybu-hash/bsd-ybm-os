"use client";

import { useCallback, useEffect, useState } from "react";
import { GripVertical, Loader2, Plus, X } from "lucide-react";
import { saveAppDataAction, listAppDataAction, updateAppDataColumnAction } from "@/app/actions/app-builder";
import { toast } from "sonner";
import type { AppBuilderKanbanUI } from "@/lib/validation/schemas/app-builder";

type Props = { schema: AppBuilderKanbanUI; schemaId?: string };

type Card = {
  id: string;
  columnId: string;
  data: Record<string, unknown>;
  createdAt: string;
};

const COLUMN_COLORS: Record<string, string> = {
  gray: "border-gray-500/40 bg-gray-500/5",
  blue: "border-blue-500/40 bg-blue-500/5",
  green: "border-emerald-500/40 bg-emerald-500/5",
  yellow: "border-amber-500/40 bg-amber-500/5",
  red: "border-rose-500/40 bg-rose-500/5",
  purple: "border-purple-500/40 bg-purple-500/5",
  indigo: "border-indigo-500/40 bg-indigo-500/5",
  orange: "border-orange-500/40 bg-orange-500/5",
};

function colClass(color?: string) {
  if (!color) return COLUMN_COLORS["gray"]!;
  for (const [key, cls] of Object.entries(COLUMN_COLORS)) {
    if (color.includes(key)) return cls;
  }
  return COLUMN_COLORS["gray"]!;
}

export default function DynamicKanbanRenderer({ schema, schemaId }: Props) {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const titleField = schema.cardFields[0];

  const loadCards = useCallback(async () => {
    if (!schemaId) return;
    setLoading(true);
    try {
      const res = await listAppDataAction(schemaId);
      if (res.ok) {
        const mapped: Card[] = res.rows.map((r) => {
          const d = r.data as Record<string, unknown>;
          return {
            id: r.id,
            columnId: String(d["_columnId"] ?? schema.columns[0]?.id ?? ""),
            data: d,
            createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
          };
        });
        setCards(mapped);
      }
    } finally {
      setLoading(false);
    }
  }, [schemaId, schema.columns]);

  useEffect(() => { void loadCards(); }, [loadCards]);

  const openAddForm = (colId: string) => {
    setAddingTo(colId);
    setForm(Object.fromEntries(schema.cardFields.map((f) => [f.name, ""])));
  };

  const handleSave = async () => {
    if (!schemaId || !addingTo) {
      toast.error("שמרו את האפליקציה תחילה");
      return;
    }
    setSaving(true);
    try {
      const formData: Record<string, unknown> = { _columnId: addingTo };
      for (const f of schema.cardFields) {
        formData[f.name] = form[f.name] ?? "";
      }
      const res = await saveAppDataAction({ schemaId, formData });
      if (res.ok) {
        await loadCards();
        setAddingTo(null);
        toast.success("כרטיסייה נוספה ✓");
      } else {
        toast.error(res.error ?? "שמירה נכשלה");
      }
    } finally {
      setSaving(false);
    }
  };

  const moveCard = async (card: Card, toColId: string) => {
    if (!schemaId || card.columnId === toColId) return;
    const fromColId = card.columnId;
    // Optimistic update
    setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, columnId: toColId } : c));
    try {
      const res = await updateAppDataColumnAction({ schemaId, dataId: card.id, columnId: toColId });
      if (!res.ok) {
        // Rollback on failure
        setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, columnId: fromColId } : c));
        toast.error(res.error ?? "העברה נכשלה");
      }
    } catch {
      setCards((prev) => prev.map((c) => c.id === card.id ? { ...c, columnId: fromColId } : c));
      toast.error("העברה נכשלה");
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-[color:var(--foreground-main)]">{schema.title}</h2>
        {loading && <Loader2 size={14} className="animate-spin text-[color:var(--foreground-muted)]" />}
      </div>

      {/* Board */}
      <div className="flex min-h-[300px] gap-3 overflow-x-auto pb-2">
        {schema.columns.map((col) => {
          const colCards = cards.filter((c) => c.columnId === col.id);
          return (
            <div
              key={col.id}
              className={`flex min-w-[200px] max-w-[240px] flex-shrink-0 flex-col gap-2 rounded-xl border p-2 ${colClass(col.color)}`}
            >
              {/* Column header */}
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-[color:var(--foreground-main)]">{col.label}</span>
                <span className="rounded-full bg-[color:var(--surface-soft)] px-1.5 py-0.5 text-[10px] text-[color:var(--foreground-muted)]">
                  {colCards.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex flex-col gap-1.5">
                {colCards.map((card) => (
                  <div
                    key={card.id}
                    className="group rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-2 shadow-sm"
                  >
                    <p className="text-xs font-semibold text-[color:var(--foreground-main)] line-clamp-2">
                      {String(card.data[titleField?.name ?? ""] ?? "—")}
                    </p>
                    {schema.cardFields.slice(1).map((f) => {
                      const val = card.data[f.name];
                      if (!val) return null;
                      return (
                        <p key={f.name} className="mt-0.5 text-[10px] text-[color:var(--foreground-muted)]">
                          {f.label}: {String(val)}
                        </p>
                      );
                    })}
                    {/* Move buttons */}
                    <div className="mt-1.5 hidden flex-wrap gap-1 group-hover:flex">
                      {schema.columns
                        .filter((c) => c.id !== col.id)
                        .map((target) => (
                          <button
                            key={target.id}
                            type="button"
                            onClick={() => void moveCard(card, target.id)}
                            className="flex items-center gap-0.5 rounded border border-[color:var(--border-main)] px-1.5 py-0.5 text-[9px] font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                          >
                            <GripVertical size={8} />
                            {target.label}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add card */}
              {addingTo === col.id ? (
                <div className="flex flex-col gap-1.5 rounded-lg border border-indigo-500/30 bg-[color:var(--surface-card)] p-2">
                  {schema.cardFields.map((f) => (
                    <div key={f.name}>
                      <label className="text-[10px] font-medium text-[color:var(--foreground-muted)]">{f.label}</label>
                      {f.type === "textarea" ? (
                        <textarea
                          value={form[f.name] ?? ""}
                          onChange={(e) => setForm((p) => ({ ...p, [f.name]: e.target.value }))}
                          rows={2}
                          className="mt-0.5 w-full rounded border border-[color:var(--border-main)] bg-transparent px-2 py-1 text-xs focus:outline-none"
                        />
                      ) : f.type === "select" ? (
                        <select
                          value={form[f.name] ?? ""}
                          onChange={(e) => setForm((p) => ({ ...p, [f.name]: e.target.value }))}
                          className="mt-0.5 w-full rounded border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-1 text-xs focus:outline-none"
                        >
                          <option value="">בחר…</option>
                          {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                          value={form[f.name] ?? ""}
                          onChange={(e) => setForm((p) => ({ ...p, [f.name]: e.target.value }))}
                          className="mt-0.5 w-full rounded border border-[color:var(--border-main)] bg-transparent px-2 py-1 text-xs focus:outline-none"
                        />
                      )}
                    </div>
                  ))}
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={saving}
                      className="flex-1 rounded bg-indigo-600 py-1.5 text-[10px] font-bold text-white disabled:opacity-60"
                    >
                      {saving ? "…" : "הוסף"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddingTo(null)}
                      className="rounded border border-[color:var(--border-main)] p-1.5 text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                    >
                      <X size={10} />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openAddForm(col.id)}
                  className="flex items-center gap-1 rounded-lg border border-dashed border-[color:var(--border-main)] px-2 py-1.5 text-[11px] text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)]"
                >
                  <Plus size={11} /> הוסף כרטיסייה
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!schemaId && (
        <p className="text-xs text-[color:var(--foreground-muted)]">שמרו את האפליקציה כדי להתחיל להוסיף כרטיסיות</p>
      )}
    </div>
  );
}
