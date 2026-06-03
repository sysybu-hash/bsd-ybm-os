"use client";

import { useEffect, useMemo, useState } from "react";
import type { DocType } from "@prisma/client";
import type { WidgetType } from "@/hooks/use-window-manager";
import {
  buildDocumentCreatorLiveData,
  type BoqLinePrefill,
} from "@/lib/project-document-catalog";
import { resolveTaskTradeId } from "@/lib/project-task-trade";
import { type ProjectSubDomain, type ProjectSubDomainId } from "@/lib/project-sub-domains";
import { toast } from "sonner";
import type { GanttTask, GanttTaskDraft } from "@/components/os/widgets/project/ProjectGanttChart";
import type { ScheduleTaskRow, ScheduleLabels } from "./types";

type UseScheduleDataParams = {
  projectId: string;
  projectName: string;
  clientName: string | null;
  primaryContactId?: string | null;
  apiBase: string;
  rawTasks: ScheduleTaskRow[];
  labels: ScheduleLabels;
  onRefresh: () => Promise<void>;
  hideConstructionFeatures: boolean;
  organizationIndustry?: string | null;
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  onOpenDiary?: (opts?: { taskId?: string; description?: string }) => void;
};

export function useScheduleData({
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
}: UseScheduleDataParams) {
  const [boqLines, setBoqLines] = useState<BoqLinePrefill[]>([]);

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
    return () => { cancelled = true; };
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
        tradeId: resolveTaskTradeId(t.description ?? null, t.title, organizationIndustry),
        linkedBoqLineId: t.linkedBoqLineId ?? null,
        linkedBoqLabel: t.linkedBoqLineId
          ? boqById.get(t.linkedBoqLineId)?.description?.slice(0, 40) ?? t.linkedBoqLineId
          : null,
        linkedWorkDiaryId: t.linkedWorkDiaryId ?? null,
        parentTaskId: t.parentTaskId ?? null,
        status: t.status ?? null,
      })),
    [rawTasks, boqById, organizationIndustry],
  );

  const counts = useMemo(() => {
    const map = new Map<ProjectSubDomainId, number>();
    for (const t of ganttTasks) {
      const id = t.tradeId ?? "GENERAL";
      map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }, [ganttTasks]);

  const getFilteredTasks = (selectedDomain: ProjectSubDomainId | "ALL") => {
    if (selectedDomain === "ALL") return ganttTasks;
    return ganttTasks.filter((t) => (t.tradeId ?? "GENERAL") === selectedDomain);
  };

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

  const openDoc = (
    docType: DocType,
    domain: ProjectSubDomain,
    setDocPickerDomain: (v: ProjectSubDomainId | null) => void,
  ) => {
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

  return {
    boqLines,
    ganttTasks,
    counts,
    getFilteredTasks,
    onImportFile,
    saveTask,
    deleteTask,
    openDoc,
    createDiaryForTask,
    onProgressChange,
  };
}
