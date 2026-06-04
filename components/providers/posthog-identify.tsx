"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  identifyPostHogUser,
  initPostHog,
  resetPostHogUser,
} from "@/lib/analytics/posthog-client";
import { getPostHogProjectKey } from "@/lib/analytics/posthog-env";
import { trackFunnelActivated } from "@/lib/analytics/marketing-funnel";

/** חייב להיות בתוך SessionProvider */
export default function PostHogIdentify() {
  const { data: session, status } = useSession();
  const activatedTracked = useRef(false);

  useEffect(() => {
    if (!getPostHogProjectKey()) return;
    initPostHog();

    if (status === "unauthenticated") {
      activatedTracked.current = false;
      resetPostHogUser();
      return;
    }

    const id = session?.user?.id;
    const organizationId = session?.user?.organizationId;
    if (!id) return;

    identifyPostHogUser(id, {
      email: session.user?.email ?? null,
      organizationId: organizationId ?? null,
    });

    if (organizationId && !activatedTracked.current) {
      activatedTracked.current = true;
      trackFunnelActivated({ organizationId, tier: "session" });
    }
  }, [session?.user?.id, session?.user?.email, session?.user?.organizationId, status]);

  return null;
}
