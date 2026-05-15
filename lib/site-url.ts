/** כתובת אתר ראשית בפרודקשן */
export const PRODUCTION_SITE_URL = "https://bsd-ybm.co.il";

/**
 * כתובת בסיס ל-NextAuth / OAuth — תמיד HTTPS בפרודקשן.
 * סדר עדיפות: NEXTAUTH_URL → AUTH_URL → NEXT_PUBLIC_SITE_URL → VERCEL_URL
 */
export function resolveSiteBaseUrl(): string | undefined {
  const candidates = [
    process.env.NEXTAUTH_URL,
    process.env.AUTH_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ];
  for (const raw of candidates) {
    const t = raw?.trim();
    if (t) return t.replace(/\/$/, "");
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`.replace(/\/$/, "");
  return undefined;
}

export function applyNextAuthUrlEnv(): void {
  const base = resolveSiteBaseUrl();
  if (!base) return;
  process.env.NEXTAUTH_URL = base;
  if (!process.env.AUTH_URL?.trim()) {
    process.env.AUTH_URL = base;
  }
}
