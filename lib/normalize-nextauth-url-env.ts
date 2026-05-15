/**
 * NextAuth (getToken ב-edge) קובע `secureCookie` לפי `NEXTAUTH_URL?.startsWith("https://")`.
 * אם בפרודקשן הוגדר `http://...`, מחפשים `next-auth.session-token` במקום `__Secure-next-auth.session-token`
 * והסשן "נעלם" — 401 ב־middleware למרות שהמשתמש מחובר.
 */
export function normalizeNextAuthUrlEnv(): void {
  const raw = process.env.NEXTAUTH_URL?.trim();
  if (!raw) return;
  if (!raw.toLowerCase().startsWith("http://")) return;
  if (!(process.env.VERCEL || process.env.NODE_ENV === "production")) return;
  process.env.NEXTAUTH_URL = `https://${raw.slice("http://".length)}`;
}
