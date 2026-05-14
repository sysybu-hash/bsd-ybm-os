/**
 * תאימות לאחור לייבוא קיימים — מנויים מבוססי SubscriptionTier.
 */
import {
  ADMIN_SUBSCRIPTION_TIER_OPTIONS,
  parseSubscriptionTier,
  tierAllowance,
  tierLabelHe,
  paypalPurchasableTiers,
  tierRank,
  type SubscriptionTierKey,
} from "@/lib/subscription-tier-config";

export const ADMIN_PLAN_OPTIONS = ADMIN_SUBSCRIPTION_TIER_OPTIONS;
export type AdminPlanId = SubscriptionTierKey;

export { tierLabelHe as planLabelHe };

export function planPriceIls(plan: string): number | null {
  return tierAllowance(plan).monthlyPriceIls;
}

export function isPlanPayPalPurchasable(plan: string): boolean {
  const t = parseSubscriptionTier(plan);
  if (!t || t === "FREE") return false;
  return tierAllowance(t).monthlyPriceIls != null;
}

/** דירוג לשדרוג PayPal — רמות שניתן לשלם עליהן */
export function purchasableTierKeysAbove(current: string): SubscriptionTierKey[] {
  const cur = parseSubscriptionTier(current) ?? "FREE";
  const rank = tierRank(cur);
  return paypalPurchasableTiers().filter((t) => tierRank(t) > rank);
}
