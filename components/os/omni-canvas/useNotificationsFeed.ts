"use client";

import { useEffect, useState } from "react";
import type { OSNotification } from "@/components/os/NotificationCenter";
import {
  getApiCooldownRemainingMs,
  isApiCooldown,
  markApiCooldownFromResponse,
  markApiCooldownMs,
} from "@/lib/client/api-rate-limit-backoff";
import { createLogger } from "@/lib/logger";

const log = createLogger("notifications-feed");
import { mapFeedItemToNotification } from "./types";

const FEED_KEY = "api:notifications/feed";
const STREAM_KEY = "api:notifications/feed/stream";
const BASE_POLL_MS = 30_000;

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
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let es: EventSource | null = null;

    const schedulePoll = (delayMs = BASE_POLL_MS) => {
      if (pollTimer || disposed) return;
      pollTimer = setTimeout(() => {
        pollTimer = null;
        void fetchNotifications();
      }, delayMs);
    };

    const fetchNotifications = async (): Promise<boolean> => {
      if (disposed || inFlight || isApiCooldown(FEED_KEY)) {
        if (isApiCooldown(FEED_KEY)) schedulePoll(getApiCooldownRemainingMs(FEED_KEY) || BASE_POLL_MS);
        return false;
      }
      inFlight = true;
      try {
        const res = await fetch("/api/notifications/feed", {
          credentials: "include",
          cache: "no-store",
          signal: abort.signal,
        });
        if (disposed) return false;
        if (markApiCooldownFromResponse(FEED_KEY, res)) {
          schedulePoll(getApiCooldownRemainingMs(FEED_KEY) || 60_000);
          return false;
        }
        if (!res.ok) {
          setNotifications([]);
          schedulePoll(BASE_POLL_MS);
          return false;
        }
        let data: unknown;
        try {
          data = await res.json();
        } catch {
          setNotifications([]);
          return false;
        }
        if (disposed) return false;
        const items = Array.isArray(data) ? data : [];
        setNotifications(items.map((item) => mapFeedItemToNotification(item as Record<string, unknown>)));
        return true;
      } catch (err) {
        if (disposed || abort.signal.aborted) return false;
        const isNetworkFailure =
          err instanceof TypeError &&
          (err.message === "Failed to fetch" || err.message.includes("NetworkError"));
        if (process.env.NODE_ENV === "development" && !isNetworkFailure) {
          log.warn("notifications feed unavailable", { error: err instanceof Error ? err.message : String(err) });
        }
        setNotifications([]);
        schedulePoll(BASE_POLL_MS);
        return false;
      } finally {
        inFlight = false;
      }
    };

    const openStream = () => {
      if (disposed || es || isApiCooldown(STREAM_KEY) || isApiCooldown(FEED_KEY)) return;
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
          } catch {
            void fetchNotifications();
          }
        };
        es.onerror = () => {
          es?.close();
          es = null;
          markApiCooldownMs(STREAM_KEY, 60_000);
          schedulePoll(getApiCooldownRemainingMs(STREAM_KEY) || 60_000);
        };
      } catch {
        schedulePoll(BASE_POLL_MS);
      }
    };

    void (async () => {
      const ok = await fetchNotifications();
      if (!disposed && ok) openStream();
      else if (!disposed) schedulePoll(getApiCooldownRemainingMs(FEED_KEY) || BASE_POLL_MS);
    })();

    return () => {
      disposed = true;
      abort.abort();
      es?.close();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [sessionStatus, userId]);

  return { notifications, setNotifications };
}
