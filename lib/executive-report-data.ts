import { prisma } from "@/lib/prisma";
import { DocStatus } from "@prisma/client";

export type ExecutiveFlowPoint = {
  name: string;
  income: number;
  expenses: number;
};

export type GlobalPriceSpikeRow = {
  changePercent: number;
  description: string;
  organizationName: string;
  latestPrice: number;
  previousPrice: number;
  normalizedKey: string;
};

function extractDocTotal(aiData: unknown): number {
  if (!aiData || typeof aiData !== "object") return 0;
  const t = (aiData as { total?: unknown }).total;
  const n = typeof t === "number" ? t : Number(t);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** סה״כ הכנסות (מסמכים מונפקים) וסה״כ הוצאות (מסמכי ERP סרוקים) — כל הארגונים */
export async function getGlobalIncomeExpenseTotals(): Promise<{
  totalIncome: number;
  totalExpenses: number;
  orgCount: number;
}> {
  const [issuedAgg, orgCount, docs] = await Promise.all([
    prisma.issuedDocument.aggregate({
      where: { status: { not: DocStatus.CANCELLED } },
      _sum: { total: true },
    }),
    prisma.organization.count(),
    prisma.document.findMany({
      select: { aiData: true },
    }),
  ]);

  const totalExpenses = docs.reduce((s, d) => s + extractDocTotal(d.aiData), 0);

  return {
    totalIncome: issuedAgg._sum.total ?? 0,
    totalExpenses,
    orgCount,
  };
}

/** נקודות תזרים חודשיות לשנה הנוכחית (ינואר–דצמבר) */
export async function getAnnualFlowSeries(year: number): Promise<ExecutiveFlowPoint[]> {
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);

  const [issued, documents] = await Promise.all([
    prisma.issuedDocument.findMany({
      where: {
        status: { not: DocStatus.CANCELLED },
        date: { gte: start, lt: end },
      },
      select: { date: true, total: true },
    }),
    prisma.document.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { createdAt: true, aiData: true },
    }),
  ]);

  const months = [
    "ינו׳",
    "פבר׳",
    "מרץ",
    "אפר׳",
    "מאי",
    "יוני",
    "יולי",
    "אוג׳",
    "ספט׳",
    "אוק׳",
    "נוב׳",
    "דצמ׳",
  ];

  const incomeByMonth = new Array(12).fill(0) as number[];
  const expenseByMonth = new Array(12).fill(0) as number[];

  for (const row of issued) {
    const m = row.date.getMonth();
    incomeByMonth[m] += row.total;
  }
  for (const row of documents) {
    const m = row.createdAt.getMonth();
    expenseByMonth[m] += extractDocTotal(row.aiData);
  }

  return months.map((name, i) => ({
    name,
    income: Math.round(incomeByMonth[i] ?? 0),
    expenses: Math.round(expenseByMonth[i] ?? 0),
  }));
}

/** משתמשים עם התחברות אחרונה */
export async function getRecentLoginUsers(limit = 25) {
  return prisma.user.findMany({
    where: { lastLoginAt: { not: null } },
    orderBy: { lastLoginAt: "desc" },
    take: limit,
    select: {
      id: true,
      email: true,
      name: true,
      lastLoginAt: true,
      organization: { select: { name: true } },
    },
  });
}

/**
 * 5 עליות המחיר החריגות ביותר מכל המערכת (לפי ProductPriceObservation).
 */
export async function getGlobalTopPriceSpikes(limit = 5): Promise<GlobalPriceSpikeRow[]> {
  const observations = await prisma.productPriceObservation.findMany({
    orderBy: { observedAt: "desc" },
    take: 15000,
    include: {
      organization: { select: { name: true } },
    },
  });

  const byKey = new Map<string, typeof observations>();
  for (const o of observations) {
    const k = `${o.organizationId}::${o.normalizedKey}`;
    const list = byKey.get(k) ?? [];
    list.push(o);
    byKey.set(k, list);
  }

  const spikes: GlobalPriceSpikeRow[] = [];

  for (const [, list] of byKey) {
    const sorted = [...list].sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
    if (sorted.length < 2) continue;
    const latest = sorted[0]!;
    const prev = sorted[1]!;
    if (prev.unitPrice <= 0 || latest.unitPrice <= prev.unitPrice * 1.002) continue;
    const changePercent = ((latest.unitPrice - prev.unitPrice) / prev.unitPrice) * 100;
    spikes.push({
      changePercent,
      description: latest.description || latest.normalizedKey,
      organizationName: latest.organization.name,
      latestPrice: latest.unitPrice,
      previousPrice: prev.unitPrice,
      normalizedKey: latest.normalizedKey,
    });
  }

  spikes.sort((a, b) => b.changePercent - a.changePercent);
  return spikes.slice(0, limit);
}
