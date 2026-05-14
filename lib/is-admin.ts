import type { UserRole } from "@prisma/client";

export const DEFAULT_OS_ADMIN_EMAIL = "sysybu@gmail.com";

export function osOwnerEmail(): string {
  const raw = process.env.OS_ADMIN_EMAIL?.trim().toLowerCase();
  if (raw && raw.includes("@")) return raw;
  return DEFAULT_OS_ADMIN_EMAIL;
}

/** @deprecated Use osOwnerEmail() so env overrides are respected. */
export const OS_ADMIN_EMAIL = DEFAULT_OS_ADMIN_EMAIL;

/** @deprecated Use osOwnerEmail() so env overrides are respected. */
export const OS_SUPER_ADMIN_EMAIL = DEFAULT_OS_ADMIN_EMAIL;

export function isAdmin(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === osOwnerEmail();
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
