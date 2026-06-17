import { prisma } from "@/lib/prisma";
import type { ProgressBillPortalRow } from "@/lib/validation/schemas/progress-bill-portal";

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
  amount: number;
  completionPercent: number;
  submit?: boolean;
}) {
  const billNumber = await nextBillNumber(input.projectId, input.organizationId);
  const now = new Date();
  const status = input.submit ? "SUBMITTED" : "DRAFT";

  return prisma.progressBill.create({
    data: {
      projectId: input.projectId,
      organizationId: input.organizationId,
      billNumber,
      contractorName: input.contractorName,
      completionPercent: input.completionPercent,
      subtotal: input.amount,
      total: input.amount,
      status,
      submittedAt: input.submit ? now : null,
      billDate: now,
    },
    include: { project: { select: { name: true } } },
  });
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
      include: { project: { select: { name: true } } },
    });
  }
  if (input.action === "approve") {
    if (bill.status !== "SUBMITTED") return { error: "INVALID_STATUS" as const };
    return prisma.progressBill.update({
      where: { id: bill.id },
      data: {
        status: "APPROVED",
        approvedAt: now,
        approvedByUserId: input.userId,
      },
      include: { project: { select: { name: true } } },
    });
  }
  if (bill.status !== "APPROVED") return { error: "INVALID_STATUS" as const };
  return prisma.progressBill.update({
    where: { id: bill.id },
    data: { status: "PAID" },
    include: { project: { select: { name: true } } },
  });
}
