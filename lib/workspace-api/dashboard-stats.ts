import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getUpstashRedis } from "@/lib/upstash-redis";
import type { DocType } from "@prisma/client";

const log = createLogger("dashboard-stats");

const DASH_STATS_TTL_SEC = 45;

/** Document types that count as income (issued invoices / receipts). */
const INCOME_DOC_TYPES: DocType[] = [
  "TRANSACTION_INVOICE",
  "INVOICE",
  "INVOICE_RECEIPT",
  "RECEIPT",
];

const MONTH_NAMES_HE = [
  "ינו", "פבר", "מרץ", "אפר", "מאי", "יונ",
  "יול", "אוג", "ספט", "אוק", "נוב", "דצמ",
] as const;

export type MoneySourceBreakdown = {
  /** Human-readable source lines for UI */
  revenueLines: { label: string; amount: number }[];
  expenseLines: { label: string; amount: number }[];
  /** Project budgets are NOT income — shown for context only */
  projectBudgetsTotal: number;
  issuedIncomeDocsCount: number;
  creditNotesTotal: number;
  expenseRecordsCount: number;
};

export type CashflowMonthPoint = {
  name: string;
  revenue: number;
  expenses: number;
  /** @deprecated use expenses — kept for AreaChart compatibility */
  actual?: number;
  forecast?: number;
  type: "past" | "future";
};

export type DashboardStatsPayload = {
  totalRevenue: number;
  totalExpenses: number;
  activeProjects: number;
  totalClients: number;
  pendingInvoices: number;
  aiInsight: string;
  cashflow: CashflowMonthPoint[];
  breakdown: MoneySourceBreakdown;
  analytics: {
    monthlyExpenses: { name: string; value: number }[];
    monthlyIncome: { name: string; value: number }[];
    quoteStatus: { name: string; value: number; color: string }[];
  };
};

function cacheKey(orgId: string): string {
  return `dash:stats:v2:${orgId}`;
}

function monthBounds(year: number, monthIndex: number): { start: Date; end: Date } {
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

async function sumIssuedIncome(
  orgId: string,
  from?: Date,
  to?: Date,
): Promise<{ income: number; credits: number; count: number }> {
  const dateFilter =
    from && to ? { date: { gte: from, lte: to } } : {};

  const [incomeAgg, creditAgg, count] = await Promise.all([
    prisma.issuedDocument.aggregate({
      where: {
        organizationId: orgId,
        deletedAt: null,
        status: { not: "CANCELLED" },
        type: { in: INCOME_DOC_TYPES },
        ...dateFilter,
      },
      _sum: { total: true },
    }),
    prisma.issuedDocument.aggregate({
      where: {
        organizationId: orgId,
        deletedAt: null,
        status: { not: "CANCELLED" },
        type: "CREDIT_NOTE",
        ...dateFilter,
      },
      _sum: { total: true },
    }),
    prisma.issuedDocument.count({
      where: {
        organizationId: orgId,
        deletedAt: null,
        status: { not: "CANCELLED" },
        type: { in: INCOME_DOC_TYPES },
        ...dateFilter,
      },
    }),
  ]);

  return {
    income: incomeAgg._sum.total ?? 0,
    credits: creditAgg._sum.total ?? 0,
    count,
  };
}

async function sumExpenses(orgId: string, from?: Date, to?: Date): Promise<{ total: number; count: number }> {
  const dateFilter =
    from && to ? { expenseDate: { gte: from, lte: to } } : {};
  const [agg, count] = await Promise.all([
    prisma.expenseRecord.aggregate({
      where: { organizationId: orgId, ...dateFilter },
      _sum: { total: true },
    }),
    prisma.expenseRecord.count({
      where: { organizationId: orgId, ...dateFilter },
    }),
  ]);
  return { total: agg._sum.total ?? 0, count };
}

async function buildMonthlyCashflow(orgId: string): Promise<CashflowMonthPoint[]> {
  const now = new Date();
  const points: CashflowMonthPoint[] = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const { start, end } = monthBounds(d.getFullYear(), d.getMonth());
    const [issued, expenses] = await Promise.all([
      sumIssuedIncome(orgId, start, end),
      sumExpenses(orgId, start, end),
    ]);
    const revenue = Math.max(0, issued.income - issued.credits);
    const exp = expenses.total;
    points.push({
      name: MONTH_NAMES_HE[d.getMonth()]!,
      revenue,
      expenses: exp,
      actual: exp,
      type: "past",
    });
  }

  return points;
}

async function computeDashboardStats(orgId: string): Promise<DashboardStatsPayload> {
  const whereOrg = { organizationId: orgId };
  const now = new Date();
  const thisMonth = monthBounds(now.getFullYear(), now.getMonth());
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = monthBounds(lastMonthDate.getFullYear(), lastMonthDate.getMonth());

  const [
    projectBudgets,
    activeProjects,
    totalClients,
    allTimeIssued,
    allTimeExpenses,
    thisMonthIssued,
    lastMonthIssued,
    thisMonthExpenses,
    lastMonthExpenses,
    pendingQuotes,
    signedQuotes,
    pendingInvoicesCount,
    dbInsight,
    cashflow,
  ] = await Promise.all([
    prisma.project.aggregate({
      where: whereOrg,
      _sum: { budget: true },
    }),
    prisma.project.count({ where: whereOrg }),
    prisma.contact.count({ where: whereOrg }),
    sumIssuedIncome(orgId),
    sumExpenses(orgId),
    sumIssuedIncome(orgId, thisMonth.start, thisMonth.end),
    sumIssuedIncome(orgId, lastMonth.start, lastMonth.end),
    sumExpenses(orgId, thisMonth.start, thisMonth.end),
    sumExpenses(orgId, lastMonth.start, lastMonth.end),
    prisma.quote.count({ where: { ...whereOrg, status: "PENDING" } }),
    prisma.quote.count({
      where: { ...whereOrg, status: { in: ["SIGNED", "APPROVED"] } },
    }),
    prisma.issuedDocument.count({
      where: { organizationId: orgId, status: "PENDING", deletedAt: null },
    }),
    prisma.financialInsight.findUnique({ where: { organizationId: orgId } }),
    buildMonthlyCashflow(orgId),
  ]);

  const totalRevenue = Math.max(0, allTimeIssued.income - allTimeIssued.credits);
  const totalExpenses = allTimeExpenses.total;
  const projectBudgetsTotal = projectBudgets._sum.budget ?? 0;

  const thisMonthIncome = Math.max(0, thisMonthIssued.income - thisMonthIssued.credits);
  const lastMonthIncome = Math.max(0, lastMonthIssued.income - lastMonthIssued.credits);

  const insight =
    dbInsight?.content ??
    (totalRevenue === 0 && totalExpenses === 0
      ? "אין עדיין חשבוניות מונפקות או הוצאות רשומות — הפק מסמך או רשום הוצאה כדי למלא את הסקירה."
      : "הנתונים מסונכרנים ממסמכים מונפקים והוצאות שנרשמו במערכת.");

  const breakdown: MoneySourceBreakdown = {
    revenueLines: [
      {
        label: "חשבוניות וקבלות מונפקות",
        amount: allTimeIssued.income,
      },
      ...(allTimeIssued.credits > 0
        ? [{ label: "בניכוי זיכויים", amount: -allTimeIssued.credits }]
        : []),
    ],
    expenseLines: [
      {
        label: "רשומות הוצאה (ספקים / משרד / פרויקט)",
        amount: totalExpenses,
      },
    ],
    projectBudgetsTotal,
    issuedIncomeDocsCount: allTimeIssued.count,
    creditNotesTotal: allTimeIssued.credits,
    expenseRecordsCount: allTimeExpenses.count,
  };

  return {
    totalRevenue,
    totalExpenses,
    activeProjects,
    totalClients,
    pendingInvoices: pendingInvoicesCount,
    aiInsight: insight,
    cashflow,
    breakdown,
    analytics: {
      monthlyExpenses: [
        { name: "חודש שעבר", value: lastMonthExpenses.total },
        { name: "החודש", value: thisMonthExpenses.total },
      ],
      monthlyIncome: [
        { name: "חודש שעבר", value: lastMonthIncome },
        { name: "החודש", value: thisMonthIncome },
      ],
      quoteStatus: [
        { name: "ממתין", value: pendingQuotes, color: "#f59e0b" },
        { name: "נחתם", value: signedQuotes, color: "#10b981" },
      ],
    },
  };
}

export async function getDashboardStats(orgId: string): Promise<DashboardStatsPayload> {
  const redis = getUpstashRedis();
  const key = cacheKey(orgId);
  if (redis) {
    try {
      const cached = await redis.get<DashboardStatsPayload>(key);
      if (cached && typeof cached === "object" && cached.breakdown) {
        return cached;
      }
    } catch (err) {
      log.warn("dashboard_stats_cache_get_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const stats = await computeDashboardStats(orgId);

  if (redis) {
    try {
      await redis.set(key, stats, { ex: DASH_STATS_TTL_SEC });
    } catch (err) {
      log.warn("dashboard_stats_cache_set_failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return stats;
}
