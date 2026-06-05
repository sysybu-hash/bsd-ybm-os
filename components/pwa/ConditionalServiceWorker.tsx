"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { shouldSkipServiceWorkerRegistration } from "@/lib/perf/marketing-paths";

/** רישום SW במרחב עבודה; בדף נחיתה שיווקי רק כשה-workspace פעיל (rewrite מ־`/`) */
export default function ConditionalServiceWorker() {
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      const workspaceActive = document.documentElement.dataset.workspaceActive === "true";
      if (shouldSkipServiceWorkerRegistration(pathname, workspaceActive)) return;

      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .then((registration) => {
          void registration.update();
        })
        .catch(() => undefined);
    };

    const runRegister = () => {
      if (document.readyState === "complete") {
        register();
      } else {
        window.addEventListener("load", register, { once: true });
      }
    };

    runRegister();
    const observer = new MutationObserver(runRegister);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-workspace-active"],
    });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
