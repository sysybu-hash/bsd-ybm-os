"use client";

import { useCallback, useEffect, useState } from "react";
import ProjectWidget from "@/components/os/ProjectWidget";
import ProjectBoardWidget from "@/components/os/widgets/ProjectBoardWidget";
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

  useEffect(() => {
    if (typeof liveData?.projectId === "string") {
      setProjectId(liveData.projectId);
      setProjectName(typeof liveData?.name === "string" ? liveData.name : undefined);
    }
  }, [liveData?.projectId, liveData?.name]);

  useEffect(() => {
    let cancelled = false;
    setProjectsLoading(true);
    void fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { projects?: ProjectListItem[] } | null) => {
        if (cancelled) return;
        const list = data?.projects;
        setProjects(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    (id: string) => {
      const picked = projects.find((p) => p.id === id);
      setProjectId(id);
      setProjectName(picked?.name);
      setActiveTab("project");
      pushView({ tab: "project", projectId: id, name: picked?.name ?? null });
    },
    [projects, pushView],
  );

  return (
    <WidgetHubShell
      tabs={TABS}
      initialTab={activeTab}
      onTabChange={handleTabChange}
      tabCountLabel={t("workspaceWidgets.hubs.tabCount", { count: String(TABS.length) })}
      renderTab={(tabId) => {
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
  );
}
