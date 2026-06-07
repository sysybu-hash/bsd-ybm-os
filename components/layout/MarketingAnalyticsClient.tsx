"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { subscribeAnalyticsConsent } from "@/lib/analytics/posthog-consent";
import { getPostHogProjectKey } from "@/lib/analytics/posthog-env";

const PostHogAnalyticsIsland = dynamic(
  () => import("@/components/layout/MarketingPostHogIsland"),
  { ssr: false },
);

/** PostHog רק אחרי consent + idle — bundle נפרד, לא חוסם LCP */
export function MarketingAnalyticsClient() {
  const [analyticsAllowed, setAnalyticsAllowed] = useState(false);
  const [idleReady, setIdleReady] = useState(false);

  useEffect(() => {
    const run = () => setIdleReady(true);
    const w = window as Window & { requestIdleCallback?: typeof requestIdleCallback };
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(run, { timeout: 6000 });
    } else {
      globalThis.setTimeout(run, 4000);
    }
  }, []);

  useEffect(() => subscribeAnalyticsConsent(setAnalyticsAllowed), []);

  if (!idleReady || !getPostHogProjectKey() || !analyticsAllowed) return null;

  return <PostHogAnalyticsIsland />;
}
