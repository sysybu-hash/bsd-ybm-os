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
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    const timeout = mobile ? 8000 : 6000;
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(run, { timeout });
    } else {
      globalThis.setTimeout(run, mobile ? 5000 : 4000);
    }
  }, []);

  useEffect(() => subscribeAnalyticsConsent(setAnalyticsAllowed), []);

  if (!idleReady || !getPostHogProjectKey() || !analyticsAllowed) return null;

  return <PostHogAnalyticsIsland />;
}
