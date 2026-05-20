import { prisma } from "@/lib/prisma";

export async function getProjectDashboard(orgId: string, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: orgId },
    include: {
      primaryContact: { select: { id: true, name: true } },
      paymentMilestones: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      projectExtras: { orderBy: { createdAt: "desc" } },
      projectExpenses: { orderBy: [{ month: "desc" }, { createdAt: "desc" }] },
      workDiaries: { orderBy: { date: "desc" } },
      tasks: { orderBy: { startDate: "asc" } },
      expenseRecords: { orderBy: { expenseDate: "desc" }, take: 50 },
    },
  });

  if (!project) return null;

  const erpExpenses = project.expenseRecords.reduce((s, e) => s + e.total, 0);
  const plannedExpenses = project.projectExpenses.reduce((s, e) => s + e.amount, 0);
  const extrasApproved = project.projectExtras
    .filter((e) => e.isApproved)
    .reduce((s, e) => s + e.cost, 0);
  const extrasPending = project.projectExtras
    .filter((e) => !e.isApproved)
    .reduce((s, e) => s + e.cost, 0);
  const milestonesTotal = project.paymentMilestones.reduce((s, m) => s + m.amount, 0);
  const milestonesPaid = project.paymentMilestones
    .filter((m) => m.isPaid)
    .reduce((s, m) => s + m.amount, 0);

  const budget = project.budget || 0;
  const utilized = erpExpenses + plannedExpenses + extrasApproved;
  const budgetUtilizationPercent =
    budget > 0 ? Math.min(100, Math.round((utilized / budget) * 100)) : 0;

  let attendance: unknown[] = [];
  try {
    const { getMeckanoAttendanceForProject } = await import("@/lib/meckano-access");
    attendance = await getMeckanoAttendanceForProject(project.id, orgId);
  } catch {
    attendance = [];
  }

  return {
    id: project.id,
    name: project.name,
    status: project.status,
    budget,
    client: project.primaryContact?.name ?? null,
    primaryContactId: project.primaryContactId,
    autoSyncCrm: project.autoSyncCrm,
    budgetUtilizationPercent,
    financial: {
      erpExpenses,
      plannedExpenses,
      extrasApproved,
      extrasPending,
      milestonesTotal,
      milestonesPaid,
      utilized,
    },
    milestones: project.paymentMilestones,
    extras: project.projectExtras,
    projectExpenses: project.projectExpenses,
    workDiaries: project.workDiaries,
    tasks: project.tasks,
    expenseRecords: project.expenseRecords.map((e) => ({
      id: e.id,
      amount: e.total,
      vendor: e.vendorName,
      date: e.expenseDate?.toISOString() ?? null,
    })),
    attendanceLogs: attendance,
  };
}
