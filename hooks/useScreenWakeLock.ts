"use client";

import { useEffect, useRef } from "react";
import { createLogger } from "@/lib/logger";

const log = createLogger("screen-wake-lock");

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
  removeEventListener?: (type: "release", listener: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

/**
 * שומר מסך דלוק בזמן שיחת Live (Screen Wake Lock API).
 * משחרר ב-unmount, כש-active=false, visibility hidden, או שגיאה.
 */
export function useScreenWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (!active) return undefined;

    const nav = navigator as NavigatorWithWakeLock;
    if (typeof nav.wakeLock?.request !== "function") {
      return undefined;
    }

    let cancelled = false;

    const release = async () => {
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (!sentinel) return;
      try {
        await sentinel.release();
      } catch (err: unknown) {
        log.warn("wake lock release failed", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    };

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const sentinel = await nav.wakeLock!.request("screen");
        if (cancelled) {
          await sentinel.release();
          return;
        }
        await release();
        sentinelRef.current = sentinel;
        const onReleased = () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null;
        };
        sentinel.addEventListener?.("release", onReleased);
      } catch (err: unknown) {
        log.warn("wake lock unavailable", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    };

    void acquire();

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void release();
      } else if (!cancelled) {
        void acquire();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void release();
    };
  }, [active]);
}
