/**
 * Apply Stripe checkout / subscription events to org billing (mirrors PayPal flow).
 */
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { applyPayPalCaptureResult } from "@/lib/paypal-capture-apply";
import { parseSubscriptionTier, defaultScanBalancesForTier } from "@/lib/subscription-tier-config";
import type { SubscriptionTier } from "@prisma/client";
import { createLogger } from "@/lib/logger";

const log = createLogger("stripe-apply");

function customIdFromMetadata(metadata: Stripe.Metadata | null | undefined): string | null {
  const raw = metadata?.custom_id ?? metadata?.customId;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export async function applyStripeCheckoutCompleted(session: Stripe.Checkout.Session): Promise<{ ok: boolean; error?: string }> {
  const customId = customIdFromMetadata(session.metadata);
  if (!customId) {
    log.warn("stripe_checkout_missing_custom_id", { sessionId: session.id });
    return { ok: false, error: "Missing custom_id metadata" };
  }

  const paidTotal =
    session.amount_total != null ? session.amount_total / 100 : session.amount_subtotal != null ? session.amount_subtotal / 100 : NaN;
  const currency = (session.currency ?? "ils").toUpperCase();
  const transactionId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? session.id;

  if (!Number.isFinite(paidTotal)) {
    return { ok: false, error: "Missing amount" };
  }

  const applied = await applyPayPalCaptureResult({
    customIdFull: customId,
    paidTotal,
    currency: currency === "ILS" ? "ILS" : currency,
    captureId: `stripe_${transactionId}`,
  });

  if (!applied.ok) {
    return { ok: false, error: applied.error };
  }

  const orgId = customId.split("|")[0]?.trim();
  if (orgId && session.customer) {
    const customerId = typeof session.customer === "string" ? session.customer : session.customer.id;
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        stripeCustomerId: customerId,
        ...(typeof session.subscription === "string"
          ? { stripeSubscriptionId: session.subscription }
          : session.subscription?.id
            ? { stripeSubscriptionId: session.subscription.id }
            : {}),
      },
    }).catch((e) => {
      log.warn("stripe_org_update_failed", { orgId, error: e instanceof Error ? e.message : String(e) });
    });
  }

  return { ok: true };
}

export async function applyStripeSubscriptionEvent(
  subscription: Stripe.Subscription,
  eventType: string,
): Promise<{ ok: boolean; error?: string }> {
  const customId = customIdFromMetadata(subscription.metadata);
  const orgId = customId?.split("|")[0]?.trim();
  if (!orgId) {
    log.warn("stripe_subscription_missing_org", { subscriptionId: subscription.id });
    return { ok: false, error: "Missing org in subscription metadata" };
  }

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null;

  if (eventType === "customer.subscription.deleted" || subscription.status === "canceled") {
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        subscriptionStatus: "CANCELLED",
        stripeSubscriptionId: null,
        ...(customerId ? { stripeCustomerId: customerId } : {}),
      },
    });
    return { ok: true };
  }

  const tierRaw = customId?.split("|")[2]?.trim();
  const tier = parseSubscriptionTier(tierRaw ?? "") as SubscriptionTier | null;
  if (!tier || tier === "FREE") {
    return { ok: false, error: "Invalid tier in subscription metadata" };
  }

  const balances = defaultScanBalancesForTier(tier);
  const active = subscription.status === "active" || subscription.status === "trialing";

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      subscriptionTier: tier,
      subscriptionStatus: active ? "ACTIVE" : "PAST_DUE",
      stripeSubscriptionId: subscription.id,
      ...(customerId ? { stripeCustomerId: customerId } : {}),
      ...(active
        ? {
            cheapScansRemaining: balances.cheapScansRemaining,
            premiumScansRemaining: balances.premiumScansRemaining,
            maxCompanies: balances.maxCompanies,
          }
        : {}),
    },
  });

  return { ok: true };
}
