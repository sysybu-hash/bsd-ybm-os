"use client";

import React from "react";
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
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="mb-2 text-xs font-semibold text-amber-200">
        {editingId ? labels.editTask : labels.newTaskTitle}
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        <input
          className={`${osFieldClassName} md:col-span-2`}
          placeholder={labels.task}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
        <label className="text-[10px] text-[color:var(--foreground-muted)]">
          {labels.start}
          <input type="date" className={`${osFieldClassName} mt-0.5 w-full`} value={draft.startDate}
            onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
        </label>
        <label className="text-[10px] text-[color:var(--foreground-muted)]">
          {labels.end}
          <input type="date" className={`${osFieldClassName} mt-0.5 w-full`} value={draft.endDate}
            onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
        </label>
        <label className="text-[10px] text-[color:var(--foreground-muted)]">
          {labels.trade}
          <select className={`${osFieldClassName} mt-0.5 w-full`} value={draft.tradeId}
            onChange={(e) => setDraft({ ...draft, tradeId: e.target.value as ProjectSubDomainId | "" })}>
            <option value="">—</option>
            {projectSubDomains.map((d) => <option key={d.id} value={d.id}>{d.labelHe}</option>)}
          </select>
        </label>
        <label className="text-[10px] text-[color:var(--foreground-muted)]">
          {labels.progress}
          <input type="number" min={0} max={100} className={`${osFieldClassName} mt-0.5 w-full`}
            value={draft.progress}
            onChange={(e) => setDraft({ ...draft, progress: Number(e.target.value) })} />
        </label>
        {!hideConstructionFeatures ? (
          <label className="text-[10px] text-[color:var(--foreground-muted)]">
            {labels.linkedBoq}
            <select className={`${osFieldClassName} mt-0.5 w-full`} value={draft.linkedBoqLineId}
              onChange={(e) => setDraft({ ...draft, linkedBoqLineId: e.target.value })}>
              <option value="">—</option>
              {boqLines.map((line) => <option key={line.id} value={line.id}>{line.description.slice(0, 48)}</option>)}
            </select>
          </label>
        ) : null}
        <label className="text-[10px] text-[color:var(--foreground-muted)] md:col-span-2">
          {labels.dependencies}
          <select multiple className={`${osFieldClassName} mt-0.5 min-h-[4rem] w-full`}
            value={draft.dependencies.split(/,\s*/).filter(Boolean)}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
              setDraft({ ...draft, dependencies: selected.join(", ") });
            }}>
            {linkTasks.filter((t) => t.id !== editingId).map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
          <span className="mt-0.5 block text-[9px] text-[color:var(--foreground-muted)]">Ctrl+לחיצה לבחירה מרובה</span>
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={saving || !draft.title.trim()} onClick={onSave}
          className="min-h-[44px] rounded-lg bg-indigo-600 px-4 py-2 text-xs text-white disabled:opacity-50 md:min-h-0 md:py-1">
          {labels.save}
        </button>
        <button type="button" onClick={onCancel}
          className="min-h-[44px] rounded-lg border border-[color:var(--border-main)] px-4 py-2 text-xs md:min-h-0 md:py-1">
          {labels.cancel}
        </button>
      </div>
    </div>
  );
}
