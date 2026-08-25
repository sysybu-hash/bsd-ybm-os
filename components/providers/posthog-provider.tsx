"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { subscribeAnalyticsConsent } from "@/lib/analytics/posthog-consent";
import { capturePageview, initPostHog, posthog } from "@/lib/analytics/posthog-client";
import { getPostHogProjectKey } from "@/lib/analytics/posthog-env";

const PostHogProvider = dynamic(
  () => import("posthog-js/react").then((m) => ({ default: m.PostHogProvider })),
  { ssr: false },
);

function PostHogPageView({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!enabled || !pathname || !getPostHogProjectKey()) return;
    const query = searchParams?.toString();
    const url = `${window.location.origin}${pathname}${query ? `?${query}` : ""}`;
    // Deliberately does NOT initialise. This effect runs on mount, so calling
    // initPostHog() here loaded PostHog immediately and made the idle deferral
    // below dead code — measured as 324KB of recorder/surveys/autocapture
    // arriving 845ms into a workspace load, against an LCP of ~6s. The pageview
    // is queued and flushed once initialisation actually happens.
    capturePageview(url);
  }, [pathname, searchParams, enabled]);

  return null;
}

export function CSPostHogProvider({ children }: { children: React.ReactNode }) {
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false);

  useEffect(() => subscribeAnalyticsConsent(setAnalyticsAllowed), []);

  useEffect(() => {
    if (!analyticsAllowed) return;
    const run = () => initPostHog({ skipConsentCheck: true });
    const w = window as Window & { requestIdleCallback?: typeof requestIdleCallback };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(run, { timeout: 8000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const timer = globalThis.setTimeout(run, 2000);
    return () => globalThis.clearTimeout(timer);
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
