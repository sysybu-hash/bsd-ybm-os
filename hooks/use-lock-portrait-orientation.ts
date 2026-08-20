"use client";

import { useEffect } from "react";
import { isMobileViewport } from "@/lib/workspace/window-layout-policy";

/** Screen Orientation API lock values (lib.dom may omit OrientationLockType). */
type PortraitOrientationLock =
  | "any"
  | "natural"
  | "landscape"
  | "landscape-primary"
  | "landscape-secondary"
  | "portrait"
  | "portrait-primary"
  | "portrait-secondary";


function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function getOrientableScreen():
  | (ScreenOrientation & {
      lock?: (orientation: PortraitOrientationLock) => Promise<void>;
      unlock?: () => void;
    })
  | undefined {
  return screen.orientation as
    | (ScreenOrientation & {
        lock?: (orientation: PortraitOrientationLock) => Promise<void>;
        unlock?: () => void;
      })
    | undefined;
}

/** נועל portrait ב-PWA מובייל כשהדפדפן מאפשר (Android; iOS לרוב מתעלם). */
export function useLockPortraitOrientation(): void {
  useEffect(() => {
    if (!isMobileViewport() || !isStandalonePwa()) return;

    const orientation = getOrientableScreen();
    const lock = orientation?.lock;
    if (!lock) return;

    void (async () => {
      try {
        await lock("portrait-primary");
      } catch {
        // iOS / הרשאות — ללא הפרעה למשתמש
      }
    })();

    return () => {
      try {
        orientation?.unlock?.();
      } catch {
        // ignore
      }
    };
  }, []);
}
