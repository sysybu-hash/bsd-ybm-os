"use client";

import posthog from "posthog-js";
import { hasAnalyticsConsent } from "@/lib/analytics/posthog-consent";
import { getPostHogHost, getPostHogProjectKey } from "@/lib/analytics/posthog-env";

let initialized = false;

export function initPostHog(options?: { skipConsentCheck?: boolean }): void {
  if (typeof window === "undefined" || initialized) return;
  if (!options?.skipConsentCheck && !hasAnalyticsConsent()) return;
  if ((posthog as { __loaded?: boolean }).__loaded) {
    initialized = true;
    return;
  }
  const key = getPostHogProjectKey();
  if (!key) return;
  posthog.init(key, {
    api_host: getPostHogHost(),
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: true,
  });
  initialized = true;
}

export function resetPostHogUser(): void {
  if (typeof window === "undefined" || !getPostHogProjectKey()) return;
  if (!(posthog as { __loaded?: boolean }).__loaded) return;
  posthog.reset();
}

export function captureProductEvent(
  event: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (!getPostHogProjectKey()) return;
  initPostHog();
  posthog.capture(event, properties);
}

export function identifyPostHogUser(
  userId: string,
  traits?: Record<string, string | number | boolean | null>,
): void {
  if (!getPostHogProjectKey()) return;
  initPostHog();
  posthog.identify(userId, traits);
}

export { posthog };
