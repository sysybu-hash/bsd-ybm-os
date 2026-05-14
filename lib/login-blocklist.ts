import { canonicalizeLoginEmail } from "@/lib/email-canonicalize";

let cache: Set<string> | null = null;

function blockedSet(): Set<string> {
  if (cache) return cache;
  const s = new Set<string>();
  const raw = process.env.LOGIN_BLOCKED_EMAILS?.trim();
  if (raw) {
    for (const part of raw.split(",")) {
      const c = canonicalizeLoginEmail(part.trim());
      if (c) s.add(c);
    }
  }
  cache = s;
  return s;
}

/** לאחר שינוי ENV בזמן ריצה (בדיקות) */
export function clearLoginBlockedEmailCache(): void {
  cache = null;
}

/** מיילים ב־LOGIN_BLOCKED_EMAILS (פסיקים) — לא יכולים להתחבר גם אם ACTIVE ב-DB */
export function isLoginBlockedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const c = canonicalizeLoginEmail(email);
  return c.length > 0 && blockedSet().has(c);
}
