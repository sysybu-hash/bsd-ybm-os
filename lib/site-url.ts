/** כתובת אתר ראשית בפרודקשן */
/** דומיין קנוני ל-OAuth / מדיניות (תואם legal-site.publicUrl) */
export const PRODUCTION_SITE_URL = "https://www.bsd-ybm.co.il";

/**
 * כתובת בסיס ל-NextAuth / OAuth — תמיד HTTPS בפרודקשן.
 * סדר עדיפות: NEXTAUTH_URL → AUTH_URL → (פרודקשן) NEXT_PUBLIC_SITE_URL → VERCEL_URL
 *
 * בפיתוח לא משתמשים ב-NEXT_PUBLIC_SITE_URL — לעיתים מוגדר לדומיין ייצור ושובר OAuth מול localhost.
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
