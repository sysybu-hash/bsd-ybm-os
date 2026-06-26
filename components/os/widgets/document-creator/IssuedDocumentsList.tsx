"use client";

import React from "react";
import { FileText } from "lucide-react";
import { documentTypeLabel } from "@/lib/document-types";
import type { IssuedDocEntry } from "./types";

type IssuedDocumentsListProps = {
  issuedList: IssuedDocEntry[];
  issuedListLoading: boolean;
  onOpen: (id: string) => void;
  onRefresh: () => void;
};

export function IssuedDocumentsList({ issuedList, issuedListLoading, onOpen, onRefresh }: IssuedDocumentsListProps) {
  return (
    <section className="rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[color:var(--accent)] dark:text-indigo-400" />
          <h3 className="text-sm font-bold text-[color:var(--foreground-main)]">מסמכים שהונפקו</h3>
        </div>
        <button type="button" onClick={onRefresh} className="text-[10px] font-bold text-[color:var(--accent)] dark:text-indigo-400 hover:underline">
          רענון
        </button>
      </div>
      {issuedListLoading ? (
        <p className="text-xs text-[color:var(--foreground-muted)]">טוען רשימה…</p>
      ) : issuedList.length === 0 ? (
        <p className="text-xs text-[color:var(--foreground-muted)]">עדיין אין מסמכים. לאחר הפקה הם יופיעו כאן.</p>
      ) : (
        <ul className="max-h-44 space-y-1 overflow-y-auto custom-scrollbar">
          {issuedList.map((doc) => (
            <li key={doc.id}>
              <button
                type="button"
                onClick={() => onOpen(doc.id)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-transparent px-3 py-2 text-start text-xs transition-colors hover:border-[color:var(--border-main)] hover:bg-[color:var(--background-main)]/60"
              >
                <span className="font-bold text-[color:var(--foreground-main)]">
                  {documentTypeLabel(doc.type)} #{doc.number}
                </span>
                <span className="truncate text-[color:var(--foreground-muted)]">{doc.clientName}</span>
                <span className="shrink-0 font-bold text-[color:var(--accent)] dark:text-emerald-400">
                  ₪{doc.total.toLocaleString("he-IL")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
