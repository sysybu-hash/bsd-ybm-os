"use client";

import { useLayoutEffect } from "react";
import { isMobileViewport } from "@/lib/workspace/window-layout-policy";

function syncMobileViewportDataset(): boolean {
  const mobile = isMobileViewport();
  document.documentElement.dataset.mobileViewport = mobile ? "true" : "false";
  return mobile;
}

/** מסנכרן data-mobile-viewport על html — לשימוש ב-Tailwind mobile-vp / desktop-vp. */
export function useMobileViewportSync(): void {
  useLayoutEffect(() => {
    const apply = () => {
      syncMobileViewportDataset();
    };

    apply();
    window.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("resize", apply);
    window.visualViewport?.addEventListener("scroll", apply);

    return () => {
      window.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("resize", apply);
      window.visualViewport?.removeEventListener("scroll", apply);
      delete document.documentElement.dataset.mobileViewport;
    };
  }, []);
}
