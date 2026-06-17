"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

type HistoryRow = {
  id: string;
  fileName: string;
  type: string;
  status: string;
  createdAt: string;
  vendor?: string | null;
  total?: number | null;
};

type ScanHistoryPanelProps = {
  tr: (key: string, fallback: string) => string;
};

export function ScanHistoryPanel({ tr }: ScanHistoryPanelProps) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [queuePending, setQueuePending] = useState(0);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const [histRes, queueRes] = await Promise.all([
        fetch("/api/scan/history?limit=20", { credentials: "include" }),
        fetch("/api/analyze-queue/pending", { credentials: "include" }),
      ]);
      if (histRes.ok) {
        const data = (await histRes.json()) as { items?: HistoryRow[] };
        setRows(data.items ?? []);
      }
      if (queueRes.ok) {
        const q = (await queueRes.json()) as { pending?: number };
        setQueuePending(q.pending ?? 0);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleClearHistory = async () => {
    if (clearing || rows.length === 0) return;
    setClearing(true);
    try {
      const res = await fetch("/api/scan/history", {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("clear failed");
      setRows([]);
    } catch {
      /* ignore — UI stays as-is */
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="rounded-xl border border-[color:var(--border-main)]/80 bg-[color:var(--surface-card)]/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
          {tr("workspaceWidgets.documentScan.historyTitle", "היסטוריית סריקות")}
        </h4>
        <div className="flex items-center gap-1.5">
          {queuePending > 0 ? (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600">
              {tr("workspaceWidgets.documentScan.queuePending", "בתור")}: {queuePending}
            </span>
          ) : null}
          {!loading && rows.length > 0 ? (
            <button
              type="button"
              onClick={() => void handleClearHistory()}
              disabled={clearing}
              aria-label={tr("workspaceWidgets.documentScan.clearHistory", "נקה היסטוריה")}
              title={tr("workspaceWidgets.documentScan.clearHistory", "נקה היסטוריה")}
              className="rounded-lg p-1.5 text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--foreground-muted)]/10 hover:text-rose-600 disabled:opacity-50"
            >
              <Trash2 size={14} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      {loading ? (
        <p className="animate-pulse text-xs text-[color:var(--foreground-muted)]">…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-[color:var(--foreground-muted)]">
          {tr("workspaceWidgets.documentScan.historyEmpty", "אין מסמכים אחרונים")}
        </p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--border-main)]/60 px-2 py-1.5"
            >
              <span className="truncate font-semibold">{r.fileName}</span>
              <span className="shrink-0 text-[color:var(--foreground-muted)]">
                {r.vendor ?? r.type}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
