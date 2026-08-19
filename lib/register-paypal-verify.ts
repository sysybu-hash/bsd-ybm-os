import { type SubscriptionTier } from "@prisma/client";
import { capturePayPalOrder } from "@/lib/billing/paypal-order";
import { parseCapturePayload } from "@/lib/paypal-order-parse";
import { isPayPalServerConfigured, paypalFetchOrder } from "@/lib/paypal-server";
import { parseSubscriptionTier } from "@/lib/subscription-tier-config";

export type RegistrationPaymentOk = {
  ok: true;
  tier: SubscriptionTier;
  captureId: string;
};

export type RegistrationPaymentResult = RegistrationPaymentOk | { ok: false };

/**
 * Verifies a PayPal order/capture tied to signup (custom_id: REG|email|TIER|tier|cycle).
 * Used by POST /api/register to skip PENDING_APPROVAL when payment already completed.
 */
export async function verifyRegistrationPayPalOrder(
  orderId: string,
  normalizedEmail: string,
): Promise<RegistrationPaymentResult> {
  const id = orderId.trim();
  if (!id || !isPayPalServerConfigured()) return { ok: false };

  try {
    let raw = await paypalFetchOrder(id);
    if (String(raw.status ?? "") !== "COMPLETED") {
      await capturePayPalOrder(id);
      // Re-read rather than parsing the capture response: the capture payload
      // omits custom_id on the purchase unit, and custom_id is what decides the
      // tier. Losing it here would take the money and grant nothing.
      raw = await paypalFetchOrder(id);
    }

    const parsed = parseCapturePayload(raw);
    if (!parsed || parsed.captureStatus !== "COMPLETED") return { ok: false };

    const parts = parsed.customId.split("|");
    if (parts[0] !== "REG" || parts[2] !== "TIER") return { ok: false };

    const emailInOrder = parts[1]?.trim().toLowerCase();
    if (!emailInOrder || emailInOrder !== normalizedEmail) return { ok: false };

    const tier = parseSubscriptionTier(parts[3] ?? "") as SubscriptionTier | null;
    if (!tier || tier === "FREE") return { ok: false };

    return { ok: true, tier, captureId: parsed.captureId };
  } catch {
    return { ok: false };
  }
}
