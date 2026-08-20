/**
 * דוח "בריאות עסק" חודשי — KPI לארגון עבור החודש הקלנדרי הקודם.
 *
 * Run by: app/api/cron/monthly-health-report/route.ts (ה-1 לחודש, 08:00)
 * Opt-out: Setting key `monthly_health_optout:<orgId>` = "1" (ללא מיגרציה).
 */

import { prisma } from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/mail-core";
import { createLogger } from "@/lib/logger";

const log = createLogger("monthly-health-report");

export type MonthlyHealthReport = {
  organizationId: string;
  organizationName: string;
  /** למשל "יוני 2026" */
  periodLabel: string;
  from: Date;
  to: Date;
  /** מסמכים שהופקו בתקופה */
  issuedCount: number;
  issuedTotal: number;
  /** הוצאות שנקלטו בתקופה */
  expenseCount: number;
  expenseTotal: number;
  /** חייבים פתוחים (כל הזמנים, סטטוס PENDING) */
  receivablesOpenCount: number;
  receivablesOpenTotal: number;
  /** סריקות שבוצעו בתקופה */
  scanCount: number;
  /** משימות שהושלמו בתקופה */
  tasksCompleted: number;
  /** הכנסות פחות הוצאות בתקופה */
  netCashflow: number;
};

export function monthlyHealthOptOutKey(organizationId: string): string {
  return `monthly_health_optout:${organizationId}`;
}

/** גבולות החודש הקלנדרי הקודם ביחס ל-refDate */
export function previousMonthRange(refDate: Date): { from: Date; to: Date; periodLabel: string } {
  const from = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
  const to = new Date(refDate.getFullYear(), refDate.getMonth(), 1);
  const periodLabel = from.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
  return { from, to, periodLabel };
}

export async function buildMonthlyHealthReport(
  organizationId: string,
  refDate: Date = new Date(),
): Promise<MonthlyHealthReport | null> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!org) return null;

  const { from, to, periodLabel } = previousMonthRange(refDate);
  const period = { gte: from, lt: to };

  const [issued, expenses, openReceivables, scanCount, tasksCompleted] = await Promise.all([
    prisma.issuedDocument.aggregate({
      where: { organizationId, date: period, deletedAt: null, status: { not: "CANCELLED" } },
      _count: true,
      _sum: { total: true },
    }),
    prisma.expenseRecord.aggregate({
      where: { organizationId, expenseDate: period },
      _count: true,
      _sum: { total: true },
    }),
    prisma.issuedDocument.aggregate({
      where: { organizationId, status: "PENDING", deletedAt: null },
      _count: true,
      _sum: { total: true },
    }),
    prisma.documentScanJob.count({
      where: { organizationId, createdAt: period },
    }),
    prisma.task.count({
      where: { organizationId, status: "DONE", updatedAt: period },
    }),
  ]);

  const issuedTotal = issued._sum.total ?? 0;
  const expenseTotal = expenses._sum.total ?? 0;

  return {
    organizationId,
    organizationName: org.name,
    periodLabel,
    from,
    to,
    issuedCount: issued._count,
    issuedTotal,
    expenseCount: expenses._count,
    expenseTotal,
    receivablesOpenCount: openReceivables._count,
    receivablesOpenTotal: openReceivables._sum.total ?? 0,
    scanCount,
    tasksCompleted,
    netCashflow: issuedTotal - expenseTotal,
  };
}

/** true אם אין שום פעילות בתקופה — לא שולחים מייל ריק */
export function isEmptyReport(r: MonthlyHealthReport): boolean {
  return (
    r.issuedCount === 0 &&
    r.expenseCount === 0 &&
    r.scanCount === 0 &&
    r.tasksCompleted === 0 &&
    r.receivablesOpenCount === 0
  );
}

function ils(n: number): string {
  return n.toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
}

function kpiRow(label: string, value: string, sub?: string): string {
  return `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#475569;">${label}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:700;color:#0f172a;text-align:left;" dir="ltr">${value}${
        sub ? `<div style="font-size:11px;font-weight:400;color:#94a3b8;">${sub}</div>` : ""
      }</td>
    </tr>`;
}

/** גוף HTML פנימי (RTL) — עטיפת המיתוג נעשית ב-sendTransactionalEmail */
export function renderMonthlyHealthEmailHtml(r: MonthlyHealthReport): string {
  const cashflowColor = r.netCashflow >= 0 ? "#059669" : "#e11d48";
  return `
  <div dir="rtl" style="text-align:right;">
    <h2 style="margin:0 0 4px;font-size:18px;color:#0f172a;">דוח בריאות עסק — ${r.periodLabel}</h2>
    <p style="margin:0 0 16px;font-size:13px;color:#64748b;">${r.organizationName}</p>

    <div style="border-radius:12px;background:${r.netCashflow >= 0 ? "#ecfdf5" : "#fff1f2"};padding:14px 16px;margin-bottom:16px;">
      <div style="font-size:12px;color:#475569;">תזרים נטו לחודש (הכנסות − הוצאות)</div>
      <div style="font-size:24px;font-weight:800;color:${cashflowColor};" dir="ltr">${ils(r.netCashflow)}</div>
    </div>

    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      ${kpiRow("מסמכים שהופקו", ils(r.issuedTotal), `${r.issuedCount} מסמכים`)}
      ${kpiRow("הוצאות שנקלטו", ils(r.expenseTotal), `${r.expenseCount} רשומות`)}
      ${kpiRow("חייבים פתוחים (מצטבר)", ils(r.receivablesOpenTotal), `${r.receivablesOpenCount} מסמכים ממתינים לתשלום`)}
      ${kpiRow("סריקות חכמות", String(r.scanCount))}
      ${kpiRow("משימות שהושלמו", String(r.tasksCompleted))}
    </table>

    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">
      הדוח נשלח אוטומטית בתחילת כל חודש. להסרה: הגדרות הארגון במערכת.
    </p>
  </div>`;
}

export type MonthlyHealthRunResult = {
  checked: number;
  sent: number;
  skippedOptOut: number;
  skippedEmpty: number;
  skippedNoRecipient: number;
  failed: number;
  nextCursor: string | null;
  partial: boolean;
};

export type MonthlyHealthRunOpts = {
  refDate?: Date;
  orgId?: string;
  cursor?: string;
  take?: number;
  timeBudgetMs?: number;
};

const DEFAULT_ORG_BATCH = 25;
const DEFAULT_TIME_BUDGET_MS = 240_000;

/**
 * מריץ את הדוח על ארגונים (batch עם cursor) ושולח למנהלי הארגון.
 */
export async function runMonthlyHealthReports(
  opts: MonthlyHealthRunOpts = {},
): Promise<MonthlyHealthRunResult> {
  const refDate = opts.refDate ?? new Date();
  const take = opts.take ?? DEFAULT_ORG_BATCH;
  const timeBudgetMs = opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const started = Date.now();

  const result: MonthlyHealthRunResult = {
    checked: 0,
    sent: 0,
    skippedOptOut: 0,
    skippedEmpty: 0,
    skippedNoRecipient: 0,
    failed: 0,
    nextCursor: null,
    partial: false,
  };

  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true },
    where: opts.orgId ? { id: opts.orgId } : undefined,
    orderBy: { id: "asc" },
    take: opts.orgId ? 1 : take,
    ...(opts.cursor && !opts.orgId
      ? { cursor: { id: opts.cursor }, skip: 1 }
      : {}),
  });

  const optOuts = new Set(
    (
      await prisma.setting.findMany({
        where: {
          key: { in: orgs.map((o) => monthlyHealthOptOutKey(o.id)) },
          value: "1",
        },
        select: { key: true },
      })
    ).map((s) => s.key),
  );

  for (const org of orgs) {
    if (Date.now() - started > timeBudgetMs) {
      result.nextCursor = org.id;
      result.partial = true;
      break;
    }

    result.checked += 1;

    if (optOuts.has(monthlyHealthOptOutKey(org.id))) {
      result.skippedOptOut += 1;
      continue;
    }

    try {
      const report = await buildMonthlyHealthReport(org.id, refDate);
      if (!report || isEmptyReport(report)) {
        result.skippedEmpty += 1;
        continue;
      }

      const admins = await prisma.user.findMany({
        where: {
          organizationId: org.id,
          role: { in: ["ORG_ADMIN", "SUPER_ADMIN"] },
          accountStatus: "ACTIVE",
          email: { not: "" },
        },
        select: { email: true },
      });
      const recipients = admins.map((a) => a.email).filter(Boolean);
      if (recipients.length === 0) {
        result.skippedNoRecipient += 1;
        continue;
      }

      const html = renderMonthlyHealthEmailHtml(report);
      const sendResult = await sendTransactionalEmail(
        recipients,
        `דוח בריאות עסק — ${report.periodLabel} · ${report.organizationName}`,
        html,
      );
      if (sendResult.ok) {
        result.sent += 1;
      } else {
        result.failed += 1;
        log.warn("monthly health email failed", { orgId: org.id, error: sendResult.error });
      }
    } catch (err: unknown) {
      result.failed += 1;
      log.error("monthly health report failed", {
        orgId: org.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!result.partial && !opts.orgId && orgs.length === take) {
    result.nextCursor = orgs[orgs.length - 1]?.id ?? null;
    result.partial = Boolean(result.nextCursor);
  }

  log.info("monthly health run complete", { ...result });
  return result;
}
