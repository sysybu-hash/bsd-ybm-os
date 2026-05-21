"use client";



import React, { useEffect, useMemo, useRef, useState } from "react";

import { ChevronDown, ChevronLeft, FileOutput, FileStack, Upload } from "lucide-react";

import type { WidgetType } from "@/hooks/use-window-manager";

import type { DocType } from "@prisma/client";

import ProjectGanttChart, {

  type GanttTask,

  type GanttTaskDraft,

} from "@/components/os/widgets/project/ProjectGanttChart";

import ProjectDocumentGeneratorModal from "@/components/os/widgets/project/ProjectDocumentGeneratorModal";

import WidgetSplitPanels from "@/components/os/layout/WidgetSplitPanels";

import {

  getProjectSubDomainsForIndustry,

  type ProjectSubDomain,

  type ProjectSubDomainId,

} from "@/lib/project-sub-domains";

import {

  buildDocumentCreatorLiveData,

  type BoqLinePrefill,

} from "@/lib/project-document-catalog";

import { resolveTaskTradeId } from "@/lib/project-task-trade";

import { toast } from "sonner";



type ScheduleTaskRow = {

  id: string;

  title: string;

  startDate: string | null;

  endDate: string | null;

  progress: number;

  dependencies: string | null;

  description?: string | null;

  linkedBoqLineId?: string | null;

  linkedWorkDiaryId?: string | null;

};



type Props = {

  projectId: string;

  projectName: string;

  clientName: string | null;

  primaryContactId?: string | null;

  apiBase: string;

  tasks: ScheduleTaskRow[];

  labels: {

    importSchedule: string;

    importConfirm: string;

    importSuccess: string;

    importFailed: string;

    allDomains: string;

    generateDoc: string;

    docGeneratorTitle: string;

    domainCount: string;

    task: string;

    start: string;

    end: string;

    progress: string;

    noTasks: string;

    listView: string;

    chartView: string;

    addTask: string;

    editTask: string;

    save: string;

    cancel: string;

    delete: string;

    deleteConfirm: string;

    scaleWeeks: string;

    scaleMonths: string;

    trade: string;

    dependencies: string;

    linkedBoq: string;

    workDiary: string;

    createDiary: string;

    newTaskTitle: string;

    taskSaved: string;

    taskDeleted: string;

    taskSaveFailed: string;

    ganttLegend: string;

    ganttToday: string;

    ganttProgress: string;

    ganttDependency: string;

  };

  onRefresh: () => Promise<void>;

  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;

  onOpenBoq?: () => void;

  onOpenDiary?: (opts?: { taskId?: string; description?: string }) => void;

  organizationIndustry?: string | null;

  hideConstructionFeatures?: boolean;

};



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

}: Props) {

  const projectSubDomains = useMemo(

    () => getProjectSubDomainsForIndustry(organizationIndustry),

    [organizationIndustry],

  );

  const [selectedDomain, setSelectedDomain] = useState<ProjectSubDomainId | "ALL">("ALL");

  const [docPickerDomain, setDocPickerDomain] = useState<ProjectSubDomainId | null>(null);

  const [docModalOpen, setDocModalOpen] = useState(false);

  const [boqLines, setBoqLines] = useState<BoqLinePrefill[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);



  useEffect(() => {

    if (hideConstructionFeatures) {

      setBoqLines([]);

      return;

    }

    let cancelled = false;

    void (async () => {

      try {

        const res = await fetch(`${apiBase}/boq`, { credentials: "include" });

        if (!res.ok) return;

        const json = (await res.json()) as {

          lines?: Array<{

            id: string;

            description: string;

            quantity?: number | null;

            unit?: string | null;

            unitPrice?: number | null;

            lineTotal?: number;

            isSectionSubtotal?: boolean;

          }>;

        };

        if (cancelled) return;

        setBoqLines(

          (json.lines ?? [])

            .filter((l) => !l.isSectionSubtotal)

            .map((l) => ({

              id: l.id,

              description: l.description,

              quantity: l.quantity,

              unit: l.unit,

              unitPrice: l.unitPrice,

              lineTotal: l.lineTotal,

            })),

        );

      } catch {

        /* optional */

      }

    })();

    return () => {

      cancelled = true;

    };

  }, [apiBase, hideConstructionFeatures]);



  const boqById = useMemo(() => new Map(boqLines.map((l) => [l.id, l])), [boqLines]);



  const ganttTasks: GanttTask[] = useMemo(

    () =>

      rawTasks.map((t) => ({

        id: t.id,

        title: t.title,

        startDate: t.startDate,

        endDate: t.endDate,

        progress: t.progress,

        dependencies: t.dependencies,

        tradeId: resolveTaskTradeId(t.description ?? null, t.title),

        linkedBoqLineId: t.linkedBoqLineId ?? null,

        linkedBoqLabel: t.linkedBoqLineId

          ? boqById.get(t.linkedBoqLineId)?.description?.slice(0, 40) ?? t.linkedBoqLineId

          : null,

        linkedWorkDiaryId: t.linkedWorkDiaryId ?? null,

      })),

    [rawTasks, boqById],

  );



  const counts = useMemo(() => {

    const map = new Map<ProjectSubDomainId, number>();

    for (const t of ganttTasks) {

      const id = t.tradeId ?? "GENERAL";

      map.set(id, (map.get(id) ?? 0) + 1);

    }

    return map;

  }, [ganttTasks]);



  const filteredTasks = useMemo(() => {

    if (selectedDomain === "ALL") return ganttTasks;

    return ganttTasks.filter((t) => (t.tradeId ?? "GENERAL") === selectedDomain);

  }, [ganttTasks, selectedDomain]);



  const onImportFile = async (file: File) => {

    const fd = new FormData();

    fd.append("file", file);

    const prev = await fetch(`${apiBase}/import/schedule`, {

      method: "POST",

      credentials: "include",

      body: fd,

    });

    const pj = await prev.json();

    if (!prev.ok) {

      toast.error(pj.error ?? labels.importFailed);

      return;

    }

    if (!confirm(labels.importConfirm.replace("{count}", String(pj.taskCount ?? 0)))) return;

    fd.append("confirm", "true");

    const res = await fetch(`${apiBase}/import/schedule`, {

      method: "POST",

      credentials: "include",

      body: fd,

    });

    const json = await res.json();

    if (!res.ok) {

      toast.error(json.error ?? labels.importFailed);

      return;

    }

    toast.success(labels.importSuccess.replace("{count}", String(json.imported ?? 0)));

    await onRefresh();

  };



  const saveTask = async (draft: GanttTaskDraft, taskId?: string) => {

    const payload = {

      title: draft.title.trim(),

      startDate: draft.startDate || undefined,

      endDate: draft.endDate || undefined,

      progress: draft.progress,

      tradeId: draft.tradeId || null,

      dependencies: draft.dependencies,

      linkedBoqLineId: draft.linkedBoqLineId || null,

    };

    const res = await fetch(`${apiBase}/tasks`, {

      method: taskId ? "PATCH" : "POST",

      credentials: "include",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify(taskId ? { id: taskId, ...payload } : payload),

    });

    const json = await res.json();

    if (!res.ok) {

      toast.error(json.error ?? labels.taskSaveFailed);

      throw new Error("save failed");

    }

    toast.success(labels.taskSaved);

    await onRefresh();

  };



  const deleteTask = async (taskId: string) => {

    const res = await fetch(`${apiBase}/tasks?id=${encodeURIComponent(taskId)}`, {

      method: "DELETE",

      credentials: "include",

    });

    const json = await res.json();

    if (!res.ok) {

      toast.error(json.error ?? labels.taskSaveFailed);

      return;

    }

    toast.success(labels.taskDeleted);

    await onRefresh();

  };



  const openDoc = (docType: DocType, domain: ProjectSubDomain) => {

    if (!openWorkspaceWidget) return;

    const entry = buildDocumentCreatorLiveData({

      projectId,

      projectName,

      contactId: primaryContactId,

      contactName: clientName ?? undefined,

      entry: {

        id: docType.toLowerCase(),

        labelHe: domain.docShortcuts.find((s) => s.docType === docType)?.labelHe ?? docType,

        docType,

        subDomains: "ALL",

        color: "indigo",

      },

      domainLabel: domain.labelHe,

      boqLines,

    });

    openWorkspaceWidget("docCreator", entry);

    setDocPickerDomain(null);

  };



  const createDiaryForTask = async (task: GanttTask) => {

    const res = await fetch(`${apiBase}/work-diaries`, {

      method: "POST",

      credentials: "include",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({

        description: `${task.title} — יומן עבודה`,

        progress: task.progress,

        linkedTaskId: task.id,

        linkedBoqLineId: task.linkedBoqLineId ?? undefined,

      }),

    });

    if (!res.ok) {

      toast.error(labels.taskSaveFailed);

      return;

    }

    toast.success(labels.taskSaved);

    await onRefresh();

    onOpenDiary?.({ taskId: task.id, description: task.title });

  };



  const onProgressChange = async (taskId: string, progress: number) => {

    await fetch(`${apiBase}/tasks/schedule`, {

      method: "PATCH",

      credentials: "include",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ tasks: [{ id: taskId, progress }] }),

    });

    await onRefresh();

  };



  const sidebar = (

    <nav className="flex h-full min-h-0 flex-col gap-0.5 overflow-y-auto p-1 text-xs">

      <button

        type="button"

        onClick={() => setSelectedDomain("ALL")}

        className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-start ${

          selectedDomain === "ALL"

            ? "bg-amber-500/20 text-amber-100"

            : "hover:bg-[color:var(--surface-elevated)]"

        }`}

      >

        <span>{labels.allDomains}</span>

        <span className="text-[10px] text-[color:var(--foreground-muted)]">{ganttTasks.length}</span>

      </button>

      {projectSubDomains.map((domain) => {

        const Icon = domain.icon;

        const count = counts.get(domain.id) ?? 0;

        const active = selectedDomain === domain.id;

        return (

          <div key={domain.id} className="space-y-0.5">

            <button

              type="button"

              onClick={() => setSelectedDomain(domain.id)}

              className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-start ${

                active ? "bg-indigo-500/20 text-indigo-100" : "hover:bg-[color:var(--surface-elevated)]"

              }`}

            >

              <Icon size={13} className="shrink-0 opacity-80" />

              <span className="min-w-0 flex-1 truncate">{domain.labelHe}</span>

              <span className="text-[10px] text-[color:var(--foreground-muted)]">{count}</span>

            </button>

            {active && openWorkspaceWidget && domain.docShortcuts.length > 0 ? (

              <div className="me-2 flex flex-col gap-0.5 border-e border-[color:var(--border-main)]/50 pe-2">

                <button

                  type="button"

                  className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-amber-200/90 hover:bg-amber-500/10"

                  onClick={() =>

                    setDocPickerDomain(docPickerDomain === domain.id ? null : domain.id)

                  }

                >

                  <FileOutput size={10} />

                  {labels.generateDoc}

                </button>

                {docPickerDomain === domain.id

                  ? domain.docShortcuts.map((shortcut) => (

                      <button

                        key={shortcut.docType}

                        type="button"

                        className="rounded px-2 py-0.5 text-start text-[10px] hover:bg-[color:var(--surface-elevated)]"

                        onClick={() => openDoc(shortcut.docType, domain)}

                      >

                        {shortcut.labelHe}

                      </button>

                    ))

                  : null}

              </div>

            ) : null}

          </div>

        );

      })}

    </nav>

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

          <span className="ms-auto rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-200">

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

        onSaveTask={saveTask}

        onDeleteTask={deleteTask}

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

