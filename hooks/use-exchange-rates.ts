"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExchangeRatesPayload } from "@/lib/exchange-rates/frankfurter";

export function useExchangeRates(base: string, symbols: string[]) {
  const [data, setData] = useState<ExchangeRatesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const symbolKey = symbols.join(",");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ base, symbols: symbolKey });
      const res = await fetch(`/api/exchange-rates?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load rates");
      const json = (await res.json()) as ExchangeRatesPayload;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [base, symbolKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
