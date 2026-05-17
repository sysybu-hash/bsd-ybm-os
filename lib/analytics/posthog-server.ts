import { PostHog } from "posthog-node";
import { getPostHogHost, getPostHogProjectKey } from "@/lib/analytics/posthog-env";

let client: PostHog | null = null;

function getServerPostHog(): PostHog | null {
  const key = getPostHogProjectKey();
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: getPostHogHost(),
    });
  }
  return client;
}

export function captureServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  const ph = getServerPostHog();
  if (!ph) return;
  ph.capture({ distinctId, event, properties });
}
