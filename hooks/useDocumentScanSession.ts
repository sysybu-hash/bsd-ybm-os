"use client";

import { useMemo } from "react";
import type { UnifiedScanPhase } from "@/lib/scan/unified-scan-types";
import { useScanQueue, type UseScanQueueArgs } from "@/components/os/widgets/ai-scanner/useScanQueue";

/**
 * State machine מאוחד לסורק מסמכים — עוטף את useScanQueue עם שלבי session.
 */
export function useDocumentScanSession(args: UseScanQueueArgs) {
  const queue = useScanQueue(args);

  const phase: UnifiedScanPhase = useMemo(() => {
    if (queue.sessionPhase !== "idle") return queue.sessionPhase;
    if (queue.isProcessing) return "processing";
    if (queue.pendingAnalysis) return "review";
    if (queue.lastScanV5) return "review";
    if (queue.pendingFiles.length > 0) return "intake";
    return "idle";
  }, [
    queue.sessionPhase,
    queue.isProcessing,
    queue.pendingAnalysis,
    queue.lastScanV5,
    queue.pendingFiles.length,
  ]);

  return { ...queue, phase };
}

export type DocumentScanSession = ReturnType<typeof useDocumentScanSession>;
