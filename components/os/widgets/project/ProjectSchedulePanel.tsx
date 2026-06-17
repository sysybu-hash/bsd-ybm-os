"use client";

import React, { useMemo, useRef, useState } from "react";
import { FileStack, Upload } from "lucide-react";
import { getProjectSubDomainsForIndustry, type ProjectSubDomainId } from "@/lib/project-sub-domains";
import ProjectGanttChart from "@/components/os/widgets/project/ProjectGanttChart";
import ProjectDocumentGeneratorModal from "@/components/os/widgets/project/ProjectDocumentGeneratorModal";
import WidgetSplitPanels from "@/components/os/layout/WidgetSplitPanels";
import type { ProjectSchedulePanelProps } from "./schedule-panel/types";
import { useScheduleData } from "./schedule-panel/useScheduleData";
import { ScheduleDomainSidebar } from "./schedule-panel/ScheduleDomainSidebar";

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
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg bg-amber-600/90 px-2.5 py-1.5 text-xs font-medium text-white"
        >
          <Upload size={14} />
          {labels.importSchedule}
        </button>
        {openWorkspaceWidget ? (
          <button
            type="button"
            onClick={() => setDocModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-100"
          >
            <FileStack size={14} />
            {labels.docGeneratorTitle}
          </button>
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
                    תתי תחומים
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
