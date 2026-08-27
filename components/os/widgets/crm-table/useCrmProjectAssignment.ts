"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { createProjectForContact } from "@/app/actions/crm";
import {
  checkProjectChangeApi,
  fetchProjectOptionsApi,
  fetchProjectSyncMetaApi,
  updateContactApi,
} from "./crm-table-api";
import type { Client } from "./types";

export type CrmSyncStatus = "unlinked" | "syncing" | "synced" | "linked";

type Options = {
  selectedClient: Client | null;
  setSelectedClient: (next: Client | null) => void;
  setClients: (updater: (prev: Client[]) => Client[]) => void;
  t: (key: string, vars?: Record<string, string>) => string;
};

/**
 * Linking a CRM contact to a project: the option list, the two in-flight flags,
 * the project's sync metadata, and the status the detail panel shows.
 *
 * Split out of useCrmTable (415 lines) following the seam its siblings already
 * use — useCrmCsvTransfer and useCrmGoogleImport. This cluster is cohesive:
 * every piece of it exists to answer "which project is this contact on, and is
 * it syncing?", and nothing else in the widget touches it.
 */
export function useCrmProjectAssignment({
  selectedClient,
  setSelectedClient,
  setClients,
  t,
}: Options) {
  const [projectOptions, setProjectOptions] = useState<{ id: string; name: string }[]>([]);
  const [savingProject, setSavingProject] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectSyncMeta, setProjectSyncMeta] = useState<{
    autoSyncCrm: boolean;
    primaryContactId: string | null;
  } | null>(null);

  const loadProjectOptions = useCallback(async () => {
    try {
      setProjectOptions(await fetchProjectOptionsApi());
    } catch {
      /* the picker simply stays empty */
    }
  }, []);

  const projectId = selectedClient?.projectId ?? null;
  const clientId = selectedClient?.id ?? null;

  useEffect(() => {
    if (!projectId) {
      setProjectSyncMeta(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const meta = await fetchProjectSyncMetaApi(projectId);
      if (!cancelled) setProjectSyncMeta(meta);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, clientId]);

  /**
   * "synced" is narrower than "linked": the project must have auto-sync on AND
   * have this exact contact as its primary. A contact attached to an
   * auto-syncing project that points at someone else is linked, not synced.
   */
  const crmSyncStatus: CrmSyncStatus = savingProject
    ? "syncing"
    : !selectedClient?.projectId
      ? "unlinked"
      : projectSyncMeta?.autoSyncCrm
        ? projectSyncMeta.primaryContactId === selectedClient.id
          ? "synced"
          : "linked"
        : "linked";

  const saveClientProject = async (nextProjectId: string | null) => {
    if (!selectedClient || savingProject) return;
    if (nextProjectId) {
      const check = await checkProjectChangeApi(selectedClient.id, nextProjectId);
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
        (await updateContactApi(selectedClient.id, { projectId: nextProjectId })) ??
        ({
          ...selectedClient,
          projectId: null,
          projectName: null,
          totalProjects: 0,
        } satisfies Client);
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

  return {
    projectOptions,
    loadProjectOptions,
    savingProject,
    creatingProject,
    crmSyncStatus,
    saveClientProject,
    handleCreateProjectForClient,
  };
}
