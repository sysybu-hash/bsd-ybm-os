"use client";

import React, { useMemo, useState } from "react";
import {
  BarChart2, List, Plus, Trash2, CalendarDays, CalendarRange, Calendar,
} from "lucide-react";
import { getProjectSubDomainsForIndustry } from "@/lib/project-sub-domains";
import { GanttTaskForm } from "./gantt/GanttTaskForm";
import { GanttChartView } from "./gantt/GanttChartView";
import { GanttTableView } from "./gantt/GanttTableView";
import { buildTicks, draftFromTask, emptyDraft, autoScale } from "./gantt/utils";
import type { GanttProps, GanttTask, GanttTaskDraft, Scale } from "./gantt/types";

export type { GanttTask, GanttTaskDraft } from "./gantt/types";

type View = "chart" | "table";

export default function ProjectGanttChart({
  tasks,
  allTasks,
  boqLines = [],
  onProgressChange,
  onDatesChange,
  onSaveTask,
  onDeleteTask,
  onClearAll,
  onCreateDiary,
  onOpenDiary,
  labels,
  organizationIndustry,
  hideConstructionFeatures = false,
}: GanttProps) {
  const projectSubDomains = useMemo(
    () => getProjectSubDomainsForIndustry(organizationIndustry),
    [organizationIndustry],
  );

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
  const [draft, setDraft]         = useState<GanttTaskDraft | null>(null);
  const [saving, setSaving]       = useState(false);
  const [clearing, setClearing]   = useState(false);

  const range = useMemo(() => {
    if (tasks.length === 0) {
      const now = Date.now();
      return { min: now, max: now + 14 * 86400000 };
    }
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

  const span      = range.max - range.min || 1;
  const ticks     = useMemo(() => buildTicks(range.min, range.max, scale), [range.min, range.max, scale]);
  const todayLeft = ((Date.now() - range.min) / span) * 100;
  const linkTasks = allTasks ?? tasks;
  const taskById  = useMemo(() => new Map(linkTasks.map(t => [t.id, t])), [linkTasks]);

  const openCreate = () => { setEditingId(null); setDraft(emptyDraft()); };
  const openEdit   = (task: GanttTask) => { setEditingId(task.id); setDraft(draftFromTask(task)); };
  const closeForm  = () => { setEditingId(null); setDraft(null); };

  const submitForm = async () => {
    if (!draft?.title.trim()) return;
    setSaving(true);
    try { await onSaveTask(draft, editingId ?? undefined); closeForm(); }
    finally { setSaving(false); }
  };

  const handleClearAll = async () => {
    if (!onClearAll) return;
    if (!confirm("למחוק את כל המשימות? פעולה זו אינה הפיכה.")) return;
    setClearing(true);
    try { await onClearAll(); } finally { setClearing(false); }
  };

  // Empty state
  if (tasks.length === 0 && draft == null) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-[color:var(--border-main)] bg-[color:var(--surface-soft)]/50 py-14 text-center">
        <div className="rounded-full bg-indigo-100 p-4 dark:bg-indigo-900/30">
          <BarChart2 size={28} className="text-[color:var(--win-accent,#6366f1)]" />
        </div>
        <div>
          <p className="text-sm font-semibold text-[color:var(--foreground-main)]">
            {labels.noTasks}
          </p>
          <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">
            הוסף משימות ידנית או ייבא קובץ XML / CSV
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg bg-[color:var(--win-accent,#6366f1)] px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus size={14} />
          {labels.addTask}
        </button>
      </div>
    );
  }

  const scaleButtons: { key: Scale; label: string; icon: typeof CalendarDays }[] = [
    { key: "days",   label: labels.scaleDays   ?? "ימים",   icon: CalendarDays },
    { key: "weeks",  label: labels.scaleWeeks  ?? "שבועות", icon: CalendarRange },
    { key: "months", label: labels.scaleMonths ?? "חודשים", icon: Calendar },
  ];

  return (
    <div className="flex flex-col gap-3">

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* View toggle — segmented control */}
        <div className="flex overflow-hidden rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-soft)]">
          <button
            type="button"
            onClick={() => setView("chart")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              view === "chart"
                ? "bg-[color:var(--surface-card)] text-[color:var(--foreground-main)] shadow-sm"
                : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
            }`}
          >
            <BarChart2 size={13} />
            {labels.chartView}
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              view === "table"
                ? "bg-[color:var(--surface-card)] text-[color:var(--foreground-main)] shadow-sm"
                : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
            }`}
          >
            <List size={13} />
            {labels.listView}
          </button>
        </div>

        {/* Scale — only in chart mode */}
        {view === "chart" ? (
          <div className="flex overflow-hidden rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-soft)]">
            {scaleButtons.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setScale(key)}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  scale === key
                    ? "bg-[color:var(--win-accent,#6366f1)] text-white"
                    : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
                }`}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Secondary: clear all */}
        {onClearAll && tasks.length > 0 ? (
          <button
            type="button"
            disabled={clearing}
            onClick={() => void handleClearAll()}
            className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300 dark:hover:bg-rose-900/40"
          >
            <Trash2 size={12} />
            נקה הכל
          </button>
        ) : null}

        {/* Primary: add task */}
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-lg bg-[color:var(--win-accent,#6366f1)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
        >
          <Plus size={13} />
          {labels.addTask}
        </button>
      </div>

      {/* Task count pill */}
      {tasks.length > 0 ? (
        <div className="flex items-center gap-2 text-[11px] text-[color:var(--foreground-muted)]">
          <span className="rounded-full bg-[color:var(--surface-soft)] px-2 py-0.5 font-medium text-[color:var(--foreground-main)]">
            {tasks.length}
          </span>
          <span>משימות בפרויקט</span>
          <LegendRow labels={labels} />
        </div>
      ) : null}

      {/* Form */}
      {draft != null ? (
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
      ) : null}

      {/* Chart / Table */}
      {view === "chart" ? (
        <GanttChartView
          tasks={tasks} range={range} ticks={ticks} todayLeft={todayLeft}
          taskById={taskById} hideConstructionFeatures={hideConstructionFeatures}
          scale={scale} labels={labels}
          onEdit={openEdit}
          onProgressChange={onProgressChange}
          onDatesChange={onDatesChange}
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

function LegendRow({ labels }: { labels: GanttProps["labels"] }) {
  return (
    <div className="ms-auto flex items-center gap-3">
      <span className="flex items-center gap-1">
        <span className="h-2 w-4 rounded-sm bg-[color:var(--win-accent,#6366f1)]" />
        {labels.ganttProgress ?? "בביצוע"}
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-4 rounded-sm bg-emerald-500" />
        הושלם
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-4 rounded-sm bg-rose-500" />
        באיחור
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-0.5 rounded-full bg-blue-500" />
        {labels.ganttToday ?? "היום"}
      </span>
    </div>
  );
}
