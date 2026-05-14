/**
 * מיפוי SubscriptionTier (Prisma) לתצוגת מסך החיוב — ללא תלות ב-React / Client.
 */

/** תצוגה ממופה ממסלולי Prisma; לא תואם 1:1 לשמות API */
export type BillingWorkspacePlan = "FREE" | "CHEAP" | "PREMIUM" | "VIP";

export function mapSubscriptionTierToBillingPlan(tier: string): BillingWorkspacePlan {
  const u = (tier || "FREE").toUpperCase();
  if (u === "CORPORATE") return "VIP";
  if (u === "COMPANY") return "PREMIUM";
  if (u === "HOUSEHOLD" || u === "DEALER") return "CHEAP";
  return "FREE";
}
