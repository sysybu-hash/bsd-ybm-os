"use client";

import React from "react";
import type { QueueItem } from "@/components/os/widgets/ai-scanner/types";

type ScanProcessingPhaseProps = {
  queue: QueueItem[];
  queueProgress: { current: number; total: number; name: string } | null;
  tr: (key: string, fallback: string) => string;
};

export function ScanProcessingPhase({ queue, queueProgress, tr }: ScanProcessingPhaseProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <div className="size-10 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      <p className="text-sm font-bold text-[color:var(--foreground-main)]">
        {queueProgress
          ? tr("scanner.scanProgress", "סורק {current} מתוך {total}: {name}")
              .replace("{current}", String(queueProgress.current))
              .replace("{total}", String(queueProgress.total))
              .replace("{name}", queueProgress.name)
          : tr("workspaceWidgets.documentScan.processing", "מעבד מסמך…")}
      </p>
      <ul className="w-full max-w-md space-y-1 text-xs">
        {queue.map((q) => (
          <li key={q.id} className="flex justify-between rounded-lg border border-[color:var(--border-main)] px-2 py-1">
            <span className="truncate">{q.file.name}</span>
            <span>{q.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
