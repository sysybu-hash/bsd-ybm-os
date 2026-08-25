"use client";

import { useSession } from "next-auth/react";
import { isMeckanoSubscriberEmail } from "@/lib/meckano-subscriber";

/**
 * Access is a pure function of the session, so it is computed during render
 * rather than mirrored into state by an effect. The old version held an
 * `allowed` state that the effect wrote on every session change, which meant one
 * extra render on every transition and a `null` window where `loading` was true
 * even though the answer was already known.
 */
export function useMeckanoAccess() {
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const allowed =
    status === "authenticated" && isMeckanoSubscriberEmail(session?.user?.email);

  return { allowed, loading };
}
