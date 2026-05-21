"use client";

import React, { useMemo, useState } from "react";
import { BookOpen, Link2, ListTree, Pencil, Plus, Trash2 } from "lucide-react";
import type { BoqLinePrefill } from "@/lib/project-document-catalog";
import { osFieldClassName } from "@/components/os/ui/os-field";
import {
  getProjectSubDomainsForIndustry,
  PROJECT_SUB_DOMAIN_BY_ID,
  type ProjectSubDomainId,
} from "@/lib/project-sub-domains";

export type GanttTask = {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  progress: number;
  dependencies?: string | null;
  tradeId?: ProjectSubDomainId | null;
  linkedBoqLineId?: string | null;
  linkedBoqLabel?: string | null;
  linkedWorkDiaryId?: string | null;
};

export type GanttTaskDraft = {
  title: string;
  startDate: string;
  endDate: string;
  progress: number;
  tradeId: ProjectSubDomainId | "";
  dependencies: string;
  linkedBoqLineId: string;
};

const TRADE_BAR: Partial<Record<ProjectSubDomainId, string>> = {
  SKELETON: "from-stone-600/90 to-stone-500/80",
  PLUMBING: "from-cyan-600/90 to-blue-600/80",
  ELECTRICAL: "from-amber-500/90 to-orange-600/80",
  HVAC: "from-sky-600/90 to-indigo-600/80",
  PAINTING: "from-pink-600/90 to-rose-600/80",
  SALES: "from-emerald-600/90 to-teal-600/80",
  OPERATIONS: "from-cyan-600/90 to-sky-600/80",
  FINANCE: "from-amber-600/90 to-yellow-600/80",
  HR: "from-violet-600/90 to-purple-600/80",
  PRODUCT: "from-indigo-600/90 to-blue-600/80",
  MARKETING: "from-rose-600/90 to-pink-600/80",
  GENERAL: "from-indigo-600/90 to-violet-600/80",
};

type Props = {
  tasks: GanttTask[];
  allTasks?: GanttTask[];
  boqLines?: BoqLinePrefill[];
  labels: {
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
    ganttLegend?: string;
    ganttToday?: string;
    ganttProgress?: string;
    ganttDependency?: string;
  };
  onProgressChange: (taskId: string, progress: number) => Promise<void>;
  onSaveTask: (draft: GanttTaskDraft, taskId?: string) => Promise<void>;
  onDeleteTask: (taskId: string) => Promise<void>;
  onCreateDiary?: (task: GanttTask) => Promise<void>;
  onOpenDiary?: (task: GanttTask) => void;
  organizationIndustry?: string | null;
  hideConstructionFeatures?: boolean;
};

function parseTime(iso: string | null, fallback: number): number {
  if (!iso) return fallback;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? fallback : t;
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function parseDependencyIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    /* */
  }
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function emptyDraft(): GanttTaskDraft {
  const today = new Date().toISOString().slice(0, 10);
  const next = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  return {
    title: "",
    startDate: today,
    endDate: next,
    progress: 0,
    tradeId: "",
    dependencies: "",
    linkedBoqLineId: "",
  };
}

function draftFromTask(task: GanttTask): GanttTaskDraft {
  return {
    title: task.title,
    startDate: toDateInput(task.startDate),
    endDate: toDateInput(task.endDate),
    progress: task.progress,
    tradeId: task.tradeId ?? "",
    dependencies: parseDependencyIds(task.dependencies).join(", "),
    linkedBoqLineId: task.linkedBoqLineId ?? "",
  };
}

type Scale = "weeks" | "months";

function buildTicks(min: number, max: number, scale: Scale): { label: string; left: number }[] {
  const ticks: { label: string; left: number }[] = [];
  const span = max - min || 1;
  const cursor = new Date(min);
  cursor.setHours(0, 0, 0, 0);
  if (scale === "weeks") {
    const day = cursor.getDay();
    cursor.setDate(cursor.getDate() - day);
  } else {
    cursor.setDate(1);
  }
  while (cursor.getTime() <= max + 86400000) {
    const t = cursor.getTime();
    ticks.push({
      label:
        scale === "weeks"
          ? cursor.toLocaleDateString("he-IL", { day: "numeric", month: "short" })
          : cursor.toLocaleDateString("he-IL", { month: "short", year: "2-digit" }),
      left: ((t - min) / span) * 100,
    });
    if (scale === "weeks") cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  return ticks;
}

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
}: Props) {
  const projectSubDomains = useMemo(
    () => getProjectSubDomainsForIndustry(organizationIndustry),
    [organizationIndustry],
  );
  const [view, setView] = useState<"chart" | "table">("chart");
  const [scale, setScale] = useState<Scale>("weeks");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<GanttTaskDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const range = useMemo(() => {
    if (tasks.length === 0) {
      const now = Date.now();
      return { min: now, max: now + 14 * 86400000 };
    }
    let min = Infinity;
    let max = -Infinity;
    for (const t of tasks) {
      const s = parseTime(t.startDate, Date.now());
      const e = parseTime(t.endDate, s + 7 * 86400000);
      min = Math.min(min, s);
      max = Math.max(max, e);
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

  const openCreate = () => {
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const openEdit = (task: GanttTask) => {
    setEditingId(task.id);
    setDraft(draftFromTask(task));
  };

  const closeForm = () => {
    setEditingId(null);
    setDraft(null);
  };

  const submitForm = async () => {
    if (!draft?.title.trim()) return;
    setSaving(true);
    try {
      await onSaveTask(draft, editingId ?? undefined);
      closeForm();
    } finally {
      setSaving(false);
    }
  };

  const formPanel =
    draft != null ? (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
        <p className="mb-2 text-xs font-semibold text-amber-200">
          {editingId ? labels.editTask : labels.newTaskTitle}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className={`${osFieldClassName} sm:col-span-2`}
            placeholder={labels.task}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <label className="text-[10px] text-[color:var(--foreground-muted)]">
            {labels.start}
            <input
              type="date"
              className={`${osFieldClassName} mt-0.5 w-full`}
              value={draft.startDate}
              onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
            />
          </label>
          <label className="text-[10px] text-[color:var(--foreground-muted)]">
            {labels.end}
            <input
              type="date"
              className={`${osFieldClassName} mt-0.5 w-full`}
              value={draft.endDate}
              onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
            />
          </label>
          <label className="text-[10px] text-[color:var(--foreground-muted)]">
            {labels.trade}
            <select
              className={`${osFieldClassName} mt-0.5 w-full`}
              value={draft.tradeId}
              onChange={(e) =>
                setDraft({ ...draft, tradeId: e.target.value as ProjectSubDomainId | "" })
              }
            >
              <option value="">—</option>
              {projectSubDomains.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.labelHe}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] text-[color:var(--foreground-muted)]">
            {labels.progress}
            <input
              type="number"
              min={0}
              max={100}
              className={`${osFieldClassName} mt-0.5 w-full`}
              value={draft.progress}
              onChange={(e) => setDraft({ ...draft, progress: Number(e.target.value) })}
            />
          </label>
          {!hideConstructionFeatures ? (
            <label className="text-[10px] text-[color:var(--foreground-muted)]">
              {labels.linkedBoq}
              <select
                className={`${osFieldClassName} mt-0.5 w-full`}
                value={draft.linkedBoqLineId}
                onChange={(e) => setDraft({ ...draft, linkedBoqLineId: e.target.value })}
              >
                <option value="">—</option>
                {boqLines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.description.slice(0, 48)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="text-[10px] text-[color:var(--foreground-muted)] sm:col-span-2">
            {labels.dependencies}
            <select
              multiple
              className={`${osFieldClassName} mt-0.5 min-h-[4rem] w-full`}
              value={draft.dependencies.split(/,\s*/).filter(Boolean)}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                setDraft({ ...draft, dependencies: selected.join(", ") });
              }}
            >
              {linkTasks
                .filter((t) => t.id !== editingId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
            <span className="mt-0.5 block text-[9px] text-[color:var(--foreground-muted)]">
              Ctrl+לחיצה לבחירה מרובה
            </span>
          </label>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving || !draft.title.trim()}
            onClick={() => void submitForm()}
            className="rounded-lg bg-indigo-600 px-3 py-1 text-xs text-white disabled:opacity-50"
          >
            {labels.save}
          </button>
          <button
            type="button"
            onClick={closeForm}
            className="rounded-lg border border-[color:var(--border-main)] px-3 py-1 text-xs"
          >
            {labels.cancel}
          </button>
        </div>
      </div>
    ) : null;

  if (tasks.length === 0 && draft == null) {
    return (
      <div className="space-y-3">
        <p className="py-4 text-center text-xs text-[color:var(--foreground-muted)]">{labels.noTasks}</p>
        <button
          type="button"
          onClick={openCreate}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-amber-500/40 py-2 text-xs text-amber-200"
        >
          <Plus size={14} />
          {labels.addTask}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[color:var(--border-main)]/60 bg-[color:var(--surface-elevated)]/40 px-2 py-1.5 text-[9px] text-[color:var(--foreground-muted)]">
        <span className="font-semibold text-[color:var(--foreground)]">{labels.ganttLegend ?? "מקרא"}</span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-6 rounded bg-gradient-to-r from-indigo-600 to-violet-600" />
          {labels.ganttProgress ?? "התקדמות"}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-px bg-rose-400" />
          {labels.ganttToday ?? "היום"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Link2 size={10} />
          {labels.ganttDependency ?? "תלות"}
        </span>
        <span className="inline-flex items-center gap-1">
          <ListTree size={10} />
          BOQ
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setView("chart")}
          className={`rounded px-2 py-1 ${view === "chart" ? "bg-amber-500/20 text-amber-100" : "border border-[color:var(--border-main)]"}`}
        >
          {labels.chartView}
        </button>
        <button
          type="button"
          onClick={() => setView("table")}
          className={`rounded px-2 py-1 ${view === "table" ? "bg-amber-500/20 text-amber-100" : "border border-[color:var(--border-main)]"}`}
        >
          {labels.listView}
        </button>
        {view === "chart" ? (
          <>
            <span className="text-[color:var(--foreground-muted)]">|</span>
            <button
              type="button"
              onClick={() => setScale("weeks")}
              className={`rounded px-2 py-1 ${scale === "weeks" ? "bg-indigo-500/20" : "border border-[color:var(--border-main)]"}`}
            >
              {labels.scaleWeeks}
            </button>
            <button
              type="button"
              onClick={() => setScale("months")}
              className={`rounded px-2 py-1 ${scale === "months" ? "bg-indigo-500/20" : "border border-[color:var(--border-main)]"}`}
            >
              {labels.scaleMonths}
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={openCreate}
          className="mr-auto flex items-center gap-1 rounded-lg bg-indigo-600/90 px-2 py-1 text-white"
        >
          <Plus size={12} />
          {labels.addTask}
        </button>
      </div>

      {formPanel}

      {view === "chart" ? (
        <div
          className="overflow-x-auto rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/40 p-2 shadow-inner"
          dir="ltr"
        >
          <div className="min-w-[560px]">
            <div className="relative mb-1 grid grid-cols-[minmax(120px,160px)_1fr] gap-2 text-[10px] text-[color:var(--foreground-muted)]">
              <span />
              <div className="relative h-5 border-b border-[color:var(--border-main)]">
                {ticks.map((tick, i) => (
                  <span
                    key={`${tick.label}-${i}`}
                    className="absolute -translate-x-1/2 whitespace-nowrap"
                    style={{ left: `${tick.left}%` }}
                  >
                    {tick.label}
                  </span>
                ))}
                {todayLeft >= 0 && todayLeft <= 100 ? (
                  <span
                    className="absolute top-0 bottom-0 w-px bg-rose-400/80"
                    style={{ left: `${todayLeft}%` }}
                    title="היום"
                  />
                ) : null}
              </div>
            </div>
            <div className="space-y-1.5">
              {tasks.map((task) => {
                const start = parseTime(task.startDate, range.min);
                const end = Math.max(parseTime(task.endDate, start + 86400000), start + 86400000);
                const left = ((start - range.min) / span) * 100;
                const width = Math.max(1.5, ((end - start) / span) * 100);
                const trade = task.tradeId ? PROJECT_SUB_DOMAIN_BY_ID[task.tradeId] : null;
                const deps = parseDependencyIds(task.dependencies);
                const barGrad =
                  (task.tradeId && TRADE_BAR[task.tradeId]) || TRADE_BAR.GENERAL || "from-indigo-600/90 to-violet-600/80";
                const tooltip = [
                  task.title,
                  `${task.progress}%`,
                  `${formatDateHe(task.startDate)} – ${formatDateHe(task.endDate)}`,
                  trade?.labelHe,
                  task.linkedBoqLabel ? `BOQ: ${task.linkedBoqLabel}` : null,
                  deps.length
                    ? `תלוי ב: ${deps.map((id) => taskById.get(id)?.title ?? id).join(", ")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join("\n");
                return (
                  <div
                    key={task.id}
                    className="grid grid-cols-[minmax(120px,160px)_1fr] items-center gap-2 text-xs"
                    dir="rtl"
                    style={{ minHeight: 28 }}
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-1">
                      <span className="truncate font-medium" title={tooltip}>
                        {task.title}
                      </span>
                      {trade ? (
                        <span className="shrink-0 rounded bg-[color:var(--surface-elevated)] px-1 text-[9px] text-amber-200/90">
                          {trade.labelHe}
                        </span>
                      ) : null}
                      {!hideConstructionFeatures && task.linkedBoqLineId ? (
                        <span
                          className="shrink-0 rounded bg-emerald-500/15 px-1 text-[9px] text-emerald-200"
                          title={task.linkedBoqLabel ?? labels.linkedBoq}
                        >
                          <ListTree size={8} className="inline" />
                        </span>
                      ) : null}
                      {!hideConstructionFeatures && task.linkedWorkDiaryId ? (
                        <button
                          type="button"
                          className="shrink-0 rounded bg-sky-500/15 p-0.5 text-sky-200"
                          title={labels.workDiary}
                          onClick={() => onOpenDiary?.(task)}
                        >
                          <BookOpen size={9} />
                        </button>
                      ) : !hideConstructionFeatures && onCreateDiary ? (
                        <button
                          type="button"
                          className="shrink-0 rounded p-0.5 text-[color:var(--foreground-muted)] hover:text-sky-300"
                          title={labels.createDiary}
                          onClick={() => void onCreateDiary(task)}
                        >
                          <BookOpen size={9} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="shrink-0 rounded p-0.5 hover:bg-[color:var(--surface-elevated)]"
                        onClick={() => openEdit(task)}
                        aria-label={labels.editTask}
                      >
                        <Pencil size={11} />
                      </button>
                    </div>
                    <div className="relative h-7 rounded-md bg-[color:var(--surface-elevated)]/80">
                      {todayLeft >= 0 && todayLeft <= 100 ? (
                        <span
                          className="pointer-events-none absolute top-0 bottom-0 z-0 w-px bg-rose-400/50"
                          style={{ left: `${todayLeft}%` }}
                        />
                      ) : null}
                      <div
                        className={`absolute top-0.5 bottom-0.5 z-[1] rounded-md border border-white/10 bg-gradient-to-r shadow-sm ${barGrad}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={tooltip}
                      >
                        <div
                          className="h-full rounded-md bg-emerald-400/45"
                          style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-white drop-shadow">
                          {task.progress}%
                        </span>
                      </div>
                      {deps.map((depId) => {
                        const pred = taskById.get(depId);
                        if (!pred) return null;
                        const predEnd = parseTime(pred.endDate, start);
                        const predLeft = ((predEnd - range.min) / span) * 100;
                        if (predLeft >= left) return null;
                        return (
                          <span
                            key={depId}
                            className="pointer-events-none absolute top-1/2 z-[2] h-px -translate-y-1/2 border-t border-dashed border-amber-400/70"
                            style={{
                              left: `${predLeft}%`,
                              width: `${Math.max(0.5, left - predLeft)}%`,
                            }}
                            title={`${pred.title} → ${task.title}`}
                          />
                        );
                      })}
                      {deps.length > 0 ? (
                        <span
                          className="absolute -top-1 end-0 z-[3] flex items-center gap-0.5 rounded bg-amber-500/20 px-1 text-[9px] text-amber-100"
                          title={deps.map((id) => taskById.get(id)?.title ?? id).join(" → ")}
                        >
                          <Link2 size={9} />
                          {deps.length}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[color:var(--border-main)]">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="bg-[color:var(--surface-elevated)]/60 text-[color:var(--foreground-muted)]">
                <th className="p-2 text-start">{labels.task}</th>
                <th className="p-2 text-start">{labels.trade}</th>
                <th className="p-2 text-start">{labels.start}</th>
                <th className="p-2 text-start">{labels.end}</th>
                <th className="p-2 text-start">{labels.progress}</th>
                <th className="p-2 text-start" />
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-t border-[color:var(--border-main)]/50">
                  <td className="p-2 font-medium">{task.title}</td>
                  <td className="p-2 text-[color:var(--foreground-muted)]">
                    {task.tradeId ? PROJECT_SUB_DOMAIN_BY_ID[task.tradeId]?.labelHe : "—"}
                  </td>
                  <td className="p-2">{formatDateHe(task.startDate)}</td>
                  <td className="p-2">{formatDateHe(task.endDate)}</td>
                  <td className="p-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className={`${osFieldClassName} w-14`}
                      defaultValue={task.progress}
                      onBlur={(e) => void onProgressChange(task.id, Number(e.target.value))}
                    />
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className="rounded border border-[color:var(--border-main)] p-1"
                        onClick={() => openEdit(task)}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        className="rounded border border-rose-500/40 p-1 text-rose-300"
                        onClick={() => {
                          if (confirm(labels.deleteConfirm)) void onDeleteTask(task.id);
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDateHe(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL");
}
