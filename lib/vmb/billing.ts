import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { findCreditPack, nextPeriod, VMB_ANNUAL_PLAN, withVat } from "@/lib/vmb/plans";
import type { VmbPurchase } from "@/lib/vmb/custom-id";

const log = createLogger("vmb-billing");

export { parseVmbCustomId, vmbCustomId, VMB_CUSTOM_ID_PREFIX, type VmbPurchase } from "@/lib/vmb/custom-id";

/** The amount (agorot, VAT included) a purchase must have been paid. */
export function expectedAmountMinor(p: VmbPurchase): number {
  if (p.kind === "annual") return withVat(VMB_ANNUAL_PLAN.priceMinor);
  const pack = findCreditPack(p.packId);
  if (!pack) throw new Error(`unknown credit pack ${p.packId}`);
  return withVat(pack.priceMinor);
}

export type ApplyResult = { applied: true } | { applied: false; reason: "duplicate" | "amount_mismatch" | "currency_mismatch" | "no_workspace" };

/**
 * Applies a completed payment: records it, then renews the subscription and
 * grants its credits, or adds a credit pack. One transaction; the payment's
 * (gateway, txId) is unique, so a replayed capture or webhook does nothing.
 */
export async function applyVmbPayment(input: {
  purchase: VmbPurchase;
  gateway: "paypal" | "manual";
  txId: string;
  amountMinor: number;
  currency: string;
  /** Manual activation (bank transfer) may skip the amount check. */
  trustAmount?: boolean;
}): Promise<ApplyResult> {
  const { purchase, gateway, txId } = input;
  if (input.currency !== "ILS") return { applied: false, reason: "currency_mismatch" };
  if (!input.trustAmount && input.amountMinor !== expectedAmountMinor(purchase)) {
    log.warn("vmb_payment_amount_mismatch", { gateway, txId, kind: purchase.kind, amountMinor: input.amountMinor });
    return { applied: false, reason: "amount_mismatch" };
  }
  const ws = await prisma.vmbWorkspace.findUnique({ where: { id: purchase.workspaceId }, select: { id: true } });
  if (!ws) return { applied: false, reason: "no_workspace" };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.vmbPayment.create({
        data: {
          workspaceId: ws.id,
          gateway,
          txId,
          kind: purchase.kind,
          packId: purchase.kind === "credits" ? purchase.packId : null,
          amountMinor: input.amountMinor,
          currency: input.currency,
        },
      });
      if (purchase.kind === "annual") {
        const current = await tx.vmbSubscription.findUnique({ where: { workspaceId: ws.id }, select: { periodEnd: true } });
        const { start, end } = nextPeriod(new Date(), current?.periodEnd ?? null);
        await tx.vmbSubscription.upsert({
          where: { workspaceId: ws.id },
          create: { workspaceId: ws.id, periodStart: start, periodEnd: end, includedCredits: VMB_ANNUAL_PLAN.includedCredits },
          update: { status: "active", periodStart: start, periodEnd: end, includedCredits: VMB_ANNUAL_PLAN.includedCredits },
        });
        await tx.vmbCreditLedger.create({
          data: { workspaceId: ws.id, delta: VMB_ANNUAL_PLAN.includedCredits, reason: "grant", refId: `${gateway}:${txId}` },
        });
      } else {
        const pack = findCreditPack(purchase.packId);
        if (!pack) throw new Error(`unknown credit pack ${purchase.packId}`);
        await tx.vmbCreditLedger.create({
          data: { workspaceId: ws.id, delta: pack.credits, reason: "purchase", refId: `${gateway}:${txId}` },
        });
      }
    });
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { applied: false, reason: "duplicate" };
    throw err;
  }
  log.info("vmb_payment_applied", { gateway, txId, kind: purchase.kind, workspaceId: ws.id });
  return { applied: true };
}
