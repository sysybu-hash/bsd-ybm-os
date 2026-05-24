"use client";

import { useEffect, useState } from "react";
import type { OSNotification } from "@/components/os/NotificationCenter";
import { mapFeedItemToNotification } from "./types";

export function useNotificationsFeed(
  sessionStatus: string,
  userId: string | undefined,
) {
  const [notifications, setNotifications] = useState<OSNotification[]>([]);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !userId) {
      setNotifications([]);
      return;
    }

    const abort = new AbortController();
    let disposed = false;
    let inFlight = false;

    const fetchNotifications = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch("/api/notifications/feed", {
          credentials: "include",
          cache: "no-store",
          signal: abort.signal,
        });
        if (disposed) return;
        if (!res.ok) { setNotifications([]); return; }
        let data: unknown;
        try { data = await res.json(); } catch { setNotifications([]); return; }
        if (disposed) return;
        const items = Array.isArray(data) ? data : [];
        setNotifications(items.map((item) => mapFeedItemToNotification(item as Record<string, unknown>)));
      } catch (err) {
        if (disposed || abort.signal.aborted) return;
        const isNetworkFailure =
          err instanceof TypeError &&
          (err.message === "Failed to fetch" || err.message.includes("NetworkError"));
        if (process.env.NODE_ENV === "development" && !isNetworkFailure) {
          console.warn("Notifications feed unavailable", err);
        }
        setNotifications([]);
      } finally {
        inFlight = false;
      }
    };

    const scheduleFetch = () => { void fetchNotifications(); };
    scheduleFetch();

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let es: EventSource | null = null;

    const startPolling = () => {
      if (pollInterval || disposed) return;
      pollInterval = setInterval(scheduleFetch, 10000);
    };

    try {
      es = new EventSource("/api/notifications/feed/stream");
      es.onmessage = (event) => {
        if (disposed) return;
        try {
          const payload = JSON.parse(event.data) as Record<string, unknown> | Record<string, unknown>[];
          if (Array.isArray(payload)) {
            setNotifications(payload.map((item) => mapFeedItemToNotification(item)));
            return;
          }
          const next = mapFeedItemToNotification(payload);
          setNotifications((prev) => {
            if (prev.some((n) => n.id === next.id)) return prev;
            return [next, ...prev];
          });
        } catch { scheduleFetch(); }
      };
      es.onerror = () => { es?.close(); es = null; startPolling(); };
    } catch { startPolling(); }

    return () => {
      disposed = true;
      abort.abort();
      es?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [sessionStatus, userId]);

  return { notifications, setNotifications };
}
