"use client";

import React from "react";
import { CheckCircle2, X, Building2, Hash, DollarSign, Calendar, Save } from "lucide-react";
import type { DocumentAnalysis } from "./types";

type ScanConfirmPanelProps = {
  analysis: DocumentAnalysis;
  onChange: (next: DocumentAnalysis) => void;
  onClose: () => void;
  onConfirm: () => void;
  tr: (key: string, fallback: string) => string;
};

export function ScanConfirmPanel({
  analysis,
  onChange,
  onClose,
  onConfirm,
  tr,
}: ScanConfirmPanelProps) {
  return (
    <div className="custom-scrollbar flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-xl rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="text-emerald-500" size={20} />
            {tr("scanner.results", "אישור")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-black/5"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="text-[10px] font-bold text-[color:var(--foreground-muted)]">
            <Building2 size={10} className="inline" /> ספק
            <input
              value={analysis.vendor}
              onChange={(e) => onChange({ ...analysis, vendor: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs"
            />
          </label>
          <label className="text-[10px] font-bold text-[color:var(--foreground-muted)]">
            <Hash size={10} className="inline" /> ח&quot;פ
            <input
              value={analysis.taxId || ""}
              onChange={(e) => onChange({ ...analysis, taxId: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs"
            />
          </label>
          <label className="text-[10px] font-bold text-[color:var(--foreground-muted)]">
            <DollarSign size={10} className="inline" /> סכום
            <input
              type="number"
              value={analysis.amount}
              onChange={(e) => onChange({ ...analysis, amount: parseFloat(e.target.value) || 0 })}
              className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-mono"
            />
          </label>
          <label className="text-[10px] font-bold text-[color:var(--foreground-muted)]">
            <Calendar size={10} className="inline" /> תאריך
            <input
              type="date"
              value={analysis.date}
              onChange={(e) => onChange({ ...analysis, date: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={onConfirm}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-black text-white"
        >
          <Save size={18} /> {tr("scanner.confirmExpense", "אשר ושמור")}
        </button>
      </div>
    </div>
  );
}
