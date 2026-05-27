"use client";

import React from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import ProjectPickerPanel from "@/components/os/widgets/shared/ProjectPickerPanel";
import ProjectSchedulePanel from "@/components/os/widgets/project/ProjectSchedulePanel";
import WidgetState from "@/components/os/WidgetState";
import type { ProjectDashboardWidgetProps } from "./project-dashboard/types";
import { buildGanttLabels } from "./project-dashboard/utils";
import { FinancialTab } from "./project-dashboard/FinancialTab";
import { DiaryTab } from "./project-dashboard/DiaryTab";
import { SettingsTab } from "./project-dashboard/SettingsTab";
import { DashboardHeader } from "./project-dashboard/DashboardHeader";
import { useProjectDashboard } from "./project-dashboard/useProjectDashboard";

const NotebookLMWidget = dynamic(() => import("@/components/os/widgets/NotebookLMWidget"), {
  loading: () => (
    <div className="flex h-40 items-center justify-center text-xs text-[color:var(--foreground-muted)]">
      …
    </div>
  ),
});

export type { ProjectDashboardWidgetProps };

export default function ProjectDashboardWidget({
  projectId,
  projectName,
  openWorkspaceWidget,
}: ProjectDashboardWidgetProps) {
  const s = useProjectDashboard({ projectId, projectName, openWorkspaceWidget });
  const {
    t, dir,
    data, loading, resolvedId,
    projectsList, projectsListLoading,
    activeTab, setActiveTab,
    pushEnabled, uploadingBlueprint,
    fileRef,
    diaryInitialDesc, setDiaryInitialDesc,
    diaryInitialTaskId, setDiaryInitialTaskId,
    showProjectPicker, isCompanyMgmt, industryId,
    tabs,
    selectProject, refresh, clearProjectSelection, resetWorkspace, togglePush, onBlueprintFile,
  } = s;

  if (showProjectPicker) {
    return (
      <ProjectPickerPanel
        projects={projectsList}
        loading={projectsListLoading}
        onSelect={selectProject}
        titleKey="projectDashboard.pickProjectTitle"
        descKey="projectDashboard.pickProjectDesc"
        loadingKey="projectDashboard.pickProjectLoading"
        emptyKey="projectDashboard.noProjects"
        openCrmKey={openWorkspaceWidget ? "projectDashboard.openCrm" : undefined}
        onOpenCrm={openWorkspaceWidget ? () => openWorkspaceWidget("crmTable", null) : undefined}
        statusActiveKey="projectDashboard.statusActive"
        statusInactiveKey="projectDashboard.statusInactive"
      />
    );
  }

  if (!data && !showProjectPicker && (loading || Boolean(resolvedId || projectId || projectName))) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center" dir={dir}>
        <Loader2 className="animate-spin text-amber-500" aria-hidden />
      </div>
    );
  }

  if (!data) {
    return (
      <WidgetState
        variant="empty"
        message={`${t("projectDashboard.emptyTitle")} — ${t("projectDashboard.emptyDesc")}`}
        action={
          <button
            type="button"
            onClick={clearProjectSelection}
            className="rounded-lg border border-[color:var(--border-main)] px-4 py-2 text-xs font-bold hover:bg-[color:var(--surface-elevated)]"
          >
            {t("projectDashboard.pickProjectTitle")}
          </button>
        }
      />
    );
  }

  const apiBase = `/api/projects/${encodeURIComponent(resolvedId)}`;

  return (
    <div
      className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col text-[color:var(--foreground-main)]"
      dir={dir}
    >
      <DashboardHeader
        t={t}
        data={data}
        resolvedId={resolvedId}
        isCompanyMgmt={isCompanyMgmt}
        pushEnabled={pushEnabled}
        uploadingBlueprint={uploadingBlueprint}
        fileRef={fileRef}
        activeTab={activeTab}
        tabs={tabs}
        setActiveTab={setActiveTab}
        clearProjectSelection={clearProjectSelection}
        resetWorkspace={resetWorkspace}
        togglePush={togglePush}
        onBlueprintFile={onBlueprintFile}
        openWorkspaceWidget={openWorkspaceWidget}
      />

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3">
        {activeTab === "financial" && (
          <FinancialTab
            data={data}
            apiBase={apiBase}
            isCompanyMgmt={isCompanyMgmt}
            refresh={refresh}
            t={t}
          />
        )}
        {activeTab === "diary" && (
          <DiaryTab
            data={data}
            apiBase={apiBase}
            refresh={refresh}
            t={t}
            initialDesc={diaryInitialDesc}
            initialTaskId={diaryInitialTaskId}
          />
        )}
        {activeTab === "gantt" && (
          <ProjectSchedulePanel
            projectId={resolvedId}
            projectName={data.name}
            clientName={data.client}
            primaryContactId={data.primaryContactId}
            apiBase={apiBase}
            tasks={data.tasks}
            organizationIndustry={industryId}
            hideConstructionFeatures={isCompanyMgmt}
            onRefresh={refresh}
            openWorkspaceWidget={openWorkspaceWidget}
            onOpenBoq={isCompanyMgmt ? undefined : () => setActiveTab("financial")}
            onOpenDiary={
              isCompanyMgmt
                ? undefined
                : (opts) => {
                    setActiveTab("diary");
                    if (opts?.description) setDiaryInitialDesc(opts.description);
                    if (opts?.taskId) setDiaryInitialTaskId(opts.taskId);
                  }
            }
            labels={buildGanttLabels(t)}
          />
        )}
        {activeTab === "settings" && (
          <SettingsTab data={data} resolvedId={resolvedId} refresh={refresh} t={t} />
        )}
        {activeTab === "ai" && (
          <div className="h-[min(520px,60vh)] min-h-[280px]">
            <NotebookLMWidget liveData={{ projectId: resolvedId, name: data.name }} />
          </div>
        )}
      </div>
    </div>
  );
}
