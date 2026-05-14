import { prisma } from "@/lib/prisma";

/** ב־Prisma ORM מודרני `aggregate` עם `_count: true` מחזיר `{ _all: n }` — לא לערבב עם ילדי React */
function unwrapAggregateAllCount(countVal: unknown): number {
  if (typeof countVal === "number" && !Number.isNaN(countVal)) return countVal;
  if (countVal && typeof countVal === "object" && "_all" in countVal) {
    const n = (countVal as { _all?: unknown })._all;
    if (typeof n === "number" && !Number.isNaN(n)) return n;
  }
  return 0;
}

/** סכומי `_sum` / שדות Float לפעמים יוצאים כ־Decimal מטיפוס runtime — חייבים מספר פשוט ל־React ול־Intl */
function toPlainNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && value !== null && "toNumber" in value) {
    const fn = (value as { toNumber?: () => unknown }).toNumber;
    if (typeof fn === "function") {
      try {
        const n = fn.call(value);
        if (typeof n === "number" && Number.isFinite(n)) return n;
      } catch {
        /* ignore */
      }
    }
  }
  const coerced = Number(value);
  return Number.isFinite(coerced) ? coerced : 0;
}

export type WorkspaceHomeRecentIssued = {
  id: string;
  type: string;
  number: string | number;
  clientName: string;
  total: number;
  status: string;
  /** ISO — נשמר כמחרוזת כדי לא להיכשל בסריאליזציה של RSC מעל גבולות Client */
  date: string;
};

export type WorkspaceHomeRecentClient = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  value: number | null;
};

export type WorkspaceHomeData = {
  monthRevenue: number;
  monthIssuedCount: number;
  pendingAmount: number;
  pendingCount: number;
  paidAmount: number;
  collectionRate: number;
  trendLabel: string | undefined;
  trendDirection: "up" | "down" | "flat";
  activeClients: number;
  activeProjects: number;
  scannedDocsCount: number;
  recentIssued: WorkspaceHomeRecentIssued[];
  recentClients: WorkspaceHomeRecentClient[];
};

/** נפילה רכה בדף הבית כשהשאילתה נכשלת (חיבור DB, timeout וכו׳) */
export const EMPTY_WORKSPACE_HOME_DATA: WorkspaceHomeData = {
  monthRevenue: 0,
  monthIssuedCount: 0,
  pendingAmount: 0,
  pendingCount: 0,
  paidAmount: 0,
  collectionRate: 0,
  trendLabel: undefined,
  trendDirection: "flat",
  activeClients: 0,
  activeProjects: 0,
  scannedDocsCount: 0,
  recentIssued: [],
  recentClients: [],
};

export async function loadWorkspaceHomeData(organizationId: string): Promise<WorkspaceHomeData> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const [
    activeClients,
    activeProjects,
    monthIssued,
    prevMonthIssued,
    pendingAgg,
    paidAgg,
    scannedDocsCount,
    recentIssued,
    recentClients,
  ] = await Promise.all([
    prisma.contact.count({ where: { organizationId } }),
    prisma.project.count({ where: { organizationId, isActive: true } }),
    prisma.issuedDocument.aggregate({
      where: { organizationId, type: "INVOICE", date: { gte: startOfMonth } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.issuedDocument.aggregate({
      where: {
        organizationId,
        type: "INVOICE",
        date: { gte: startOfPrevMonth, lte: endOfPrevMonth },
      },
      _sum: { total: true },
    }),
    prisma.issuedDocument.aggregate({
      where: { organizationId, status: "PENDING" },
      _sum: { total: true },
      _count: true,
    }),
    prisma.issuedDocument.aggregate({
      where: { organizationId, status: "PAID", date: { gte: startOfMonth } },
      _sum: { total: true },
    }),
    prisma.document.count({ where: { organizationId, createdAt: { gte: startOfMonth } } }),
    prisma.issuedDocument.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        type: true,
        number: true,
        clientName: true,
        total: true,
        status: true,
        date: true,
      },
    }),
    prisma.contact.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, status: true, createdAt: true, value: true },
    }),
  ]);

  const monthRevenue = toPlainNumber(monthIssued._sum.total);
  const prevRevenue = toPlainNumber(prevMonthIssued._sum.total);
  const pendingAmount = toPlainNumber(pendingAgg._sum.total);
  const pendingCount = unwrapAggregateAllCount(pendingAgg._count);
  const paidAmount = toPlainNumber(paidAgg._sum.total);
  const totalBilled = monthRevenue;
  const collectionRate = totalBilled > 0 ? Math.round((paidAmount / totalBilled) * 100) : 0;

  const trend = prevRevenue > 0 ? ((monthRevenue - prevRevenue) / prevRevenue) * 100 : null;
  const trendLabel =
    trend === null
      ? undefined
      : trend === 0
        ? "ללא שינוי"
        : `${trend > 0 ? "+" : ""}${trend.toFixed(1)}%`;
  const trendDirection: "up" | "down" | "flat" =
    trend === null || trend === 0 ? "flat" : trend > 0 ? "up" : "down";

  return {
    monthRevenue,
    monthIssuedCount: unwrapAggregateAllCount(monthIssued._count),
    pendingAmount,
    pendingCount,
    paidAmount,
    collectionRate,
    trendLabel,
    trendDirection,
    activeClients,
    activeProjects,
    scannedDocsCount,
    recentIssued: recentIssued.map((row) => ({
      id: row.id,
      type: row.type,
      number: row.number,
      clientName: row.clientName,
      status: row.status,
      total: toPlainNumber(row.total),
      date: row.date instanceof Date ? row.date.toISOString() : String(row.date ?? ""),
    })),
    recentClients: recentClients.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? ""),
      value: row.value == null ? null : toPlainNumber(row.value),
    })),
  };
}
