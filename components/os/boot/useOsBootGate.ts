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
};

/**
 * Keeps the boot splash visible until session + layout are ready and min time elapsed.
 */
export function useOsBootGate({ mounted, sessionBlocking, hasHydrated }: Args) {
  const startedAt = useRef(
    typeof performance !== "undefined" ? performance.now() : Date.now(),
  );
  const [minElapsed, setMinElapsed] = useState(false);
  const [fading, setFading] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const remaining = Math.max(
      0,
      OS_BOOT_MIN_MS - ((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt.current),
    );
    const id = window.setTimeout(() => setMinElapsed(true), remaining);
    return () => window.clearTimeout(id);
  }, []);

  const coreReady = mounted && !sessionBlocking && hasHydrated && minElapsed;

  useEffect(() => {
    if (!coreReady || hidden || fading) return;
    setFading(true);
    const id = window.setTimeout(() => setHidden(true), OS_BOOT_FADE_MS);
    return () => window.clearTimeout(id);
  }, [coreReady, hidden, fading]);

  const showSplash = !hidden;
  const phase =
    !mounted || sessionBlocking
      ? ("session" as const)
      : !hasHydrated
        ? ("desktop" as const)
        : ("ready" as const);

  return { showSplash, fading, phase };
}
