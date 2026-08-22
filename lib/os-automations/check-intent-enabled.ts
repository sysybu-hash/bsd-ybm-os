import type { AutomationIntent } from "@/lib/os-automations/types";

/**
 * Is this automation intent enabled in platform settings?
 *
 * Answered over the API, never from Prisma. This module sits in a client-only
 * graph: every consumer of `@/lib/os-automations/registry` is a browser hook or
 * component (`hooks/useAutomationRunner.ts`, `hooks/use-os-assistant.ts` via
 * `lib/os-assistant/tool-handler.ts`).
 *
 * It used to carry a `typeof window === "undefined"` branch that dynamically
 * imported `@/lib/platform-settings` for a server caller that never existed.
 * Webpack hid the cost; Turbopack traced the edge into the client graph and
 * dragged PrismaClient with it. If a genuine server-side caller ever appears,
 * give it `isAutomationIntentEnabled` from `@/lib/platform-settings` directly
 * rather than reviving the isomorphic branch here.
 */
export async function checkAutomationIntentEnabled(intent: AutomationIntent): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/os/automations/intent-enabled?intent=${encodeURIComponent(intent)}`,
      { credentials: "include", cache: "no-store" },
    );
    const data = (await res.json()) as { enabled?: boolean };
    return res.ok && data.enabled === true;
  } catch {
    return false;
  }
}
