import type { AutomationIntent } from "@/lib/os-automations/types";

/** בדיקת intent מופעל — בלקוח דרך API, בשרת ישירות מ-Prisma */
export async function checkAutomationIntentEnabled(intent: AutomationIntent): Promise<boolean> {
  if (typeof window === "undefined") {
    const { isAutomationIntentEnabled } = await import("@/lib/platform-settings");
    return isAutomationIntentEnabled(intent);
  }
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
