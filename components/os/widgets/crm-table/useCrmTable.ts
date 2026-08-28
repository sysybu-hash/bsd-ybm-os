"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import type { Client, CrmTableWidgetProps } from "./types";
import type { CrmPipelineStatus } from "@/lib/crm/pipeline-status";
import {
  deleteContactApi,
  fetchContactByIdApi,
  fetchContactsPageApi,
  postSemanticSearchApi,
  updateContactApi,
} from "./crm-table-api";
import { useCrmGoogleImport } from "./useCrmGoogleImport";
import { useCrmCsvTransfer } from "./useCrmCsvTransfer";
import { useCrmProjectAssignment } from "./useCrmProjectAssignment";

export function useCrmTable({
  openWorkspaceWidget,
  t,
}: Pick<CrmTableWidgetProps, "openWorkspaceWidget"> & { t: (key: string) => string }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [semanticMode, setSemanticMode] = useState(false);
  const [semanticFallback, setSemanticFallback] = useState(false);
  const [tagFilter, setTagFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<CrmPipelineStatus | "">("");
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [showGoogleImport, setShowGoogleImport] = useState(false);
  const [selectedClient, setSelectedClientState] = useState<Client | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const applyCrmView = useCallback((view: WidgetViewState) => {
    const contactId = typeof view.contactId === "string" ? view.contactId.trim() : "";
    if (!contactId) {
      setSelectedClientState(null);
      setIsEditing(false);
      return;
    }
    void (async () => {
      try {
        const client = await fetchContactByIdApi(contactId);
        if (client) setSelectedClientState(client);
      } catch {
        /* ignore deep-link miss */
      }
    })();
  }, []);
  const { pushView } = useSyncedWidgetNavigation(applyCrmView);

  const setSelectedClient = useCallback(
    (client: Client | null | ((prev: Client | null) => Client | null)) => {
      setSelectedClientState((prev) => {
        const next = typeof client === "function" ? client(prev) : client;
        if (next?.id !== prev?.id) {
          queueMicrotask(() => pushView(next?.id ? { contactId: next.id } : {}));
        }
        return next;
      });
    },
    [pushView],
  );
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const {
    projectOptions,
    loadProjectOptions,
    savingProject,
    creatingProject,
    crmSyncStatus,
    saveClientProject,
    handleCreateProjectForClient,
  } = useCrmProjectAssignment({ selectedClient, setSelectedClient, setClients, t });

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) {
      for (const tag of c.tags ?? []) {
        if (tag.trim()) set.add(tag.trim());
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, "he"));
  }, [clients]);

  const filteredClients = useMemo(() => {
    if (!statusFilter) return clients;
    return clients.filter((c) => c.status === statusFilter);
  }, [clients, statusFilter]);

  const runSemanticSearch = useCallback(
    async (query: string): Promise<string[] | null> => {
      try {
        const data = await postSemanticSearchApi(query);
        if (data.error && !data.fallback) {
          throw new Error(data.error ?? t("workspaceWidgets.crmTable.semanticFailed"));
        }
        setSemanticFallback(data.fallback);
        return data.matchedIds;
      } catch {
        setSemanticFallback(true);
        return null;
      }
    },
    [t],
  );

  const fetchClients = useCallback(
    async (append = false) => {
      try {
        if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
          setPage(0);
        }
        setLoadError(null);
        const skip = append ? (page + 1) * 50 : 0;
        const q = searchQuery.trim();
        const errorLoad = t("workspaceWidgets.crmTable.errorLoad");

        let pageResult: { clients: Client[]; total: number };

        if (semanticMode && q.length >= 2) {
          const matchedIds = await runSemanticSearch(q);
          if (matchedIds && matchedIds.length > 0) {
            pageResult = await fetchContactsPageApi(
              { skip, tag: tagFilter || undefined, ids: matchedIds },
              errorLoad,
            );
          } else if (matchedIds && matchedIds.length === 0) {
            pageResult = { clients: [], total: 0 };
          } else {
            pageResult = await fetchContactsPageApi(
              { skip, q, tag: tagFilter || undefined },
              errorLoad,
            );
          }
        } else {
          pageResult = await fetchContactsPageApi(
            { skip, q: q || undefined, tag: tagFilter || undefined },
            errorLoad,
          );
        }

        if (append) {
          setClients((prev) => [...prev, ...pageResult.clients]);
          setPage((p) => p + 1);
        } else {
          setClients(pageResult.clients);
          setPage(0);
        }
        setHasMore(skip + pageResult.clients.length < pageResult.total);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : t("workspaceWidgets.crmTable.errorLoad");
        setLoadError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [page, searchQuery, tagFilter, semanticMode, runSemanticSearch, t],
  );

  useEffect(() => {
    void loadProjectOptions();
  }, [loadProjectOptions]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchClients(false);
    }, 300);
    return () => window.clearTimeout(timer);
    // `fetchClients` is intentionally absent: it is re-created on every page
    // change, and including it would turn each pagination click into a second
    // debounced refetch. The effect only needs to fire when a filter changes,
    // and the render that changes one already supplies the current fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, tagFilter, semanticMode]);

  useEffect(() => {
    if (!selectedClient?.id) return;
    let cancelled = false;
    void (async () => {
      const refreshed = await fetchContactByIdApi(selectedClient.id);
      if (!refreshed || cancelled) return;
      // Use state setter (not URL-syncing wrapper) so detail refresh does not rewrite the URL.
      setSelectedClientState((prev) => (prev?.id === refreshed.id ? { ...prev, ...refreshed } : prev));
      setClients((prev) => prev.map((c) => (c.id === refreshed.id ? { ...c, ...refreshed } : c)));
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClient?.id]);

  const confirmDeleteClient = async () => {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    setDeleteTargetId(null);
    try {
      if (await deleteContactApi(id)) {
        toast.success(t("workspaceWidgets.crmTable.deleted"));
        void fetchClients();
      } else throw new Error("delete failed");
    } catch {
      toast.error(t("workspaceWidgets.crmTable.deleteFailed"));
    }
  };

  const handleUpdateClient = async () => {
    if (!selectedClient) return;
    try {
      const refreshed = await updateContactApi(selectedClient.id, {
        name: selectedClient.name,
        email: selectedClient.email,
        phone: selectedClient.phone,
        notes: selectedClient.notes,
        status: selectedClient.status,
        value: selectedClient.value,
        projectId: selectedClient.projectId,
        tags: selectedClient.tags ?? [],
      });
      if (refreshed) {
        setSelectedClient((prev) => (prev?.id === refreshed.id ? { ...prev, ...refreshed } : prev));
        toast.success(t("workspaceWidgets.crmTable.updated"));
        setIsEditing(false);
        void fetchClients();
      } else throw new Error("update failed");
    } catch {
      toast.error(t("workspaceWidgets.crmTable.updateFailed"));
    }
  };

  const handleQuickStatusChange = async (status: CrmPipelineStatus) => {
    if (!selectedClient) return;
    try {
      const refreshed = await updateContactApi(selectedClient.id, { status });
      if (refreshed) {
        setSelectedClient((prev) => (prev?.id === refreshed.id ? { ...prev, ...refreshed } : prev));
        setClients((prev) => prev.map((c) => (c.id === refreshed.id ? { ...c, ...refreshed } : c)));
        toast.success(t("workspaceWidgets.crmTable.updated"));
        void fetchClients();
      } else throw new Error("update failed");
    } catch {
      toast.error(t("workspaceWidgets.crmTable.updateFailed"));
    }
  };

  const openProjectHub = (client?: Client) => {
    const target = client ?? selectedClient;
    if (!target?.projectId || !openWorkspaceWidget) return;
    if (!client) {
      setSelectedClient(null);
      setIsEditing(false);
    }
    openWorkspaceWidget(
      "project",
      { projectId: target.projectId, name: target.projectName ?? undefined },
      { maximize: true },
    );
  };


  const { fetchGooglePreview, runGoogleImport, handleGoogleImported } = useCrmGoogleImport({
    t,
    onImported: () => {
      void fetchClients(false);
    },
  });

  const { isImporting, isExporting, handleImportCSV, handleExportCsv } = useCrmCsvTransfer({
    t,
    onImported: () => {
      void fetchClients();
    },
    fileInputRef,
  });

  return {
    clients: filteredClients,
    allClients: clients,
    loading,
    loadError,
    deleteTargetId,
    setDeleteTargetId,
    searchQuery,
    setSearchQuery,
    semanticMode,
    setSemanticMode,
    semanticFallback,
    tagFilter,
    setTagFilter,
    statusFilter,
    setStatusFilter,
    allTags,
    isAddingClient,
    setIsAddingClient,
    isImporting,
    isExporting,
    showGoogleImport,
    setShowGoogleImport,
    selectedClient,
    setSelectedClient,
    isEditing,
    setIsEditing,
    hasMore,
    loadingMore,
    fileInputRef,
    projectOptions,
    savingProject,
    creatingProject,
    crmSyncStatus,
    fetchClients,
    confirmDeleteClient,
    handleUpdateClient,
    handleQuickStatusChange,
    saveClientProject,
    handleCreateProjectForClient,
    openProjectHub,
    handleImportCSV,
    handleExportCsv,
    fetchGooglePreview,
    runGoogleImport,
    handleGoogleImported,
  };
}
