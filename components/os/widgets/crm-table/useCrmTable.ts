"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Papa from "papaparse";
import { createProjectForContact } from "@/app/actions/crm";
import { downloadAuthenticatedFile } from "@/lib/client/download-api-file";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import type { Client, CrmTableWidgetProps } from "./types";
import {
  checkProjectChangeApi,
  deleteContactApi,
  fetchContactByIdApi,
  fetchContactsPageApi,
  fetchProjectOptionsApi,
  fetchProjectSyncMetaApi,
  importContactsApi,
  postSemanticSearchApi,
  updateContactApi,
} from "./crm-table-api";

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
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
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
  const [projectOptions, setProjectOptions] = useState<{ id: string; name: string }[]>([]);
  const [savingProject, setSavingProject] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectSyncMeta, setProjectSyncMeta] = useState<{
    autoSyncCrm: boolean;
    primaryContactId: string | null;
  } | null>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of clients) {
      for (const tag of c.tags ?? []) {
        if (tag.trim()) set.add(tag.trim());
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b, "he"));
  }, [clients]);

  const loadProjectOptions = useCallback(async () => {
    try {
      setProjectOptions(await fetchProjectOptionsApi());
    } catch {
      /* ignore */
    }
  }, []);

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
  }, [searchQuery, tagFilter, semanticMode]); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    if (!selectedClient?.projectId) {
      setProjectSyncMeta(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const meta = await fetchProjectSyncMetaApi(selectedClient.projectId!);
      if (!cancelled) setProjectSyncMeta(meta);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClient?.projectId, selectedClient?.id]);

  const crmSyncStatus: "unlinked" | "syncing" | "synced" | "linked" = (() => {
    if (savingProject) return "syncing";
    if (!selectedClient?.projectId) return "unlinked";
    if (projectSyncMeta?.autoSyncCrm) {
      return projectSyncMeta.primaryContactId === selectedClient.id ? "synced" : "linked";
    }
    return "linked";
  })();

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

  const saveClientProject = async (projectId: string | null) => {
    if (!selectedClient || savingProject) return;
    if (projectId) {
      const check = await checkProjectChangeApi(selectedClient.id, projectId);
      if (check) {
        if (check.allowed === false) {
          toast.error(check.warn ?? t("workspaceWidgets.crmTable.projectChangeBlocked"));
          return;
        }
        if (check.warn && !window.confirm(check.warn)) return;
      }
    }
    setSavingProject(true);
    try {
      const updated =
        (await updateContactApi(selectedClient.id, { projectId })) ??
        ({ ...selectedClient, projectId: null, projectName: null, totalProjects: 0 } satisfies Client);
      setSelectedClient(updated);
      setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      toast.success(t("workspaceWidgets.crmTable.projectLinkUpdated"));
    } catch {
      toast.error(t("workspaceWidgets.crmTable.projectLinkFailed"));
    } finally {
      setSavingProject(false);
    }
  };

  const handleCreateProjectForClient = async () => {
    if (!selectedClient) return;
    setCreatingProject(true);
    try {
      const result = await createProjectForContact({ contactId: selectedClient.id });
      if (!result.ok) {
        toast.error(result.error ?? t("workspaceWidgets.crmTable.createProjectFailed"));
        return;
      }
      const updated: Client = {
        ...selectedClient,
        projectId: result.projectId,
        projectName: result.projectName,
        totalProjects: 1,
      };
      setSelectedClient(updated);
      setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      await loadProjectOptions();
      toast.success(t("workspaceWidgets.crmTable.createProjectSuccess"));
    } catch {
      toast.error(t("workspaceWidgets.crmTable.createProjectFailed"));
    } finally {
      setCreatingProject(false);
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

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const data = results.data as Record<string, string>[];
        if (!data.length) {
          toast.error(t("workspaceWidgets.crmTable.importEmpty"));
          setIsImporting(false);
          return;
        }
        try {
          const result = await importContactsApi(data);
          if (result.ok) {
            toast.success(result.message ?? t("workspaceWidgets.crmTable.importSuccess"));
            void fetchClients();
          } else throw new Error(result.error || t("workspaceWidgets.crmTable.importFailed"));
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : t("workspaceWidgets.crmTable.importFailed"));
        } finally {
          setIsImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      },
      error: () => {
        toast.error(t("workspaceWidgets.crmTable.importCsvError"));
        setIsImporting(false);
      },
    });
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      await downloadAuthenticatedFile("/api/crm/contacts/export", "crm-contacts.csv");
      toast.success(t("workspaceWidgets.crmTable.exportSuccess"));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("workspaceWidgets.crmTable.exportFailed"));
    } finally {
      setIsExporting(false);
    }
  };

  return {
    clients,
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
    allTags,
    isAddingClient,
    setIsAddingClient,
    isImporting,
    isExporting,
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
    saveClientProject,
    handleCreateProjectForClient,
    openProjectHub,
    handleImportCSV,
    handleExportCsv,
  };
}
