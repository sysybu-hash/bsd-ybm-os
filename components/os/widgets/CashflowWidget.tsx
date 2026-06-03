import React, { useEffect, useMemo, useState } from 'react';

import { useI18n } from "@/components/os/system/I18nProvider";
import { StatCard, ChartContainer, StatusBadge } from "@/components/os/widgets/shared/WidgetCard";
interface TrendPoint {
  month: string;
  revenue: number;
  expenses: number;
}

interface CashflowData {
  fetchedAt?: string;
  overview: {
    revenue: number;
    expenses: number;
    netProfit: number;
    runwayMonths: number;
    upcomingPayables: number;
  };
  trend: TrendPoint[];
}

const fallbackData: CashflowData = {
  fetchedAt: new Date().toISOString(),
  overview: {
    revenue: 428000,
    expenses: 276000,
    netProfit: 152000,
    runwayMonths: 14.2,
    upcomingPayables: 84000,
  },
  trend: [
    { month: 'ינואר', revenue: 308000, expenses: 188000 },
    { month: 'פברואר', revenue: 334000, expenses: 201000 },
    { month: 'מרץ', revenue: 361000, expenses: 214000 },
    { month: 'אפריל', revenue: 388000, expenses: 226000 },
    { month: 'מאי', revenue: 414000, expenses: 239000 },
    { month: 'יוני', revenue: 441000, expenses: 251000 },
  ],
};

const nis = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
});

const isCashflowData = (value: unknown): value is CashflowData => {
  return typeof value === 'object' && value !== null && 'overview' in value && 'trend' in value;
};

export default function CashflowWidget({ data }: { data?: unknown }) {
  const { dir } = useI18n();
  const cashflow = useMemo(() => (isCashflowData(data) ? data : fallbackData), [data]);
  const [selectedPoint, setSelectedPoint] = useState<TrendPoint | null>(cashflow.trend[cashflow.trend.length - 1] || null);
  const [isLivePulse, setIsLivePulse] = useState(false);

  useEffect(() => {
    setIsLivePulse(true);
    const timer = window.setTimeout(() => setIsLivePulse(false), 1400);
    return () => window.clearTimeout(timer);
  }, [cashflow.fetchedAt]);

  const maxTrendValue = Math.max(...cashflow.trend.flatMap((item) => [item.revenue, item.expenses]), 1);
  const monthlyStats = [
    { label: 'הכנסות', value: nis.format(cashflow.overview.revenue), detail: 'תחזית Tri-Engine', valueClass: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'הוצאות', value: nis.format(cashflow.overview.expenses), detail: 'ספקים + שכר', valueClass: 'text-rose-600 dark:text-rose-400' },
    { label: 'רווח נקי', value: nis.format(cashflow.overview.netProfit), detail: 'מרווח חי', valueClass: 'text-teal-600 dark:text-teal-400' },
  ];

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)]" dir={dir}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-emerald-600/60 dark:via-emerald-300/60 to-transparent" />

      <div className="relative flex flex-1 min-h-0 flex-col gap-5 p-3 md:p-6">
        <div className="flex items-start justify-between gap-4 border-b border-[color:var(--border-main)] pb-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-200/70">סקירה חודשית</p>
            <h2 className="mt-2 text-2xl font-bold text-[color:var(--foreground-main)]">תזרים מזומנים</h2>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-200">
            <span className={`h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-300 ${isLivePulse ? 'animate-ping' : ''}`} />
            עדכון חי
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {monthlyStats.map((stat) => (
            <StatCard
              key={stat.label}
              title={stat.label}
              value={stat.value}
              detail={stat.detail}
              valueClassName={stat.valueClass}
            />
          ))}
        </div>

        <ChartContainer
          title="מגמת מזומנים"
          subtitle="לחץ על חודש לפירוט Tri-Engine"
          actionElement={
            <div className="flex items-center gap-3" dir="ltr">
              <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                הכנסות
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="h-2 w-2 rounded-full bg-rose-500 dark:bg-rose-400" />
                הוצאות
              </span>
            </div>
          }
          minHeight={144}
        >
          <div className="min-w-0 overflow-x-auto pb-1">
            <div className="flex h-36 min-w-[300px] items-end justify-between gap-1.5 sm:gap-3 border-b border-slate-200 dark:border-slate-700/50 pb-3" dir="ltr">
              {cashflow.trend.map((item) => {
                const isSelected = selectedPoint?.month === item.month;
                return (
                  <button
                    key={item.month}
                    onClick={() => setSelectedPoint(item)}
                    className={`flex h-full flex-1 flex-col items-center justify-end gap-2 rounded-xl px-1 transition-colors ${
                      isSelected
                        ? 'bg-slate-100 dark:bg-slate-700/50'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                    }`}
                  >
                    <div className="flex h-full w-full items-end justify-center gap-1.5">
                      <div
                        className="w-4 rounded-t-lg bg-gradient-to-t from-emerald-600 to-emerald-400 dark:from-emerald-500 dark:to-emerald-300"
                        style={{ height: `${(item.revenue / maxTrendValue) * 100}%` }}
                        title={`${item.month} הכנסות: ${nis.format(item.revenue)}`}
                      />
                      <div
                        className="w-4 rounded-t-lg bg-gradient-to-t from-rose-600 to-rose-400 dark:from-rose-500 dark:to-rose-300"
                        style={{ height: `${(item.expenses / maxTrendValue) * 100}%` }}
                        title={`${item.month} הוצאות: ${nis.format(item.expenses)}`}
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">{item.month}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-green-50 dark:bg-green-500/10 px-4 py-3">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">אופק תזרימי</p>
              <p className="mt-1 font-bold text-emerald-700 dark:text-emerald-400">{cashflow.overview.runwayMonths} חודשים</p>
            </div>
            <div className="rounded-xl border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-500/10 px-4 py-3">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">תשלומים קרובים</p>
              <p className="mt-1 font-bold text-rose-700 dark:text-rose-400">{nis.format(cashflow.overview.upcomingPayables)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800 px-4 py-3">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{selectedPoint?.month || 'פירוט'}</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
                {selectedPoint ? `${nis.format(selectedPoint.revenue - selectedPoint.expenses)} נטו` : 'בחר עמודה'}
              </p>
            </div>
          </div>
        </ChartContainer>
      </div>
    </div>
  );
}
