import { prisma } from "@/lib/prisma";

export type ConfirmExpenseInput = {
  amount: number | string;
  projectName?: string;
  vendor?: string;
};

export async function confirmExpense(orgId: string, body: ConfirmExpenseInput) {
  const amount = parseFloat(String(body.amount ?? ""));
  const projectName = body.projectName || "פרויקט הרצליה";

  if (Number.isNaN(amount) || amount <= 0) {
    return { ok: false as const, error: "סכום לא תקין" };
  }

  let project = await prisma.project.findFirst({
    where: { name: projectName.trim(), organizationId: orgId },
  });
  if (!project) {
    project = await prisma.project.create({
      data: {
        name: projectName,
        budget: 1200000,
        organizationId: orgId,
      },
    });
  }

  await prisma.expenseRecord.create({
    data: {
      amountNet: amount,
      vat: 0,
      total: amount,
      vendorName: body.vendor || "ספק שזוהה ע״י AI",
      projectId: project.id,
      organizationId: orgId,
    },
  });

  const allExpenses = await prisma.expenseRecord.aggregate({
    where: { organizationId: orgId },
    _sum: { total: true },
  });
  const allProjects = await prisma.project.aggregate({
    where: { organizationId: orgId },
    _sum: { budget: true },
    _count: { id: true },
  });

  return {
    ok: true as const,
    success: true,
    newStats: {
      totalRevenue: allProjects._sum.budget || 1200000,
      totalExpenses: allExpenses._sum.total || 450000,
      activeProjects: allProjects._count.id || 5,
      pendingInvoices: 12,
    },
  };
}
