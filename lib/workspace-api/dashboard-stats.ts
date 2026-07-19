import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const log = createLogger("dashboard-stats");

export async function getDashboardStats(orgId: string) {
  const whereOrg = { organizationId: orgId };
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const [
    projectAgg,
    activeProjects,
    totalClients,
    expenseTotal,
    thisMonthExpenseAgg,
    lastMonthExpenseAgg,
    pendingQuotes,
    signedQuotes,
    pendingInvoicesCount,
    dbInsight,
  ] = await Promise.all([
    prisma.project.aggregate({
      where: whereOrg,
      _sum: { budget: true },
    }),
    prisma.project.count({ where: whereOrg }),
    prisma.contact.count({ where: whereOrg }),
    prisma.expenseRecord.aggregate({
      where: whereOrg,
      _sum: { total: true },
    }),
    prisma.expenseRecord.aggregate({
      where: { ...whereOrg, expenseDate: { gte: thisMonthStart } },
      _sum: { total: true },
    }),
    prisma.expenseRecord.aggregate({
      where: {
        ...whereOrg,
        expenseDate: { gte: lastMonthStart, lte: lastMonthEnd },
      },
      _sum: { total: true },
    }),
    prisma.quote.count({ where: { ...whereOrg, status: "PENDING" } }),
    prisma.quote.count({
      where: { ...whereOrg, status: { in: ["SIGNED", "APPROVED"] } },
    }),
    prisma.issuedDocument.count({
      where: { organizationId: orgId, status: "PENDING", deletedAt: null },
    }),
    prisma.financialInsight.findUnique({ where: { organizationId: orgId } }),
  ]);

  const totalRevenue = projectAgg._sum.budget ?? 0;
  const totalExpenses = expenseTotal._sum.total ?? 0;
  const thisMonthExpenses = thisMonthExpenseAgg._sum.total ?? 0;
  const lastMonthExpenses = lastMonthExpenseAgg._sum.total ?? 0;
  const insight = dbInsight?.content ?? "המערכת מנתחת נתונים...";

  let cashflow: unknown[] = [];
  try {
    const { getCashflowForecasting } = await import("@/lib/cashflow-logic");
    cashflow = await getCashflowForecasting(orgId);
  } catch (err: unknown) {
    log.warn("Cashflow fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    totalRevenue,
    totalExpenses,
    activeProjects,
    totalClients,
    pendingInvoices: pendingInvoicesCount,
    aiInsight: insight,
    cashflow,
    analytics: {
      monthlyExpenses: [
        { name: "חודש שעבר", value: lastMonthExpenses },
        { name: "החודש", value: thisMonthExpenses },
      ],
      quoteStatus: [
        { name: "ממתין", value: pendingQuotes, color: "#f59e0b" },
        { name: "נחתם", value: signedQuotes, color: "#10b981" },
      ],
    },
  };
}
