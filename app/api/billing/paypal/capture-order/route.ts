import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isPayPalServerConfigured, paypalCaptureOrder } from "@/lib/paypal-server";
import { sendPayPalSubscriptionConfirmationEmail } from "@/lib/mail";
import { parseCapturePayload } from "@/lib/paypal-order-parse";
import { applyPayPalCaptureResult } from "@/lib/paypal-capture-apply";

export async function POST(req: Request) {
  if (!isPayPalServerConfigured()) {
    return NextResponse.json({ ok: false, error: "PayPal לא מוגדר בשרת" }, { status: 503 });
  }

  const session = await getServerSession(authOptions);
  const orgIdSession = session?.user?.organizationId;
  const userEmail = session?.user?.email;
  if (!session?.user?.id || !orgIdSession || !userEmail) {
    return NextResponse.json({ ok: false, error: "נדרשת התחברות" }, { status: 401 });
  }

  let body: { orderID?: string };
  try {
    body = (await req.json()) as { orderID?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "גוף בקשה לא תקין" }, { status: 400 });
  }

  const orderID = String(body.orderID || "").trim();
  if (!orderID) {
    return NextResponse.json({ ok: false, error: "חסר מזהה הזמנה" }, { status: 400 });
  }

  let raw: Record<string, unknown>;
  try {
    raw = await paypalCaptureOrder(orderID);
  } catch (e) {
    console.error("[capture-order] capture", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Capture נכשל" },
      { status: 502 },
    );
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
    sessionOrgId: orgIdSession,
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
    message:
      "תודה! הרכישה נרשמה. ברוך הבא לשדרה שמחברת בין כולם",
  });
}
