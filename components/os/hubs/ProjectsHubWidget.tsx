"use client";

import { useCallback, useEffect, useState } from "react";
import ProjectWidget from "@/components/os/ProjectWidget";
import ProjectBoardWidget from "@/components/os/widgets/ProjectBoardWidget";
import AddProjectDialog from "@/components/os/widgets/shared/AddProjectDialog";
import ProjectPickerPanel from "@/components/os/widgets/shared/ProjectPickerPanel";
import WidgetHubShell, { type HubTabDef } from "@/components/os/hubs/WidgetHubShell";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetType } from "@/hooks/use-window-manager";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";

const TABS: HubTabDef[] = [
  { id: "board", labelKey: "workspaceWidgets.hubs.projects.tabs.board" },
  { id: "project", labelKey: "workspaceWidgets.hubs.projects.tabs.project" },
];

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

export default function ProjectsHubWidget({ liveData, openWorkspaceWidget }: Props) {
  const { t } = useI18n();
  const initialTab =
    typeof liveData?.tab === "string" && TABS.some((tab) => tab.id === liveData.tab)
      ? (liveData.tab as string)
      : "board";
  const [activeTab, setActiveTab] = useState(initialTab);

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
    void reloadProjects();
  }, [reloadProjects]);

  const applyView = useCallback((view: WidgetViewState) => {
    const tab = view.tab;
    if (typeof tab === "string" && TABS.some((row) => row.id === tab)) {
      setActiveTab(tab);
    }
    if (typeof view.projectId === "string") {
      setProjectId(view.projectId);
      setProjectName(typeof view.name === "string" ? view.name : undefined);
    }
  }, []);

  const { pushView } = useSyncedWidgetNavigation(applyView);

  const handleTabChange = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      pushView({
        tab: tabId,
        projectId: projectId ?? null,
        name: projectName ?? null,
      });
    },
    [pushView, projectId, projectName],
  );

  const selectProject = useCallback(
    (id: string, nameOverride?: string) => {
      const picked = projects.find((p) => p.id === id);
      const name = nameOverride ?? picked?.name;
      setProjectId(id);
      setProjectName(name);
      setActiveTab("project");
      pushView({ tab: "project", projectId: id, name: name ?? null });
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

  return (
    <>
    <AddProjectDialog
      open={addProjectOpen}
      onClose={() => setAddProjectOpen(false)}
      onCreated={handleProjectCreated}
    />
    <WidgetHubShell
      tabs={projectId ? [] : TABS}
      initialTab={projectId ? undefined : activeTab}
      onTabChange={handleTabChange}
      tabCountLabel={t("workspaceWidgets.hubs.tabCount", { count: String(TABS.length) })}
      renderTab={(tabId) => {
        if (projectId) {
          return (
            <ProjectWidget
              projectId={projectId}
              projectName={projectName}
              openWorkspaceWidget={openWorkspaceWidget}
            />
          );
        }
        if (tabId === "board") {
          return (
            <ProjectBoardWidget
              projectId={typeof liveData?.projectId === "string" ? liveData.projectId : undefined}
              openWorkspaceWidget={openWorkspaceWidget}
            />
          );
        }
        if (!projectId) {
          return (
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
          );
        }
        return (
          <ProjectWidget
            projectId={projectId}
            projectName={projectName}
            openWorkspaceWidget={openWorkspaceWidget}
          />
        );
      }}
    />
    </>
  );
}
