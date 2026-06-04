"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { subscribeAnalyticsConsent } from "@/lib/analytics/posthog-consent";
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
  const [consent, setConsent] = useState(false);

  useEffect(() => subscribeAnalyticsConsent(setConsent), []);

  useEffect(() => {
    if (!getPostHogProjectKey() || !consent) return;
    initPostHog({ skipConsentCheck: true });

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
  }, [session?.user?.id, session?.user?.email, session?.user?.organizationId, status, consent]);

  return null;
}
