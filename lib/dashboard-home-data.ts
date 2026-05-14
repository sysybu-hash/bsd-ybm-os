import { prisma } from "@/lib/prisma";

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

const CONTACT_STATUS_HE: Record<string, string> = {
  LEAD: "ליד",
  ACTIVE: "פעיל",
  PROPOSAL: "הצעה",
  CLOSED_WON: "נסגר בהצלחה",
  CLOSED_LOST: "נסגר שלילי",
};

export type DashboardChartPoint = {
  monthKey: string;
  label: string;
  total: number;
};

export type RecentContactHomeRow = {
  id: string;
  name: string;
  email: string | null;
  status: string;
  statusLabel: string;
};

export type OrgDashboardHomeData = {
  monthTitle: string;
  monthGross: number;
  prevMonthGross: number;
  /** אחוז שינוי לעומת החודש הקודם, או null אם אין בסיס להשוואה */
  monthChangePct: number | null;
  pipelineValue: number;
  pipelineDealCount: number;
  recentContacts: RecentContactHomeRow[];
  monthlySeries: DashboardChartPoint[];
  /** יתרות סריקה מהארגון */
  cheapScansRemaining: number;
  premiumScansRemaining: number;
  subscriptionTier: string;
};

const EMPTY_HOME: OrgDashboardHomeData = {
  monthTitle: "",
  monthGross: 0,
  prevMonthGross: 0,
  monthChangePct: null,
  pipelineValue: 0,
  pipelineDealCount: 0,
  recentContacts: [],
  monthlySeries: [],
  cheapScansRemaining: 0,
  premiumScansRemaining: 0,
  subscriptionTier: "FREE",
};

function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * נתונים אמיתיים לדף הבית של הדשבורד: הכנסות ממסמכים שהונפקו, הצעות מחיר ממתינות, לקוחות אחרונים, סדרת חודשים לגרף.
 */
export async function getOrgDashboardHomeData(
  organizationId: string | null | undefined,
): Promise<OrgDashboardHomeData> {
  if (!organizationId) {
    return { ...EMPTY_HOME };
  }

  const now = new Date();
  const curStart = startOfMonth(now);
  const curEnd = endOfMonth(now);
  const prevRef = addMonths(now, -1);
  const prevStart = startOfMonth(prevRef);
  const prevEnd = endOfMonth(prevRef);
  const seriesStart = startOfMonth(addMonths(now, -5));

  const [issuedCur, issuedPrev, pendingQuotes, recentContactsRaw, docsForSeries, orgRow] = await Promise.all([
    prisma.issuedDocument.aggregate({
      where: { organizationId, date: { gte: curStart, lte: curEnd } },
      _sum: { total: true },
    }),
    prisma.issuedDocument.aggregate({
      where: { organizationId, date: { gte: prevStart, lte: prevEnd } },
      _sum: { total: true },
    }),
    prisma.quote.findMany({
      where: { organizationId, status: "PENDING" },
      select: { amount: true },
    }),
    prisma.contact.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, name: true, email: true, status: true },
    }),
    prisma.issuedDocument.findMany({
      where: { organizationId, date: { gte: seriesStart, lte: curEnd } },
      select: { date: true, total: true },
    }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        cheapScansRemaining: true,
        premiumScansRemaining: true,
        subscriptionTier: true,
      },
    }),
  ]);

  const monthGross = issuedCur._sum.total ?? 0;
  const prevMonthGross = issuedPrev._sum.total ?? 0;
  let monthChangePct: number | null = null;
  if (prevMonthGross > 0) {
    monthChangePct = ((monthGross - prevMonthGross) / prevMonthGross) * 100;
  }

  const pipelineValue = pendingQuotes.reduce((s, q) => s + q.amount, 0);
  const pipelineDealCount = pendingQuotes.length;

  const bucket = new Map<string, number>();
  for (let i = 0; i < 6; i++) {
    const d = addMonths(seriesStart, i);
    bucket.set(ymKey(d), 0);
  }
  for (const doc of docsForSeries) {
    const k = ymKey(doc.date);
    if (bucket.has(k)) bucket.set(k, (bucket.get(k) ?? 0) + doc.total);
  }

  const monthlySeries: DashboardChartPoint[] = [];
  for (let i = 0; i < 6; i++) {
    const d = addMonths(seriesStart, i);
    const key = ymKey(d);
    monthlySeries.push({
      monthKey: key,
      label: d.toLocaleDateString("he-IL", { month: "short" }),
      total: bucket.get(key) ?? 0,
    });
  }

  const recentContacts: RecentContactHomeRow[] = recentContactsRaw.map((c) => ({
    id: c.id,
    name: c.name,
    email: c.email,
    status: c.status,
    statusLabel: CONTACT_STATUS_HE[c.status] ?? c.status,
  }));

  const monthTitle = now.toLocaleDateString("he-IL", { month: "long", year: "numeric" });

  return {
    monthTitle,
    monthGross,
    prevMonthGross,
    monthChangePct,
    pipelineValue,
    pipelineDealCount,
    recentContacts,
    monthlySeries,
    cheapScansRemaining: orgRow?.cheapScansRemaining ?? 0,
    premiumScansRemaining: orgRow?.premiumScansRemaining ?? 0,
    subscriptionTier: orgRow?.subscriptionTier ?? "FREE",
  };
}
