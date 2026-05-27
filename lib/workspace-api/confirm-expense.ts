import { prisma } from "@/lib/prisma";

export type ConfirmExpenseInput = {
  amount: number | string;
  projectName?: string;
  vendor?: string;
};

export async function confirmExpense(orgId: string, body: ConfirmExpenseInput) {
  const amount = parseFloat(String(body.amount ?? ""));
  const projectName = body.projectName?.trim() || "";

  if (Number.isNaN(amount) || amount <= 0) {
    return { ok: false as const, error: "סכום לא תקין" };
  }

  let project = projectName
    ? await prisma.project.findFirst({
        where: { name: projectName, organizationId: orgId },
      })
    : null;
  if (!project) {
    const fallbackName = projectName || "כללי";
    project = await prisma.project.create({
      data: {
        name: fallbackName,
        budget: 0,
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

  const [allExpenses, allProjects, pendingInvoices] = await Promise.all([
    prisma.expenseRecord.aggregate({
      where: { organizationId: orgId },
      _sum: { total: true },
    }),
    prisma.project.aggregate({
      where: { organizationId: orgId },
      _sum: { budget: true },
      _count: { id: true },
    }),
    prisma.issuedDocument.count({
      where: { organizationId: orgId, status: "PENDING", deletedAt: null },
    }),
  ]);

  return {
    ok: true as const,
    success: true,
    newStats: {
      totalRevenue: allProjects._sum.budget ?? 0,
      totalExpenses: allExpenses._sum.total ?? 0,
      activeProjects: allProjects._count.id,
      pendingInvoices,
    },
  };
}
