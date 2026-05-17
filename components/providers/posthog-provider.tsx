"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { PostHogProvider } from "posthog-js/react";
import {
  identifyPostHogUser,
  initPostHog,
  posthog,
  resetPostHogUser,
} from "@/lib/analytics/posthog-client";
import { getPostHogProjectKey } from "@/lib/analytics/posthog-env";

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || !getPostHogProjectKey()) return;
    initPostHog();
    const query = searchParams?.toString();
    const url = `${window.location.origin}${pathname}${query ? `?${query}` : ""}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

function PostHogIdentify() {
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

export function CSPostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  if (!getPostHogProjectKey()) {
    return <>{children}</>;
  }

  return (
    <PostHogProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      <PostHogIdentify />
      {children}
    </PostHogProvider>
  );
}
