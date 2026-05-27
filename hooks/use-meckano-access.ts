"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { isMeckanoSubscriberEmail } from "@/lib/meckano-access";
import { useIsPlatformAdmin } from "@/hooks/use-is-platform-admin";
import {
  isApiCooldown,
  markApiCooldownFromResponse,
} from "@/lib/client/api-rate-limit-backoff";

const MECKANO_ACCESS_KEY = "api:meckano/access";

export function useMeckanoAccess() {
  const { data: session, status } = useSession();
  const isPlatformAdmin = useIsPlatformAdmin();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated") {
      setAllowed(false);
      return;
    }

    if (isPlatformAdmin || isMeckanoSubscriberEmail(session?.user?.email)) {
      setAllowed((prev) => (prev === null ? true : prev));
    }

    let cancelled = false;
    void (async () => {
      if (isApiCooldown(MECKANO_ACCESS_KEY)) {
        if (!cancelled) setAllowed(false);
        return;
      }
      try {
        const res = await fetch("/api/meckano/access", { credentials: "same-origin" });
        if (markApiCooldownFromResponse(MECKANO_ACCESS_KEY, res)) {
          if (!cancelled) setAllowed(false);
          return;
        }
        const data = (await res.json()) as { allowed?: boolean };
        if (!cancelled) setAllowed(Boolean(data.allowed));
      } catch {
        if (!cancelled) setAllowed(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.email, isPlatformAdmin]);

  const loading = status === "loading" || (status === "authenticated" && allowed === null);

  return {
    allowed: allowed === true,
    loading,
  };
}
