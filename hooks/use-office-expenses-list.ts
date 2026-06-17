"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FinanceExpenseRow } from "@/lib/finance-workspace-types";

export type OfficeExpenseFilters = {
  q: string;
  status: "" | "DRAFT" | "POSTED";
  fromDate: string;
  toDate: string;
};

export const emptyOfficeExpenseFilters = (): OfficeExpenseFilters => ({
  q: "",
  status: "",
  fromDate: "",
  toDate: "",
});

function buildQuery(filters: OfficeExpenseFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.status) params.set("status", filters.status);
  if (filters.fromDate) params.set("fromDate", filters.fromDate);
  if (filters.toDate) params.set("toDate", filters.toDate);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useOfficeExpensesList(loadErrorMessage: string) {
  const [expenses, setExpenses] = useState<FinanceExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<OfficeExpenseFilters>(emptyOfficeExpenseFilters);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/office-expenses${buildQuery(filters)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(loadErrorMessage);
      const data = (await res.json()) as { expenses: FinanceExpenseRow[] };
      setExpenses(data.expenses ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : loadErrorMessage);
    } finally {
      setLoading(false);
    }
  }, [filters, loadErrorMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPosted = useMemo(
    () =>
      expenses
        .filter((row) => row.status === "POSTED")
        .reduce((sum, row) => sum + row.total, 0),
    [expenses],
  );

  const resetFilters = useCallback(() => {
    setFilters(emptyOfficeExpenseFilters());
  }, []);

  return {
    expenses,
    loading,
    error,
    filters,
    setFilters,
    resetFilters,
    totalPosted,
    reload: load,
  };
}
