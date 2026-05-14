"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { AccountStatus, CustomerType } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isExecutiveSubscriptionSuperAdmin } from "@/lib/executive-subscription-super-admin";
import {
  CORPORATE_MAX_COMPANIES_EFFECTIVE,
  defaultScanBalancesForTier,
  parseSubscriptionTier,
  tierLabelHe,
} from "@/lib/subscription-tier-config";
import { OS_UNLIMITED_CREDITS } from "@/lib/platform-developers";
import { hashPassword, generateProvisionPassword } from "@/lib/password";
import { logActivity } from "@/lib/activity-log";
import { sendProvisionCredentialsEmail } from "@/app/actions/send-credentials-email";
import { sendSubscriptionTierInvitationEmail } from "@/lib/mail";
import { trialEndsAtFromNow } from "@/lib/trial";
import type { ExecutiveOrgRow } from "@/app/actions/executive-subscriptions";

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isExecutiveSubscriptionSuperAdmin(session.user.email)) {
    return null;
  }
  return session;
}

function revalidateSubscriptionSurfaces() {
  revalidatePath("/app/admin");
  revalidatePath("/app/documents/erp");
  revalidatePath("/app/settings/billing");
  revalidatePath("/app/settings/overview");
}

export async function manageSubsListOrganizationsAction(): Promise<ExecutiveOrgRow[] | { error: string }> {
  const s = await requireSuperAdmin();
  if (!s) return { error: "׳׳™׳ ׳”׳¨׳©׳׳”" };

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      cheapScansRemaining: true,
      premiumScansRemaining: true,
      maxCompanies: true,
      trialEndsAt: true,
      tenantPublicDomain: true,
      users: {
        take: 1,
        orderBy: { createdAt: "asc" },
        select: { email: true },
      },
    },
  });

  return orgs.map((o) => ({
    id: o.id,
    name: o.name,
    subscriptionTier: o.subscriptionTier,
    subscriptionStatus: o.subscriptionStatus,
    cheapScansRemaining: o.cheapScansRemaining,
    premiumScansRemaining: o.premiumScansRemaining,
    maxCompanies: o.maxCompanies,
    trialEndsAt: o.trialEndsAt,
    primaryEmail: o.users[0]?.email ?? null,
    tenantPublicDomain: o.tenantPublicDomain ?? null,
  }));
}

function normalizeTenantDomainInput(raw: string): string | null {
  let d = raw.trim();
  if (!d) return null;
  d = d.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim().toLowerCase();
  if (d.length > 253) return "";
  return d || null;
}

export async function manageSubsSaveTenantDomainAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await requireSuperAdmin();
  if (!s) return { ok: false, error: "׳׳™׳ ׳”׳¨׳©׳׳”" };

  const organizationId = String(formData.get("organizationId") ?? "").trim();
  const domainOrNull = normalizeTenantDomainInput(String(formData.get("tenantPublicDomain") ?? ""));

  if (!organizationId) return { ok: false, error: "׳—׳¡׳¨ ׳׳¨׳’׳•׳" };
  if (domainOrNull === "") return { ok: false, error: "׳“׳•׳׳™׳™׳ ׳׳ ׳×׳§׳™׳" };

  try {
    if (domainOrNull) {
      const clash = await prisma.organization.findFirst({
        where: {
          tenantPublicDomain: domainOrNull,
          NOT: { id: organizationId },
        },
        select: { id: true },
      });
      if (clash) {
        return { ok: false, error: "׳”׳“׳•׳׳™׳™׳ ׳›׳‘׳¨ ׳‘׳©׳™׳׳•׳© ׳‘׳׳¨׳’׳•׳ ׳׳—׳¨" };
      }
    }

    await prisma.organization.update({
      where: { id: organizationId },
      data: { tenantPublicDomain: domainOrNull },
    });

    revalidateSubscriptionSurfaces();
    return { ok: true };
  } catch (e) {
    console.error("manageSubsSaveTenantDomainAction", e);
    return { ok: false, error: "׳©׳׳™׳¨׳× ׳“׳•׳׳™׳™׳ ׳ ׳›׳©׳׳”" };
  }
}

export async function manageSubsCreateManualUserAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await requireSuperAdmin();
  if (!s) return { ok: false, error: "׳׳™׳ ׳”׳¨׳©׳׳”" };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  const organizationName = String(formData.get("organizationName") ?? "").trim();
  const tierRaw = String(formData.get("tier") ?? "FREE");
  const vip = formData.get("vip") === "on" || formData.get("vip") === "true";
  const typeRaw = String(formData.get("orgType") ?? "COMPANY").toUpperCase();

  if (!email.includes("@")) return { ok: false, error: "׳׳™׳׳™׳™׳ ׳׳ ׳×׳§׳™׳" };
  if (organizationName.length < 2) return { ok: false, error: "׳©׳ ׳׳¨׳’׳•׳ ׳§׳¦׳¨ ׳׳“׳™" };

  const orgType = Object.values(CustomerType).includes(typeRaw as CustomerType)
    ? (typeRaw as CustomerType)
    : CustomerType.COMPANY;

  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "׳׳©׳×׳׳© ׳¢׳ ׳”׳׳™׳׳™׳™׳ ׳”׳–׳” ׳›׳‘׳¨ ׳§׳™׳™׳" };

  const plain = generateProvisionPassword();
  const passwordHash = await hashPassword(plain);

  try {
    if (vip) {
      await prisma.organization.create({
        data: {
          name: organizationName,
          type: orgType,
          subscriptionTier: "CORPORATE",
          subscriptionStatus: "ACTIVE",
          isVip: true,
          cheapScansRemaining: OS_UNLIMITED_CREDITS,
          premiumScansRemaining: OS_UNLIMITED_CREDITS,
          maxCompanies: CORPORATE_MAX_COMPANIES_EFFECTIVE,
          users: {
            create: {
              email,
              name,
              role: "ORG_ADMIN",
              accountStatus: AccountStatus.ACTIVE,
              passwordHash,
            },
          },
        },
      });
    } else {
      const tier = parseSubscriptionTier(tierRaw) ?? "FREE";
      const b = defaultScanBalancesForTier(tier);
      await prisma.organization.create({
        data: {
          name: organizationName,
          type: orgType,
          subscriptionTier: tier,
          subscriptionStatus: "ACTIVE",
          isVip: false,
          trialEndsAt: tier === "FREE" ? trialEndsAtFromNow() : null,
          cheapScansRemaining: b.cheapScansRemaining,
          premiumScansRemaining: b.premiumScansRemaining,
          maxCompanies: b.maxCompanies,
          users: {
            create: {
              email,
              name,
              role: "ORG_ADMIN",
              accountStatus: AccountStatus.ACTIVE,
              passwordHash,
            },
          },
        },
      });
    }

    void sendProvisionCredentialsEmail(email, name, plain, organizationName).catch((err) =>
      console.error("sendProvisionCredentialsEmail manage-subscriptions", err),
    );

    if (s.user?.id) {
      const createdOrg = await prisma.organization.findFirst({
        where: { name: organizationName },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (createdOrg) {
        await logActivity(s.user.id, createdOrg.id, "SUBSCRIPTION:manual_org_created", `email=${email};vip=${vip}`);
      }
    }

    revalidateSubscriptionSurfaces();
    return { ok: true };
  } catch (e) {
    console.error("manageSubsCreateManualUserAction", e);
    return { ok: false, error: "׳™׳¦׳™׳¨׳× ׳׳¨׳’׳•׳ ׳ ׳›׳©׳׳”" };
  }
}

export async function manageSubsAdjustScansAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await requireSuperAdmin();
  if (!s) return { ok: false, error: "׳׳™׳ ׳”׳¨׳©׳׳”" };

  const organizationId = String(formData.get("organizationId") ?? "").trim();
  const cheapDelta = Number(formData.get("cheapDelta") ?? 0);
  const premiumDelta = Number(formData.get("premiumDelta") ?? 0);

  if (!organizationId) return { ok: false, error: "׳—׳¡׳¨ ׳׳¨׳’׳•׳" };
  if (!Number.isFinite(cheapDelta) || !Number.isFinite(premiumDelta)) {
    return { ok: false, error: "׳׳¡׳₪׳¨׳™׳ ׳׳ ׳×׳§׳™׳ ׳™׳" };
  }

  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { cheapScansRemaining: true, premiumScansRemaining: true },
    });
    if (!org) return { ok: false, error: "׳׳¨׳’׳•׳ ׳׳ ׳ ׳׳¦׳" };

    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        cheapScansRemaining: Math.max(0, org.cheapScansRemaining + cheapDelta),
        premiumScansRemaining: Math.max(0, org.premiumScansRemaining + premiumDelta),
      },
    });

    revalidateSubscriptionSurfaces();
    return { ok: true };
  } catch {
    return { ok: false, error: "׳¢׳“׳›׳•׳ ׳™׳×׳¨׳” ׳ ׳›׳©׳" };
  }
}

export async function manageSubsSendTierInviteAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await requireSuperAdmin();
  if (!s) return { ok: false, error: "׳׳™׳ ׳”׳¨׳©׳׳”" };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const tierRaw = String(formData.get("tier") ?? "").trim();
  const daysRaw = Number(formData.get("validDays") ?? 14);

  if (!email.includes("@")) return { ok: false, error: "׳׳™׳׳™׳™׳ ׳׳ ׳×׳§׳™׳" };
  const tier = parseSubscriptionTier(tierRaw);
  if (!tier) return { ok: false, error: "׳¨׳׳× ׳׳ ׳•׳™ ׳׳ ׳×׳§׳™׳ ׳”" };

  const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 90 ? daysRaw : 14;
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + days * 86_400_000);

  try {
    await prisma.subscriptionInvitation.create({
      data: {
        token,
        email,
        subscriptionTier: tier,
        expiresAt,
        createdByEmail: s.user?.email?.trim().toLowerCase() ?? null,
      },
    });

    const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://bsd-ybm.co.il";
    const registerUrl = `${base}/register?invite=${encodeURIComponent(token)}`;

    const mail = await sendSubscriptionTierInvitationEmail(email, {
      tierLabel: `${tierLabelHe(tier)} (${tier})`,
      registerUrl,
      expiresNote: `׳”׳§׳™׳©׳•׳¨ ׳×׳§׳£ ׳-${days} ׳™׳׳™׳. ׳™׳© ׳׳”׳™׳¨׳©׳ ׳¢׳ ׳׳•׳×׳• ׳׳™׳׳™׳™׳.`,
    });
    if (!mail.ok) return { ok: false, error: mail.error };

    revalidateSubscriptionSurfaces();
    return { ok: true };
  } catch (e) {
    console.error("manageSubsSendTierInviteAction", e);
    return { ok: false, error: "׳©׳׳™׳¨׳× ׳”׳–׳׳ ׳” ׳׳• ׳©׳׳™׳—׳× ׳׳™׳™׳ ׳ ׳›׳©׳׳”" };
  }
}

export async function manageSubsUpdateSubscriptionAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await requireSuperAdmin();
  if (!s) return { ok: false, error: "׳׳™׳ ׳”׳¨׳©׳׳”" };

  const organizationId = String(formData.get("organizationId") ?? "").trim();
  const tierRaw = String(formData.get("tier") ?? "").trim();
  const statusRaw = String(formData.get("subscriptionStatus") ?? "").trim().toUpperCase();

  const tier = parseSubscriptionTier(tierRaw);
  if (!organizationId) return { ok: false, error: "׳—׳¡׳¨ ׳׳¨׳’׳•׳" };
  if (!tier) return { ok: false, error: "׳¨׳׳× ׳׳ ׳•׳™ ׳׳ ׳×׳§׳™׳ ׳”" };
  if (!statusRaw) return { ok: false, error: "׳¡׳˜׳˜׳•׳¡ ׳׳ ׳•׳™ ׳—׳¡׳¨" };

  try {
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        subscriptionTier: tier,
        subscriptionStatus: statusRaw,
      },
    });
    if (s.user?.id) {
      await logActivity(s.user.id, organizationId, "SUBSCRIPTION:updated", `tier=${tier};status=${statusRaw}`);
    }
    revalidateSubscriptionSurfaces();
    return { ok: true };
  } catch (e) {
    console.error("manageSubsUpdateSubscriptionAction", e);
    return { ok: false, error: "׳¢׳“׳›׳•׳ ׳׳ ׳•׳™ ׳ ׳›׳©׳" };
  }
}

export async function manageSubsDeleteUserByEmailAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await requireSuperAdmin();
  if (!s) return { ok: false, error: "׳׳™׳ ׳”׳¨׳©׳׳”" };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const actor = s.user?.email?.trim().toLowerCase() ?? "";
  if (!email.includes("@")) return { ok: false, error: "׳׳™׳׳™׳™׳ ׳׳ ׳×׳§׳™׳" };
  if (email === actor) return { ok: false, error: "׳׳ ׳ ׳™׳×׳ ׳׳׳—׳•׳§ ׳׳× ׳”׳׳©׳×׳׳© ׳”׳׳—׳•׳‘׳¨" };
  if (isExecutiveSubscriptionSuperAdmin(email)) {
    return { ok: false, error: "׳׳ ׳ ׳™׳×׳ ׳׳׳—׳•׳§ ׳׳× ׳—׳©׳‘׳•׳ ׳”׳¡׳•׳₪׳¨-׳׳“׳׳™׳" };
  }

  const target = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (!target) return { ok: false, error: "׳”׳׳©׳×׳׳© ׳׳ ׳ ׳׳¦׳" };

  try {
    const org = await prisma.user.findUnique({ where: { id: target.id }, select: { organizationId: true } });
    await prisma.user.delete({ where: { id: target.id } });
    if (s.user?.id && org?.organizationId) {
      await logActivity(s.user.id, org.organizationId, "SUBSCRIPTION:user_deleted", `email=${email}`);
    }
    revalidateSubscriptionSurfaces();
    return { ok: true };
  } catch (e) {
    console.error("manageSubsDeleteUserByEmailAction", e);
    return { ok: false, error: "׳׳—׳™׳§׳× ׳׳©׳×׳׳© ׳ ׳›׳©׳׳”" };
  }
}

export async function manageSubsDeleteOrganizationAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await requireSuperAdmin();
  if (!s) return { ok: false, error: "׳׳™׳ ׳”׳¨׳©׳׳”" };

  const organizationId = String(formData.get("organizationId") ?? "").trim();
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (!organizationId) return { ok: false, error: "׳—׳¡׳¨ ׳׳¨׳’׳•׳" };
  if (!confirmation) return { ok: false, error: "׳™׳© ׳׳”׳§׳׳™׳“ ׳׳× ׳©׳ ׳”׳׳¨׳’׳•׳ ׳›׳“׳™ ׳׳׳—׳•׳§." };

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!org) return { ok: false, error: "׳”׳׳¨׳’׳•׳ ׳׳ ׳ ׳׳¦׳" };
  if (s.user?.organizationId === organizationId) {
    return { ok: false, error: "׳׳ ׳ ׳™׳×׳ ׳׳׳—׳•׳§ ׳׳× ׳”׳׳¨׳’׳•׳ ׳”׳׳—׳•׳‘׳¨ ׳›׳¨׳’׳¢." };
  }
  if (confirmation !== org.name) {
    return { ok: false, error: "׳©׳ ׳”׳׳¨׳’׳•׳ ׳׳ ׳×׳•׳׳ ׳׳׳™׳©׳•׳¨ ׳”׳׳—׳™׳§׳”." };
  }

  try {
    if (s.user?.id) {
      await logActivity(s.user.id, organizationId, "SUBSCRIPTION:organization_deleted", `name=${org.name}`);
    }
    await prisma.$transaction(async (tx) => {
      await tx.activityLog.deleteMany({ where: { organizationId } });
      await tx.productPriceObservation.deleteMany({ where: { organizationId } });
      await tx.documentLineItem.deleteMany({ where: { organizationId } });
      await tx.documentScanCache.deleteMany({ where: { organizationId } });
      await tx.quote.deleteMany({ where: { organizationId } });
      await tx.issuedDocument.deleteMany({ where: { organizationId } });
      await tx.invoice.deleteMany({ where: { organizationId } });
      await tx.financialInsight.deleteMany({ where: { organizationId } });
      await tx.cloudIntegration.deleteMany({ where: { organizationId } });
      await tx.meckanoZone.deleteMany({ where: { organizationId } });
      await tx.organizationInvite.deleteMany({ where: { organizationId } });
      await tx.project.deleteMany({ where: { organizationId } });
      await tx.contact.deleteMany({ where: { organizationId } });
      await tx.document.deleteMany({ where: { organizationId } });
      await tx.user.deleteMany({ where: { organizationId } });
      await tx.organization.delete({ where: { id: organizationId } });
    });
    revalidateSubscriptionSurfaces();
    return { ok: true };
  } catch (e) {
    console.error("manageSubsDeleteOrganizationAction", e);
    return { ok: false, error: "׳׳—׳™׳§׳× ׳׳¨׳’׳•׳ ׳ ׳›׳©׳׳”" };
  }
}

