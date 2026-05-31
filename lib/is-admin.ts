import type { UserRole } from "@prisma/client";
import { env } from "@/lib/env";

/** סופר-אדמינים קבועים בפלטפורמה */
export const DEFAULT_OS_ADMIN_EMAILS = [
  "yb@bsd-ybm.co.il",
  "sysybu@gmail.com",
] as const;

/** @deprecated השתמשו ב־osAdminEmails() */
export const DEFAULT_OS_ADMIN_EMAIL = DEFAULT_OS_ADMIN_EMAILS[0];

function parseEmailList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;]/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

/** כל כתובות הסופר-אדמין (env: OS_ADMIN_EMAILS או OS_ADMIN_EMAIL, מופרד בפסיק) */
export function osAdminEmails(): string[] {
  const fromEnv = [
    ...parseEmailList(env.OS_ADMIN_EMAILS),
    ...parseEmailList(env.OS_ADMIN_EMAIL),
  ];
  const merged = [...fromEnv, ...DEFAULT_OS_ADMIN_EMAILS.map((e) => e.toLowerCase())];
  return [...new Set(merged)];
}

/** כתובת ראשית לתאימות לאחור (התראות מערכת) */
export function osOwnerEmail(): string {
  return osAdminEmails()[0] ?? DEFAULT_OS_ADMIN_EMAILS[0];
}

/** @deprecated Use osOwnerEmail() */
export const OS_ADMIN_EMAIL = DEFAULT_OS_ADMIN_EMAILS[0];

/** @deprecated Use osOwnerEmail() */
export const OS_SUPER_ADMIN_EMAIL = DEFAULT_OS_ADMIN_EMAILS[0];

export function isAdmin(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  return osAdminEmails().includes(e);
}

export function jwtRoleForSession(
  email: string | null | undefined,
  dbRole: UserRole | string,
): string {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return String(dbRole);
  if (isAdmin(e)) return "SUPER_ADMIN";
  if (String(dbRole) === "SUPER_ADMIN") return "ORG_ADMIN";
  return String(dbRole);
}
