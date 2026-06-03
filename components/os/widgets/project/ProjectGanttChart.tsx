"use client";

import React, { useMemo, useState } from "react";
import { Link2, ListTree, Plus } from "lucide-react";
import { getProjectSubDomainsForIndustry } from "@/lib/project-sub-domains";
import { GanttTaskForm } from "./gantt/GanttTaskForm";
import { GanttChartView } from "./gantt/GanttChartView";
import { GanttTableView } from "./gantt/GanttTableView";
import { buildTicks, draftFromTask, emptyDraft, autoScale } from "./gantt/utils";
import type { GanttProps, GanttTask, GanttTaskDraft, Scale } from "./gantt/types";

// Re-export types for external consumers
export type { GanttTask, GanttTaskDraft } from "./gantt/types";

type View = "chart" | "table";

export default function ProjectGanttChart({
  tasks,
  allTasks,
  boqLines = [],
  onProgressChange,
  onSaveTask,
  onDeleteTask,
  onCreateDiary,
  onOpenDiary,
  labels,
  organizationIndustry,
  hideConstructionFeatures = false,
}: GanttProps) {
  const projectSubDomains = useMemo(() => getProjectSubDomainsForIndustry(organizationIndustry), [organizationIndustry]);
  const [view, setView] = useState<View>("chart");
  const [scale, setScale] = useState<Scale>(() => {
    if (tasks.length === 0) return "weeks";
    let min = Infinity, max = -Infinity;
    for (const t of tasks) {
      const s = new Date(t.startDate ?? "").getTime() || Date.now();
      const e = new Date(t.endDate ?? "").getTime() || s + 7 * 86400000;
      min = Math.min(min, s); max = Math.max(max, e);
    }
    return autoScale(max - min);
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GanttTaskDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const range = useMemo(() => {
    if (tasks.length === 0) { const now = Date.now(); return { min: now, max: now + 14 * 86400000 }; }
    let min = Infinity, max = -Infinity;
    for (const t of tasks) {
      const s = new Date(t.startDate ?? "").getTime() || Date.now();
      const e = new Date(t.endDate ?? "").getTime() || s + 7 * 86400000;
      min = Math.min(min, s); max = Math.max(max, e);
    }
    const pad = (max - min) * 0.05 || 86400000;
    if (max <= min) max = min + 86400000;
    return { min: min - pad, max: max + pad };
  }, [tasks]);

  const span = range.max - range.min || 1;
  const ticks = useMemo(() => buildTicks(range.min, range.max, scale), [range.min, range.max, scale]);
  const todayLeft = ((Date.now() - range.min) / span) * 100;
  const linkTasks = allTasks ?? tasks;
  const taskById = useMemo(() => new Map(linkTasks.map((t) => [t.id, t])), [linkTasks]);

  const openCreate = () => { setEditingId(null); setDraft(emptyDraft()); };
  const openEdit = (task: GanttTask) => { setEditingId(task.id); setDraft(draftFromTask(task)); };
  const closeForm = () => { setEditingId(null); setDraft(null); };

  const submitForm = async () => {
    if (!draft?.title.trim()) return;
    setSaving(true);
    try { await onSaveTask(draft, editingId ?? undefined); closeForm(); }
    finally { setSaving(false); }
  };

  if (tasks.length === 0 && draft == null) {
    return (
      <div className="space-y-3">
        <p className="py-4 text-center text-xs text-[color:var(--foreground-muted)]">{labels.noTasks}</p>
        <button type="button" onClick={openCreate}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-amber-500/40 py-2 text-xs text-amber-200">
          <Plus size={14} />{labels.addTask}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[color:var(--border-main)]/60 bg-[color:var(--surface-elevated)]/40 px-2 py-1.5 text-[9px] text-[color:var(--foreground-muted)]">
        <span className="font-semibold text-[color:var(--foreground)]">{labels.ganttLegend ?? "מקרא"}</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-6 rounded bg-gradient-to-r from-indigo-600 to-violet-600" />{labels.ganttProgress ?? "התקדמות"}</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-px bg-rose-400" />{labels.ganttToday ?? "היום"}</span>
        <span className="inline-flex items-center gap-1"><Link2 size={10} />{labels.ganttDependency ?? "תלות"}</span>
        <span className="inline-flex items-center gap-1"><ListTree size={10} />BOQ</span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button type="button" onClick={() => setView("chart")}
          className={`rounded px-2 py-1 ${view === "chart" ? "bg-amber-500/20 text-amber-100" : "border border-[color:var(--border-main)]"}`}>
          {labels.chartView}
        </button>
        <button type="button" onClick={() => setView("table")}
          className={`rounded px-2 py-1 ${view === "table" ? "bg-amber-500/20 text-amber-100" : "border border-[color:var(--border-main)]"}`}>
          {labels.listView}
        </button>
        {view === "chart" ? (
          <>
            <span className="text-[color:var(--foreground-muted)]">|</span>
            <button type="button" onClick={() => setScale("days")}
              className={`rounded px-2 py-1 ${scale === "days" ? "bg-indigo-500/20" : "border border-[color:var(--border-main)]"}`}>
              {labels.scaleDays ?? "ימים"}
            </button>
            <button type="button" onClick={() => setScale("weeks")}
              className={`rounded px-2 py-1 ${scale === "weeks" ? "bg-indigo-500/20" : "border border-[color:var(--border-main)]"}`}>
              {labels.scaleWeeks}
            </button>
            <button type="button" onClick={() => setScale("months")}
              className={`rounded px-2 py-1 ${scale === "months" ? "bg-indigo-500/20" : "border border-[color:var(--border-main)]"}`}>
              {labels.scaleMonths}
            </button>
          </>
        ) : null}
        <button type="button" onClick={openCreate}
          className="mr-auto flex items-center gap-1 rounded-lg bg-indigo-600/90 px-2 py-1 text-white">
          <Plus size={12} />{labels.addTask}
        </button>
      </div>

      {draft != null && (
        <GanttTaskForm
          draft={draft} setDraft={setDraft}
          editingId={editingId} saving={saving}
          linkTasks={linkTasks}
          projectSubDomains={projectSubDomains}
          boqLines={boqLines}
          hideConstructionFeatures={hideConstructionFeatures}
          labels={labels}
          onSave={() => void submitForm()}
          onCancel={closeForm}
        />
      )}

      {view === "chart" ? (
        <GanttChartView
          tasks={tasks} range={range} ticks={ticks} todayLeft={todayLeft}
          taskById={taskById} hideConstructionFeatures={hideConstructionFeatures}
          scale={scale}
          labels={labels}
          onEdit={openEdit}
          onProgressChange={onProgressChange}
          onOpenDiary={onOpenDiary}
          onCreateDiary={onCreateDiary}
        />
      ) : (
        <GanttTableView
          tasks={tasks} labels={labels}
          onEdit={openEdit}
          onDelete={(id) => void onDeleteTask(id)}
          onProgressChange={onProgressChange}
        />
      )}
    </div>
  );
}
