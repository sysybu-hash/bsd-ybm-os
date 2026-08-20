"use client";

import { useCallback, useEffect, useState } from "react";
import { createLogger } from "@/lib/logger";
import type { LogisticsAssetRow, LogisticsInventoryRow, LogisticsLookups } from "./types";

const log = createLogger("use-logistics-data");

export function useLogisticsInventory(search: string) {
  const [items, setItems] = useState<LogisticsInventoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/logistics/inventory?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items?: LogisticsInventoryRow[] };
      setItems(data.items ?? []);
    } catch (err: unknown) {
      log.error("inventory fetch failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      setError("fetch_failed");
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, isLoading, error, reload };
}

export function useLogisticsAssets(search: string) {
  const [assets, setAssets] = useState<LogisticsAssetRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/logistics/assets?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { assets?: LogisticsAssetRow[] };
      setAssets(data.assets ?? []);
    } catch (err: unknown) {
      log.error("assets fetch failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      setError("fetch_failed");
      setAssets([]);
    } finally {
      setIsLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { assets, isLoading, error, reload };
}

export function useLogisticsLookups(enabled: boolean) {
  const [lookups, setLookups] = useState<LogisticsLookups | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/logistics/lookups");
        if (!res.ok) return;
        const data = (await res.json()) as LogisticsLookups;
        if (!cancelled) setLookups(data);
      } catch (err: unknown) {
        log.warn("lookups fetch failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return lookups;
}
