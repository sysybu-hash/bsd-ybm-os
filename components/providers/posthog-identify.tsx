"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import {
  identifyPostHogUser,
  initPostHog,
  resetPostHogUser,
} from "@/lib/analytics/posthog-client";
import { getPostHogProjectKey } from "@/lib/analytics/posthog-env";

/** חייב להיות בתוך SessionProvider */
export default function PostHogIdentify() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (!getPostHogProjectKey()) return;
    initPostHog();

    if (status === "unauthenticated") {
      resetPostHogUser();
      return;
    }

    const id = session?.user?.id;
    if (!id) return;

    identifyPostHogUser(id, {
      email: session.user?.email ?? null,
      organizationId: session.user?.organizationId ?? null,
    });
  }, [session?.user?.id, session?.user?.email, session?.user?.organizationId, status]);

  return null;
}
