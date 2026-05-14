"use client";

import { COOKIE_CONSENT_STORAGE_KEY, parseStoredConsent } from "@/lib/cookie-consent";

export async function trackWizardEvent(action: string, details?: string): Promise<void> {
  try {
    const rawConsent = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    const consent = parseStoredConsent(rawConsent);
    if (!consent?.analytics) return;

    await fetch("/api/telemetry/wizard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, details }),
    });
  } catch {
    // Telemetry should never block UI flow.
  }
}
