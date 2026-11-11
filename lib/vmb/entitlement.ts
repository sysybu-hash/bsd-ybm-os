import "server-only";
import { prisma } from "@/lib/prisma";
import { creditBalance } from "@/lib/vmb/credits";

export type VmbEntitlement = {
  subscription: { status: string; periodEnd: Date; includedCredits: number } | null;
  /** Active and inside its period. */
  active: boolean;
  balance: number;
};

export function isSubscriptionActive(sub: { status: string; periodEnd: Date } | null, now: Date = new Date()): boolean {
  return Boolean(sub && sub.status === "active" && sub.periodEnd.getTime() > now.getTime());
}

/** What a workspace may do right now: the one check every /api/vmb engine route asks. */
export async function getEntitlement(workspaceId: string): Promise<VmbEntitlement> {
  const [subscription, balance] = await Promise.all([
    prisma.vmbSubscription.findUnique({
      where: { workspaceId },
      select: { status: true, periodEnd: true, includedCredits: true },
    }),
    creditBalance(workspaceId),
  ]);
  return { subscription, active: isSubscriptionActive(subscription), balance };
}

export type CanRun = { ok: true } | { ok: false; code: "no_subscription" | "insufficient_credits"; balance: number };

/** Whether a job estimated at `cost` credits may start. Painting is allowed to any active subscriber with credits. */
export function canRun(ent: VmbEntitlement, cost: number): CanRun {
  if (!ent.active) return { ok: false, code: "no_subscription", balance: ent.balance };
  if (ent.balance < cost) return { ok: false, code: "insufficient_credits", balance: ent.balance };
  return { ok: true };
}
