"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, Download, FileJson, FileSpreadsheet, FileText, Printer, Save, X } from "lucide-react";
import type { DocumentAnalysis } from "./types";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import { downloadBlob, rowsToCsv } from "@/lib/export-file";
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
  /** Parent owns scroll (hub / constrained widget shell) */
  embeddedInScrollParent?: boolean;
  /** Override confirm button label */
  confirmLabel?: string;
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

function useScanExport(
  v5Ref: React.RefObject<ScanExtractionV5 | null>,
  tr: (key: string, fallback: string) => string,
) {
  const [exportOpen, setExportOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  function baseName() {
    const v = v5Ref.current;
    return `${v?.vendor || "scan"}-${v?.date || "export"}`.replace(/[^\w\u0590-\u05FF.-]/g, "_");
  }

  function exportCsv() {
    const v = v5Ref.current;
    if (!v) return;
    const header = [
      tr("scanner.csvColDescription", "Description"),
      tr("scanner.csvColQty", "Qty"),
      tr("scanner.csvColUnitPrice", "Unit price"),
      tr("scanner.csvColLineTotal", "Line total"),
      tr("scanner.csvColCurrency", "Currency"),
      tr("scanner.csvColSku", "SKU"),
    ];
    const rows = v.lineItems.map((li) => [
      li.description,
      String(li.quantity ?? ""),
      String(li.unitPrice ?? ""),
      String(li.lineTotal ?? ""),
      li.currency ?? "ILS",
      li.sku ?? "",
    ]);
    downloadBlob(`${baseName()}.csv`, rowsToCsv([header, ...rows]), "text/csv;charset=utf-8");
    setExportOpen(false);
  }

  function exportJson() {
    const v = v5Ref.current;
    if (!v) return;
    downloadBlob(`${baseName()}.json`, JSON.stringify(v, null, 2), "application/json");
    setExportOpen(false);
  }

  async function exportPdf() {
    const v = v5Ref.current;
    if (!v) return;
    setPdfLoading(true);
    try {
      const res = await fetch("/api/scan/export-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ v5: v }),
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfLoading(false);
      setExportOpen(false);
    }
  }

  function printDoc() {
    setExportOpen(false);
    setTimeout(() => window.print(), 100);
  }

  return { exportOpen, setExportOpen, pdfLoading, exportCsv, exportJson, exportPdf, printDoc };
}

export function ScanFullEditor({
  analysis,
  onChange,
  onClose,
  onConfirm,
  tr,
  embeddedInScrollParent = false,
  confirmLabel,
}: ScanFullEditorProps) {
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

  const v5Ref = useRef<ScanExtractionV5 | null>(null);
  v5Ref.current = v5;
  const exportActions = useScanExport(v5Ref, tr);

  const [boqOpen, setBoqOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [telemetryOpen, setTelemetryOpen] = useState(false);

  const telemetry = analysis.rawAiData?._triEngineTelemetry as Record<string, { phase: string; ms?: number; detail?: string }> | undefined;

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
    <div
      className={
        embeddedInScrollParent
          ? "p-4"
          : "custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4"
      }
    >
      <div className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="text-emerald-500" size={20} />
            {tr("scanner.fullEditor", "עריכת תוצאת סריקה")}
          </h3>
          <div className="flex items-center gap-1">
            {/* Export dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => exportActions.setExportOpen((o) => !o)}
                className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/60 px-2.5 py-1.5 text-[11px] font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                title={tr("scanner.export", "ייצוא")}
              >
                <Download size={13} aria-hidden />
                {tr("scanner.export", "ייצוא")}
                <ChevronDown size={11} aria-hidden />
              </button>
              {exportActions.exportOpen && (
                <div className="absolute end-0 top-full z-50 mt-1 min-w-[160px] rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-xl">
                  <button type="button" onClick={exportActions.exportCsv}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[12px] hover:bg-[color:var(--surface-soft)] rounded-t-xl">
                    <FileSpreadsheet size={14} className="text-emerald-600" aria-hidden />
                    CSV
                  </button>
                  <button type="button" onClick={exportActions.exportJson}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[12px] hover:bg-[color:var(--surface-soft)]">
                    <FileJson size={14} className="text-amber-600" aria-hidden />
                    JSON
                  </button>
                  <button type="button" onClick={() => void exportActions.exportPdf()} disabled={exportActions.pdfLoading}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[12px] hover:bg-[color:var(--surface-soft)] disabled:opacity-50">
                    <FileText size={14} className="text-red-600" aria-hidden />
                    {exportActions.pdfLoading ? tr("scanner.generating", "מייצר...") : "PDF"}
                  </button>
                  <button type="button" onClick={exportActions.printDoc}
                    className="flex w-full items-center gap-2 px-3 py-2 text-[12px] hover:bg-[color:var(--surface-soft)] rounded-b-xl">
                    <Printer size={14} className="text-blue-600" aria-hidden />
                    {tr("scanner.print", "הדפסה")}
                  </button>
                </div>
              )}
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-black/5">
              <X size={18} />
            </button>
          </div>
        </div>

        <HeaderFields v5={v5} onChange={patchV5} />

        {autoTotal != null && Math.abs(autoTotal - v5.total) > 0.01 && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50/80 px-3 py-1.5 text-[11px] dark:bg-amber-900/10">
            <span className="text-amber-700 dark:text-amber-300">
              {tr("scanner.lineTotalMismatch", "Line total: ₪{amount} — differs from document total").replace(
                "{amount}",
                autoTotal.toLocaleString("he-IL", { maximumFractionDigits: 2 }),
              )}
            </span>
            <button type="button" onClick={() => patchV5({ total: autoTotal })}
              className="rounded bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-amber-500">
              {tr("scanner.updateTotal", "Update")}
            </button>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-wide text-[color:var(--foreground-muted)]">
            {tr("scanner.lineItemsTitle", "Line items ({count})").replace("{count}", String(v5.lineItems.length))}
          </p>
          <LineItemsEditor items={v5.lineItems} onChange={(items) => patchV5({ lineItems: items })} />
        </div>

        {showBoq && (
          <Section
            title={tr("scanner.boqSectionTitle", "Bill of quantities (BOQ) — {count} rows").replace(
              "{count}",
              String(v5.billOfQuantities.length),
            )}
            open={boqOpen}
            toggle={() => setBoqOpen((o) => !o)}
          >
            <BoqEditor rows={v5.billOfQuantities} onChange={(rows) => patchV5({ billOfQuantities: rows })} />
          </Section>
        )}

        <Section title={tr("scanner.summarySection", "Summary")} open={summaryOpen} toggle={() => setSummaryOpen((o) => !o)}>
          <textarea value={v5.summary} onChange={(e) => patchV5({ summary: e.target.value })} rows={4}
            className="w-full rounded-lg border border-[color:var(--border-main)] bg-transparent px-2 py-1.5 text-xs leading-relaxed" />
        </Section>

        {telemetry && (
          <Section title={tr("scanner.engineDetails", "פרטי מנועים")} open={telemetryOpen} toggle={() => setTelemetryOpen((o) => !o)}>
            <div className="space-y-1">
              {Object.entries(telemetry).map(([engine, status]) => {
                const phase = status.phase as string;
                const color = phase === "ok" ? "text-emerald-600" : phase === "error" ? "text-red-500" : phase === "skipped" ? "text-[color:var(--foreground-muted)]" : "text-amber-500";
                const label = { documentAI: "Document AI", gemini: "Gemini", gpt: "OpenAI", mistral: "Pixtral", anthropic: "Claude" }[engine] ?? engine;
                return (
                  <div key={engine} className="flex items-center justify-between text-[11px]">
                    <span className="font-medium">{label}</span>
                    <span className={color}>
                      {phase === "ok" ? `✓ ${status.ms ? `${status.ms}ms` : ""}` : phase === "error" ? `✗ ${status.detail ?? ""}` : phase === "skipped" ? `— ${status.detail ?? ""}` : phase}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        <button type="button"
          onClick={() => { onChange({ ...analysis, vendor: v5.vendor, taxId: v5.taxId ?? undefined, amount: v5.total, date: v5.date ?? analysis.date, v5 }); onConfirm(); }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--accent)] py-3 text-sm font-black text-white hover:bg-emerald-500">
          <Save size={18} /> {confirmLabel ?? tr("scanner.confirmExpense", "אשר ושמור")}
        </button>
      </div>
    </div>
  );
}
