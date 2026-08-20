"use client";

import React from "react";
import { History } from "lucide-react";
import ItemActions from "@/components/os/ItemActions";
import type { ScanHistoryItem } from "./types";

type ScanHistorySidebarProps = {
  history: ScanHistoryItem[];
  onDelete: (id: string) => void;
  tr: (key: string, fallback: string) => string;
};

export function ScanHistorySidebar({ history, onDelete, tr }: ScanHistorySidebarProps) {
  return (
    <div className="flex h-36 shrink-0 flex-col border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 md:h-auto md:w-56 md:border-b-0 md:border-s">
      <div className="border-b border-[color:var(--border-main)] p-3">
        <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
          <History size={16} />
          <span className="text-[10px] font-black uppercase tracking-widest">
            {tr("scanner.historyTitle", "היסטוריה")}
          </span>
        </div>
      </div>
      <div className="custom-scrollbar flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        {history.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-2"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[10px] font-bold">{item.vendor}</div>
              <div className="text-[10px] font-mono text-[color:var(--accent)]">
                ₪{(item.amount || 0).toLocaleString()}
              </div>
            </div>
            <ItemActions onDelete={() => onDelete(item.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}
