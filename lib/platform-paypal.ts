/**
 * PayPal של מפעיל ה-OS בלבד — משתני סביבה.
 * נפרד מ־paypalMerchantEmail / paypalMeSlug של כל ארגון (לקוחות קצה).
 */
export type OSPayPalConfig = {
  merchantEmail: string | null;
  meSlug: string | null;
};

function normalizeMeSlug(raw: string): string {
  return raw
    .replace(/^https?:\/\/(www\.)?paypal\.me\//i, "")
    .replace(/^\/+|\/+$/g, "");
}

export function getOSPayPalConfig(): OSPayPalConfig {
  const merchantEmail = process.env.OS_PAYPAL_MERCHANT_EMAIL?.trim() || null;
  const slugRaw = process.env.OS_PAYPAL_ME_SLUG?.trim();
  const meSlug = slugRaw ? normalizeMeSlug(slugRaw) : null;
  return { merchantEmail, meSlug };
}

export function hasOSPayPalConfigured(): boolean {
  const c = getOSPayPalConfig();
  return Boolean(c.merchantEmail || c.meSlug);
}
