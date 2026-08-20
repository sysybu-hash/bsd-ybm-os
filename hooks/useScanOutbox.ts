"use client";

import { useCallback, useEffect, useState } from "react";
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

  const sync = useCallback(async (): Promise<{ synced: number; remaining: number }> => {
    if (syncing) return { synced: 0, remaining: count };
    setSyncing(true);
    try {
      const result = await flushScanOutbox(submitRecord);
      setCount(result.remaining);
      return result;
    } finally {
      setSyncing(false);
    }
  }, [syncing, count]);

  useEffect(() => {
    void refresh();
    if (typeof window === "undefined") return;

    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    // רענון תקופתי קליל — תופס רשומות שנוספו מחלון/טאב אחר.
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { count, syncing, sync, refresh };
}
