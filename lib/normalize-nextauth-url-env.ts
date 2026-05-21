/**
 * NextAuth (getToken ב-edge) קובע `secureCookie` לפי `NEXTAUTH_URL?.startsWith("https://")`.
 * אם בפרודקשן הוגדר `http://...`, מחפשים `next-auth.session-token` במקום `__Secure-next-auth.session-token`
 * והסשן "נעלם" — 401 ב־middleware למרות שהמשתמש מחובר.
 */
function isLoopbackAuthHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

export function normalizeNextAuthUrlEnv(): void {
  const raw = process.env.NEXTAUTH_URL?.trim();
  if (!raw) return;
  if (!raw.toLowerCase().startsWith("http://")) return;
  if (!(process.env.VERCEL || process.env.NODE_ENV === "production")) return;
  try {
    const { hostname } = new URL(raw);
    /* Playwright / next start על 127.0.0.1 — לא להמיר ל-https (שובר עוגיות Secure על HTTP). */
    if (isLoopbackAuthHost(hostname)) return;
  } catch {
    return;
  }
  process.env.NEXTAUTH_URL = `https://${raw.slice("http://".length)}`;
}
