import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import {
  jsonBadRequest,
  jsonServiceUnavailable,
} from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import "@/lib/payments/register-gateways";
import { getGateway } from "@/lib/payments/gateway-interface";
import { isStripeConfigured, getStripePriceId } from "@/lib/stripe-server";
import {
  parseSubscriptionTier,
  tierLabelHe,
} from "@/lib/subscription-tier-config";
import { getExpectedTierOrderAmountIls } from "@/lib/billing-pricing";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import {
  FUNNEL_EVENTS,
  trackFunnelServer,
} from "@/lib/analytics/marketing-funnel-server";

const log = createLogger("billing-stripe-create-checkout");

const createCheckoutBodySchema = z.object({
  tier: z.string().optional(),
  bundleId: z.string().optional(),
  billingCycle: z.string().optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export const POST = withWorkspacesAuth(
  async (req, { orgId, userId }, data) => {
    try {
      if (!isStripeConfigured()) {
        return jsonServiceUnavailable(
          "Stripe לא מוגדר בשרת (חסר STRIPE_SECRET_KEY)",
          "stripe_not_configured",
        );
      }

      const gateway = getGateway("stripe");
      const origin = new URL(req.url).origin;
      const successUrl = data.successUrl ?? `${origin}/app/settings/billing?stripe=success`;
      const cancelUrl = data.cancelUrl ?? `${origin}/app/settings/billing?stripe=cancel`;

      const notifyUser = await prisma.user.findFirst({
        where: { organizationId: orgId },
        orderBy: { createdAt: "asc" },
        select: { email: true, name: true },
      });
      const customerEmail = notifyUser?.email?.trim() || "billing@bsd-ybm.co.il";
      const customerName = notifyUser?.name?.trim() || "BSD-YBM";

      const bundleId = String(data.bundleId ?? "").trim();
      if (bundleId) {
        const bundle = await prisma.scanBundle.findFirst({
          where: { id: bundleId, isActive: true },
        });
        if (!bundle) {
          return jsonBadRequest("חבילה לא נמצאה או לא פעילה", "bundle_not_found");
        }
        const customId = `${orgId}|BUNDLE|${bundle.id}`.slice(0, 127);
        const result = await gateway.createCheckout({
          amount: bundle.priceIls,
          currencyCode: "ILS",
          itemName: `BSD-YBM — ${bundle.name}`,
          customerName,
          customerEmail,
          successUrl,
          errorUrl: cancelUrl,
          callbackUrl: `${origin}/api/webhooks/stripe`,
          idempotencyKey: customId,
        });
        trackFunnelServer(userId, FUNNEL_EVENTS.payStarted, { provider: "stripe", tier: "bundle" });
        return NextResponse.json({ checkoutUrl: result.checkoutUrl, sessionId: result.providerRef });
      }

      const tierRaw = String(data.tier ?? "").trim().toUpperCase();
      const tier = parseSubscriptionTier(tierRaw);
      if (!tier || tier === "FREE") {
        return jsonBadRequest("רמת מנוי לא זמינה לתשלום", "invalid_tier");
      }

      const cycleRaw = String(data.billingCycle ?? "monthly").trim().toLowerCase();
      const billingCycle: "monthly" | "annual" = cycleRaw === "annual" ? "annual" : "monthly";
      const price = await getExpectedTierOrderAmountIls(tier, billingCycle);
      if (price == null) {
        return jsonBadRequest("אין מחיר לרמה זו — פנו לתמיכה", "no_price");
      }

      const cycleToken = billingCycle === "annual" ? "A" : "M";
      const customId = `${orgId}|TIER|${tier}|${cycleToken}`.slice(0, 127);
      const desc =
        billingCycle === "annual"
          ? `BSD-YBM — מנוי ${tierLabelHe(tier)} (שנתי)`
          : `BSD-YBM — מנוי ${tierLabelHe(tier)}`;

      const priceId = getStripePriceId(tier, billingCycle);
      const result = await gateway.createCheckout({
        amount: price,
        currencyCode: "ILS",
        itemName: desc,
        customerName,
        customerEmail,
        successUrl,
        errorUrl: cancelUrl,
        callbackUrl: `${origin}/api/webhooks/stripe`,
        idempotencyKey: customId,
        metadata: priceId ? { stripePriceId: priceId } : undefined,
      });

      trackFunnelServer(userId, FUNNEL_EVENTS.payStarted, { provider: "stripe", tier });
      return NextResponse.json({ checkoutUrl: result.checkoutUrl, sessionId: result.providerRef });
    } catch (err: unknown) {
      log.error("create_checkout_failed", { error: err instanceof Error ? err.message : String(err) });
      return apiErrorResponse(err, "[stripe/create-checkout]");
    }
  },
  { schema: createCheckoutBodySchema },
);
