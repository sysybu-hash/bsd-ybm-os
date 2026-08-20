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
    void import("@/lib/analytics/posthog-client").then(({ initPostHog }) => {
      initPostHog({ skipConsentCheck: true });
      const query = searchParams?.toString();
      const url = `${window.location.origin}${pathname}${query ? `?${query}` : ""}`;
      client.capture("$pageview", { $current_url: url });
    });
  }, [pathname, searchParams, client]);

  return null;
}

export default function MarketingPostHogIsland() {
  const [client, setClient] = useState<typeof posthogJs | null>(null);

  useEffect(() => {
    void import("@/lib/analytics/posthog-client").then(({ initPostHog, posthog }) => {
      initPostHog({ skipConsentCheck: true });
      setClient(posthog);
    });
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
