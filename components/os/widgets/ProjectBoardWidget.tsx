"use client";

import React, { useState } from "react";
import { BarChart3, Plus, Search, ArrowRight, Clock, User } from "lucide-react";
import AddProjectDialog from "@/components/os/widgets/shared/AddProjectDialog";
import ProjectPickerPanel from "@/components/os/widgets/shared/ProjectPickerPanel";
import ItemActions from "@/components/os/ItemActions";
import type { OpenWorkspaceWidgetFn } from "@/components/os/widgets/CrmTableWidget";
import { TaskFormModal } from "./project-board/TaskFormModal";
import { useProjectBoard } from "./project-board/useProjectBoard";
import { columns, emptyForm } from "./project-board/constants";
import { formatBoardDueDate, type BoardColumnId } from "@/lib/tasks/board-mapping";

export type ProjectBoardWidgetProps = {
  projectId?: string;
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
};

export default function ProjectBoardWidget({ projectId, openWorkspaceWidget }: ProjectBoardWidgetProps) {
  const s = useProjectBoard({ projectId, openWorkspaceWidget });
  const {
    dir, t, boardPrefix,
    selectedProjectName, projectsList, projectsListLoading,
    showProjectPicker, loadProjectsList, selectProject,
    searchQuery, setSearchQuery,
    isAddingProject, setIsAddingProject,
    editingTaskId, setEditingTaskId,
    addForm, setAddForm,
    editForm, setEditForm,
    contacts,
    handleClearProject, openEdit,
    handleAddProject, handleSaveEdit, handleDeleteTask,
    updateTaskStatus, updateTaskBudget,
    filteredTasks, priorityLabel,
  } = s;

  const [activeCol, setActiveCol] = useState<BoardColumnId>("todo");
  const [addProjectOpen, setAddProjectOpen] = useState(false);

  if (showProjectPicker) {
    return (
      <>
        <AddProjectDialog
          open={addProjectOpen}
          onClose={() => setAddProjectOpen(false)}
          onCreated={(created) => {
            void loadProjectsList().then((list) => {
              selectProject(created.id, list);
            });
          }}
        />
        <ProjectPickerPanel
          projects={projectsList}
          loading={projectsListLoading}
          onSelect={selectProject}
          titleKey={`${boardPrefix}.pickProjectTitle`}
          descKey={`${boardPrefix}.pickProjectDesc`}
          loadingKey={`${boardPrefix}.pickProjectLoading`}
          emptyKey={`${boardPrefix}.noProjects`}
          openCrmKey={openWorkspaceWidget ? `${boardPrefix}.openCrm` : undefined}
          onOpenCrm={openWorkspaceWidget ? () => openWorkspaceWidget("crmTable", null) : undefined}
          onAddProject={() => setAddProjectOpen(true)}
          statusActiveKey="projectDashboard.statusActive"
          statusInactiveKey="projectDashboard.statusInactive"
        />
      </>
    );
  }

  // Shared modals
  const modals = (
    <>
      <TaskFormModal
        open={isAddingProject}
        title={t(`${boardPrefix}.addTitle`)}
        form={addForm}
        contacts={contacts}
        lockedProjectName={selectedProjectName ?? undefined}
        onChange={setAddForm}
        onClose={() => setIsAddingProject(false)}
        onSave={() => void handleAddProject()}
        saveLabel={t(`${boardPrefix}.saveNew`)}
        t={t}
      />
      <TaskFormModal
        open={editingTaskId !== null}
        title={t(`${boardPrefix}.editTitle`)}
        form={editForm}
        contacts={contacts}
        lockedProjectName={selectedProjectName ?? undefined}
        onChange={setEditForm}
        onClose={() => setEditingTaskId(null)}
        onSave={() => void handleSaveEdit()}
        saveLabel={t(`${boardPrefix}.saveEdit`)}
        t={t}
      />
    </>
  );

  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)]"
      dir={dir}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50">
        {/* Top row: icon + title + new task */}
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-6 sm:py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 sm:h-10 sm:w-10">
            <BarChart3 size={20} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold sm:text-xl">
              {selectedProjectName ?? t(`${boardPrefix}.headerTitle`)}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => { setAddForm(emptyForm(selectedProjectName ?? "")); setIsAddingProject(true); }}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500 transition-all"
          >
            <Plus size={15} aria-hidden />
            <span className="hidden xs:inline">{t(`${boardPrefix}.newTask`)}</span>
            <span className="xs:hidden">{t(`${boardPrefix}.newTask`)}</span>
          </button>
        </div>

        {/* Bottom row: search + switch */}
        <div className="flex items-center gap-2 px-3 pb-2.5 sm:px-6">
          <div className="relative flex-1">
            <Search className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={14} aria-hidden />
            <input
              type="text"
              placeholder={t(`${boardPrefix}.searchPlaceholder`)}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 py-2 pe-9 ps-3 text-sm text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)] focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
            />
          </div>
          <button
            type="button"
            onClick={handleClearProject}
            className="flex shrink-0 items-center gap-1 rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)] transition-all"
          >
            <ArrowRight size={13} className="rtl:rotate-180" aria-hidden />
            <span className="hidden sm:inline">{t(`${boardPrefix}.switchProject`)}</span>
          </button>
        </div>
      </div>

      {/* ── Unified: tab selector + grid list (mobile + desktop) ── */}
      <div className="flex min-h-0 flex-1 flex-col">
        {modals}

        {/* Column tabs */}
        <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[color:var(--border-main)] px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {columns.map((col) => {
            const count = filteredTasks.filter((task) => task.status === col.id).length;
            const active = activeCol === col.id;
            return (
              <button
                key={col.id}
                type="button"
                onClick={() => setActiveCol(col.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all ${
                  active
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                }`}
              >
                {t(`${boardPrefix}.columns.${col.titleKey}`)}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${active ? "bg-white/20" : "bg-[color:var(--foreground-muted)]/10"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Task grid — 1 col on mobile, 2 cols on desktop */}
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filteredTasks
              .filter((task) => task.status === activeCol)
              .map((task) => (
                <div
                  key={task.id}
                  className="flex items-start gap-3 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-3 transition-all hover:bg-[color:var(--surface-card)]/80"
                >
                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                        task.priority === "high"
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                          : task.priority === "medium"
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : "bg-[color:var(--foreground-muted)]/10 text-[color:var(--foreground-muted)]"
                      }`}>
                        {priorityLabel(task.priority)}
                      </span>
                      {task.dueDate ? (
                        <span className="flex items-center gap-1 text-[10px] text-[color:var(--foreground-muted)]">
                          <Clock size={9} aria-hidden />
                          {formatBoardDueDate(task.dueDate)}
                        </span>
                      ) : null}
                    </div>
                    <h4 className="text-sm font-bold leading-snug text-[color:var(--foreground-main)] line-clamp-2">
                      {task.title}
                    </h4>
                    {task.description ? (
                      <p className="mt-0.5 text-[11px] leading-snug text-[color:var(--foreground-muted)] line-clamp-2">
                        {task.description}
                      </p>
                    ) : null}
                    {task.clientName ? (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[color:var(--foreground-muted)]">
                        <User size={10} aria-hidden />
                        {task.clientName}
                      </div>
                    ) : null}
                    <div className="mt-2">
                      <select
                        value={task.status}
                        onChange={(e) => void updateTaskStatus(task.id, e.target.value as BoardColumnId)}
                        className="rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-1 text-[10px] font-bold text-[color:var(--foreground-muted)] outline-none focus:ring-1 focus:ring-indigo-500/50"
                        aria-label={t(`${boardPrefix}.fields.status`)}
                      >
                        {columns.map((col) => (
                          <option key={col.id} value={col.id}>
                            {t(`${boardPrefix}.columns.${col.titleKey}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <ItemActions
                      onEdit={() => openEdit(task)}
                      onDelete={() => void handleDeleteTask(task.id)}
                      deleteConfirmMessage={t(`${boardPrefix}.deleteConfirm`)}
                      deleteTitle={t(`${boardPrefix}.deleteTitle`)}
                    />
                    {task.budget ? (
                      <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        ₪{task.budget.toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
          </div>

          {filteredTasks.filter((task) => task.status === activeCol).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center opacity-40">
              <p className="text-sm font-bold text-[color:var(--foreground-muted)]">
                {t(`${boardPrefix}.columns.${columns.find((c) => c.id === activeCol)?.titleKey ?? "todo"}`)}
              </p>
              <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">אין משימות</p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => {
              setAddForm({ ...emptyForm(selectedProjectName ?? ""), status: activeCol });
              setIsAddingProject(true);
            }}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[color:var(--border-main)] py-3 text-xs font-bold text-[color:var(--foreground-muted)] transition-all hover:border-indigo-500/50 hover:text-indigo-500"
          >
            <Plus size={14} aria-hidden />
            {t(`${boardPrefix}.addCard`)}
          </button>
        </div>
      </div>
    </div>
  );
}
