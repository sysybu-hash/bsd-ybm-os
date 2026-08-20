import { logActivity } from "@/lib/activity-log";

const ACTION_PREFIX = "BILLING";

export type BillingAuditAction = "refund" | "stripe_checkout" | "stripe_subscription";

export async function logBillingAudit(
  userId: string,
  organizationId: string,
  action: BillingAuditAction,
  details: string,
): Promise<void> {
  await logActivity(userId, organizationId, `${ACTION_PREFIX}:${action}`, details);
}

export function billingAuditDetails(parts: Record<string, string | number | null | undefined>): string {
  return Object.entries(parts)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(";");
}
