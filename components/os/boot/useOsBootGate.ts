"use client";

import { useEffect, useState } from "react";
import { OS_BOOT_FADE_MS, OS_BOOT_MIN_MS } from "@/components/os/boot/OsBootSplash";

type Args = {
  mounted: boolean;
  sessionBlocking: boolean;
  hasHydrated: boolean;
  launcherBootReady?: boolean;
};

/**
 * Keeps the boot splash until session + layout + launcher are ready.
 * Splash uses the same desktop background — only content fades out.
 */
export function useOsBootGate({
  mounted,
  sessionBlocking,
  hasHydrated,
  launcherBootReady = true,
}: Args) {
  const [minElapsed, setMinElapsed] = useState(false);
  const [hidden, setHidden] = useState(false);

  // The start timestamp used to be captured in a useRef initialiser, which
  // calls performance.now() during render — impure, and flagged by the React
  // Compiler rules. It only ever fed this one subtraction, and the effect runs
  // a few milliseconds after that render, so the remaining time it computed was
  // OS_BOOT_MIN_MS minus render-to-effect latency. Out of 700ms that is noise,
  // and starting the clock here is arguably closer to intent: the splash is on
  // screen from paint, not from the render pass.
  useEffect(() => {
    const id = window.setTimeout(() => setMinElapsed(true), OS_BOOT_MIN_MS);
    return () => window.clearTimeout(id);
  }, []);

  const coreReady =
    mounted && !sessionBlocking && hasHydrated && launcherBootReady && minElapsed;

  // `fading` used to be state that an effect flipped on the render after
  // coreReady turned true. It is the same value as coreReady — the splash fades
  // exactly when the OS is ready — so it is derived instead, and the effect is
  // left owning only the timer that removes the splash once the fade is over.
  const fading = coreReady;

  useEffect(() => {
    if (!coreReady || hidden) return;
    const id = window.setTimeout(() => setHidden(true), OS_BOOT_FADE_MS);
    return () => window.clearTimeout(id);
  }, [coreReady, hidden]);

  const showSplash = !hidden;
  const blockPointer = showSplash && !fading;

  const phase =
    !mounted || sessionBlocking
      ? ("session" as const)
      : !hasHydrated || !launcherBootReady
        ? ("desktop" as const)
        : ("ready" as const);

  return { showSplash, fading, phase, blockPointer };
}
