import { prisma } from "@/lib/prisma";
import { decrementScan, type ScanUsageWarningId } from "@/lib/decrement-scan";
import { isAdmin } from "@/lib/is-admin";
import { trialEndsAtFromNow } from "@/lib/trial";
import type { ScanCreditKind } from "@/lib/scan-credit-kind";

/**
 * ׳׳•׳•׳“׳ ׳©׳™׳© orgId ׳×׳§׳£: ׳׳ ׳—׳¡׳¨ ׳‘׳˜׳•׳§׳ ג€” ׳ ׳˜׳¢׳ ׳׳”׳׳©׳×׳׳© ׳‘׳׳¡׳“.
 * ׳׳ ׳׳™׳ ׳׳¨׳’׳•׳ ׳‘׳›׳׳ ג€” ׳ ׳•׳¦׳¨ ׳׳¨׳’׳•׳ ׳׳™׳©׳™ (׳׳›׳¡׳” ׳׳”׳¡׳›׳™׳׳”).
 */
export async function resolveOrganizationForUser(
  orgId: string,
  userId: string,
): Promise<{ id: string } | null> {
  if (orgId) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });
    if (org) return org;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true, email: true, name: true },
  });

  if (user?.organizationId) {
    return { id: user.organizationId };
  }

  const label =
    user?.name?.trim() ||
    user?.email?.split("@")[0]?.trim() ||
    "׳׳¨׳’׳•׳ ׳׳™׳©׳™";

  const created = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: `${label} ג€” BSD-YBM`,
        trialEndsAt: trialEndsAtFromNow(),
      },
      select: { id: true },
    });
    await tx.user.update({
      where: { id: userId },
      data: { organizationId: org.id },
    });
    return org;
  });

  return created;
}

/**
 * ׳‘׳•׳“׳§ ׳•׳׳ ׳›׳” ׳™׳×׳¨׳× ׳¡׳¨׳™׳§׳” ׳׳₪׳™ ׳¡׳•׳’ ׳׳ ׳•׳¢ (׳–׳•׳ / ׳₪׳¨׳™׳׳™׳•׳).
 * QUOTA_EXCEEDED ג†’ ׳”׳₪׳ ׳™׳” ׳ײ¾/app/settings/billing ׳׳¨׳›׳™׳©׳× ׳‘׳ ׳“׳.
 */
export async function checkAndDeductScanCredit(
  orgId: string,
  userId: string,
  kind: ScanCreditKind,
): Promise<
  | {
      allowed: true;
      organizationId: string;
      usageWarnings?: ScanUsageWarningId[];
    }
  | { allowed: false; error: string; code?: "QUOTA_EXCEEDED" }
> {
  const userRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (userRow?.email && isAdmin(userRow.email)) {
    const resolved = await resolveOrganizationForUser(orgId, userId);
    if (!resolved) {
      return { allowed: false, error: "׳׳©׳×׳׳© ׳׳ ׳ ׳׳¦׳ ׳‘׳׳¢׳¨׳›׳×." };
    }
    return { allowed: true, organizationId: resolved.id };
  }

  const resolved = await resolveOrganizationForUser(orgId, userId);
  if (!resolved) {
    return { allowed: false, error: "׳׳©׳×׳׳© ׳׳ ׳ ׳׳¦׳ ׳‘׳׳¢׳¨׳›׳×." };
  }

  const scanType = kind === "premium" ? "PREMIUM" : "CHEAP";
  const dec = await decrementScan(resolved.id, scanType);
  if (!dec.ok) {
    return {
      allowed: false,
      error: dec.error,
      code: dec.code,
    };
  }
  return {
    allowed: true,
    organizationId: resolved.id,
    usageWarnings: dec.usageWarnings?.length ? dec.usageWarnings : undefined,
  };
}

/** @deprecated ׳”׳©׳×׳׳©׳• ׳‘ײ¾checkAndDeductScanCredit ׳¢׳ ׳¡׳•׳’ ׳׳ ׳•׳¢ */
export async function checkAndDeductCredit(orgId: string, userId: string) {
  return checkAndDeductScanCredit(orgId, userId, "cheap");
}

