import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadGateway } from "@/lib/api-json";
import { isPayPalServerConfigured, paypalCaptureOrder } from "@/lib/paypal-server";
import { sendPayPalSubscriptionConfirmationEmail } from "@/lib/mail";
import { parseCapturePayload } from "@/lib/paypal-order-parse";
import { applyPayPalCaptureResult } from "@/lib/paypal-capture-apply";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse } from "@/lib/api-route-helpers";

const captureOrderBodySchema = z.object({
  orderID: z.string().min(1),
});

export const POST = withWorkspacesAuth(
  async (_req, { orgId, userId }, data) => {
    try {
      if (!isPayPalServerConfigured()) {
        return NextResponse.json({ ok: false, error: "PayPal לא מוגדר בשרת" }, { status: 503 });
      }

      const userRow = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      const userEmail = userRow?.email;
      if (!userEmail) {
        return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
      }

      const orderID = data.orderID.trim();

      let raw: Record<string, unknown>;
      try {
        raw = await paypalCaptureOrder(orderID);
      } catch (e) {
        console.error("[capture-order] capture", e);
        return jsonBadGateway(e instanceof Error ? e.message : "Capture נכשל");
      }

      const parsed = parseCapturePayload(raw);
      if (!parsed || parsed.captureStatus !== "COMPLETED") {
        return NextResponse.json({ ok: false, error: "תשלום לא הושלם" }, { status: 400 });
      }

      const applied = await applyPayPalCaptureResult({
        customIdFull: parsed.customId,
        paidTotal: parsed.paid,
        currency: parsed.currency,
        captureId: parsed.captureId,
        sessionOrgId: orgId,
      });

      if (!applied.ok) {
        return NextResponse.json({ ok: false, error: applied.error }, { status: applied.status });
      }

      if (!applied.duplicate) {
        void sendPayPalSubscriptionConfirmationEmail(userEmail, {
          planLabel: applied.planLabel,
          amountIls: applied.paidTotal.toLocaleString("he-IL", { minimumFractionDigits: 2 }),
          orgName: applied.orgName,
        });
      }

      revalidatePath("/app/documents/erp");
      revalidatePath("/app/settings/billing");
      revalidatePath("/app");

      return NextResponse.json({
        ok: true,
        message: "תודה! הרכישה נרשמה. ברוך הבא לשדרה שמחברת בין כולם",
      });
    } catch (err: unknown) {
      return apiErrorResponse(err, "[capture-order]");
    }
  },
  { schema: captureOrderBodySchema },
);
