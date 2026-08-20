"use client";

import React, { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useI18n } from "@/components/os/system/I18nProvider";
import { FileStack, Upload } from "lucide-react";
import { getProjectSubDomainsForIndustry, type ProjectSubDomainId } from "@/lib/project-sub-domains";
import ProjectDocumentGeneratorModal from "@/components/os/widgets/project/ProjectDocumentGeneratorModal";
import WidgetSplitPanels from "@/components/os/layout/WidgetSplitPanels";
import { OsButton } from "@/components/os/ui";
import type { ProjectSchedulePanelProps } from "./schedule-panel/types";
import { useScheduleData } from "./schedule-panel/useScheduleData";
import { ScheduleDomainSidebar } from "./schedule-panel/ScheduleDomainSidebar";

const ProjectGanttChart = dynamic(
  () => import("@/components/os/widgets/project/ProjectGanttChart"),
  { ssr: false, loading: () => null },
);

export default function ProjectSchedulePanel({
  projectId,
  projectName,
  clientName,
  primaryContactId,
  apiBase,
  tasks: rawTasks,
  labels,
  onRefresh,
  openWorkspaceWidget,
  onOpenBoq,
  onOpenDiary,
  organizationIndustry,
  hideConstructionFeatures = false,
}: ProjectSchedulePanelProps) {
  const { t } = useI18n();

  const projectSubDomains = useMemo(
    () => getProjectSubDomainsForIndustry(organizationIndustry),
    [organizationIndustry],
  );

  const [selectedDomain, setSelectedDomain] = useState<ProjectSubDomainId | "ALL">("ALL");
  const [docPickerDomain, setDocPickerDomain] = useState<ProjectSubDomainId | null>(null);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    boqLines,
    ganttTasks,
    counts,
    getFilteredTasks,
    onImportFile,
    saveTask,
    deleteTask,
    clearAllTasks,
    openDoc,
    createDiaryForTask,
    onProgressChange,
    updateTaskDates,
  } = useScheduleData({
    projectId,
    projectName,
    clientName,
    primaryContactId,
    apiBase,
    rawTasks,
    labels,
    onRefresh,
    hideConstructionFeatures,
    organizationIndustry,
    openWorkspaceWidget,
    onOpenDiary,
  });

  const filteredTasks = useMemo(
    () => getFilteredTasks(selectedDomain),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ganttTasks, selectedDomain],
  );

  const sidebar = (
    <ScheduleDomainSidebar
      ganttTaskCount={ganttTasks.length}
      selectedDomain={selectedDomain}
      docPickerDomain={docPickerDomain}
      counts={counts}
      projectSubDomains={projectSubDomains}
      hasDocWidget={!!openWorkspaceWidget}
      labels={labels}
      onSelectDomain={setSelectedDomain}
      onToggleDocPicker={(id) => setDocPickerDomain(docPickerDomain === id ? null : id)}
      onOpenDoc={(docType, domain) => openDoc(docType, domain, setDocPickerDomain)}
    />
  );

  const main = (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-1">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-elevated)]/30 px-3 py-2">
        <input
          ref={fileRef}
          type="file"
          accept=".xml,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportFile(f);
            e.target.value = "";
          }}
        />
        <OsButton
          variant="primary"
          size="sm"
          className="bg-amber-600/90 hover:bg-amber-500"
          icon={<Upload size={14} aria-hidden />}
          onClick={() => fileRef.current?.click()}
        >
          {labels.importSchedule}
        </OsButton>
        {openWorkspaceWidget ? (
          <OsButton
            variant="secondary"
            size="sm"
            className="border-amber-500/40 bg-amber-500/10 text-amber-100"
            icon={<FileStack size={14} aria-hidden />}
            onClick={() => setDocModalOpen(true)}
          >
            {labels.docGeneratorTitle}
          </OsButton>
        ) : null}
        <p className="text-[10px] text-[color:var(--foreground-muted)]">XML / CSV (MS Project)</p>
        {selectedDomain !== "ALL" ? (
          <span className="ms-auto rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-700 dark:text-indigo-200">
            {labels.domainCount.replace(
              "{label}",
              projectSubDomains.find((d) => d.id === selectedDomain)?.labelHe ?? "",
            )}{" "}
            · {filteredTasks.length}
          </span>
        ) : null}
      </div>

      <ProjectGanttChart
        tasks={filteredTasks}
        allTasks={ganttTasks}
        boqLines={boqLines}
        labels={labels}
        onProgressChange={onProgressChange}
        onDatesChange={(taskId, startDate, endDate) => updateTaskDates(taskId, startDate, endDate)}
        onSaveTask={saveTask}
        onDeleteTask={deleteTask}
        onClearAll={clearAllTasks}
        onCreateDiary={hideConstructionFeatures ? undefined : createDiaryForTask}
        onOpenDiary={
          hideConstructionFeatures
            ? undefined
            : (task) =>
                onOpenDiary?.({
                  taskId: task.id,
                  description: task.linkedWorkDiaryId ? task.title : task.title,
                })
        }
        organizationIndustry={organizationIndustry}
        hideConstructionFeatures={hideConstructionFeatures}
      />
    </div>
  );

  return (
    <>
      <div className="min-h-[360px] md:hidden">{main}</div>
      <div className="hidden min-h-[360px] md:flex md:flex-1">
        <WidgetSplitPanels
          className="min-h-[360px] flex-1"
          panels={[
            {
              id: "schedule-domains",
              defaultSize: 18,
              minSize: 14,
              className:
                "flex min-h-0 min-w-0 flex-col border-e border-[color:var(--border-main)] bg-[color:var(--background-main)]/40",
              children: (
                <>
                  <div className="border-b border-[color:var(--border-main)] px-2 py-1.5 text-[10px] font-bold text-[color:var(--foreground-muted)]">
                    {t("projectDashboard.subTrades")}
                  </div>
                  {sidebar}
                </>
              ),
            },
            {
              id: "schedule-gantt",
              defaultSize: 82,
              minSize: 50,
              className: "flex min-h-0 min-w-0 flex-col",
              children: main,
            },
          ]}
        />
      </div>

      <ProjectDocumentGeneratorModal
        open={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        projectId={projectId}
        projectName={projectName}
        contactId={primaryContactId}
        contactName={clientName}
        initialDomain={selectedDomain === "ALL" ? "ALL" : selectedDomain}
        boqLines={boqLines}
        title={labels.docGeneratorTitle}
        openWorkspaceWidget={openWorkspaceWidget}
        onOpenBoq={onOpenBoq}
        onOpenDiary={onOpenDiary}
        organizationIndustry={organizationIndustry}
      />
    </>
  );
}
