import { NextRequest, NextResponse } from "next/server";
import {
  jsonBadGateway,
  jsonBadRequest,
  jsonServiceUnavailable,
} from "@/lib/api-json";
import { applyRateLimit } from "@/lib/rate-limit";
import { isPayPalServerConfigured } from "@/lib/paypal-server";
import { createPayPalOrderId } from "@/lib/billing/paypal-order";
import { parseSubscriptionTier, tierLabelHe } from "@/lib/subscription-tier-config";
import { getExpectedTierOrderAmountIls } from "@/lib/billing-pricing";
import { createLogger } from "@/lib/logger";
import { env } from "@/lib/env";

const log = createLogger("register-paypal-create-order");

/** Mirrors EMAIL_RE in app/api/register/route.ts. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Creates a PayPal order for a signup that has not happened yet.
 *
 * The in-app equivalent (app/api/billing/paypal/create-order) is wrapped in
 * withWorkspacesAuth and stamps the order with an organization id. Neither is
 * available before registration, so this route is unauthenticated — and is
 * therefore rate-limited per IP, prices strictly server-side, and writes
 * nothing. The only thing it produces is a PayPal order id.
 *
 * The custom_id is the contract with verifyRegistrationPayPalOrder, which
 * POST /api/register uses to decide the tier:  REG|<email>|TIER|<tier>|<cycle>
 */
export async function POST(req: NextRequest) {
  const burst = await applyRateLimit(req, "register-paypal:burst", 5, 60_000);
  if (burst) return burst;
  const limited = await applyRateLimit(req, "register-paypal", 20, 60 * 60 * 1000);
  if (limited) return limited;

  try {
    if (!isPayPalServerConfigured()) {
      return jsonServiceUnavailable(
        "PayPal לא מוגדר בשרת",
        "paypal_not_configured",
      );
    }

    const body = (await req.json()) as {
      email?: string;
      tier?: string;
      billingCycle?: string;
    };

    const email = String(body.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return jsonBadRequest("אימייל לא תקין", "invalid_email");
    }

    const tier = parseSubscriptionTier(String(body.tier ?? "").trim().toUpperCase());
    if (!tier || tier === "FREE") {
      return jsonBadRequest("רמת מנוי לא זמינה לתשלום", "invalid_tier");
    }

    const cycleRaw = String(body.billingCycle ?? "monthly").trim().toLowerCase();
    const billingCycle: "monthly" | "annual" = cycleRaw === "annual" ? "annual" : "monthly";

    // Price is resolved server-side only — the client never states an amount.
    const price = await getExpectedTierOrderAmountIls(tier, billingCycle);
    if (price == null) {
      return jsonBadRequest("אין מחיר לרמה זו — פנו לתמיכה", "no_price");
    }

    const cycleToken = billingCycle === "annual" ? "A" : "M";
    const customId = `REG|${email}|TIER|${tier}|${cycleToken}`;
    // PayPal caps custom_id at 127 chars. Truncating here would corrupt the
    // tier/cycle fields and make verifyRegistrationPayPalOrder reject a real
    // payment, so refuse up front rather than take money we can't honour.
    if (customId.length > 127) {
      return jsonBadRequest("כתובת האימייל ארוכה מדי לתשלום", "email_too_long");
    }
    const description =
      billingCycle === "annual"
        ? `BSD-YBM — מנוי ${tierLabelHe(tier)} (שנתי)`
        : `BSD-YBM — מנוי ${tierLabelHe(tier)}`;

    const id = await createPayPalOrderId({
      amountValue: price.toFixed(2),
      description,
      customId,
    });

    return NextResponse.json({ id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Distinguish "our credentials are wrong" from "PayPal rejected the order".
    // Both used to surface as one opaque 502, which made a misconfigured
    // PAYPAL_CLIENT_ID/SECRET pair indistinguishable from a bad request — the
    // client saw "order creation failed" and the cause lived only in the logs.
    const isAuth =
      /invalid_client|Client Authentication failed|PayPal token HTTP|חסר PAYPAL_CLIENT_SECRET/i.test(msg);
    log.error("register paypal create-order failed", {
      error: msg,
      kind: isAuth ? "auth" : "order_rejected",
      // Which PayPal environment the server actually talked to. Empty
      // PAYPAL_ENV means live, which is easy to get wrong when the credentials
      // configured alongside it are sandbox ones.
      paypalEnv: env.PAYPAL_ENV ?? "(unset → live)",
    });
    // The message stays generic; only the code differs, so nothing upstream leaks.
    return jsonBadGateway(
      "יצירת הזמנה נכשלה",
      isAuth ? "paypal_auth_failed" : "paypal_order_rejected",
    );
  }
}
