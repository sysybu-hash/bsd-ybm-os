"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Cpu,
  FileText,
  FolderKanban,
  Loader2,
  ScanLine,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";

type Stats = {
  totalRevenue?: number;
  totalExpenses?: number;
  activeProjects?: number;
  totalClients?: number;
  pendingInvoices?: number;
};

type Tone = "emerald" | "rose" | "blue" | "violet" | "amber";

const TONE: Record<Tone, { chip: string; value: string; glow: string; ring: string }> = {
  emerald: { chip: "from-emerald-400 to-teal-500", value: "text-emerald-600", glow: "bg-emerald-400/20", ring: "hover:ring-emerald-400/40" },
  rose: { chip: "from-rose-400 to-pink-500", value: "text-[color:var(--foreground-main)]", glow: "bg-rose-400/20", ring: "hover:ring-rose-400/40" },
  blue: { chip: "from-blue-400 to-indigo-500", value: "text-[color:var(--foreground-main)]", glow: "bg-blue-400/20", ring: "hover:ring-blue-400/40" },
  violet: { chip: "from-violet-400 to-purple-500", value: "text-[color:var(--foreground-main)]", glow: "bg-violet-400/20", ring: "hover:ring-violet-400/40" },
  amber: { chip: "from-amber-400 to-orange-500", value: "text-[color:var(--foreground-main)]", glow: "bg-amber-400/20", ring: "hover:ring-amber-400/40" },
};

const QUICK_ACTIONS: ReadonlyArray<{ id: string; icon: LucideIcon; tone: Tone }> = [
  { id: "crm", icon: Users, tone: "violet" },
  { id: "erp", icon: FileText, tone: "blue" },
  { id: "scan", icon: ScanLine, tone: "amber" },
  { id: "customOs", icon: Cpu, tone: "emerald" },
];

function shekel(n: number | undefined): string {
  const v = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);
}

function KpiCard({
  label, value, icon: Icon, tone,
}: { label: string; value: React.ReactNode; icon: LucideIcon; tone: Tone }) {
  const c = TONE[tone];
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-5 shadow-[var(--shadow-md)] ring-1 ring-transparent transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] ${c.ring}`}
    >
      <span className={`pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full blur-2xl ${c.glow}`} aria-hidden />
      <div className="relative flex items-start justify-between">
        <span className="text-sm font-semibold text-[color:var(--foreground-muted)]">{label}</span>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg ${c.chip}`}>
          <Icon size={20} strokeWidth={2.2} aria-hidden />
        </span>
      </div>
      <div className={`relative mt-4 text-3xl font-black tracking-tight ${c.value}`}>{value}</div>
    </div>
  );
}

export default function DashboardOverview({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/stats", { credentials: "include" });
      setStats(res.ok ? ((await res.json()) as Stats) : {});
    } catch {
      setStats({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-7">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-600 p-7 text-white shadow-xl shadow-blue-900/20 sm:p-9">
        {/* decorative graphics */}
        <span className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" aria-hidden />
        <span className="pointer-events-none absolute -bottom-24 right-10 h-56 w-56 rounded-full bg-indigo-300/20 blur-3xl" aria-hidden />
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.12]" aria-hidden>
          <defs>
            <pattern id="dash-dots" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.4" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dash-dots)" />
        </svg>
        <Sparkles className="pointer-events-none absolute bottom-5 start-7 h-20 w-20 text-white/10" strokeWidth={1.2} aria-hidden />

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold ring-1 ring-white/25 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.9)]" />
            {t("workspaceWidgets.classicDashboard.title")}
          </span>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-white drop-shadow-sm sm:text-4xl">
            {t("workspaceWidgets.classicDashboard.overview.greeting")}
          </h2>
          <p className="mt-1.5 max-w-xl text-sm font-medium text-white/85 sm:text-base">
            {t("workspaceWidgets.classicDashboard.overview.subtitle")}
          </p>
        </div>
      </section>

      {/* KPI cards */}
      {loading ? (
        <div className="flex min-h-[160px] items-center justify-center text-[color:var(--foreground-muted)]">
          <Loader2 className="h-7 w-7 animate-spin text-[color:var(--accent)]" aria-hidden />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard tone="emerald" icon={TrendingUp} label={t("workspaceWidgets.classicDashboard.overview.revenue")} value={shekel(stats?.totalRevenue)} />
          <KpiCard tone="rose" icon={TrendingDown} label={t("workspaceWidgets.classicDashboard.overview.expenses")} value={shekel(stats?.totalExpenses)} />
          <KpiCard tone="amber" icon={Wallet} label={t("workspaceWidgets.classicDashboard.overview.pendingInvoices")} value={stats?.pendingInvoices ?? 0} />
          <KpiCard tone="blue" icon={FolderKanban} label={t("workspaceWidgets.classicDashboard.overview.activeProjects")} value={stats?.activeProjects ?? 0} />
          <KpiCard tone="violet" icon={Users} label={t("workspaceWidgets.classicDashboard.overview.clients")} value={stats?.totalClients ?? 0} />
        </div>
      )}

      {/* Quick actions */}
      <section>
        <h3 className="mb-3 text-lg font-black text-[color:var(--foreground-main)]">
          {t("workspaceWidgets.classicDashboard.overview.quickActionsTitle")}
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_ACTIONS.map(({ id, icon: Icon, tone }) => {
            const c = TONE[tone];
            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4 text-start shadow-[var(--shadow-md)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]"
              >
                <span className={`pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full blur-2xl ${c.glow}`} aria-hidden />
                <span className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg ${c.chip}`}>
                  <Icon size={22} strokeWidth={2.2} aria-hidden />
                </span>
                <span className="relative min-w-0 flex-1 truncate text-sm font-black text-[color:var(--foreground-main)]">
                  {t(`workspaceWidgets.classicDashboard.tabs.${id}`)}
                </span>
                <ArrowUpRight
                  size={18}
                  className="relative shrink-0 text-[color:var(--foreground-muted)] transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[color:var(--accent)] rtl:rotate-[-90deg] rtl:group-hover:rotate-[-90deg]"
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
