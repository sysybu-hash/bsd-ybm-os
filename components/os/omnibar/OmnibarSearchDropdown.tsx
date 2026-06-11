"use client";

import React from "react";

type SearchResult = {
  type: "project" | "contact";
  name: string;
  taxId?: string;
  relevance?: number;
};

type Props = {
  results: SearchResult[];
  input: string;
  layout: "inline" | "stacked";
  t: (key: string, vars?: Record<string, string>) => string;
  onSelect: (result: SearchResult) => void;
  onClearInput: () => void;
};

export function OmnibarSearchDropdown({ results, input, layout, t, onSelect, onClearInput }: Props) {
  if (results.length === 0 || !input.trim()) return null;
  return (
    <div
      className={`absolute w-full overflow-hidden rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-lg ${
        layout === "stacked" ? "relative mt-2" : "bottom-full mb-3 w-[calc(100%-2rem)]"
      }`}
    >
      {results.map((result, idx) => (
        <button
          key={`${result.type}-${result.name}-${idx}`}
          type="button"
          onClick={() => { onSelect(result); onClearInput(); }}
          className="flex min-h-[44px] w-full items-center justify-between border-b border-[color:var(--border-main)]/50 p-3 text-start transition last:border-0 hover:bg-[color:var(--surface-soft)]"
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-md text-[10px] font-black ${
                result.type === "contact"
                  ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              }`}
            >
              {result.type === "contact" ? "CRM" : "PRJ"}
            </div>
            <div>
              <div className="text-xs font-black text-[color:var(--foreground-main)]">{result.name}</div>
              {result.taxId ? (
                <div className="text-[10px] font-semibold text-[color:var(--foreground-muted)]">
                  {t("workspaceWidgets.omnibar.taxId", { id: result.taxId })}
                </div>
              ) : null}
            </div>
          </div>
          {typeof result.relevance === "number" ? (
            <div className="font-mono text-[10px] text-[color:var(--foreground-muted)]">
              {Math.round(result.relevance * 100)}%
            </div>
          ) : null}
        </button>
      ))}
    </div>
  );
}
