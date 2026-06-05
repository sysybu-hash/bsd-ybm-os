import { prisma } from "@/lib/prisma";
import { resolveLinkedBoqLineId } from "@/lib/project-task-metadata";
import { filterPaymentMilestonesForDisplay } from "@/lib/project-payment-milestones";
import { resolveMilestoneIls } from "@/lib/payment-milestone-amounts";

export async function getProjectDashboard(orgId: string, projectId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { industry: true },
  });
  const orgIndustry = org?.industry ?? null;

  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId: orgId },
    include: {
      primaryContact: { select: { id: true, name: true } },
      paymentMilestones: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      projectExtras: { orderBy: { createdAt: "desc" } },
      projectExpenses: { orderBy: [{ month: "desc" }, { createdAt: "desc" }] },
      workDiaries: { orderBy: { date: "desc" } },
      tasks: {
        orderBy: { startDate: "asc" },
        select: {
          id: true,
          title: true,
          startDate: true,
          endDate: true,
          progress: true,
          status: true,
          dependencies: true,
          description: true,
          linkedBoqLineId: true,
          parentTaskId: true,
        },
      },
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
  const budget = project.budget || 0;
  const visibleMilestones = filterPaymentMilestonesForDisplay(
    orgIndustry,
    project.paymentMilestones,
  );
  const milestoneRows = visibleMilestones.map((m) => ({
    amount: m.amount,
    percent: m.percent,
  }));
  const milestonesTotal = visibleMilestones.reduce(
    (s, m) => s + resolveMilestoneIls({ amount: m.amount, percent: m.percent }, budget, milestoneRows),
    0,
  );
  const milestonesPaid = visibleMilestones
    .filter((m) => m.isPaid)
    .reduce(
      (s, m) => s + resolveMilestoneIls({ amount: m.amount, percent: m.percent }, budget, milestoneRows),
      0,
    );
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
    milestones: visibleMilestones.map((m) => ({
      id: m.id,
      name: m.name,
      amount: m.amount,
      percent: m.percent,
      isPaid: m.isPaid,
      datePaid: m.datePaid?.toISOString() ?? null,
    })),
    hiddenConstructionMilestones: Math.max(
      0,
      project.paymentMilestones.length - visibleMilestones.length,
    ),
    extras: project.projectExtras,
    projectExpenses: project.projectExpenses,
    workDiaries: project.workDiaries,
    tasks: await (async () => {
      const diaryByTask = new Map<string, string>();
      for (const d of project.workDiaries) {
        if (d.linkedTaskId && !diaryByTask.has(d.linkedTaskId)) {
          diaryByTask.set(d.linkedTaskId, d.id);
        }
      }
      return project.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        startDate: t.startDate?.toISOString() ?? null,
        endDate: t.endDate?.toISOString() ?? null,
        progress: t.progress,
        status: t.status,
        dependencies: t.dependencies,
        description: t.description,
        linkedBoqLineId: resolveLinkedBoqLineId(t.linkedBoqLineId, t.description),
        linkedWorkDiaryId: diaryByTask.get(t.id) ?? null,
        parentTaskId: t.parentTaskId ?? null,
      }));
    })(),
    expenseRecords: project.expenseRecords.map((e) => ({
      id: e.id,
      amount: e.total,
      vendor: e.vendorName,
      date: e.expenseDate?.toISOString() ?? null,
    })),
    attendanceLogs: attendance,
  };
}
