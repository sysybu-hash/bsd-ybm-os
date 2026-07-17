"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

const INTERVAL_MS = 60_000;

/**
 * שולח heartbeat נוכחות כשהמשתמש מחובר ובכרטיסייה פעילה.
 * משמש את טאב «כניסות» בניהול הפלטפורמה.
 */
export default function PresenceHeartbeat() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const lastSent = useRef(0);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;

    const beat = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastSent.current < 20_000) return;
      lastSent.current = now;
      void fetch("/api/presence/heartbeat", {
        method: "POST",
        credentials: "include",
      }).catch(() => undefined);
    };

    beat();
    const id = window.setInterval(beat, INTERVAL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [status, userId]);

  return null;
}
