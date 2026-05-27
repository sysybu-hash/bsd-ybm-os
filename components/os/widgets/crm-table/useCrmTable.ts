"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Papa from "papaparse";
import { createProjectForContact } from "@/app/actions/crm";
import { downloadAuthenticatedFile } from "@/lib/client/download-api-file";
import type { Client, ProjectOption, CrmTableWidgetProps } from "./types";
import { mapIssuedDocuments } from "./constants";

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
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
  const [savingProject, setSavingProject] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectSyncMeta, setProjectSyncMeta] = useState<{
    autoSyncCrm: boolean;
    primaryContactId: string | null;
  } | null>(null);

  const mapContactRow = (c: Record<string, unknown>): Client => {
    const project = c.project as { id?: string; name?: string } | null | undefined;
    const rawTags = c.tags;
    const tags = Array.isArray(rawTags) ? rawTags.map(String) : [];
    return {
      id: String(c.id),
      name: String(c.name ?? ""),
      email: (c.email as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      notes: (c.notes as string | null) ?? null,
      status: (String(c.status ?? "active").toLowerCase() as Client["status"]) || "active",
      lastContact: String(c.createdAt ?? new Date().toISOString()),
      totalProjects: project?.id ? 1 : 0,
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
      issuedDocuments: mapIssuedDocuments(c.issuedDocuments),
      tags,
    };
  };

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
      const res = await fetch("/api/projects", { credentials: "include" });
      const json = await res.json();
      if (!res.ok) return;
      const list = Array.isArray(json.projects) ? json.projects : Array.isArray(json) ? json : [];
      setProjectOptions(list.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
    } catch {
      /* ignore */
    }
  }, []);

  const runSemanticSearch = useCallback(
    async (query: string): Promise<string[] | null> => {
      try {
        const res = await fetch("/api/crm/semantic-search", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
        const data = (await res.json()) as {
          matchedIds?: string[];
          fallback?: boolean;
          error?: string;
        };
        if (!res.ok) {
          if (data.fallback) {
            setSemanticFallback(true);
            return null;
          }
          throw new Error(data.error ?? t("workspaceWidgets.crmTable.semanticFailed"));
        }
        setSemanticFallback(Boolean(data.fallback));
        return Array.isArray(data.matchedIds) ? data.matchedIds : [];
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

        let rows: Record<string, unknown>[] = [];
        let total = 0;

        if (semanticMode && q.length >= 2) {
          const matchedIds = await runSemanticSearch(q);
          if (matchedIds && matchedIds.length > 0) {
            const params = new URLSearchParams({
              ids: matchedIds.join(","),
              take: "50",
              skip: String(skip),
            });
            if (tagFilter) params.set("tag", tagFilter);
            const res = await fetch(`/api/crm/contacts?${params.toString()}`, { credentials: "include" });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || t("workspaceWidgets.crmTable.errorLoad"));
            rows = Array.isArray(data.contacts) ? data.contacts : [];
            total = typeof data.total === "number" ? data.total : rows.length;
          } else if (matchedIds && matchedIds.length === 0) {
            rows = [];
            total = 0;
          } else {
            const params = new URLSearchParams({ skip: String(skip), take: "50", q });
            if (tagFilter) params.set("tag", tagFilter);
            const res = await fetch(`/api/crm/contacts?${params.toString()}`, { credentials: "include" });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || t("workspaceWidgets.crmTable.errorLoad"));
            rows = Array.isArray(data.contacts) ? data.contacts : [];
            total = typeof data.total === "number" ? data.total : rows.length;
          }
        } else {
          const params = new URLSearchParams({ skip: String(skip), take: "50" });
          if (q) params.set("q", q);
          if (tagFilter) params.set("tag", tagFilter);
          const res = await fetch(`/api/crm/contacts?${params.toString()}`, { credentials: "include" });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || t("workspaceWidgets.crmTable.errorLoad"));
          rows = Array.isArray(data.contacts) ? data.contacts : [];
          total = typeof data.total === "number" ? data.total : rows.length;
        }

        const mapped = rows.map((c) => mapContactRow(c));
        if (append) {
          setClients((prev) => [...prev, ...mapped]);
          setPage((p) => p + 1);
        } else {
          setClients(mapped);
          setPage(0);
        }
        setHasMore(skip + mapped.length < total);
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
      try {
        const res = await fetch(`/api/crm/contacts/${selectedClient.id}`, { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { contact?: Record<string, unknown> };
        if (!data.contact || cancelled) return;
        const refreshed = mapContactRow(data.contact);
        setSelectedClient((prev) => (prev?.id === refreshed.id ? { ...prev, ...refreshed } : prev));
        setClients((prev) => prev.map((c) => (c.id === refreshed.id ? { ...c, ...refreshed } : c)));
      } catch {
        /* optional */
      }
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
      try {
        const res = await fetch(`/api/projects/${selectedClient.projectId}`, { credentials: "include" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          project?: { autoSyncCrm?: boolean; primaryContactId?: string | null };
        };
        if (!cancelled) {
          setProjectSyncMeta({
            autoSyncCrm: Boolean(data.project?.autoSyncCrm),
            primaryContactId: data.project?.primaryContactId ?? null,
          });
        }
      } catch {
        if (!cancelled) setProjectSyncMeta(null);
      }
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
      const res = await fetch(`/api/crm/contacts/${id}`, { method: "DELETE" });
      if (res.ok) {
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
      const res = await fetch(`/api/crm/contacts/${selectedClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedClient.name,
          email: selectedClient.email,
          phone: selectedClient.phone,
          notes: selectedClient.notes,
          status: selectedClient.status,
          projectId: selectedClient.projectId,
          tags: selectedClient.tags ?? [],
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { contact?: Record<string, unknown> };
        if (json.contact) {
          const refreshed = mapContactRow(json.contact);
          setSelectedClient((prev) => (prev?.id === refreshed.id ? { ...prev, ...refreshed } : prev));
        }
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
      const check = await fetch(
        `/api/crm/contacts/${selectedClient.id}/project-change-check?nextProjectId=${encodeURIComponent(projectId)}`,
        { credentials: "include" },
      ).catch(() => null);
      if (check?.ok) {
        const j = (await check.json()) as { allowed?: boolean; warn?: string };
        if (j.allowed === false) {
          toast.error(j.warn ?? t("workspaceWidgets.crmTable.projectChangeBlocked"));
          return;
        }
        if (j.warn && !window.confirm(j.warn)) return;
      }
    }
    setSavingProject(true);
    try {
      const res = await fetch(`/api/crm/contacts/${selectedClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) throw new Error("patch failed");
      const json = await res.json();
      const contact = json.contact as Record<string, unknown> | undefined;
      const updated: Client = contact
        ? mapContactRow(contact)
        : { ...selectedClient, projectId: null, projectName: null, totalProjects: 0 };
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
          const res = await fetch("/api/crm/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contacts: data }),
          });
          const result = await res.json();
          if (res.ok) {
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
