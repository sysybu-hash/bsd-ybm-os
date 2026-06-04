import {
  COOKIE_CONSENT_STORAGE_KEY,
  type CookieConsentState,
  parseStoredConsent,
} from "@/lib/cookie-consent";

export function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  const stored = parseStoredConsent(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
  return stored?.analytics === true;
}

export function subscribeAnalyticsConsent(onChange: (allowed: boolean) => void): () => void {
  const notify = () => onChange(hasAnalyticsConsent());
  notify();

  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<CookieConsentState>).detail;
    onChange(detail?.analytics === true);
  };

  window.addEventListener("bsd-cookie-consent-updated", onCustom);
  return () => window.removeEventListener("bsd-cookie-consent-updated", onCustom);
}
