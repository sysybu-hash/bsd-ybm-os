"use client";

import { useCallback, useEffect, useState } from "react";
import ProjectWidget from "@/components/os/ProjectWidget";
import AddProjectDialog from "@/components/os/widgets/shared/AddProjectDialog";
import ProjectPickerPanel from "@/components/os/widgets/shared/ProjectPickerPanel";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetType } from "@/hooks/use-window-manager";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";

type OpenWorkspaceWidgetFn = (
  type: WidgetType,
  data?: Record<string, unknown> | null,
  options?: { maximize?: boolean },
) => void;

type Props = {
  liveData?: Record<string, unknown> | null;
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
};

type ProjectListItem = { id: string; name: string; isActive?: boolean };

/** Legacy hub tab "board" → project center + tasks dashboard tab */
function normalizeProjectsView(view: WidgetViewState): WidgetViewState {
  const next = { ...view };
  if (next.tab === "board") {
    next.tab = "project";
    if (next.dashboardTab == null) next.dashboardTab = "tasks";
  }
  return next;
}

export default function ProjectsHubWidget({ liveData, openWorkspaceWidget }: Props) {
  const [projectId, setProjectId] = useState<string | undefined>(
    typeof liveData?.projectId === "string" ? liveData.projectId : undefined,
  );
  const [projectName, setProjectName] = useState<string | undefined>(
    typeof liveData?.name === "string" ? liveData.name : undefined,
  );
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);

  const reloadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const res = await fetch("/api/projects", { credentials: "include" });
      const data = (await res.json()) as { projects?: ProjectListItem[] };
      const list = Array.isArray(data?.projects) ? data.projects : [];
      setProjects(list);
      return list;
    } catch {
      setProjects([]);
      return [];
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof liveData?.projectId === "string") {
      setProjectId(liveData.projectId);
      setProjectName(typeof liveData?.name === "string" ? liveData.name : undefined);
    }
  }, [liveData?.projectId, liveData?.name]);

  useEffect(() => {
    if (liveData?.action === "create") setAddProjectOpen(true);
  }, [liveData?.action]);

  useEffect(() => {
    void reloadProjects();
  }, [reloadProjects]);

  const applyView = useCallback((view: WidgetViewState) => {
    const normalized = normalizeProjectsView(view);
    if (typeof normalized.projectId === "string" && normalized.projectId.trim()) {
      setProjectId(normalized.projectId);
      setProjectName(typeof normalized.name === "string" ? normalized.name : undefined);
    }
  }, []);

  const { pushView } = useSyncedWidgetNavigation(applyView);

  const selectProject = useCallback(
    (id: string, nameOverride?: string) => {
      const picked = projects.find((p) => p.id === id);
      const name = nameOverride ?? picked?.name;
      setProjectId(id);
      setProjectName(name);
      pushView({ tab: "project", projectId: id, name: name ?? null, dashboardTab: "overview" });
    },
    [projects, pushView],
  );

  const handleProjectCreated = useCallback(
    (created: { id: string; name: string }) => {
      setProjects((prev) => {
        if (prev.some((p) => p.id === created.id)) return prev;
        return [{ id: created.id, name: created.name, isActive: true }, ...prev];
      });
      selectProject(created.id, created.name);
      void reloadProjects();
    },
    [selectProject, reloadProjects],
  );

  if (projectId) {
    return (
      <>
        <AddProjectDialog
          open={addProjectOpen}
          onClose={() => setAddProjectOpen(false)}
          onCreated={handleProjectCreated}
        />
        <ProjectWidget
          projectId={projectId}
          projectName={projectName}
          openWorkspaceWidget={openWorkspaceWidget}
        />
      </>
    );
  }

  return (
    <>
      <AddProjectDialog
        open={addProjectOpen}
        onClose={() => setAddProjectOpen(false)}
        onCreated={handleProjectCreated}
      />
      <ProjectPickerPanel
        projects={projects}
        loading={projectsLoading}
        onSelect={selectProject}
        titleKey="workspaceWidgets.hubs.projects.pickerTitle"
        descKey="workspaceWidgets.hubs.projects.pickerDesc"
        loadingKey="workspaceWidgets.projectPicker.loading"
        emptyKey="workspaceWidgets.projectPicker.empty"
        openCrmKey={openWorkspaceWidget ? "workspaceWidgets.hubs.projects.openCrm" : undefined}
        onOpenCrm={openWorkspaceWidget ? () => openWorkspaceWidget("crmTable", null) : undefined}
        onAddProject={() => setAddProjectOpen(true)}
      />
    </>
  );
}
