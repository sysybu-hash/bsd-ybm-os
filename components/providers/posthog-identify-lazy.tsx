"use client";

import dynamic from "next/dynamic";

const PostHogIdentify = dynamic(() => import("@/components/providers/posthog-identify"), {
  ssr: false,
});

/** Defers PostHog identify until after hydration — keeps it out of the critical path. */
export default function PostHogIdentifyLazy() {
  return <PostHogIdentify />;
}
