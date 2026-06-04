"use client";

import { captureProductEvent } from "@/lib/analytics/posthog-client";
import { FUNNEL_EVENTS } from "@/lib/analytics/marketing-funnel-events";

export function trackFunnelCtaRegister(source: string): void {
  captureProductEvent(FUNNEL_EVENTS.ctaRegister, { source });
}

export function trackFunnelRegisterStarted(source: string): void {
  captureProductEvent(FUNNEL_EVENTS.registerStarted, { source });
}

export function trackFunnelRegisterCompleted(props: {
  pendingApproval: boolean;
  source?: string;
}): void {
  captureProductEvent(FUNNEL_EVENTS.registerCompleted, {
    pending_approval: props.pendingApproval ? "1" : "0",
    source: props.source ?? "register_wizard",
  });
}

export function trackFunnelLeadSubmitted(source: string): void {
  captureProductEvent(FUNNEL_EVENTS.leadSubmitted, { source });
}

export function trackFunnelActivated(props: {
  organizationId: string;
  tier: string;
}): void {
  captureProductEvent(FUNNEL_EVENTS.activated, {
    organization_id: props.organizationId,
    tier: props.tier,
  });
}

export function trackFunnelPayStarted(provider: string, tier: string): void {
  captureProductEvent(FUNNEL_EVENTS.payStarted, { provider, tier });
}
