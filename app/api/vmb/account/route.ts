import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withVmbAuth } from "@/lib/vmb/api";
import { getEntitlement } from "@/lib/vmb/entitlement";
import { ensureWorkspace } from "@/lib/vmb/workspace";

export const dynamic = "force-dynamic";

/** The account page's data: office, subscription, balance, recent movements and payments. */
export const GET = withVmbAuth(async (_req, { user }) => {
  const ws = await ensureWorkspace(user);
  const [ent, ledger, payments] = await Promise.all([
    getEntitlement(ws.id),
    prisma.vmbCreditLedger.findMany({
      where: { workspaceId: ws.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { createdAt: true, delta: true, reason: true, jobId: true, note: true },
    }),
    prisma.vmbPayment.findMany({
      where: { workspaceId: ws.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { createdAt: true, kind: true, packId: true, amountMinor: true, currency: true, status: true, gateway: true },
    }),
  ]);
  return NextResponse.json({ workspace: ws, entitlement: ent, ledger, payments });
});
