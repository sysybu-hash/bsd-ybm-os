import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * The credit ledger. Balance = sum(delta). A job holds its estimate up front
 * (negative), and on finish releases what it did not use, or everything if it
 * failed. Every movement carries (reason, refId), unique per workspace, so a
 * replayed webhook or a retried step cannot count twice.
 */
export type LedgerReason = "grant" | "purchase" | "hold" | "release" | "adjust" | "refund";

export async function creditBalance(workspaceId: string): Promise<number> {
  const agg = await prisma.vmbCreditLedger.aggregate({ where: { workspaceId }, _sum: { delta: true } });
  return agg._sum.delta ?? 0;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Adds one movement. Returns false when that (reason, refId) was already
 * recorded: the caller's event was a replay and nothing changed.
 */
export async function recordCredit(input: {
  workspaceId: string;
  delta: number;
  reason: LedgerReason;
  refId: string;
  jobId?: string;
  note?: string;
}): Promise<boolean> {
  if (!Number.isInteger(input.delta) || input.delta === 0) throw new Error("credit delta must be a non-zero integer");
  try {
    await prisma.vmbCreditLedger.create({ data: { ...input, jobId: input.jobId ?? null, note: input.note ?? null } });
    return true;
  } catch (err: unknown) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

export type HoldResult = { ok: true } | { ok: false; code: "insufficient"; balance: number };

/**
 * Holds `amount` credits for a job, only if the balance covers it. Runs in a
 * serializable transaction so two jobs cannot both spend the last credits.
 */
export async function holdCredits(workspaceId: string, jobId: string, amount: number): Promise<HoldResult> {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("hold amount must be a positive integer");
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.vmbCreditLedger.findUnique({
        where: { workspaceId_reason_refId: { workspaceId, reason: "hold", refId: jobId } },
        select: { id: true },
      });
      if (existing) return { ok: true } as const;
      const agg = await tx.vmbCreditLedger.aggregate({ where: { workspaceId }, _sum: { delta: true } });
      const balance = agg._sum.delta ?? 0;
      if (balance < amount) return { ok: false, code: "insufficient", balance } as const;
      await tx.vmbCreditLedger.create({ data: { workspaceId, delta: -amount, reason: "hold", refId: jobId, jobId } });
      return { ok: true } as const;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/**
 * Settles a job's hold: gives back `held - used` (all of it when the job
 * failed, used = 0). Idempotent per job.
 */
export async function settleHold(workspaceId: string, jobId: string, used: number): Promise<void> {
  const hold = await prisma.vmbCreditLedger.findUnique({
    where: { workspaceId_reason_refId: { workspaceId, reason: "hold", refId: jobId } },
    select: { delta: true },
  });
  if (!hold) return;
  const back = -hold.delta - Math.max(0, Math.round(used));
  if (back > 0) await recordCredit({ workspaceId, delta: back, reason: "release", refId: jobId, jobId });
}
