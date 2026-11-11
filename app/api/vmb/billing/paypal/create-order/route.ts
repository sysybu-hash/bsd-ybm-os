import { NextResponse } from "next/server";
import { z } from "zod";
import { applyRateLimit } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import { isPayPalServerConfigured, paypalCreateOrderBody } from "@/lib/paypal-server";
import { withVmbAuth } from "@/lib/vmb/api";
import { expectedAmountMinor, vmbCustomId, type VmbPurchase } from "@/lib/vmb/billing";
import { minorToDecimal } from "@/lib/vmb/plans";
import { VMB_BRAND } from "@/lib/vmb/brand";
import { ensureWorkspace } from "@/lib/vmb/workspace";

export const dynamic = "force-dynamic";
const log = createLogger("vmb-paypal-create");

const bodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("annual") }),
  z.object({ kind: z.literal("credits"), packId: z.string().min(1).max(20) }),
]);

/** Creates a PayPal order for the signed-in user's office. Price is set here, never by the client. */
export const POST = withVmbAuth(async (req, { user }) => {
  const limited = await applyRateLimit(req, "vmb:paypal-create", 10, 60_000);
  if (limited) return limited;
  if (!isPayPalServerConfigured()) return NextResponse.json({ code: "paypal_not_configured" }, { status: 503 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "invalid" }, { status: 400 });

  const ws = await ensureWorkspace(user);
  const purchase: VmbPurchase =
    parsed.data.kind === "annual" ? { workspaceId: ws.id, kind: "annual" } : { workspaceId: ws.id, kind: "credits", packId: parsed.data.packId };
  let amountMinor: number;
  try {
    amountMinor = expectedAmountMinor(purchase);
  } catch {
    return NextResponse.json({ code: "invalid" }, { status: 400 });
  }
  try {
    const order = await paypalCreateOrderBody({
      amountValue: minorToDecimal(amountMinor),
      description: `${VMB_BRAND.name} · ${purchase.kind === "annual" ? "annual plan" : `credits ${purchase.packId}`}`,
      customId: vmbCustomId(purchase),
    });
    return NextResponse.json({ id: order.id });
  } catch (err: unknown) {
    log.error("create_order_failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ code: "gateway_error" }, { status: 502 });
  }
});
