import { AccountStatus, type UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/is-admin";
import { OS_UNLIMITED_CREDITS } from "@/lib/platform-developers";

/**
 * יוצר חשבון סופר-אדמין בפעם הראשונה (למשל yb@bsd-ybm.co.il לפני Google OAuth).
 */
export async function createOSAdminAccountIfMissing(
  rawEmail: string,
  name?: string | null,
): Promise<{ id: string; role: UserRole; organizationId: string } | null> {
  const normalized = rawEmail.trim().toLowerCase();
  if (!isAdmin(normalized)) return null;

  const existing = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
  });

  if (existing?.organizationId && existing.role === "SUPER_ADMIN") {
    return {
      id: existing.id,
      role: existing.role,
      organizationId: existing.organizationId,
    };
  }

  let orgId = existing?.organizationId ?? null;
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
  }

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: "SUPER_ADMIN",
        organizationId: orgId,
        accountStatus: AccountStatus.ACTIVE,
        email: normalized,
        ...(name?.trim() ? { name: name.trim() } : {}),
      },
    });
    return { id: existing.id, role: "SUPER_ADMIN", organizationId: orgId };
  }

  const user = await prisma.user.create({
    data: {
      email: normalized,
      name: name?.trim() || null,
      role: "SUPER_ADMIN",
      accountStatus: AccountStatus.ACTIVE,
      organizationId: orgId,
    },
    select: { id: true, role: true, organizationId: true },
  });

  if (!user.organizationId) return null;
  return {
    id: user.id,
    role: user.role,
    organizationId: user.organizationId,
  };
}
