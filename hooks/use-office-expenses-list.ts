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

const SEARCH_DEBOUNCE_MS = 300;

export function useOfficeExpensesList(loadErrorMessage: string) {
  const [expenses, setExpenses] = useState<FinanceExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<OfficeExpenseFilters>(emptyOfficeExpenseFilters);
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((prev) => (prev.q === searchInput ? prev : { ...prev, q: searchInput }));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

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
    setSearchInput("");
    setFilters(emptyOfficeExpenseFilters());
  }, []);

  const hasActiveFilters = useMemo(
    () =>
      Boolean(filters.q.trim()) ||
      Boolean(filters.status) ||
      Boolean(filters.fromDate) ||
      Boolean(filters.toDate),
    [filters],
  );

  return {
    expenses,
    loading,
    error,
    filters,
    setFilters,
    searchInput,
    setSearchInput,
    resetFilters,
    hasActiveFilters,
    totalPosted,
    reload: load,
  };
}
