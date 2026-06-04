"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PostHogProvider } from "posthog-js/react";
import { subscribeAnalyticsConsent } from "@/lib/analytics/posthog-consent";
import { initPostHog, posthog } from "@/lib/analytics/posthog-client";
import { getPostHogProjectKey } from "@/lib/analytics/posthog-env";

function PostHogPageView({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!enabled || !pathname || !getPostHogProjectKey()) return;
    initPostHog({ skipConsentCheck: true });
    const query = searchParams?.toString();
    const url = `${window.location.origin}${pathname}${query ? `?${query}` : ""}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams, enabled]);

  return null;
}

export function CSPostHogProvider({ children }: { children: React.ReactNode }) {
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false);

  useEffect(() => subscribeAnalyticsConsent(setAnalyticsAllowed), []);

  useEffect(() => {
    if (analyticsAllowed) {
      initPostHog({ skipConsentCheck: true });
    }
  }, [analyticsAllowed]);

  if (!getPostHogProjectKey() || !analyticsAllowed) {
    return <>{children}</>;
  }

  return (
    <PostHogProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView enabled={analyticsAllowed} />
      </Suspense>
      {children}
    </PostHogProvider>
  );
}
