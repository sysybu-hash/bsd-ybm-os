"use server";

import { revalidatePath } from "next/cache";
import { revalidateErpDocumentsSurfaces } from "@/lib/workspace-revalidate";
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
import { readTierPricesJson } from "@/lib/billing-pricing";
import {
  ADMIN_SUBSCRIPTION_TIER_OPTIONS,
  tierAllowance,
} from "@/lib/subscription-tier-config";

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
  industry: string;
  constructionTrade: string;
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
  if (!s) return { error: "אין הרשאה" };

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      industry: true,
      constructionTrade: true,
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
    industry: o.industry,
    constructionTrade: o.constructionTrade,
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

/** עדכון מנוי ידני: רגיל (לפי מכסות רמה), VIP (מכסות גבוהות), או הרצה (FREE + ניסיון) */
export async function executiveApplyManualSubscriptionAction(
  organizationId: string,
  tierRaw: string,
  mode: ManualTierMode,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await requireExecutive();
  if (!s) return { ok: false, error: "אין הרשאה" };

  const tier = parseSubscriptionTier(tierRaw);
  if (!tier) return { ok: false, error: "רמה לא חוקית" };

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
    revalidateErpDocumentsSurfaces();
    revalidatePath("/app/settings/billing");
    revalidatePath("/app/clients");
    return { ok: true };
  } catch {
    return { ok: false, error: "עדכון נכשל" };
  }
}

export type TierPricingRow = {
  tier: SubscriptionTier;
  /** Price actually charged, i.e. the override when set, otherwise the built-in. */
  effectiveMonthlyIls: number | null;
  /** The value compiled into subscription-tier-config. */
  defaultMonthlyIls: number | null;
  /** True when an override row exists for this tier. */
  isOverridden: boolean;
  cheapScans: number;
  premiumScans: number;
  maxCompanies: number;
};

/** Current price of every tier, with the built-in shown alongside the override. */
export async function executiveListTierPricingAction(): Promise<
  TierPricingRow[] | { error: string }
> {
  const s = await requireExecutive();
  if (!s) return { error: "אין הרשאה" };

  const row = await prisma.oSBillingConfig.findUnique({
    where: { id: "default" },
    select: { tierMonthlyPricesJson: true },
  });
  const overrides = readTierPricesJson(row?.tierMonthlyPricesJson);

  return ADMIN_SUBSCRIPTION_TIER_OPTIONS.map((tier) => {
    const allowance = tierAllowance(tier);
    const override = overrides[tier];
    const hasOverride = typeof override === "number" && Number.isFinite(override);
    return {
      tier: tier as SubscriptionTier,
      effectiveMonthlyIls: hasOverride ? override : allowance.monthlyPriceIls,
      defaultMonthlyIls: allowance.monthlyPriceIls,
      isOverridden: hasOverride,
      cheapScans: allowance.cheapScans,
      premiumScans: allowance.premiumScans,
      maxCompanies: allowance.maxCompanies,
    };
  });
}

/**
 * Saves per-tier price overrides.
 *
 * Takes a typed map rather than the raw JSON string the older form field used,
 * so a malformed paste can't land in the column that decides what customers are
 * charged. A tier mapped to null drops its override and falls back to the
 * built-in price.
 */
export async function executiveSaveTierPricingAction(
  prices: Record<string, number | null>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await requireExecutive();
  if (!s) return { ok: false, error: "אין הרשאה" };

  const next: Record<string, number> = {};
  for (const [rawTier, rawValue] of Object.entries(prices)) {
    const tier = ADMIN_SUBSCRIPTION_TIER_OPTIONS.find((t) => t === rawTier);
    if (!tier) return { ok: false, error: `רמת מנוי לא מוכרת: ${rawTier}` };
    if (rawValue == null) continue; // cleared → fall back to the built-in price
    if (!Number.isFinite(rawValue) || rawValue < 0) {
      return { ok: false, error: `מחיר לא תקין עבור ${tier}` };
    }
    if (rawValue > 100_000) {
      return { ok: false, error: `מחיר חריג עבור ${tier}` };
    }
    next[tier] = Math.round(rawValue * 100) / 100;
  }

  try {
    await prisma.oSBillingConfig.upsert({
      where: { id: "default" },
      create: { id: "default", tierMonthlyPricesJson: next },
      update: { tierMonthlyPricesJson: next },
    });
    // The register wizard reads these server-side on /login, and the PayPal
    // order amount is derived from them.
    revalidatePath("/login");
    revalidatePath("/app/admin");
    revalidatePath("/app/settings/billing");
    return { ok: true };
  } catch {
    return { ok: false, error: "שמירת מחירים נכשלה" };
  }
}

export async function executiveSaveBillingConfigAction(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const s = await requireExecutive();
  if (!s) return { ok: false, error: "אין הרשאה" };

  const paypalRaw = String(formData.get("paypalClientId") ?? "").trim();
  const pricesRaw = String(formData.get("tierPricesJson") ?? "").trim();

  let tierMonthlyPricesJson: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;
  if (pricesRaw) {
    try {
      tierMonthlyPricesJson = JSON.parse(pricesRaw) as Prisma.InputJsonValue;
    } catch {
      return { ok: false, error: "JSON מחירים לא תקין" };
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
    revalidateErpDocumentsSurfaces();
    revalidatePath("/app/settings/billing");
    return { ok: true };
  } catch {
    return { ok: false, error: "שמירה נכשלה" };
  }
}

export async function executiveSendJoinInviteAction(formData: FormData): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const s = await requireExecutive();
  if (!s) return { ok: false, error: "אין הרשאה" };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const headline = String(formData.get("headline") ?? "").trim() || "הוזמנתם ל-BSD-YBM";
  const bodyText = String(formData.get("bodyText") ?? "").trim();
  const tierHint = String(formData.get("tierHint") ?? "").trim();

  if (!email || !email.includes("@")) {
    return { ok: false, error: "אימייל לא תקין" };
  }

  const tierLine = tierHint
    ? `\n\nרמת מנוי מוצעת: ${tierLabelHe(tierHint)} (${tierHint}).`
    : "";
  const fullBody =
    bodyText ||
    `שלום,

הוזמנתם להצטרף לפלטפורמת BSD-YBM — ניהול ERP, סריקות AI וחיוב בחשבון אחד.${tierLine}

בברכה,
צוות BSD-YBM`;

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
  if (!s) return { ok: false, error: "אין הרשאה" };
  if (!Number.isFinite(priceIls) || priceIls <= 0) {
    return { ok: false, error: "מחיר לא חוקי" };
  }
  try {
    await prisma.scanBundle.update({
      where: { id: bundleId },
      data: { priceIls },
    });
    revalidateErpDocumentsSurfaces();
    revalidatePath("/app/settings/billing");
    return { ok: true };
  } catch {
    return { ok: false, error: "עדכון נכשל" };
  }
}

