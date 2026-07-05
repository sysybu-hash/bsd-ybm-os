"use client";

import { CloudOff, Loader2, RefreshCw } from "lucide-react";
import { useScanOutbox } from "@/hooks/useScanOutbox";

type ScanOutboxBadgeProps = {
  tr: (key: string, fallback: string) => string;
};

/** תגית "ממתינים לסנכרון" בסורק — מוצגת רק כשיש סריקות אופליין בתור. */
export function ScanOutboxBadge({ tr }: ScanOutboxBadgeProps) {
  const { count, syncing, sync } = useScanOutbox();

  if (count === 0) return null;

  return (
    <button
      type="button"
      onClick={() => void sync()}
      disabled={syncing}
      data-testid="scan-outbox-badge"
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-700 transition hover:bg-amber-500/20 disabled:opacity-60 dark:text-amber-300"
      title={tr("scanner.outboxSyncNow", "סנכרן סריקות שממתינות")}
    >
      {syncing ? (
        <Loader2 size={13} className="animate-spin" aria-hidden />
      ) : (
        <CloudOff size={13} aria-hidden />
      )}
      {tr("scanner.outboxPending", "ממתינים לסנכרון")} ({count})
      {!syncing ? <RefreshCw size={11} aria-hidden /> : null}
    </button>
  );
}
