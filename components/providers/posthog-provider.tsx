"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { subscribeAnalyticsConsent } from "@/lib/analytics/posthog-consent";
import { initPostHog, posthog } from "@/lib/analytics/posthog-client";
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
