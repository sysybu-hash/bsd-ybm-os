"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getPostHogProjectKey } from "@/lib/analytics/posthog-env";
import type posthogJs from "posthog-js";

const PostHogProvider = dynamic(
  () => import("posthog-js/react").then((m) => ({ default: m.PostHogProvider })),
  { ssr: false },
);

function PostHogPageView({ client }: { client: typeof posthogJs }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || !getPostHogProjectKey()) return;
    const query = searchParams?.toString();
    const url = `${window.location.origin}${pathname}${query ? `?${query}` : ""}`;
    // Queued rather than initialising: see the note in posthog-client.ts. This
    // effect runs on mount, so initialising here would pull the recorder and
    // surveys bundles in on first paint.
    void import("@/lib/analytics/posthog-client").then(({ capturePageview }) => {
      capturePageview(url);
    });
  }, [pathname, searchParams, client]);

  return null;
}

export default function MarketingPostHogIsland() {
  const [client, setClient] = useState<typeof posthogJs | null>(null);

  useEffect(() => {
    /**
     * Deferred to idle, matching CSPostHogProvider. posthog.init() pulls in the
     * session recorder, surveys and autocapture bundles — 324KB of third-party
     * script that has no reason to compete with the page it is measuring.
     */
    const run = () => {
      void import("@/lib/analytics/posthog-client").then(({ initPostHog, posthog }) => {
        initPostHog({ skipConsentCheck: true });
        setClient(posthog);
      });
    };
    const w = window as Window & { requestIdleCallback?: typeof requestIdleCallback };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(run, { timeout: 8000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const timer = globalThis.setTimeout(run, 2000);
    return () => globalThis.clearTimeout(timer);
  }, []);

  if (!client) return null;

  return (
    <PostHogProvider client={client}>
      <Suspense fallback={null}>
        <PostHogPageView client={client} />
      </Suspense>
    </PostHogProvider>
  );
}
