import type { SubscriptionTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseSubscriptionTier, tierAllowance, type SubscriptionTierKey } from "@/lib/subscription-tier-config";

type TierPricesMap = Partial<Record<SubscriptionTierKey, number>>;

function readTierPricesJson(raw: unknown): TierPricesMap {
  if (!raw || typeof raw !== "object") return {};
  const out: TierPricesMap = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const tier = parseSubscriptionTier(k);
    if (tier && typeof v === "number" && Number.isFinite(v)) {
      out[tier] = v;
    }
  }
  return out;
}

/** מחיר מנוי חודשי אפקטיבי (DB → ברירת מחדל מקוד) */
export async function getEffectiveTierMonthlyPriceIls(
  tier: SubscriptionTier,
): Promise<number | null> {
  const base = tierAllowance(tier).monthlyPriceIls;
   const row = await prisma.oSBillingConfig.findUnique({
    where: { id: "default" },
    select: { tierMonthlyPricesJson: true },
  });
  const overrides = readTierPricesJson(row?.tierMonthlyPricesJson);
  const o = overrides[tier];
  if (typeof o === "number" && Number.isFinite(o)) return o;
  return base;
}

/** סכום לחיוב PayPal לפי מחזור: חודשי = מחיר חודשי, שנתי = 12×חודש −20% */
export async function getExpectedTierOrderAmountIls(
  tier: SubscriptionTier,
  cycle: "monthly" | "annual",
): Promise<number | null> {
  const monthly = await getEffectiveTierMonthlyPriceIls(tier);
  if (monthly == null) return null;
  if (cycle === "monthly") return monthly;
  return Math.round(monthly * 12 * 0.8 * 100) / 100;
}

export async function getPayPalClientIdPublic(): Promise<string> {
   const row = await prisma.oSBillingConfig.findUnique({
    where: { id: "default" },
    select: { paypalClientIdPublic: true },
  });
  const fromDb = row?.paypalClientIdPublic?.trim();
  if (fromDb) return fromDb;
  return process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() ?? "";
}
