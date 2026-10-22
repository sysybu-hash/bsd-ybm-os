/** The login that may paint. Further addresses are added with VIZ_PAINT_EMAILS. */
export const VIZ_PAINT_EMAIL = "sysybu@gmail.com";

export function vizPaintEmails(extraEmails: string | null | undefined): string[] {
  const allowed = new Set<string>();
  for (const raw of [VIZ_PAINT_EMAIL, ...(extraEmails ?? "").split(/[,;]/)]) {
    const email = raw.trim().toLowerCase();
    if (email.includes("@")) allowed.add(email);
  }
  return [...allowed];
}

export function isVizPaintEmail(
  email: string | null | undefined,
  extraEmails: string | null | undefined,
): boolean {
  const who = (email ?? "").trim().toLowerCase();
  if (!who.includes("@")) return false;
  return vizPaintEmails(extraEmails).includes(who);
}
