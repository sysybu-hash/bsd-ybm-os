/**
 * Growth funnel events (PostHog) — landing → register → activate → pay.
 * Client helpers only; API routes use marketing-funnel-server.ts.
 */
export { FUNNEL_EVENTS } from "@/lib/analytics/marketing-funnel-events";
export {
  trackFunnelActivated,
  trackFunnelCtaRegister,
  trackFunnelLeadSubmitted,
  trackFunnelPayStarted,
  trackFunnelRegisterCompleted,
  trackFunnelRegisterStarted,
} from "@/lib/analytics/marketing-funnel-client";
