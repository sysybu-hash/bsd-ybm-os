"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Calendar, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import OsFloatingPanel from "@/components/os/layout/OsFloatingPanel";
import { useI18n } from "@/components/os/system/I18nProvider";
import { emitProjectMutation } from "@/lib/events/project-sync";
import { createLogger } from "@/lib/logger";
import type { BoardColumnId, BoardPriorityId } from "@/lib/tasks/board-mapping";
import { columns } from "./constants";

const log = createLogger("create-task-panel");
const boardPrefix = "workspaceWidgets.projectBoard";

const inputClass =
  "w-full rounded-md border border-border-main bg-surface-soft px-3 py-2 text-sm text-foreground-main transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-accent)]";
const labelClass = "mb-1 block text-sm font-medium text-foreground-muted";

type FormState = {
  title: string;
  description: string;
  status: BoardColumnId;
  priority: BoardPriorityId;
  dueDate: string;
  clientName: string;
  budget: string;
};

const emptyState = (defaultStatus: BoardColumnId): FormState => ({
  title: "",
  description: "",
  status: defaultStatus,
  priority: "medium",
  dueDate: "",
  clientName: "",
  budget: "",
});

type CreateTaskPanelProps = {
  projectId: string;
  open: boolean;
  onClose: () => void;
  defaultStatus?: BoardColumnId;
};

export default function CreateTaskPanel({
  projectId,
  open,
  onClose,
  defaultStatus = "todo",
}: CreateTaskPanelProps) {
  const { t } = useI18n();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormState>(() => emptyState(defaultStatus));

  useEffect(() => {
    if (open) {
      setFormData(emptyState(defaultStatus));
    }
  }, [open, defaultStatus]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!formData.title.trim()) return;

      setIsSubmitting(true);
      try {
        const budgetNum = formData.budget.trim() ? parseFloat(formData.budget) : undefined;
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            title: formData.title.trim(),
            description: formData.description.trim() || undefined,
            status: formData.status,
            priority: formData.priority,
            dueDate: formData.dueDate || undefined,
            clientName: formData.clientName.trim() || undefined,
            budget: budgetNum != null && !Number.isNaN(budgetNum) ? budgetNum : undefined,
            metadata: {
              clientName: formData.clientName.trim() || undefined,
              budget: budgetNum != null && !Number.isNaN(budgetNum) ? budgetNum : 0,
            },
          }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          throw new Error(typeof body.error === "string" ? body.error : "create_failed");
        }

        emitProjectMutation(projectId);
        toast.success(t(`${boardPrefix}.created`));
        onClose();
      } catch (err: unknown) {
        log.error("create_task_failed", {
          message: err instanceof Error ? err.message : String(err),
          projectId,
        });
        toast.error(t(`${boardPrefix}.saveFailed`));
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, onClose, projectId, t],
  );

  const footer = (
    <div className="flex justify-end gap-3">
      <button
        type="button"
        onClick={onClose}
        className="rounded-md px-4 py-2 text-sm font-medium text-foreground-main transition-colors hover:bg-surface-soft"
        disabled={isSubmitting}
      >
        {t("workspaceWidgets.confirm.cancel")}
      </button>
      <button
        type="submit"
        form="create-task-panel-form"
        disabled={isSubmitting || !formData.title.trim()}
        className="flex items-center gap-2 rounded-md bg-[color:var(--brand-accent)] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-50"
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          t(`${boardPrefix}.saveNew`)
        )}
      </button>
    </div>
  );

  return (
    <OsFloatingPanel
      open={open}
      onClose={onClose}
      title={t(`${boardPrefix}.addTitle`)}
      headerStart={<Plus className="h-4 w-4 text-[color:var(--brand-accent)]" aria-hidden />}
      panelWidth={450}
      footer={footer}
      showZoom={false}
    >
      <form
        id="create-task-panel-form"
        onSubmit={(e) => void handleSubmit(e)}
        className="flex flex-col text-foreground-main"
      >
        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="create-task-title">
              {t(`${boardPrefix}.fields.title`)}
            </label>
            <input
              id="create-task-title"
              type="text"
              autoFocus
              required
              value={formData.title}
              onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              className={inputClass}
              placeholder={t(`${boardPrefix}.fields.title`)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="create-task-status">
                {t(`${boardPrefix}.fields.status`)}
              </label>
              <select
                id="create-task-status"
                value={formData.status}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, status: e.target.value as BoardColumnId }))
                }
                className={inputClass}
              >
                {columns.map((col) => (
                  <option key={col.id} value={col.id}>
                    {t(`${boardPrefix}.columns.${col.titleKey}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="create-task-priority">
                {t(`${boardPrefix}.fields.priority`)}
              </label>
              <select
                id="create-task-priority"
                value={formData.priority}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, priority: e.target.value as BoardPriorityId }))
                }
                className={inputClass}
              >
                <option value="low">{t(`${boardPrefix}.priority.low`)}</option>
                <option value="medium">{t(`${boardPrefix}.priority.medium`)}</option>
                <option value="high">{t(`${boardPrefix}.priority.high`)}</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="create-task-due">
              {t(`${boardPrefix}.fields.dueDate`)}
            </label>
            <div className="relative">
              <input
                id="create-task-due"
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData((prev) => ({ ...prev, dueDate: e.target.value }))}
                className={`${inputClass} ps-9 pe-3`}
              />
              <Calendar
                className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-foreground-muted"
                aria-hidden
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass} htmlFor="create-task-client">
                {t(`${boardPrefix}.fields.contact`)}
              </label>
              <input
                id="create-task-client"
                type="text"
                value={formData.clientName}
                onChange={(e) => setFormData((prev) => ({ ...prev, clientName: e.target.value }))}
                className={inputClass}
                placeholder={t(`${boardPrefix}.fields.contactPlaceholder`)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="create-task-budget">
                {t(`${boardPrefix}.fields.budget`)}
              </label>
              <input
                id="create-task-budget"
                type="number"
                min={0}
                step="0.01"
                value={formData.budget}
                onChange={(e) => setFormData((prev) => ({ ...prev, budget: e.target.value }))}
                className={inputClass}
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="create-task-desc">
              {t(`${boardPrefix}.fields.description`)}
            </label>
            <textarea
              id="create-task-desc"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              className={`${inputClass} custom-scrollbar resize-none`}
            />
          </div>
        </div>
      </form>
    </OsFloatingPanel>
  );
}
