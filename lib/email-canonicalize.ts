/**
 * נרמול אימייל לרשימות התחברות (allowlist / blocklist).
 * Gmail: הסרת נקודות ב-local לתאימות ל-Google OAuth.
 */
export function canonicalizeLoginEmail(email: string | null | undefined): string {
  const raw = email?.trim().toLowerCase() ?? "";
  if (!raw) return "";
  const at = raw.lastIndexOf("@");
  if (at < 0) return raw;
  let local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}
