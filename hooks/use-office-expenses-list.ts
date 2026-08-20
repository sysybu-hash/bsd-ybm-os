"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FinanceExpenseRow } from "@/lib/finance-workspace-types";
import { OFFICE_EXPENSES_PAGE_SIZE } from "@/lib/workspace-api/office-expenses";

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

function buildQuery(filters: OfficeExpenseFilters, skip: number): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.status) params.set("status", filters.status);
  if (filters.fromDate) params.set("fromDate", filters.fromDate);
  if (filters.toDate) params.set("toDate", filters.toDate);
  params.set("skip", String(skip));
  params.set("take", String(OFFICE_EXPENSES_PAGE_SIZE));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

const SEARCH_DEBOUNCE_MS = 300;

type ListResponse = {
  expenses: FinanceExpenseRow[];
  total: number;
  skip: number;
  take: number;
  totalPosted: number;
};

export function useOfficeExpensesList(loadErrorMessage: string, forbiddenMessage?: string) {
  const [expenses, setExpenses] = useState<FinanceExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<OfficeExpenseFilters>(emptyOfficeExpenseFilters);
  const [searchInput, setSearchInput] = useState("");
  const [total, setTotal] = useState(0);
  const [totalPosted, setTotalPosted] = useState(0);
  const [skip, setSkip] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((prev) => (prev.q === searchInput ? prev : { ...prev, q: searchInput }));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const fetchPage = useCallback(
    async (pageSkip: number, append: boolean) => {
      const res = await fetch(`/api/office-expenses${buildQuery(filters, pageSkip)}`, {
        credentials: "include",
      });
      if (res.status === 403 && forbiddenMessage) {
        throw new Error(forbiddenMessage);
      }
      if (!res.ok) throw new Error(loadErrorMessage);
      const data = (await res.json()) as ListResponse;
      setTotal(data.total ?? 0);
      setTotalPosted(data.totalPosted ?? 0);
      setSkip(pageSkip + (data.expenses?.length ?? 0));
      setExpenses((prev) => (append ? [...prev, ...(data.expenses ?? [])] : data.expenses ?? []));
    },
    [filters, loadErrorMessage, forbiddenMessage],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSkip(0);
    try {
      await fetchPage(0, false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : loadErrorMessage);
      setExpenses([]);
      setTotal(0);
      setTotalPosted(0);
    } finally {
      setLoading(false);
    }
  }, [fetchPage, loadErrorMessage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading) return;
    setLoadingMore(true);
    setError(null);
    try {
      await fetchPage(skip, true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : loadErrorMessage);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, loading, loadingMore, loadErrorMessage, skip]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const hasMore = expenses.length < total;

  return {
    expenses,
    loading,
    loadingMore,
    error,
    filters,
    setFilters,
    searchInput,
    setSearchInput,
    resetFilters,
    hasActiveFilters,
    totalPosted,
    total,
    hasMore,
    loadMore,
    reload: load,
  };
}
