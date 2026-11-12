import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { paypalCaptureOrder, paypalFetchOrder } from "@/lib/paypal-server";
import { parseCapturePayload } from "@/lib/paypal-order-parse";
import { withVmbAuth } from "@/lib/vmb/api";
import { applyVmbPayment, parseVmbCustomId } from "@/lib/vmb/billing";
import { isMember } from "@/lib/vmb/workspace";

export const dynamic = "force-dynamic";
const log = createLogger("vmb-paypal-capture");

const bodySchema = z.object({ orderID: z.string().min(5).max(64) });

/**
 * The buyer approved the order: capture it on the server and apply it. The
 * webhook applies the same capture too; whichever arrives second is a duplicate.
 */
export const POST = withVmbAuth(async (req, { user }) => {
  const limited = await applyRateLimit(req, "vmb:paypal-capture", 10, 60_000);
  if (limited) return limited;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "invalid" }, { status: 400 });
  const { orderID } = parsed.data;

  try {
    const before = await paypalFetchOrder(orderID);
    const unit = (before.purchase_units as Array<Record<string, unknown>> | undefined)?.[0];
    const purchase = parseVmbCustomId(String(unit?.custom_id ?? ""));
    if (!purchase || !(await isMember(user.id, purchase.workspaceId))) {
      return NextResponse.json({ code: "forbidden" }, { status: 403 });
    }
    const after = String(before.status) === "COMPLETED" ? before : await paypalCaptureOrder(orderID);
    const cap = parseCapturePayload(after);
    if (!cap) return NextResponse.json({ code: "not_completed" }, { status: 402 });
    const result = await applyVmbPayment({
      purchase,
      gateway: "paypal",
      txId: cap.captureId,
      amountMinor: Math.round(cap.paid * 100),
      currency: cap.currency,
    });
    if (!result.applied && result.reason !== "duplicate") {
      log.error("apply_failed", { reason: result.reason, orderID });
      return NextResponse.json({ code: result.reason }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    log.error("capture_failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ code: "gateway_error" }, { status: 502 });
  }
});
