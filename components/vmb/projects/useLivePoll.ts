"use client";

import { useEffect, useRef } from "react";

/**
 * Polls `url` every `intervalMs` while `active`, paused while the tab is
 * hidden. The job lives on the server, so a missed tick only delays the bar.
 */
export function useLivePoll<T>(url: string, active: boolean, onData: (data: T) => void, intervalMs = 2000) {
  const cb = useRef(onData);
  useEffect(() => {
    cb.current = onData;
  });

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ctrl = new AbortController();

    const tick = async () => {
      if (stopped) return;
      if (!document.hidden) {
        try {
          const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
          if (res.ok) cb.current((await res.json()) as T);
        } catch {
          /* offline or aborted: try again next tick */
        }
      }
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };
    timer = setTimeout(tick, intervalMs);
    return () => {
      stopped = true;
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, [url, active, intervalMs]);
}
