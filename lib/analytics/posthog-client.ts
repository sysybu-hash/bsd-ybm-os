"use client";

import posthog from "posthog-js";
import { hasAnalyticsConsent } from "@/lib/analytics/posthog-consent";
import { getPostHogHost, getPostHogProjectKey } from "@/lib/analytics/posthog-env";

let initialized = false;

/**
 * Pageviews recorded before PostHog finished loading.
 *
 * Initialisation is deliberately deferred to idle (see CSPostHogProvider),
 * because posthog.init() pulls in the session recorder, surveys, and the
 * autocapture bundles — measured at 324KB arriving 845ms into a workspace load,
 * while the page is still hydrating. Anything that needs to record a pageview
 * before then queues here instead of forcing the load early.
 */
const pendingPageviews: string[] = [];

function flushPendingPageviews(): void {
  while (pendingPageviews.length > 0) {
    const url = pendingPageviews.shift();
    if (url) posthog.capture("$pageview", { $current_url: url });
  }
}

function isPostHogLoaded(): boolean {
  return Boolean((posthog as { __loaded?: boolean }).__loaded);
}

/**
 * Record a pageview without ever triggering initialisation.
 *
 * Callers that instead reached for `initPostHog()` defeated the idle deferral
 * entirely: the pageview effect runs on mount, so PostHog loaded immediately on
 * every navigation and the requestIdleCallback below never got the chance.
 */
export function capturePageview(url: string): void {
  if (!getPostHogProjectKey()) return;
  if (!isPostHogLoaded()) {
    // Keep only the most recent few — a long pre-init session should not grow
    // this without bound.
    if (pendingPageviews.length >= 10) pendingPageviews.shift();
    pendingPageviews.push(url);
    return;
  }
  posthog.capture("$pageview", { $current_url: url });
}

export function initPostHog(options?: { skipConsentCheck?: boolean }): void {
  if (typeof window === "undefined" || initialized) return;
  if (!options?.skipConsentCheck && !hasAnalyticsConsent()) return;
  if (isPostHogLoaded()) {
    initialized = true;
    flushPendingPageviews();
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
  flushPendingPageviews();
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
