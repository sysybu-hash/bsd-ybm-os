import "server-only";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import type { VmbSessionUser } from "@/lib/vmb/session";

/** VMB_SUPERADMIN_EMAILS, comma-separated, lower-cased. Empty when unset. */
export function parseAdminEmails(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * A listed address counts only once Google verified it: anyone can register
 * a password account with any address, so the list alone proves nothing.
 */
export function isSuperAdminEmail(email: string, emailVerified: boolean, list: Set<string>): boolean {
  return emailVerified && list.has(email.trim().toLowerCase());
}

/** Whether this signed-in VMB user is a platform-wide VMB administrator. */
export async function isVmbSuperAdmin(user: Pick<VmbSessionUser, "id" | "email">): Promise<boolean> {
  const list = parseAdminEmails(env.VMB_SUPERADMIN_EMAILS);
  if (!list.has(user.email.toLowerCase())) return false;
  const row = await prisma.vmbUser.findUnique({ where: { id: user.id }, select: { email: true, emailVerified: true } });
  return Boolean(row && isSuperAdminEmail(row.email, row.emailVerified, list));
}
