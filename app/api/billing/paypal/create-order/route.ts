import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import {
  jsonBadGateway,
  jsonBadRequest,
  jsonServiceUnavailable,
} from "@/lib/api-json";
import { isPayPalServerConfigured, paypalCreateOrderBody } from "@/lib/paypal-server";
import {
  parseSubscriptionTier,
  tierLabelHe,
} from "@/lib/subscription-tier-config";
import { getExpectedTierOrderAmountIls } from "@/lib/billing-pricing";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse } from "@/lib/api-route-helpers";

const createOrderBodySchema = z.object({
  tier: z.string().optional(),
  bundleId: z.string().optional(),
  billingCycle: z.string().optional(),
});

export const POST = withWorkspacesAuth(
  async (_req, { orgId }, data) => {
    try {
      if (!isPayPalServerConfigured()) {
        return jsonServiceUnavailable(
          "PayPal לא מוגדר בשרת (חסר מפתח סודי או מזהה לקוח)",
          "paypal_not_configured",
        );
      }

      const tierRaw = String(data.tier ?? "").trim().toUpperCase();
      const bundleId = String(data.bundleId ?? "").trim();

      if (bundleId) {
        const bundle = await prisma.scanBundle.findFirst({
          where: { id: bundleId, isActive: true },
        });
        if (!bundle) {
          return jsonBadRequest("חבילה לא נמצאה או לא פעילה", "bundle_not_found");
        }
        const value = bundle.priceIls.toFixed(2);
        const customId = `${orgId}|BUNDLE|${bundle.id}`.slice(0, 127);
        try {
          const { id } = await paypalCreateOrderBody({
            amountValue: value,
            description: `BSD-YBM — ${bundle.name}`,
            customId,
          });
          return NextResponse.json({ id });
        } catch (e) {
          console.error("[create-order bundle]", e);
          return jsonBadGateway(e instanceof Error ? e.message : "יצירת הזמנה נכשלה");
        }
      }

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

      const value = price.toFixed(2);
      const cycleToken = billingCycle === "annual" ? "A" : "M";
      const customId = `${orgId}|TIER|${tier}|${cycleToken}`.slice(0, 127);
      const desc =
        billingCycle === "annual"
          ? `BSD-YBM — מנוי ${tierLabelHe(tier)} (שנתי)`
          : `BSD-YBM — מנוי ${tierLabelHe(tier)}`;

      const { id } = await paypalCreateOrderBody({
        amountValue: value,
        description: desc,
        customId,
      });
      return NextResponse.json({ id });
    } catch (err: unknown) {
      return apiErrorResponse(err, "[create-order]");
    }
  },
  { schema: createOrderBodySchema },
);
