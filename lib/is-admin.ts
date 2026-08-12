import type { UserRole } from "@prisma/client";
import { env } from "@/lib/env";

/**
 * Development / test fallbacks only. Never merged in production —
 * Production must set OS_ADMIN_EMAIL or OS_ADMIN_EMAILS.
 */
const DEV_OS_ADMIN_EMAILS = [
  "yb@bsd-ybm.co.il",
  "sysybu@gmail.com",
] as const;

/** @deprecated השתמשו ב־osAdminEmails() / osOwnerEmail() */
export const DEFAULT_OS_ADMIN_EMAILS = DEV_OS_ADMIN_EMAILS;

/** @deprecated השתמשו ב־osOwnerEmail() */
export const DEFAULT_OS_ADMIN_EMAIL = DEV_OS_ADMIN_EMAILS[0];

function parseEmailList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;]/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/** כל כתובות הסופר-אדמין (env: OS_ADMIN_EMAILS או OS_ADMIN_EMAIL, מופרד בפסיק) */
export function osAdminEmails(): string[] {
  const fromEnv = [
    ...parseEmailList(env.OS_ADMIN_EMAILS),
    ...parseEmailList(env.OS_ADMIN_EMAIL),
  ];
  if (fromEnv.length > 0) {
    return [...new Set(fromEnv)];
  }
  // Production fail-closed: no hardcoded break-glass in source control
  if (isProductionRuntime()) {
    return [];
  }
  return DEV_OS_ADMIN_EMAILS.map((e) => e.toLowerCase());
}

/** כתובת ראשית לתאימות לאחור (התראות מערכת) */
export function osOwnerEmail(): string {
  return osAdminEmails()[0] ?? "";
}

/** @deprecated Use osOwnerEmail() */
export const OS_ADMIN_EMAIL = DEV_OS_ADMIN_EMAILS[0];

/** @deprecated Use osOwnerEmail() */
export const OS_SUPER_ADMIN_EMAIL = DEV_OS_ADMIN_EMAILS[0];

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
