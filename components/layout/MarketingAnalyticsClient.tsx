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

/** PostHog רק אחרי consent — בלי SessionProvider */
export function MarketingAnalyticsClient() {
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false);
  const [idleReady, setIdleReady] = useState(false);

  useEffect(() => {
    const run = () => setIdleReady(true);
    const w = window as Window & { requestIdleCallback?: typeof requestIdleCallback };
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(run, { timeout: 5000 });
    } else {
      globalThis.setTimeout(run, 3500);
    }
  }, []);

  useEffect(() => subscribeAnalyticsConsent(setAnalyticsAllowed), []);

  useEffect(() => {
    if (analyticsAllowed && idleReady) initPostHog({ skipConsentCheck: true });
  }, [analyticsAllowed, idleReady]);

  if (!idleReady || !getPostHogProjectKey() || !analyticsAllowed) return null;

  return (
    <PostHogProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView enabled={analyticsAllowed} />
      </Suspense>
    </PostHogProvider>
  );
}
