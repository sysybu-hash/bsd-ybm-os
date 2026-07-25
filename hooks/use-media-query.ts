"use client";

import { useEffect, useState } from "react";

/**
 * Tracks a CSS media query (e.g. `(max-width: 767px)`) reactively via matchMedia.
 * Always starts at `false` so the client's first render matches the server's
 * (window-less) render — the real value is picked up in an effect after mount,
 * same as any other SSR-safe viewport hook.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
