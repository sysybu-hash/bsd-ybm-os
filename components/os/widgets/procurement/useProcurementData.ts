"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ProcurementRequestRow,
  PurchaseOrderRow,
  SupplierRow,
} from "@/lib/validation/schemas/procurement";
import {
  procurementRequestsResponseSchema,
  purchaseOrdersResponseSchema,
  suppliersResponseSchema,
} from "@/lib/validation/schemas/procurement";

export function useProcurementRequests(enabled: boolean) {
  const [requests, setRequests] = useState<ProcurementRequestRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/procurement/requests");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      const parsed = procurementRequestsResponseSchema.safeParse(json);
      if (!parsed.success) throw new Error("Invalid response");
      setRequests(parsed.data.requests);
    } catch {
      setError(true);
      setRequests([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  return { requests, isLoading, error, reload };
}

export function useProcurementSuppliers(enabled: boolean) {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/procurement/suppliers");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      const parsed = suppliersResponseSchema.safeParse(json);
      if (!parsed.success) throw new Error("Invalid response");
      setSuppliers(parsed.data.suppliers);
    } catch {
      setError(true);
      setSuppliers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  return { suppliers, isLoading, error, reload };
}

export function useProcurementOrders(enabled: boolean) {
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/procurement/orders");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      const parsed = purchaseOrdersResponseSchema.safeParse(json);
      if (!parsed.success) throw new Error("Invalid response");
      setOrders(parsed.data.orders);
    } catch {
      setError(true);
      setOrders([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  return { orders, isLoading, error, reload };
}
