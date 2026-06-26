"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Calculator,
  CalendarDays,
  Cpu,
  FileText,
  HardDrive,
  Loader2,
  Settings,
  TrendingDown,
  TrendingUp,
  Wallet,
  FolderKanban,
  Users,
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

function shekel(n: number | undefined): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(typeof n === "number" ? n : 0);
}

function KpiStrip() {
  const { t } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/stats", { credentials: "include" });
      setStats(res.ok ? ((await res.json()) as Stats) : {});
    } catch {
      setStats({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const items: Array<{ label: string; value: string; icon: LucideIcon; color: string }> = [
    { label: t("workspaceWidgets.classicDashboard.overview.revenue"),         value: shekel(stats?.totalRevenue),      icon: TrendingUp,   color: "text-emerald-500" },
    { label: t("workspaceWidgets.classicDashboard.overview.expenses"),        value: shekel(stats?.totalExpenses),     icon: TrendingDown, color: "text-rose-500" },
    { label: t("workspaceWidgets.classicDashboard.overview.activeProjects"),  value: String(stats?.activeProjects ?? 0), icon: FolderKanban, color: "text-blue-500" },
    { label: t("workspaceWidgets.classicDashboard.overview.clients"),         value: String(stats?.totalClients ?? 0),  icon: Users,        color: "text-violet-500" },
    { label: t("workspaceWidgets.classicDashboard.overview.pendingInvoices"), value: String(stats?.pendingInvoices ?? 0), icon: Wallet,     color: "text-amber-500" },
  ];

  if (loading) {
    return (
      <div className="flex h-20 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[color:var(--accent)]" aria-hidden />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map(({ label, value, icon: Icon, color }) => (
        <div
          key={label}
          className="flex items-center gap-3 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3"
        >
          <Icon size={20} className={`shrink-0 ${color}`} aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-[10px] text-[color:var(--foreground-muted)]">{label}</p>
            <p className="text-sm font-extrabold text-[color:var(--foreground-main)]">{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

type FeatureCard = {
  href: string;
  labelKey: string;
  descKey: string;
  icon: LucideIcon;
  color: string;
};

const FEATURES: ReadonlyArray<FeatureCard> = [
  {
    href: "/m/dashboard/more/erp",
    labelKey: "workspaceWidgets.classicDashboard.tabs.erp",
    descKey:  "workspaceWidgets.commandCenter.cards.document.desc",
    icon: FileText,
    color: "from-blue-400 to-indigo-500",
  },
  {
    href: "/m/dashboard/more/builder",
    labelKey: "workspaceWidgets.classicDashboard.tabs.customOs",
    descKey:  "workspaceWidgets.commandCenter.cards.aiBuilder.desc",
    icon: Cpu,
    color: "from-emerald-400 to-teal-500",
  },
  {
    href: "/m/dashboard/more/calendar",
    labelKey: "workspaceWidgets.classicDashboard.tabs.calendar",
    descKey:  "workspaceWidgets.classicDashboard.tabs.calendar",
    icon: CalendarDays,
    color: "from-amber-400 to-orange-500",
  },
  {
    href: "/m/dashboard/more/calculators",
    labelKey: "workspaceWidgets.classicDashboard.tabs.calculators",
    descKey:  "workspaceWidgets.classicDashboard.calculators.calculator",
    icon: Calculator,
    color: "from-pink-400 to-rose-500",
  },
  {
    href: "/m/dashboard/more/drive",
    labelKey: "workspaceWidgets.classicDashboard.tabs.drive",
    descKey:  "workspaceWidgets.classicDashboard.tabs.drive",
    icon: HardDrive,
    color: "from-cyan-400 to-sky-500",
  },
  {
    href: "/m/dashboard/more/settings",
    labelKey: "workspaceWidgets.classicDashboard.tabs.settings",
    descKey:  "workspaceWidgets.classicDashboard.tabs.settings",
    icon: Settings,
    color: "from-gray-400 to-slate-500",
  },
];

export default function MoreTabPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-5 p-4">
      <KpiStrip />

      <section>
        <h2 className="mb-3 text-sm font-extrabold text-[color:var(--foreground-main)]">
          {t("workspaceWidgets.classicDashboard.overview.quickActionsTitle")}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {FEATURES.map(({ href, labelKey, icon: Icon, color }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-3 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3 transition-all hover:border-[color:var(--accent)]/40 active:scale-95"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow ${color}`}
              >
                <Icon size={18} strokeWidth={2.2} aria-hidden />
              </span>
              <span className="min-w-0 truncate text-xs font-bold text-[color:var(--foreground-main)]">
                {t(labelKey)}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
