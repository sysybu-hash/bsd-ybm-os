"use client";

import React from "react";
import { Plus, X, Save } from "lucide-react";
import CommentsThread from "@/components/os/shared/CommentsThread";
import { OsButton, OsIconButton } from "@/components/os/ui";
import type { BoardColumnId, BoardPriorityId } from "@/lib/tasks/board-mapping";
import { columns } from "./constants";
import type { Contact, TaskFormState } from "./types";

const inputClass =
  "w-full bg-[color:var(--surface-soft)] border border-[color:var(--border-main)] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[color:var(--win-accent,var(--accent))]/50 text-[color:var(--foreground-main)]";
const labelClass = "text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest";

export type TaskFormModalProps = {
  open: boolean;
  title: string;
  form: TaskFormState;
  contacts: Contact[];
  lockedProjectName?: string;
  onChange: (next: TaskFormState) => void;
  onClose: () => void;
  onSave: () => void;
  saveLabel: string;
  taskId?: string;
  t: (key: string) => string;
};

export function TaskFormModal({
  open,
  title,
  form,
  contacts,
  lockedProjectName,
  onChange,
  onClose,
  onSave,
  saveLabel,
  taskId,
  t,
}: TaskFormModalProps) {
  if (!open) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto overscroll-y-contain">
      <div className="w-full max-w-lg bg-[color:var(--surface-card)] border border-[color:var(--border-main)] rounded-2xl sm:rounded-[2.5rem] p-5 sm:p-8 shadow-2xl my-auto">
        <div className="flex items-center justify-between mb-4 sm:mb-8">
          <h3 className="text-xl font-bold text-[color:var(--foreground-main)] flex items-center gap-3">
            <Plus className="text-[color:var(--win-accent,#6366f1)]" size={24} aria-hidden /> {title}
          </h3>
          <OsIconButton label={t("workspaceWidgets.confirm.cancel")} className="rounded-full" onClick={onClose}>
            <X size={20} aria-hidden />
          </OsIconButton>
        </div>

        <div className="space-y-4 mb-8 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
          <div className="space-y-1.5">
            <label className={labelClass}>{t("workspaceWidgets.projectBoard.fields.title")}</label>
            <input
              className={inputClass}
              value={form.title}
              onChange={(e) => onChange({ ...form, title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>{t("workspaceWidgets.projectBoard.fields.description")}</label>
            <textarea
              rows={3}
              className={`${inputClass} resize-none`}
              value={form.description}
              onChange={(e) => onChange({ ...form, description: e.target.value })}
            />
          </div>
          {lockedProjectName ? (
            <div className="space-y-1.5">
              <label className={labelClass}>{t("workspaceWidgets.projectBoard.fields.project")}</label>
              <p className={`${inputClass} opacity-90`}>{lockedProjectName}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className={labelClass}>{t("workspaceWidgets.projectBoard.fields.project")}</label>
              <input
                className={inputClass}
                value={form.projectName}
                onChange={(e) => onChange({ ...form, projectName: e.target.value })}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <label className={labelClass}>{t("workspaceWidgets.projectBoard.fields.contact")}</label>
            <select
              className={`${inputClass} appearance-none`}
              value={form.contactId}
              onChange={(e) => onChange({ ...form, contactId: e.target.value })}
            >
              <option value="">{t("workspaceWidgets.projectBoard.fields.contactPlaceholder")}</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className={labelClass}>{t("workspaceWidgets.projectBoard.fields.status")}</label>
              <select
                className={`${inputClass} appearance-none`}
                value={form.status}
                onChange={(e) => onChange({ ...form, status: e.target.value as BoardColumnId })}
              >
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {t(`workspaceWidgets.projectBoard.columns.${col.titleKey}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>{t("workspaceWidgets.projectBoard.fields.priority")}</label>
              <select
                className={`${inputClass} appearance-none`}
                value={form.priority}
                onChange={(e) => onChange({ ...form, priority: e.target.value as BoardPriorityId })}
              >
                <option value="low">{t("workspaceWidgets.projectBoard.priority.low")}</option>
                <option value="medium">{t("workspaceWidgets.projectBoard.priority.medium")}</option>
                <option value="high">{t("workspaceWidgets.projectBoard.priority.high")}</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className={labelClass}>{t("workspaceWidgets.projectBoard.fields.budget")}</label>
              <input
                type="number"
                inputMode="decimal"
                className={inputClass}
                value={form.budget}
                onChange={(e) => onChange({ ...form, budget: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>{t("workspaceWidgets.projectBoard.fields.dueDate")}</label>
              <input
                type="date"
                className={inputClass}
                value={form.dueDate}
                onChange={(e) => onChange({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>
        </div>

        {taskId ? <CommentsThread targetId={taskId} targetType="TASK" /> : null}

        <OsButton
          variant="primary"
          className="h-12 w-full justify-center shadow-xl"
          icon={<Save size={18} aria-hidden />}
          onClick={onSave}
        >
          {saveLabel}
        </OsButton>
      </div>
    </div>
  );
}
