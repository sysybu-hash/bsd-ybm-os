"use client";

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";

export interface DocumentLineItem {
  id: string;
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  priceAlertPending: boolean;
  normalizedKey: string;
}

export interface ErpDocument {
  id: string;
  fileName: string;
  type: string;
  status: string;
  createdAt: string;
  lineItems?: DocumentLineItem[];
}

export interface PriceChartRow {
  date: string;
  price: number;
}

export interface PriceComparison {
  productName: string;
  data: PriceChartRow[];
}

export function useErpDocuments() {
  const { t, dir } = useI18n();
  const [documents, setDocuments] = useState<ErpDocument[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<ErpDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<DocumentLineItem>>({});
  const [priceComparison, setPriceComparison] = useState<PriceComparison | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchDocuments = useCallback(async (query = "") => {
    try {
      setLoading(true);
      const res = await fetch(`/api/erp/documents${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      const data = await res.json();
      setDocuments((data as { documents?: ErpDocument[] }).documents ?? []);
    } catch {
      toast.error(t("workspaceWidgets.erp.loadListFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchDocDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/erp/documents/${id}`);
      const data = await res.json();
      setSelectedDoc((data as { document?: ErpDocument }).document ?? null);
    } catch {
      toast.error(t("workspaceWidgets.erp.loadDocFailed"));
    }
  };

  const fetchPriceComparison = async () => {
    try {
      const res = await fetch("/api/erp/price-comparison");
      const data = await res.json();
      setPriceComparison((data as { comparison?: PriceComparison }).comparison ?? null);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    void fetchDocuments();
    void fetchPriceComparison();
  }, [fetchDocuments]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchDocuments(searchQuery);
  };

  const startEditing = (line: DocumentLineItem) => {
    setEditingLineId(line.id);
    setEditValues({ unitPrice: line.unitPrice ?? 0, quantity: line.quantity ?? 0, description: line.description });
  };

  const saveLineItem = async (id: string) => {
    setIsUpdating(true);
    try {
      const lineTotal = (editValues.unitPrice ?? 0) * (editValues.quantity ?? 0);
      const res = await fetch(`/api/erp/line-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editValues, lineTotal, priceAlertPending: false }),
      });
      if (res.ok) {
        toast.success(t("workspaceWidgets.erpDocuments.rowUpdated"));
        setEditingLineId(null);
        if (selectedDoc) void fetchDocDetails(selectedDoc.id);
        void fetchPriceComparison();
      } else {
        toast.error(t("workspaceWidgets.erpDocuments.rowUpdateError"));
      }
    } catch {
      toast.error(t("workspaceWidgets.erpDocuments.serverError"));
    } finally {
      setIsUpdating(false);
    }
  };

  const deleteDocument = async (id: string) => {
    if (!confirm("האם אתה בטוח שברצונך למחוק את המסמך?")) return;
    try {
      const res = await fetch(`/api/erp/documents/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("workspaceWidgets.erpDocuments.deleted"));
        setDocuments((docs) => docs.filter((d) => d.id !== id));
        if (selectedDoc?.id === id) setSelectedDoc(null);
      }
    } catch {
      toast.error(t("workspaceWidgets.erpDocuments.deleteError"));
    }
  };

  return {
    t, dir,
    documents, selectedDoc, setSelectedDoc,
    loading, searchQuery, setSearchQuery,
    editingLineId, editValues, setEditValues,
    priceComparison, isUpdating,
    handleSearch, startEditing, saveLineItem, deleteDocument,
    fetchDocDetails,
  };
}
