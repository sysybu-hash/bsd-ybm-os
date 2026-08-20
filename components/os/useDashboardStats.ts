"use client";

import { useCallback, useEffect, useState } from "react";

interface CashflowPoint {
  name: string;
  revenue?: number;
  expenses?: number;
  actual?: number;
  forecast?: number;
  type: "past" | "future";
}

export type MoneySourceBreakdown = {
  revenueLines: { label: string; amount: number }[];
  expenseLines: { label: string; amount: number }[];
  projectBudgetsTotal: number;
  issuedIncomeDocsCount: number;
  creditNotesTotal: number;
  expenseRecordsCount: number;
};

interface DashboardStats {
  totalRevenue: number;
  totalExpenses: number;
  activeProjects: number;
  totalClients: number;
  pendingInvoices: number;
  aiInsight: string;
  cashflow: CashflowPoint[];
  breakdown?: MoneySourceBreakdown;
  analytics: {
    monthlyExpenses: { name: string; value: number }[];
    monthlyIncome?: { name: string; value: number }[];
    quoteStatus: { name: string; value: number; color: string }[];
  };
}

const DEFAULT_STATS: DashboardStats = {
  totalRevenue: 0,
  totalExpenses: 0,
  activeProjects: 0,
  totalClients: 0,
  pendingInvoices: 0,
  aiInsight: "",
  cashflow: [],
  analytics: { monthlyExpenses: [], monthlyIncome: [], quoteStatus: [] },
};

export type { DashboardStats, CashflowPoint };

export function useDashboardStats(t: (key: string) => string) {
  const [stats, setStats] = useState<DashboardStats>(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/stats", { credentials: "include" });
      if (!res.ok) throw new Error(t("workspaceWidgets.dashboard.error"));
      const data = await res.json();
      setStats(data as DashboardStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("workspaceWidgets.dashboard.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchDashboardStats();
  }, [fetchDashboardStats]);

  return { stats, loading, error, fetchDashboardStats };
}
