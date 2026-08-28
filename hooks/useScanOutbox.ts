"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLatestRef } from "@/hooks/use-latest-ref";
import {
  countOutbox,
  flushScanOutbox,
  type ScanOutboxRecord,
} from "@/lib/offline/scan-outbox";

/** שולח רשומת-תור אחת לשרת ה-tri-engine. זורק בכשל (רשת או שרת). */
async function submitRecord(record: ScanOutboxRecord): Promise<void> {
  const fd = new FormData();
  const file = new File([record.fileBlob], record.fileName, {
    type: record.fileType || "application/octet-stream",
  });
  fd.append("file", file);
  fd.append("scanMode", record.scanMode);
  fd.append("engineRunMode", record.engineRunMode);
  fd.append("persist", "true");
  if (record.projectId) fd.append("projectId", record.projectId);
  if (record.userInstruction) fd.append("userInstruction", record.userInstruction);

  const res = await fetch("/api/scan/tri-engine", {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) throw new Error(`tri-engine ${res.status}`);
}

/**
 * מנהל את תור הסריקות האופליין: חושף מונה ממתינים, מסנכרן אוטומטית
 * כשהרשת חוזרת (event `online`), ומאפשר סנכרון ידני.
 */
export function useScanOutbox() {
  const [count, setCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setCount(await countOutbox());
    } catch {
      /* indexeddb unavailable */
    }
  }, []);

  /**
   * The latch is a ref, not the `syncing` state, because the guard has to hold
   * between the call and the commit that would flip the state. Every record is
   * posted with persist:"true", so a second flush overlapping the first
   * re-submits records the first has not finished clearing — duplicate
   * documents, not merely duplicate work.
   */
  const syncingRef = useRef(false);

  const sync = useCallback(async (): Promise<{ synced: number; remaining: number }> => {
    if (syncingRef.current) return { synced: 0, remaining: count };
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await flushScanOutbox(submitRecord);
      setCount(result.remaining);
      return result;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [count]);

  /**
   * The listener is registered once, so it must not close over `sync` directly:
   * `sync` is re-created whenever `count` changes, and the mount-time copy
   * would keep reporting a stale queue. Reading it through a latest-ref keeps
   * the subscription stable while still calling the current function.
   */
  const syncRef = useLatestRef(sync);

  useEffect(() => {
    void refresh();
    if (typeof window === "undefined") return;

    const onOnline = () => void syncRef.current();
    window.addEventListener("online", onOnline);
    // רענון תקופתי קליל — תופס רשומות שנוספו מחלון/טאב אחר.
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
    };
  }, [refresh, syncRef]);

  return { count, syncing, sync, refresh };
}
