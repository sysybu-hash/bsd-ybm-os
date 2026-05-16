import React, { useEffect, useMemo, useState } from 'react';

import { useI18n } from "@/components/os/system/I18nProvider";
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
    { label: 'הכנסות', value: nis.format(cashflow.overview.revenue), detail: 'תחזית Tri-Engine', color: 'text-emerald-600 dark:text-emerald-300', glow: 'shadow-emerald-500/20' },
    { label: 'הוצאות', value: nis.format(cashflow.overview.expenses), detail: 'ספקים + שכר', color: 'text-rose-600 dark:text-rose-300', glow: 'shadow-rose-500/20' },
    { label: 'רווח נקי', value: nis.format(cashflow.overview.netProfit), detail: 'מרווח חי', color: 'text-teal-600 dark:text-teal-200', glow: 'shadow-teal-500/20' },
  ];

  return (
    <div className="relative h-full overflow-hidden bg-transparent p-3 md:p-6 text-[color:var(--foreground-main)]" dir={dir}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-emerald-600/60 dark:via-emerald-300/60 to-transparent" />

      <div className="relative z-10 flex h-full flex-col gap-5">
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {monthlyStats.map((stat) => (
            <div
              key={stat.label}
              className={`rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 p-4 shadow-sm dark:shadow-2xl ${stat.glow} backdrop-blur-md`}
            >
              <p className="text-xs text-[color:var(--foreground-muted)]">{stat.label}</p>
              <p className={`mt-2 text-xl font-semibold ${stat.color}`}>{stat.value}</p>
              <p className="mt-1 text-xs text-[color:var(--foreground-muted)] opacity-70">{stat.detail}</p>
            </div>
          ))}
        </div>

        <div className="flex-1 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 p-4 backdrop-blur-xl shadow-sm dark:shadow-none">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[color:var(--foreground-main)]">מגמת מזומנים</h3>
              <p className="text-xs text-[color:var(--foreground-muted)]">לחץ על חודש לפירוט Tri-Engine</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-[color:var(--foreground-muted)]" dir="ltr">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                הכנסות
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500 dark:bg-rose-400" />
                הוצאות
              </span>
            </div>
          </div>

          <div className="min-w-0 overflow-x-auto pb-1">
          <div className="flex h-36 min-w-[520px] items-end justify-between gap-3 border-b border-[color:var(--border-main)]/30 pb-3" dir="ltr">
            {cashflow.trend.map((item) => {
              const isSelected = selectedPoint?.month === item.month;

              return (
                <button
                  key={item.month}
                  onClick={() => setSelectedPoint(item)}
                  className={`flex h-full flex-1 flex-col items-center justify-end gap-2 rounded-xl px-1 transition-colors ${
                    isSelected ? 'bg-[color:var(--foreground-muted)]/20' : 'hover:bg-[color:var(--foreground-muted)]/10'
                  }`}
                >
                  <div className="flex h-full w-full items-end justify-center gap-1.5">
                    <div
                      className="w-4 rounded-t-lg bg-gradient-to-t from-emerald-600 to-emerald-400 dark:from-emerald-500 dark:to-emerald-200 shadow-[0_0_18px_rgba(16,185,129,0.35)]"
                      style={{ height: `${(item.revenue / maxTrendValue) * 100}%` }}
                      title={`${item.month} הכנסות: ${nis.format(item.revenue)}`}
                    />
                    <div
                      className="w-4 rounded-t-lg bg-gradient-to-t from-rose-600 to-rose-400 dark:from-rose-500 dark:to-rose-200 shadow-[0_0_18px_rgba(244,63,94,0.25)]"
                      style={{ height: `${(item.expenses / maxTrendValue) * 100}%` }}
                      title={`${item.month} הוצאות: ${nis.format(item.expenses)}`}
                    />
                  </div>
                  <span className="text-[11px] text-[color:var(--foreground-muted)]">{item.month}</span>
                </button>
              );
            })}
          </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/10 px-4 py-3">
              <p className="text-xs text-emerald-700 dark:text-emerald-100/70">אופק תזרימי</p>
              <p className="mt-1 font-semibold text-emerald-600 dark:text-emerald-200">{cashflow.overview.runwayMonths} חודשים</p>
            </div>
            <div className="rounded-xl border border-rose-400/15 bg-rose-400/10 px-4 py-3">
              <p className="text-xs text-rose-700 dark:text-rose-100/70">תשלומים קרובים</p>
              <p className="mt-1 font-semibold text-rose-600 dark:text-rose-200">{nis.format(cashflow.overview.upcomingPayables)}</p>
            </div>
            <div className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 px-4 py-3 shadow-sm dark:shadow-none">
              <p className="text-xs text-[color:var(--foreground-muted)]">{selectedPoint?.month || 'פירוט'}</p>
              <p className="mt-1 text-xs text-[color:var(--foreground-main)] opacity-80">
                {selectedPoint
                  ? `${nis.format(selectedPoint.revenue - selectedPoint.expenses)} נטו`
                  : 'בחר עמודה'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
