import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { FUNNEL_EVENTS } from "@/lib/analytics/marketing-funnel-events";

export { FUNNEL_EVENTS };

type FunnelProps = Record<string, string | number | boolean | null>;

export function trackFunnelServer(
  distinctId: string,
  event: (typeof FUNNEL_EVENTS)[keyof typeof FUNNEL_EVENTS],
  properties?: FunnelProps,
): void {
  captureServerEvent(distinctId, event, properties);
}
