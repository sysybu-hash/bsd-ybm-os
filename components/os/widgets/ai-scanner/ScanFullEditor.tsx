"use client";

import React, { useCallback, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Save, X } from "lucide-react";
import type { DocumentAnalysis } from "./types";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import {
  BOQ_MODES, HeaderFields, LineItemsEditor, BoqEditor,
  emptyBoqRow as _emptyBoqRow, computeLineTotal,
} from "./scan-editor-parts";

type ScanFullEditorProps = {
  analysis: DocumentAnalysis;
  onChange: (next: DocumentAnalysis) => void;
  onClose: () => void;
  onConfirm: () => void;
  tr: (key: string, fallback: string) => string;
};

function Section({ title, children, open, toggle }: {
  title: string; children: React.ReactNode; open: boolean; toggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-[color:var(--border-main)]">
      <button type="button" onClick={toggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left">
        <span className="text-[11px] font-black uppercase tracking-wide text-[color:var(--foreground-muted)]">{title}</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && <div className="border-t border-[color:var(--border-main)] px-3 pb-3 pt-2">{children}</div>}
    </div>
  );
}

export function ScanFullEditor({ analysis, onChange, onClose, onConfirm, tr }: ScanFullEditorProps) {
  const [v5, setV5] = useState<ScanExtractionV5>(
    () => analysis.v5 ?? {
      schemaVersion: 5,
      documentMetadata: {
        project: analysis.projectSuggestion || null, client: null,
        documentDate: analysis.date ?? null, drawingRefs: null, discipline: null,
        sheetIndex: null, sourceFileName: null, scanMode: "INVOICE_FINANCIAL",
      },
      billOfQuantities: [], lineItems: [],
      vendor: analysis.vendor, taxId: analysis.taxId ?? null, total: analysis.amount,
      date: analysis.date ?? null, docType: analysis.summary || "INVOICE",
      summary: analysis.summary, priceAlertPending: false,
    },
  );

  const [boqOpen, setBoqOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const showBoq = BOQ_MODES.has(v5.documentMetadata.scanMode);

  const patchV5 = useCallback((patch: Partial<ScanExtractionV5>) => {
    setV5((prev) => {
      const next = { ...prev, ...patch };
      onChange({ ...analysis, vendor: next.vendor, taxId: next.taxId ?? undefined, amount: next.total, date: next.date ?? analysis.date, v5: next });
      return next;
    });
  }, [analysis, onChange]);

  const autoTotal = useMemo(() => {
    const s = v5.lineItems.reduce((acc, li) => {
      const lt = li.lineTotal ?? (li.unitPrice != null && li.quantity != null ? li.unitPrice * li.quantity : 0);
      return acc + (lt ?? 0);
    }, 0);
    return s > 0 ? s : null;
  }, [v5.lineItems]);

  return (
    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="text-emerald-500" size={20} />
            {tr("scanner.fullEditor", "עריכת תוצאת סריקה")}
          </h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-black/5">
            <X size={18} />
          </button>
        </div>

        <HeaderFields v5={v5} onChange={patchV5} />

        {autoTotal != null && Math.abs(autoTotal - v5.total) > 0.01 && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50/80 px-3 py-1.5 text-[11px] dark:bg-amber-900/10">
            <span className="text-amber-700 dark:text-amber-300">
              סכום שורות: ₪{autoTotal.toLocaleString("he-IL", { maximumFractionDigits: 2 })} — שונה מסה״כ
            </span>
            <button type="button" onClick={() => patchV5({ total: autoTotal })}
              className="rounded bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-amber-500">
              עדכן
            </button>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-wide text-[color:var(--foreground-muted)]">
            שורות פריטים ({v5.lineItems.length})
          </p>
          <LineItemsEditor items={v5.lineItems} onChange={(items) => patchV5({ lineItems: items })} />
        </div>

        {showBoq && (
          <Section title={`כתב כמויות (BOQ) — ${v5.billOfQuantities.length} שורות`} open={boqOpen} toggle={() => setBoqOpen((o) => !o)}>
            <BoqEditor rows={v5.billOfQuantities} onChange={(rows) => patchV5({ billOfQuantities: rows })} />
          </Section>
        )}

        <Section title="סיכום" open={summaryOpen} toggle={() => setSummaryOpen((o) => !o)}>
          <textarea value={v5.summary} onChange={(e) => patchV5({ summary: e.target.value })} rows={4}
            className="w-full rounded-lg border border-[color:var(--border-main)] bg-transparent px-2 py-1.5 text-xs leading-relaxed" />
        </Section>

        <button type="button"
          onClick={() => { onChange({ ...analysis, vendor: v5.vendor, taxId: v5.taxId ?? undefined, amount: v5.total, date: v5.date ?? analysis.date, v5 }); onConfirm(); }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-black text-white hover:bg-emerald-500">
          <Save size={18} /> {tr("scanner.confirmExpense", "אשר ושמור")}
        </button>
      </div>
    </div>
  );
}
