"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = Readonly<{
  children: ReactNode;
  timeoutMs?: number;
}>;

/** Mounts children after idle — keeps cookie banner / analytics off the LCP path. */
export default function DeferUntilIdle({ children, timeoutMs = 5000 }: Props) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const run = () => setReady(true);
    const w = window as Window & { requestIdleCallback?: typeof requestIdleCallback };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(run, { timeout: timeoutMs });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = globalThis.setTimeout(run, Math.min(timeoutMs, 2000));
    return () => globalThis.clearTimeout(id);
  }, [timeoutMs]);

  if (!ready) return null;
  return children;
}
