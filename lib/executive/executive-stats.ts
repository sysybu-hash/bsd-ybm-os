import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getDashboardStats } from "@/lib/workspace-api/dashboard-stats";

const log = createLogger("executive-stats");

export type ExecutiveStats = {
  netCashflow: number;
  lateTasks: number;
  budgetAlerts: number;
  activeProjects: number;
  pendingProgressBills: number;
};

export async function getExecutiveStats(orgId: string): Promise<ExecutiveStats> {
  const now = new Date();

  const [
    dashboard,
    lateTasks,
    activeProjects,
    expenseByProject,
    activeProjectBudgets,
    pendingProgressBills,
  ] = await Promise.all([
    getDashboardStats(orgId),
    prisma.task.count({
      where: {
        organizationId: orgId,
        status: { not: "DONE" },
        progress: { lt: 100 },
        OR: [
          { dueDate: { lt: now } },
          { endDate: { lt: now } },
        ],
      },
    }),
    prisma.project.count({
      where: { organizationId: orgId, isActive: true },
    }),
    prisma.expenseRecord.groupBy({
      by: ["projectId"],
      where: { organizationId: orgId, projectId: { not: null } },
      _sum: { total: true },
    }),
    prisma.project.findMany({
      where: { organizationId: orgId, isActive: true, budget: { gt: 0 } },
      select: { id: true, budget: true },
    }),
    prisma.progressBill.count({
      where: { organizationId: orgId, status: "SUBMITTED" },
    }),
  ]);

  const spentByProject = new Map<string, number>();
  for (const row of expenseByProject) {
    if (row.projectId) {
      spentByProject.set(row.projectId, row._sum.total ?? 0);
    }
  }

  let budgetAlerts = 0;
  for (const project of activeProjectBudgets) {
    const spent = spentByProject.get(project.id) ?? 0;
    if (spent > project.budget * 0.9) {
      budgetAlerts += 1;
    }
  }

  const netCashflow = dashboard.totalRevenue - dashboard.totalExpenses;

  log.info("executive stats computed", {
    orgId,
    lateTasks,
    budgetAlerts,
    activeProjects,
  });

  return {
    netCashflow,
    lateTasks,
    budgetAlerts,
    activeProjects,
    pendingProgressBills,
  };
}
