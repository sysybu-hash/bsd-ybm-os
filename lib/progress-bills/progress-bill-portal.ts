import { prisma } from "@/lib/prisma";
import type { ProgressBillPortalRow } from "@/lib/validation/schemas/progress-bill-portal";

export type ProgressBillLineInput = {
  boqLineId: string;
  executedQty: number;
};

export function mapProgressBillPortalRow(
  bill: {
    id: string;
    projectId: string;
    billNumber: number;
    contractorName: string | null;
    total: number;
    completionPercent: number | null;
    status: string;
    submittedAt: Date | null;
    approvedAt: Date | null;
    createdAt: Date;
    project: { name: string };
    lines?: Array<{
      id: string;
      boqLineId: string | null;
      description: string | null;
      contractQty: number | null;
      unitPrice: number | null;
      executedQty: number | null;
      lineTotal: number;
    }>;
  },
): ProgressBillPortalRow {
  return {
    id: bill.id,
    projectId: bill.projectId,
    projectName: bill.project.name,
    billNumber: bill.billNumber,
    contractorName: bill.contractorName,
    amount: bill.total,
    completionPercent: bill.completionPercent,
    status: bill.status as ProgressBillPortalRow["status"],
    submittedAt: bill.submittedAt?.toISOString() ?? null,
    approvedAt: bill.approvedAt?.toISOString() ?? null,
    createdAt: bill.createdAt.toISOString(),
    lines: (bill.lines ?? []).map((l) => ({
      id: l.id,
      boqLineId: l.boqLineId,
      description: l.description,
      contractQty: l.contractQty,
      unitPrice: l.unitPrice,
      executedQty: l.executedQty,
      lineTotal: l.lineTotal,
    })),
  };
}

export async function nextBillNumber(projectId: string, organizationId: string): Promise<number> {
  const agg = await prisma.progressBill.aggregate({
    where: { projectId, organizationId },
    _max: { billNumber: true },
  });
  return (agg._max.billNumber ?? 0) + 1;
}

export async function createProgressBillPortal(input: {
  organizationId: string;
  projectId: string;
  contractorName: string;
  amount?: number;
  completionPercent: number;
  submit?: boolean;
  lines?: ProgressBillLineInput[];
}) {
  const billNumber = await nextBillNumber(input.projectId, input.organizationId);
  const now = new Date();
  const status = input.submit ? "SUBMITTED" : "DRAFT";

  const lineInputs = input.lines ?? [];
  let resolvedLines: Array<{
    boqLineId: string;
    description: string;
    contractQty: number | null;
    unitPrice: number | null;
    executedQty: number;
    executedCoef: number | null;
    lineTotal: number;
  }> = [];

  if (lineInputs.length > 0) {
    const boqIds = lineInputs.map((l) => l.boqLineId);
    const boqRows = await prisma.projectBoqLine.findMany({
      where: {
        id: { in: boqIds },
        projectId: input.projectId,
        organizationId: input.organizationId,
      },
    });
    const byId = new Map(boqRows.map((r) => [r.id, r]));
    resolvedLines = lineInputs
      .map((li) => {
        const boq = byId.get(li.boqLineId);
        if (!boq) return null;
        const unitPrice = boq.unitPrice ?? 0;
        const executedQty = li.executedQty;
        const contractQty = boq.quantity ?? null;
        const lineTotal = executedQty * unitPrice;
        const executedCoef =
          contractQty && contractQty > 0 ? executedQty / contractQty : null;
        return {
          boqLineId: boq.id,
          description: boq.description,
          contractQty,
          unitPrice: boq.unitPrice,
          executedQty,
          executedCoef,
          lineTotal,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }

  const linesTotal = resolvedLines.reduce((s, l) => s + l.lineTotal, 0);
  const total =
    resolvedLines.length > 0
      ? linesTotal
      : typeof input.amount === "number"
        ? input.amount
        : 0;

  return prisma.progressBill.create({
    data: {
      projectId: input.projectId,
      organizationId: input.organizationId,
      billNumber,
      contractorName: input.contractorName,
      completionPercent: input.completionPercent,
      subtotal: total,
      total,
      status,
      submittedAt: input.submit ? now : null,
      billDate: now,
      lines:
        resolvedLines.length > 0
          ? {
              create: resolvedLines.map((l) => ({
                boqLineId: l.boqLineId,
                description: l.description,
                contractQty: l.contractQty,
                unitPrice: l.unitPrice,
                executedQty: l.executedQty,
                executedCoef: l.executedCoef,
                lineTotal: l.lineTotal,
              })),
            }
          : undefined,
    },
    include: {
      project: { select: { name: true } },
      lines: true,
    },
  });
}

/** Idempotent: apply billed quantities onto BOQ lines when a bill is approved. */
async function syncBoqOnApprove(billId: string, organizationId: string): Promise<void> {
  const bill = await prisma.progressBill.findFirst({
    where: { id: billId, organizationId },
    include: { lines: true },
  });
  if (!bill || bill.lines.length === 0) return;

  for (const line of bill.lines) {
    if (!line.boqLineId) continue;
    const boq = await prisma.projectBoqLine.findFirst({
      where: { id: line.boqLineId, organizationId },
    });
    if (!boq) continue;
    const nextExecuted = Math.max(boq.executedQuantity ?? 0, line.executedQty ?? 0);
    const nextBilled = (boq.billedAmount ?? 0) + (line.lineTotal ?? 0);
    await prisma.projectBoqLine.update({
      where: { id: boq.id },
      data: {
        executedQuantity: nextExecuted,
        billedAmount: nextBilled,
      },
    });
  }
}

export async function transitionProgressBill(input: {
  billId: string;
  organizationId: string;
  action: "submit" | "approve" | "pay";
  userId: string;
}) {
  const bill = await prisma.progressBill.findFirst({
    where: { id: input.billId, organizationId: input.organizationId },
  });
  if (!bill) return null;

  const now = new Date();
  if (input.action === "submit") {
    if (bill.status !== "DRAFT") return { error: "INVALID_STATUS" as const };
    return prisma.progressBill.update({
      where: { id: bill.id },
      data: { status: "SUBMITTED", submittedAt: now },
      include: { project: { select: { name: true } }, lines: true },
    });
  }
  if (input.action === "approve") {
    if (bill.status !== "SUBMITTED") return { error: "INVALID_STATUS" as const };
    const updated = await prisma.progressBill.update({
      where: { id: bill.id },
      data: {
        status: "APPROVED",
        approvedAt: now,
        approvedByUserId: input.userId,
      },
      include: { project: { select: { name: true } }, lines: true },
    });
    await syncBoqOnApprove(bill.id, input.organizationId);
    return updated;
  }
  if (bill.status !== "APPROVED") return { error: "INVALID_STATUS" as const };
  return prisma.progressBill.update({
    where: { id: bill.id },
    data: { status: "PAID" },
    include: { project: { select: { name: true } }, lines: true },
  });
}
