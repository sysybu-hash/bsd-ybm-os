"use client";

import { useEffect, useRef, useState } from "react";
import { OS_BOOT_FADE_MS, OS_BOOT_MIN_MS } from "@/components/os/boot/OsBootSplash";

type Args = {
  /** Client mounted */
  mounted: boolean;
  /** Session still resolving and user never authenticated this mount */
  sessionBlocking: boolean;
  /** Window manager layout hydrated */
  hasHydrated: boolean;
  /** Launcher local + first server sync ready */
  launcherBootReady?: boolean;
};

/**
 * Keeps the boot splash visible until session + layout + launcher are ready and min time elapsed.
 */
export function useOsBootGate({
  mounted,
  sessionBlocking,
  hasHydrated,
  launcherBootReady = true,
}: Args) {
  const startedAt = useRef(
    typeof performance !== "undefined" ? performance.now() : Date.now(),
  );
  const [minElapsed, setMinElapsed] = useState(false);
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const remaining = Math.max(
      0,
      OS_BOOT_MIN_MS -
        ((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt.current),
    );
    const id = window.setTimeout(() => setMinElapsed(true), remaining);
    return () => window.clearTimeout(id);
  }, []);

  const coreReady =
    mounted && !sessionBlocking && hasHydrated && launcherBootReady && minElapsed;

  // Do NOT put `fading` in deps — that cleared the hide timeout and left the desktop
  // with pointer-events-none forever (invisible overlay / unclickable UI).
  useEffect(() => {
    if (!coreReady || hidden) return;
    setFading(true);
    const id = window.setTimeout(() => setHidden(true), OS_BOOT_FADE_MS);
    return () => window.clearTimeout(id);
  }, [coreReady, hidden]);

  const showSplash = !hidden;
  /** While fading, splash already ignores pointers — keep the desktop clickable. */
  const blockPointer = showSplash && !fading;

  const phase =
    !mounted || sessionBlocking
      ? ("session" as const)
      : !hasHydrated || !launcherBootReady
        ? ("desktop" as const)
        : ("ready" as const);

  return { showSplash, fading, phase, blockPointer };
}
