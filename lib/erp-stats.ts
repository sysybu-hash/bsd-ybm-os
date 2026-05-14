import type { Document } from "@prisma/client";
import type { AppLocale } from "@/lib/i18n/config";
import { intlLocaleForApp } from "@/lib/i18n/intl-locale";
import type { TFunction } from "@/lib/i18n/translate";

export type MonthlyExpensePoint = { name: string; value: number };

function docTotal(doc: Document): number {
  const ai = doc.aiData as { total?: number } | null;
  return ai?.total ?? 0;
}

/** סכום הוצאות לפי חודש קלנדרי (0–11) */
export function sumExpensesInCalendarMonth(
  docs: Document[],
  year: number,
  monthIndex: number,
): number {
  return docs.reduce((acc, doc) => {
    const d = new Date(doc.createdAt);
    if (d.getFullYear() !== year || d.getMonth() !== monthIndex) return acc;
    return acc + docTotal(doc);
  }, 0);
}

/** סדרה ל־Recharts — חודשים אחרונים */
export function buildMonthlyExpenseSeries(
  docs: Document[],
  monthsBack = 6,
  appLocale: AppLocale = "en",
): MonthlyExpensePoint[] {
  const tag = intlLocaleForApp(appLocale);
  const now = new Date();
  const points: MonthlyExpensePoint[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString(tag, { month: "short" });
    const value = sumExpensesInCalendarMonth(docs, d.getFullYear(), d.getMonth());
    points.push({ name: label, value });
  }
  return points;
}

export function formatExpenseTrendVsPrevious(
  current: number,
  previous: number,
  t: TFunction,
): string {
  if (previous <= 0) {
    return current > 0 ? t("erpStats.trendFirst") : t("erpStats.trendDash");
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return t("erpStats.trendZero");
  const sign = pct > 0 ? "+" : "";
  return t("erpStats.trendVsPrev", { sign, pct: String(pct) });
}
