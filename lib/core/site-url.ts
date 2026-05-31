/** כתובת אתר ראשית בפרודקשן */
/** דומיין קנוני ל-OAuth / מדיניות (תואם legal-site.publicUrl) */
export const PRODUCTION_SITE_URL = "https://www.bsd-ybm.co.il";

/** apex → www — חייב להתאים ל-redirects ב-next.config.js ול-Google Console */
const PRODUCTION_HOST_ALIASES: Record<string, string> = {
  "bsd-ybm.co.il": "www.bsd-ybm.co.il",
};

/**
 * מנרמל host לפרודקשן (למשל `bsd-ybm.co.il` → `www.bsd-ybm.co.il`).
 * מונע redirect_uri_mismatch כש-NEXTAUTH_URL מוגדר בלי www.
 */
export function canonicalizeSiteBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "");
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const alias = PRODUCTION_HOST_ALIASES[url.hostname.toLowerCase()];
    if (alias) url.hostname = alias;
    return url.origin;
  } catch {
    return trimmed;
  }
}

/**
 * כתובת בסיס ל-NextAuth / OAuth — תמיד HTTPS בפרודקשן.
 * סדר עדיפות: NEXTAUTH_URL → AUTH_URL → (פרודקשן) NEXT_PUBLIC_SITE_URL → VERCEL_URL
 *
 * נשאר על process.env לקריאה דינמית (בדיקות + applyNextAuthUrlEnv).
 */
export function resolveSiteBaseUrl(): string | undefined {
  const candidates: (string | undefined)[] = [
    process.env.NEXTAUTH_URL,
    process.env.AUTH_URL,
  ];
  if (process.env.NODE_ENV === "production") {
    candidates.push(process.env.NEXT_PUBLIC_SITE_URL);
  }
  for (const raw of candidates) {
    const t = raw?.trim();
    if (t) return canonicalizeSiteBaseUrl(t);
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return canonicalizeSiteBaseUrl(`https://${vercel.replace(/^https?:\/\//, "")}`);
  return undefined;
}

export function applyNextAuthUrlEnv(): void {
  const base = resolveSiteBaseUrl();
  if (!base) return;
  process.env.NEXTAUTH_URL = base;
  process.env.AUTH_URL = canonicalizeSiteBaseUrl(process.env.AUTH_URL?.trim() || base);
}
