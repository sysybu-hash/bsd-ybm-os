import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin, osOwnerEmail } from "@/lib/is-admin";

/** PostgreSQL INT — ערך גבוה ללא ניכוי מעשי */
export const OS_UNLIMITED_CREDITS = 2_147_483_647;

/** רשימת בעלי ה-OS — מסונכרן עם isAdmin (OS Owner) */
export function getOSDeveloperEmails(): string[] {
  return [osOwnerEmail()];
}

/** @deprecated השתמשו ב־isAdmin מ־lib/is-admin.ts */
export function isOSDeveloperEmail(email: string | null | undefined): boolean {
  return isAdmin(email);
}

/**
 * מעדכן משתמש מפתח: SUPER_ADMIN, ארגון עם מכסה מקסימימלית.
 * רק sysybu@gmail.com (isAdmin).
 */
export async function ensureOSDeveloperAccount(
  rawEmail: string | null | undefined,
): Promise<{ id: string; role: UserRole; organizationId: string | null } | null> {
  if (!rawEmail) return null;
  const normalized = rawEmail.trim().toLowerCase();
  if (!isAdmin(normalized)) return null;

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
  });
  if (!user) return null;

  if (user.role === "SUPER_ADMIN" && user.organizationId) {
    const orgQuick = await prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { cheapScansRemaining: true },
    });
    if (orgQuick && orgQuick.cheapScansRemaining >= 1_000_000_000) {
      return {
        id: user.id,
        role: user.role,
        organizationId: user.organizationId,
      };
    }
  }

  let orgId = user.organizationId;

  if (!orgId) {
    const org = await prisma.organization.create({
      data: {
        name: "BSD-YBM-OS — מפתחי מערכת",
        type: "ENTERPRISE",
        subscriptionTier: "CORPORATE",
        subscriptionStatus: "ACTIVE",
        cheapScansRemaining: OS_UNLIMITED_CREDITS,
        premiumScansRemaining: OS_UNLIMITED_CREDITS,
        maxCompanies: 999,
      },
      select: { id: true },
    });
    orgId = org.id;
  } else {
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        cheapScansRemaining: OS_UNLIMITED_CREDITS,
        premiumScansRemaining: OS_UNLIMITED_CREDITS,
        maxCompanies: 999,
        subscriptionTier: "CORPORATE",
        subscriptionStatus: "ACTIVE",
        name: "BSD-YBM-OS — מפתחי מערכת",
      },
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      role: "SUPER_ADMIN",
      organizationId: orgId,
      email: normalized,
      accountStatus: "ACTIVE",
    },
  });

  return {
    id: user.id,
    role: "SUPER_ADMIN",
    organizationId: orgId,
  };
}
