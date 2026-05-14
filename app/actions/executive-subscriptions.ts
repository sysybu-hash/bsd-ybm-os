"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { Prisma, type SubscriptionTier } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/is-admin";
import {
  CORPORATE_MAX_COMPANIES_EFFECTIVE,
  defaultScanBalancesForTier,
  parseSubscriptionTier,
  tierLabelHe,
} from "@/lib/subscription-tier-config";
import { sendSubscriptionJoinInviteEmail } from "@/lib/mail";
import { trialEndsAtFromNow } from "@/lib/trial";
import { OS_UNLIMITED_CREDITS } from "@/lib/platform-developers";

async function requireExecutive() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    return null;
  }
  return session;
}

export type ExecutiveOrgRow = {
  id: string;
  name: string;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: string;
  cheapScansRemaining: number;
  premiumScansRemaining: number;
  maxCompanies: number;
  trialEndsAt: Date | null;
  primaryEmail: string | null;
  tenantPublicDomain: string | null;
};

export async function executiveListOrganizationsAction(): Promise<
  ExecutiveOrgRow[] | { error: string }
> {
  const s = await requireExecutive();
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

export type ManualTierMode = "standard" | "vip" | "trial";

/** ׳¢׳“׳›׳•׳ ׳׳ ׳•׳™ ׳™׳“׳ ׳™: ׳¨׳’׳™׳ (׳׳₪׳™ ׳׳›׳¡׳•׳× ׳¨׳׳”), VIP (׳׳›׳¡׳•׳× ׳’׳‘׳•׳”׳•׳×), ׳׳• ׳”׳¨׳¦׳” (FREE + ׳ ׳™׳¡׳™׳•׳) */
export async function executiveApplyManualSubscriptionAction(
  organizationId: string,
  tierRaw: string,
  mode: ManualTierMode,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await requireExecutive();
  if (!s) return { ok: false, error: "׳׳™׳ ׳”׳¨׳©׳׳”" };

  const tier = parseSubscriptionTier(tierRaw);
  if (!tier) return { ok: false, error: "׳¨׳׳” ׳׳ ׳—׳•׳§׳™׳×" };

  try {
    if (mode === "trial") {
      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          subscriptionTier: "FREE",
          subscriptionStatus: "ACTIVE",
          isVip: false,
          trialEndsAt: trialEndsAtFromNow(),
          ...defaultScanBalancesForTier("FREE"),
        },
      });
    } else if (mode === "vip") {
      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          subscriptionTier: "CORPORATE",
          subscriptionStatus: "ACTIVE",
          isVip: true,
          cheapScansRemaining: OS_UNLIMITED_CREDITS,
          premiumScansRemaining: OS_UNLIMITED_CREDITS,
          maxCompanies: CORPORATE_MAX_COMPANIES_EFFECTIVE,
        },
      });
    } else {
      const b = defaultScanBalancesForTier(tier);
      await prisma.organization.update({
        where: { id: organizationId },
        data: {
          subscriptionTier: tier,
          subscriptionStatus: "ACTIVE",
          isVip: false,
          cheapScansRemaining: b.cheapScansRemaining,
          premiumScansRemaining: b.premiumScansRemaining,
          maxCompanies: b.maxCompanies,
        },
      });
    }
    revalidatePath("/app/documents/erp");
    revalidatePath("/app/settings/billing");
    revalidatePath("/app/clients");
    return { ok: true };
  } catch {
    return { ok: false, error: "׳¢׳“׳›׳•׳ ׳ ׳›׳©׳" };
  }
}

export async function executiveSaveBillingConfigAction(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const s = await requireExecutive();
  if (!s) return { ok: false, error: "׳׳™׳ ׳”׳¨׳©׳׳”" };

  const paypalRaw = String(formData.get("paypalClientId") ?? "").trim();
  const pricesRaw = String(formData.get("tierPricesJson") ?? "").trim();

  let tierMonthlyPricesJson: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;
  if (pricesRaw) {
    try {
      tierMonthlyPricesJson = JSON.parse(pricesRaw) as Prisma.InputJsonValue;
    } catch {
      return { ok: false, error: "JSON ׳׳—׳™׳¨׳™׳ ׳׳ ׳×׳§׳™׳" };
    }
  }

  try {
    await prisma.oSBillingConfig.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        paypalClientIdPublic: paypalRaw || null,
        tierMonthlyPricesJson,
      },
      update: {
        paypalClientIdPublic: paypalRaw || null,
        tierMonthlyPricesJson,
      },
    });
    revalidatePath("/app/documents/erp");
    revalidatePath("/app/settings/billing");
    return { ok: true };
  } catch {
    return { ok: false, error: "׳©׳׳™׳¨׳” ׳ ׳›׳©׳׳”" };
  }
}

export async function executiveSendJoinInviteAction(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const s = await requireExecutive();
  if (!s) return { ok: false, error: "׳׳™׳ ׳”׳¨׳©׳׳”" };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const headline = String(formData.get("headline") ?? "").trim() || "׳”׳•׳–׳׳ ׳×׳ ׳-BSD-YBM";
  const bodyText = String(formData.get("bodyText") ?? "").trim();
  const tierHint = String(formData.get("tierHint") ?? "").trim();

  if (!email || !email.includes("@")) {
    return { ok: false, error: "׳׳™׳׳™׳™׳ ׳׳ ׳×׳§׳™׳" };
  }

  const tierLine = tierHint
    ? `\n\n׳¨׳׳× ׳׳ ׳•׳™ ׳׳•׳¦׳¢׳×: ${tierLabelHe(tierHint)} (${tierHint}).`
    : "";
  const fullBody =
    bodyText ||
    `׳©׳׳•׳,

׳”׳•׳–׳׳ ׳×׳ ׳׳”׳¦׳˜׳¨׳£ ׳׳₪׳׳˜׳₪׳•׳¨׳׳× BSD-YBM ג€” ׳ ׳™׳”׳•׳ ERP, ׳¡׳¨׳™׳§׳•׳× AI ׳•׳—׳™׳•׳‘ ׳‘׳—׳©׳‘׳•׳ ׳׳—׳“.${tierLine}

׳‘׳‘׳¨׳›׳”,
׳¦׳•׳•׳× BSD-YBM`;

  const r = await sendSubscriptionJoinInviteEmail(email, {
    headline,
    bodyText: fullBody,
    ctaPath: "/login",
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true };
}

export async function executiveUpdateBundlePriceAction(
  bundleId: string,
  priceIls: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await requireExecutive();
  if (!s) return { ok: false, error: "׳׳™׳ ׳”׳¨׳©׳׳”" };
  if (!Number.isFinite(priceIls) || priceIls <= 0) {
    return { ok: false, error: "׳׳—׳™׳¨ ׳׳ ׳—׳•׳§׳™" };
  }
  try {
    await prisma.scanBundle.update({
      where: { id: bundleId },
      data: { priceIls },
    });
    revalidatePath("/app/documents/erp");
    revalidatePath("/app/settings/billing");
    return { ok: true };
  } catch {
    return { ok: false, error: "׳¢׳“׳›׳•׳ ׳ ׳›׳©׳" };
  }
}

