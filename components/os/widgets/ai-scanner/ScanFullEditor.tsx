"use client";

/**
 * עורך תוצאות סריקה מלא — שלב 4 באפיון.
 *
 * מחליף את ScanConfirmPanel (4 שדות) בעריכה מלאה:
 *  - שדות כותרת: ספק, ח"פ, סה"כ, תאריך, סוג מסמך, סיכום
 *  - שורות פריטים (lineItems): עריכה, הוספה, מחיקה
 *  - BOQ (billOfQuantities): עריכה, הוספה, מחיקה (לסוגי בנייה)
 *
 * עובד עם ScanExtractionV5 ישירות ומסנכרן חזרה ל-DocumentAnalysis דרך onChange.
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  CheckCircle2, ChevronDown, ChevronUp, Plus, Save, Trash2, X,
} from "lucide-react";
import type { DocumentAnalysis } from "./types";
import type { LineItemV5, BillOfQuantityRowV5, ScanExtractionV5 } from "@/lib/scan-schema-v5";

// ── helpers ──────────────────────────────────────────────────────────────────

function emptyLineItem(): LineItemV5 {
  return { description: "", quantity: undefined, unitPrice: undefined, lineTotal: undefined };
}

function emptyBoqRow(): BillOfQuantityRowV5 {
  return {
    itemRef: null, description: "", material: null,
    dimensions: null, mepPoints: null, quantity: null, unit: null, notes: null,
  };
}

const BOQ_MODES = new Set(["DRAWING_BOQ", "QUOTE_BOQ", "PROGRESS_BILL", "SITE_LOG"]);

function computeLineTotal(qty?: number, up?: number, lt?: number): number {
  if (lt != null && lt > 0) return lt;
  if (qty != null && up != null) return qty * up;
  return 0;
}

// ── sub-components ───────────────────────────────────────────────────────────

function HeaderFields({
  v5, onChange,
}: {
  v5: ScanExtractionV5;
  onChange: (patch: Partial<ScanExtractionV5>) => void;
}) {
  const field = (label: string, node: React.ReactNode) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold text-[color:var(--foreground-muted)]">{label}</span>
      {node}
    </label>
  );
  const inp = "rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-1.5 text-xs";

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {field("ספק", (
        <input className={inp} value={v5.vendor} onChange={(e) => onChange({ vendor: e.target.value })} />
      ))}
      {field('ח"פ / ע"מ', (
        <input className={inp} value={v5.taxId ?? ""} onChange={(e) => onChange({ taxId: e.target.value || null })} />
      ))}
      {field("סה״כ", (
        <input type="number" className={`${inp} font-mono`} value={v5.total}
          onChange={(e) => onChange({ total: parseFloat(e.target.value) || 0 })} />
      ))}
      {field("תאריך", (
        <input type="date" className={inp} value={v5.date ?? ""}
          onChange={(e) => onChange({ date: e.target.value || null })} />
      ))}
      {field("סוג מסמך", (
        <input className={inp} value={v5.docType}
          onChange={(e) => onChange({ docType: e.target.value })} />
      ))}
      {field("פרויקט", (
        <input className={inp} value={v5.documentMetadata.project ?? ""}
          onChange={(e) => onChange({ documentMetadata: { ...v5.documentMetadata, project: e.target.value || null } })} />
      ))}
    </div>
  );
}

function LineItemsEditor({
  items, onChange,
}: {
  items: LineItemV5[];
  onChange: (items: LineItemV5[]) => void;
}) {
  const update = (i: number, patch: Partial<LineItemV5>) => {
    const next = items.map((row, idx) => idx === i ? { ...row, ...patch } : row);
    onChange(next);
  };
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, emptyLineItem()]);

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-dashed border-[color:var(--border-main)] px-3 py-2">
        <span className="text-xs text-[color:var(--foreground-muted)]">אין שורות פריטים</span>
        <button type="button" onClick={add}
          className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-indigo-500">
          <Plus size={11} /> הוסף שורה
        </button>
      </div>
    );
  }

  const cell = "border border-[color:var(--border-main)] rounded px-1.5 py-1 text-[11px] w-full";

  return (
    <div className="space-y-1">
      {/* header row */}
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-1 text-[9px] font-bold uppercase text-[color:var(--foreground-muted)] px-0.5">
        <span>תיאור</span><span>כמות</span><span>מחיר יחידה</span><span>סה״כ שורה</span><span />
      </div>
      {items.map((row, i) => {
        const implied = computeLineTotal(row.quantity, row.unitPrice, row.lineTotal);
        return (
          <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-1 items-center">
            <input className={cell} value={row.description}
              onChange={(e) => update(i, { description: e.target.value })}
              placeholder="תיאור הפריט" />
            <input type="number" className={`${cell} font-mono`} value={row.quantity ?? ""}
              onChange={(e) => update(i, { quantity: parseFloat(e.target.value) || undefined })}
              placeholder="כמות" />
            <input type="number" className={`${cell} font-mono`} value={row.unitPrice ?? ""}
              onChange={(e) => {
                const up = parseFloat(e.target.value) || undefined;
                const lt = up != null && row.quantity != null ? up * row.quantity : row.lineTotal;
                update(i, { unitPrice: up, lineTotal: lt });
              }}
              placeholder="מחיר" />
            <span className={`${cell} font-mono bg-[color:var(--surface-soft)]/50 text-end`}>
              {implied > 0 ? implied.toLocaleString("he-IL", { maximumFractionDigits: 2 }) : "—"}
            </span>
            <button type="button" onClick={() => remove(i)}
              className="flex items-center justify-center rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
              <Trash2 size={12} />
            </button>
          </div>
        );
      })}
      <button type="button" onClick={add}
        className="flex items-center gap-1 rounded-lg border border-dashed border-indigo-400/50 px-3 py-1.5 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50/60 dark:text-indigo-400 dark:hover:bg-indigo-900/10">
        <Plus size={11} /> הוסף שורה
      </button>
    </div>
  );
}

function BoqEditor({
  rows, onChange,
}: {
  rows: BillOfQuantityRowV5[];
  onChange: (rows: BillOfQuantityRowV5[]) => void;
}) {
  const update = (i: number, patch: Partial<BillOfQuantityRowV5>) =>
    onChange(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, emptyBoqRow()]);

  const cell = "border border-[color:var(--border-main)] rounded px-1.5 py-1 text-[11px] w-full";

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[auto_2fr_1fr_1fr_auto] gap-1 text-[9px] font-bold uppercase text-[color:var(--foreground-muted)] px-0.5">
        <span>סעיף</span><span>תיאור</span><span>כמות</span><span>יחידה</span><span />
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[auto_2fr_1fr_1fr_auto] gap-1 items-center">
          <input className={`${cell} w-14`} value={row.itemRef ?? ""}
            onChange={(e) => update(i, { itemRef: e.target.value || null })}
            placeholder="סעיף" />
          <input className={cell} value={row.description}
            onChange={(e) => update(i, { description: e.target.value })}
            placeholder="תיאור" />
          <input type="number" className={`${cell} font-mono`} value={row.quantity ?? ""}
            onChange={(e) => update(i, { quantity: parseFloat(e.target.value) || null })}
            placeholder="כמות" />
          <input className={cell} value={row.unit ?? ""}
            onChange={(e) => update(i, { unit: e.target.value || null })}
            placeholder="יח׳" />
          <button type="button" onClick={() => remove(i)}
            className="flex items-center justify-center rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <button type="button" onClick={add}
        className="flex items-center gap-1 rounded-lg border border-dashed border-indigo-400/50 px-3 py-1.5 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50/60 dark:text-indigo-400 dark:hover:bg-indigo-900/10">
        <Plus size={11} /> הוסף שורת BOQ
      </button>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

type ScanFullEditorProps = {
  analysis: DocumentAnalysis;
  onChange: (next: DocumentAnalysis) => void;
  onClose: () => void;
  onConfirm: () => void;
  tr: (key: string, fallback: string) => string;
};

export function ScanFullEditor({ analysis, onChange, onClose, onConfirm, tr }: ScanFullEditorProps) {
  // v5 draft — local state to keep edit history clean
  const [v5, setV5] = useState<ScanExtractionV5>(
    () => analysis.v5 ?? {
      schemaVersion: 5,
      documentMetadata: {
        project: analysis.projectSuggestion || null,
        client: null,
        documentDate: analysis.date ?? null,
        drawingRefs: null, discipline: null, sheetIndex: null,
        sourceFileName: null, scanMode: "INVOICE_FINANCIAL",
      },
      billOfQuantities: [],
      lineItems: [],
      vendor: analysis.vendor,
      taxId: analysis.taxId ?? null,
      total: analysis.amount,
      date: analysis.date ?? null,
      docType: analysis.summary || "INVOICE",
      summary: analysis.summary,
      priceAlertPending: false,
    },
  );

  const [boqOpen, setBoqOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const showBoq = BOQ_MODES.has(v5.documentMetadata.scanMode);

  const patchV5 = useCallback((patch: Partial<ScanExtractionV5>) => {
    setV5((prev) => {
      const next = { ...prev, ...patch };
      // sync DocumentAnalysis so parent state stays current
      onChange({
        ...analysis,
        vendor: next.vendor,
        taxId: next.taxId ?? undefined,
        amount: next.total,
        date: next.date ?? analysis.date,
        v5: next,
      });
      return next;
    });
  }, [analysis, onChange]);

  // recompute auto-total from line items
  const autoTotal = useMemo(() => {
    const s = v5.lineItems.reduce((acc, li) => {
      const lt = li.lineTotal ?? (li.unitPrice != null && li.quantity != null ? li.unitPrice * li.quantity : 0);
      return acc + (lt ?? 0);
    }, 0);
    return s > 0 ? s : null;
  }, [v5.lineItems]);

  const applyAutoTotal = () => {
    if (autoTotal != null) patchV5({ total: autoTotal });
  };

  const handleConfirm = () => {
    onChange({ ...analysis, vendor: v5.vendor, taxId: v5.taxId ?? undefined, amount: v5.total, date: v5.date ?? analysis.date, v5 });
    onConfirm();
  };

  const Section = ({ title, children, open, toggle }: {
    title: string; children: React.ReactNode; open: boolean; toggle: () => void;
  }) => (
    <div className="rounded-xl border border-[color:var(--border-main)]">
      <button type="button" onClick={toggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left">
        <span className="text-[11px] font-black uppercase tracking-wide text-[color:var(--foreground-muted)]">
          {title}
        </span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <div className="border-t border-[color:var(--border-main)] px-3 pb-3 pt-2">{children}</div>}
    </div>
  );

  return (
    <div className="custom-scrollbar flex-1 min-h-0 overflow-y-auto p-4">
      <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-5">
        {/* ── header ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="text-emerald-500" size={20} />
            {tr("scanner.fullEditor", "עריכת תוצאת סריקה")}
          </h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-black/5">
            <X size={18} />
          </button>
        </div>

        {/* ── fields header ─────────────────────────────────────────────── */}
        <HeaderFields v5={v5} onChange={patchV5} />

        {/* auto-total hint */}
        {autoTotal != null && Math.abs(autoTotal - v5.total) > 0.01 && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50/80 px-3 py-1.5 text-[11px] dark:bg-amber-900/10">
            <span className="text-amber-700 dark:text-amber-300">
              סכום שורות: ₪{autoTotal.toLocaleString("he-IL", { maximumFractionDigits: 2 })} — שונה מסה״כ
            </span>
            <button type="button" onClick={applyAutoTotal}
              className="rounded bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-amber-500">
              עדכן
            </button>
          </div>
        )}

        {/* ── line items — always open ──────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-wide text-[color:var(--foreground-muted)]">
            שורות פריטים ({v5.lineItems.length})
          </p>
          <LineItemsEditor
            items={v5.lineItems}
            onChange={(items) => patchV5({ lineItems: items })}
          />
        </div>

        {/* ── BOQ — collapsible, only for relevant modes ──────────────── */}
        {showBoq && (
          <Section
            title={`כתב כמויות (BOQ) — ${v5.billOfQuantities.length} שורות`}
            open={boqOpen}
            toggle={() => setBoqOpen((o) => !o)}
          >
            <BoqEditor
              rows={v5.billOfQuantities}
              onChange={(rows) => patchV5({ billOfQuantities: rows })}
            />
          </Section>
        )}

        {/* ── summary — collapsible ─────────────────────────────────────── */}
        <Section
          title="סיכום"
          open={summaryOpen}
          toggle={() => setSummaryOpen((o) => !o)}
        >
          <textarea
            value={v5.summary}
            onChange={(e) => patchV5({ summary: e.target.value })}
            rows={4}
            className="w-full rounded-lg border border-[color:var(--border-main)] bg-transparent px-2 py-1.5 text-xs leading-relaxed"
          />
        </Section>

        {/* ── confirm button ────────────────────────────────────────────── */}
        <button type="button" onClick={handleConfirm}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-black text-white hover:bg-emerald-500">
          <Save size={18} /> {tr("scanner.confirmExpense", "אשר ושמור")}
        </button>
      </div>
    </div>
  );
}
