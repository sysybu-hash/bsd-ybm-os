"use client";

import { useEffect, useRef } from "react";

const MOBILE_CHROME_MQL = "(max-width: 767px)";

function measureChromeBottomPx(host: HTMLElement): number {
  const viewportBottom =
    window.visualViewport != null
      ? window.visualViewport.offsetTop + window.visualViewport.height
      : window.innerHeight;

  const nav = host.querySelector<HTMLElement>("nav.mobile-bottom-nav-bar");
  if (!nav) {
    return Math.max(0, Math.ceil(viewportBottom - host.getBoundingClientRect().top));
  }

  // שורת האייקונים בלבד — בלי תוספת מרווח (גלילה דרך scroll-padding בתוכן)
  const iconRow = nav.querySelector<HTMLElement>(".mobile-bottom-nav-icon-row");
  const anchorTop = (iconRow ?? nav).getBoundingClientRect().top;

  return Math.max(0, Math.ceil(viewportBottom - anchorTop));
}

/** מסנכרן את --mobile-chrome-bottom לגובה האמיתי של הסרגל התחתון במובייל. */
export function useMobileChromeBottomSync(syncKey: number | boolean = 0) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const root = document.documentElement;
    const mql = window.matchMedia(MOBILE_CHROME_MQL);

    const apply = () => {
      if (!mql.matches) {
        root.style.removeProperty("--mobile-chrome-bottom");
        return;
      }
      root.style.setProperty("--mobile-chrome-bottom", `${measureChromeBottomPx(host)}px`);
    };

    apply();

    const ro = new ResizeObserver(apply);
    ro.observe(host);
    const nav = host.querySelector("nav.mobile-bottom-nav-bar");
    if (nav) ro.observe(nav);
    const iconRow = host.querySelector(".mobile-bottom-nav-icon-row");
    if (iconRow) ro.observe(iconRow);

    const onViewportChange = () => apply();
    window.visualViewport?.addEventListener("resize", onViewportChange);
    window.visualViewport?.addEventListener("scroll", onViewportChange);
    mql.addEventListener("change", apply);
    window.addEventListener("resize", onViewportChange);

    return () => {
      ro.disconnect();
      window.visualViewport?.removeEventListener("resize", onViewportChange);
      window.visualViewport?.removeEventListener("scroll", onViewportChange);
      mql.removeEventListener("change", apply);
      window.removeEventListener("resize", onViewportChange);
      root.style.removeProperty("--mobile-chrome-bottom");
    };
  }, [syncKey]);

  return hostRef;
}
