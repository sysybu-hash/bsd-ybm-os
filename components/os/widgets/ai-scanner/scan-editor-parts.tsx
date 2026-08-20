"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { LineItemV5, BillOfQuantityRowV5, ScanExtractionV5 } from "@/lib/scan-schema-v5";

export function computeLineTotal(qty?: number, up?: number, lt?: number): number {
  if (lt != null && lt > 0) return lt;
  if (qty != null && up != null) return qty * up;
  return 0;
}

export function emptyLineItem(): LineItemV5 {
  return { description: "", quantity: undefined, unitPrice: undefined, lineTotal: undefined };
}

export function emptyBoqRow(): BillOfQuantityRowV5 {
  return {
    itemRef: null, description: "", material: null,
    dimensions: null, mepPoints: null, quantity: null, unit: null, notes: null,
  };
}

export const BOQ_MODES = new Set(["DRAWING_BOQ", "QUOTE_BOQ", "PROGRESS_BILL", "SITE_LOG"]);

const inp = "rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-1.5 text-xs";

export function HeaderFields({
  v5, onChange,
}: {
  v5: ScanExtractionV5;
  onChange: (patch: Partial<ScanExtractionV5>) => void;
}) {
  const { t } = useI18n();
  const field = (label: string, node: React.ReactNode) => (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold text-[color:var(--foreground-muted)]">{label}</span>
      {node}
    </label>
  );
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {field(t("scanner.fieldVendor"), <input className={inp} value={v5.vendor} onChange={(e) => onChange({ vendor: e.target.value })} />)}
      {field(t("scanner.fieldTaxId"), <input className={inp} value={v5.taxId ?? ""} onChange={(e) => onChange({ taxId: e.target.value || null })} />)}
      {field(t("scanner.fieldTotal"), <input type="number" className={`${inp} font-mono`} value={v5.total} onChange={(e) => onChange({ total: parseFloat(e.target.value) || 0 })} />)}
      {field(t("scanner.fieldDate"), <input type="date" className={inp} value={v5.date ?? ""} onChange={(e) => onChange({ date: e.target.value || null })} />)}
      {field(t("scanner.fieldDocType"), <input className={inp} value={v5.docType} onChange={(e) => onChange({ docType: e.target.value })} />)}
      {field(t("scanner.fieldProject"), <input className={inp} value={v5.documentMetadata.project ?? ""} onChange={(e) => onChange({ documentMetadata: { ...v5.documentMetadata, project: e.target.value || null } })} />)}
    </div>
  );
}

export function LineItemsEditor({ items, onChange }: { items: LineItemV5[]; onChange: (items: LineItemV5[]) => void }) {
  const { t, locale } = useI18n();
  const update = (i: number, patch: Partial<LineItemV5>) =>
    onChange(items.map((row, idx) => idx === i ? { ...row, ...patch } : row));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, emptyLineItem()]);

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-dashed border-[color:var(--border-main)] px-3 py-2">
        <span className="text-xs text-[color:var(--foreground-muted)]">{t("scanner.noLineItems")}</span>
        <button type="button" onClick={add} className="flex items-center gap-1 rounded-lg bg-[color:var(--accent)] px-2 py-1 text-[10px] font-bold text-white hover:opacity-90">
          <Plus size={11} aria-hidden /> {t("scanner.addRow")}
        </button>
      </div>
    );
  }

  const cell = "border border-[color:var(--border-main)] rounded px-1.5 py-1 text-[11px] w-full";
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-1 px-0.5 text-[9px] font-bold uppercase text-[color:var(--foreground-muted)]">
        <span>{t("scanner.colDescription")}</span><span>{t("scanner.colQuantity")}</span><span>{t("scanner.colUnitPrice")}</span><span>{t("scanner.colLineTotal")}</span><span />
      </div>
      {items.map((row, i) => {
        const implied = computeLineTotal(row.quantity, row.unitPrice, row.lineTotal);
        return (
          <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] items-center gap-1">
            <input className={cell} value={row.description} onChange={(e) => update(i, { description: e.target.value })} placeholder={t("scanner.phItemDescription")} />
            <input type="number" className={`${cell} font-mono`} value={row.quantity ?? ""} onChange={(e) => update(i, { quantity: parseFloat(e.target.value) || undefined })} placeholder={t("scanner.phQuantity")} />
            <input type="number" className={`${cell} font-mono`} value={row.unitPrice ?? ""} onChange={(e) => {
              const up = parseFloat(e.target.value) || undefined;
              update(i, { unitPrice: up, lineTotal: up != null && row.quantity != null ? up * row.quantity : row.lineTotal });
            }} placeholder={t("scanner.phPrice")} />
            <span className={`${cell} bg-[color:var(--surface-soft)]/50 text-end font-mono`}>
              {implied > 0 ? implied.toLocaleString(locale, { maximumFractionDigits: 2 }) : "—"}
            </span>
            <button type="button" onClick={() => remove(i)} aria-label={t("scanner.removeRow")} className="flex items-center justify-center rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
              <Trash2 size={12} aria-hidden />
            </button>
          </div>
        );
      })}
      <button type="button" onClick={add} className="flex items-center gap-1 rounded-lg border border-dashed border-indigo-400/50 px-3 py-1.5 text-[10px] font-bold text-[color:var(--accent)] hover:bg-indigo-50/60 dark:text-indigo-400 dark:hover:bg-indigo-900/10">
        <Plus size={11} aria-hidden /> {t("scanner.addRow")}
      </button>
    </div>
  );
}

export function BoqEditor({ rows, onChange }: { rows: BillOfQuantityRowV5[]; onChange: (rows: BillOfQuantityRowV5[]) => void }) {
  const { t } = useI18n();
  const update = (i: number, patch: Partial<BillOfQuantityRowV5>) =>
    onChange(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));
  const add = () => onChange([...rows, emptyBoqRow()]);

  const cell = "border border-[color:var(--border-main)] rounded px-1.5 py-1 text-[11px] w-full";
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[auto_2fr_1fr_1fr_auto] gap-1 px-0.5 text-[9px] font-bold uppercase text-[color:var(--foreground-muted)]">
        <span>{t("scanner.colItemRef")}</span><span>{t("scanner.colDescription")}</span><span>{t("scanner.colQuantity")}</span><span>{t("scanner.colUnit")}</span><span />
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[auto_2fr_1fr_1fr_auto] items-center gap-1">
          <input className={`${cell} w-14`} value={row.itemRef ?? ""} onChange={(e) => update(i, { itemRef: e.target.value || null })} placeholder={t("scanner.phItemRef")} />
          <input className={cell} value={row.description} onChange={(e) => update(i, { description: e.target.value })} placeholder={t("scanner.phDescription")} />
          <input type="number" className={`${cell} font-mono`} value={row.quantity ?? ""} onChange={(e) => update(i, { quantity: parseFloat(e.target.value) || null })} placeholder={t("scanner.phQuantity")} />
          <input className={cell} value={row.unit ?? ""} onChange={(e) => update(i, { unit: e.target.value || null })} placeholder={t("scanner.phUnit")} />
          <button type="button" onClick={() => remove(i)} className="flex items-center justify-center rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="flex items-center gap-1 rounded-lg border border-dashed border-indigo-400/50 px-3 py-1.5 text-[10px] font-bold text-[color:var(--accent)] hover:bg-indigo-50/60 dark:text-indigo-400 dark:hover:bg-indigo-900/10">
        <Plus size={11} aria-hidden /> {t("scanner.addBoqRow")}
      </button>
    </div>
  );
}
