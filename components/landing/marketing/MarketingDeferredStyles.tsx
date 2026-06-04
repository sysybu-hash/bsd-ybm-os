"use client";

import { useEffect } from "react";

/** טוען שכבת CSS מתחת לקיפול אחרי idle — מפחית CSS חוסם רינדור */
export default function MarketingDeferredStyles() {
  useEffect(() => {
    let loaded = false;
    const load = () => {
      if (loaded) return;
      loaded = true;
      void import("@/components/landing/marketing/marketing-cinematic-deferred.css");
    };
    const w = window as Window & { requestIdleCallback?: typeof requestIdleCallback };
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(load, { timeout: 1500 });
    } else {
      globalThis.setTimeout(load, 300);
    }
    window.addEventListener("scroll", load, { once: true, passive: true });
    return () => window.removeEventListener("scroll", load);
  }, []);

  return null;
}
