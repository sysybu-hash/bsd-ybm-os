"use client";

import React from "react";
import { CheckCircle2, Copy, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import type { GeneratedDocState } from "./types";

type DocGeneratedSuccessProps = {
  generatedDoc: GeneratedDocState;
  docTypeLabel: string;
  onDownloadPDF: () => void;
  onReset: () => void;
};

export function DocGeneratedSuccess({ generatedDoc, docTypeLabel, onDownloadPDF, onReset }: DocGeneratedSuccessProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 bg-transparent text-[color:var(--foreground-main)]">
      <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
        <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h2 className="text-2xl font-bold mb-2 text-[color:var(--foreground-main)]">
        {docTypeLabel} #{generatedDoc.documentNumber} הופק!
      </h2>
      <p className="text-[color:var(--foreground-muted)] mb-8 text-center">
        המסמך נשמר בבסיס הנתונים ומוכן להורדה או לשליחה.
      </p>

      <div className="w-full max-w-md space-y-4">
        <button
          onClick={onDownloadPDF}
          className="w-full py-4 bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80 border border-[color:var(--border-main)] rounded-2xl font-bold transition-all flex items-center justify-center gap-3 text-[color:var(--foreground-main)] shadow-sm dark:shadow-none"
        >
          <Download size={20} className="text-blue-600 dark:text-blue-400" /> הורד קובץ PDF
        </button>

        <div className="bg-[color:var(--background-main)]/50 border border-[color:var(--border-main)] rounded-2xl p-4 shadow-sm dark:shadow-none">
          <label className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest block mb-2">
            קישור לחתימה דיגיטלית
          </label>
          <div className="flex gap-2">
            <input
              readOnly
              value={generatedDoc.signUrl || "#"}
              className="flex-1 bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-lg px-3 py-2 text-xs text-[color:var(--foreground-muted)] outline-none"
            />
            <button
              onClick={() => { navigator.clipboard.writeText(generatedDoc.signUrl || ""); toast.success("הועתק"); }}
              className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg transition-colors border border-emerald-500/20"
            >
              <Copy size={16} />
            </button>
          </div>
        </div>

        <div className="flex gap-4 pt-4">
          <button
            onClick={onReset}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-all"
          >
            הפק מסמך חדש
          </button>
          {generatedDoc.signUrl && (
            <a
              href={generatedDoc.signUrl}
              target="_blank"
              className="p-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl transition-all flex items-center justify-center"
            >
              <ExternalLink size={20} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
