export const COOKIE_CONSENT_STORAGE_KEY = "bsd-ybm-cookie-consent-v1";

export type CookieConsentState = {
  version: 1;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
};

export function parseStoredConsent(raw: string | null): CookieConsentState | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as CookieConsentState;
    if (v?.version !== 1 || v.necessary !== true) return null;
    if (typeof v.analytics !== "boolean" || typeof v.marketing !== "boolean") return null;
    return v;
  } catch {
    return null;
  }
}

export function dispatchConsentUpdated(state: CookieConsentState) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CookieConsentState>("bsd-cookie-consent-updated", { detail: state }),
  );
}

export const OPEN_COOKIE_SETTINGS_EVENT = "bsd-open-cookie-settings";

export function openCookieSettingsFromUi() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}
