"use server";

import { AccountStatus, type SubscriptionTier, type UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAdmin } from "@/lib/is-admin";
import { prisma } from "@/lib/prisma";

async function requireOSOwner() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return null;
  }
  return session;
}

export type PendingRegistrationRow = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  organizationId: string | null;
  organizationName: string | null;
};

export async function listPendingRegistrationsAction(): Promise<
  PendingRegistrationRow[] | { error: string }
> {
  const s = await requireOSOwner();
  if (!s) return { error: "אין הרשאה" };

  const users = await prisma.user.findMany({
    where: { accountStatus: AccountStatus.PENDING_APPROVAL },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      organizationId: true,
      organization: { select: { name: true } },
    },
    take: 200,
  });

  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: u.createdAt.toISOString(),
    organizationId: u.organizationId,
    organizationName: u.organization?.name ?? null,
  }));
}

export type AdminOrganizationOption = {
  id: string;
  name: string;
};

export async function listOrganizationsForAdminAction(): Promise<
  AdminOrganizationOption[] | { error: string }
> {
  const s = await requireOSOwner();
  if (!s) return { error: "אין הרשאה" };

  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
    take: 500,
  });
  return orgs;
}
