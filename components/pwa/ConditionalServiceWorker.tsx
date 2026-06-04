"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isMarketingPublicShellPath } from "@/lib/perf/marketing-paths";

/** רישום SW רק מחוץ לדף הנחיתה השיווקי — מפחית עבודה ראשונית ב-Lighthouse */
export default function ConditionalServiceWorker() {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    if (isMarketingPublicShellPath(pathname)) return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => {
          void registration.update();
        })
        .catch(() => undefined);
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }
  }, [pathname]);

  return null;
}
