"use client";

import { useEffect } from "react";
import { isMobileViewport } from "@/lib/workspace/window-layout-policy";

function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function getOrientableScreen():
  | (ScreenOrientation & {
      lock?: (orientation: OrientationLockType) => Promise<void>;
      unlock?: () => void;
    })
  | undefined {
  return screen.orientation as
    | (ScreenOrientation & {
        lock?: (orientation: OrientationLockType) => Promise<void>;
        unlock?: () => void;
      })
    | undefined;
}

/** נועל portrait ב-PWA מובייל כשהדפדפן מאפשר (Android; iOS לרוב מתעלם). */
export function useLockPortraitOrientation(): void {
  useEffect(() => {
    if (!isMobileViewport() || !isStandalonePwa()) return;

    const orientation = getOrientableScreen();
    if (!orientation?.lock) return;

    void (async () => {
      try {
        await orientation.lock("portrait-primary");
      } catch {
        // iOS / הרשאות — ללא הפרעה למשתמש
      }
    })();

    return () => {
      try {
        orientation.unlock?.();
      } catch {
        // ignore
      }
    };
  }, []);
}
