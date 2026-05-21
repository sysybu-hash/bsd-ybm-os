"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { ProjectListItem } from "@/components/os/widgets/shared/ProjectPickerPanel";

type UseProjectPickerOptions = {
  initialProjectId?: string;
  listErrorKey?: string;
};

export function useProjectPicker({
  initialProjectId = "",
  listErrorKey = "workspaceWidgets.projectPicker.loadFailed",
}: UseProjectPickerOptions = {}) {
  const { t } = useI18n();
  const [resolvedProjectId, setResolvedProjectId] = useState(initialProjectId);
  const [selectedProjectName, setSelectedProjectName] = useState("");
  const [projectsList, setProjectsList] = useState<ProjectListItem[]>([]);
  const [projectsListLoading, setProjectsListLoading] = useState(false);

  useEffect(() => {
    if (initialProjectId) setResolvedProjectId(initialProjectId);
  }, [initialProjectId]);

  const loadProjectsList = useCallback(async (): Promise<ProjectListItem[]> => {
    setProjectsListLoading(true);
    try {
      const res = await fetch("/api/projects", { credentials: "include" });
      const json = (await res.json().catch(() => ({}))) as { projects?: ProjectListItem[] };
      if (!res.ok) throw new Error("projects");
      const list = Array.isArray(json.projects)
        ? json.projects.map((p) => ({
            id: String(p.id),
            name: String(p.name ?? ""),
            isActive: p.isActive,
          }))
        : [];
      setProjectsList(list);
      return list;
    } catch {
      toast.error(t(listErrorKey));
      setProjectsList([]);
      return [];
    } finally {
      setProjectsListLoading(false);
    }
  }, [listErrorKey, t]);

  const syncProjectName = useCallback(
    (id: string, list?: ProjectListItem[]) => {
      const source = list ?? projectsList;
      const found = source.find((p) => p.id === id);
      setSelectedProjectName(found?.name ?? "");
    },
    [projectsList],
  );

  const selectProject = useCallback(
    (id: string, list?: ProjectListItem[]) => {
      setResolvedProjectId(id);
      syncProjectName(id, list);
    },
    [syncProjectName],
  );

  const clearProject = useCallback(() => {
    setResolvedProjectId("");
    setSelectedProjectName("");
    void loadProjectsList();
  }, [loadProjectsList]);

  const showProjectPicker = !resolvedProjectId;

  return {
    resolvedProjectId,
    selectedProjectName,
    projectsList,
    projectsListLoading,
    showProjectPicker,
    loadProjectsList,
    selectProject,
    clearProject,
    syncProjectName,
    setResolvedProjectId,
    setSelectedProjectName,
  };
}
