"use client";

import React from "react";
import { X } from "lucide-react";
import { osFieldClassName } from "@/components/os/ui/os-field";
import type { ProjectSubDomain } from "@/lib/project-sub-domains";
import type { BoqLinePrefill } from "@/lib/project-document-catalog";
import type { ProjectSubDomainId } from "@/lib/project-sub-domains";
import type { GanttTask, GanttTaskDraft, GanttLabels } from "./types";

type GanttTaskFormProps = {
  draft: GanttTaskDraft;
  setDraft: (d: GanttTaskDraft) => void;
  editingId: string | null;
  saving: boolean;
  linkTasks: GanttTask[];
  projectSubDomains: ProjectSubDomain[];
  boqLines: BoqLinePrefill[];
  hideConstructionFeatures: boolean;
  labels: GanttLabels;
  onSave: () => void;
  onCancel: () => void;
};

export function GanttTaskForm({
  draft, setDraft, editingId, saving, linkTasks, projectSubDomains,
  boqLines, hideConstructionFeatures, labels, onSave, onCancel,
}: GanttTaskFormProps) {
  const set = <K extends keyof GanttTaskDraft>(key: K, val: GanttTaskDraft[K]) =>
    setDraft({ ...draft, [key]: val });

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-800/60 dark:bg-indigo-950/30">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
          {editingId ? labels.editTask : labels.newTaskTitle}
        </p>
        <button type="button" onClick={onCancel}
          className="rounded-md p-1 text-[color:var(--foreground-muted)] hover:bg-[color:var(--border-main)] hover:text-[color:var(--foreground-main)]">
          <X size={14} />
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* Title */}
        <input
          className={`${osFieldClassName} md:col-span-2`}
          placeholder={labels.task}
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          autoFocus
        />

        {/* Dates */}
        <label className="flex flex-col gap-1 text-[11px] font-medium text-[color:var(--foreground-muted)]">
          {labels.start}
          <input type="date" className={`${osFieldClassName} w-full`}
            value={draft.startDate}
            onChange={(e) => set("startDate", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium text-[color:var(--foreground-muted)]">
          {labels.end}
          <input type="date" className={`${osFieldClassName} w-full`}
            value={draft.endDate}
            onChange={(e) => set("endDate", e.target.value)} />
        </label>

        {/* Trade + Progress */}
        <label className="flex flex-col gap-1 text-[11px] font-medium text-[color:var(--foreground-muted)]">
          {labels.trade}
          <select className={`${osFieldClassName} w-full`}
            value={draft.tradeId}
            onChange={(e) => set("tradeId", e.target.value as ProjectSubDomainId | "")}>
            <option value="">—</option>
            {projectSubDomains.map((d) => (
              <option key={d.id} value={d.id}>{d.labelHe}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium text-[color:var(--foreground-muted)]">
          {labels.progress}
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={100} className={`${osFieldClassName} w-20`}
              value={draft.progress}
              onChange={(e) => set("progress", Number(e.target.value))} />
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-[color:var(--border-main)]">
              <div className="h-full rounded-full bg-[color:var(--win-accent,#6366f1)] transition-all"
                style={{ width: `${Math.min(100, draft.progress)}%` }} />
            </div>
            <span className="text-[11px] tabular-nums text-[color:var(--foreground-muted)]">{draft.progress}%</span>
          </div>
        </label>

        {/* BOQ link */}
        {!hideConstructionFeatures && boqLines.length > 0 ? (
          <label className="flex flex-col gap-1 text-[11px] font-medium text-[color:var(--foreground-muted)]">
            {labels.linkedBoq}
            <select className={`${osFieldClassName} w-full`}
              value={draft.linkedBoqLineId}
              onChange={(e) => set("linkedBoqLineId", e.target.value)}>
              <option value="">—</option>
              {boqLines.map((line) => (
                <option key={line.id} value={line.id}>{line.description.slice(0, 52)}</option>
              ))}
            </select>
          </label>
        ) : null}

        {/* Dependencies */}
        <label className="flex flex-col gap-1 text-[11px] font-medium text-[color:var(--foreground-muted)] md:col-span-2">
          {labels.dependencies}
          <select multiple className={`${osFieldClassName} min-h-[72px] w-full`}
            value={draft.dependencies.split(/,\s*/).filter(Boolean)}
            onChange={(e) => {
              const sel = Array.from(e.target.selectedOptions).map(o => o.value);
              set("dependencies", sel.join(", "));
            }}>
            {linkTasks.filter(t => t.id !== editingId).map(t => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
          <span className="text-[9px] text-[color:var(--foreground-muted)]">Ctrl + לחיצה לבחירה מרובה</span>
        </label>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={saving || !draft.title.trim()}
          onClick={onSave}
          className="min-h-[36px] rounded-lg bg-[color:var(--win-accent,#6366f1)] px-5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "שומר…" : labels.save}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[36px] rounded-lg border border-[color:var(--border-main)] px-4 text-xs text-[color:var(--foreground-muted)] transition-colors hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)]"
        >
          {labels.cancel}
        </button>
      </div>
    </div>
  );
}
