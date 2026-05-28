"use client";

import React from "react";
import { BarChart3, Plus, Search, ArrowRight } from "lucide-react";
import ProjectPickerPanel from "@/components/os/widgets/shared/ProjectPickerPanel";
import type { OpenWorkspaceWidgetFn } from "@/components/os/widgets/CrmTableWidget";
import { TaskFormModal } from "./project-board/TaskFormModal";
import { BoardColumn } from "./project-board/BoardColumn";
import { useProjectBoard } from "./project-board/useProjectBoard";
import { columns, emptyForm } from "./project-board/constants";

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

  if (showProjectPicker) {
    return (
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
        statusActiveKey="projectDashboard.statusActive"
        statusInactiveKey="projectDashboard.statusInactive"
      />
    );
  }

  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)]"
      dir={dir}
    >
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
            <BarChart3 size={24} />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate">
              {selectedProjectName ?? t(`${boardPrefix}.headerTitle`)}
            </h2>
            <p className="text-xs text-[color:var(--foreground-muted)]">
              {t(`${boardPrefix}.headerSubtitleScoped`)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:gap-4 w-full md:w-auto">
          <button
            type="button"
            onClick={handleClearProject}
            className="flex items-center gap-1.5 rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-xs font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-elevated)] transition-all"
          >
            <ArrowRight size={14} aria-hidden />
            {t(`${boardPrefix}.switchProject`)}
          </button>
          <div className="relative w-full md:w-auto">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
            <input
              type="text"
              placeholder={t(`${boardPrefix}.searchPlaceholder`)}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-2 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-full md:w-64 text-slate-900 dark:text-slate-200"
            />
          </div>
          <button
            type="button"
            onClick={() => { setAddForm(emptyForm(selectedProjectName ?? "")); setIsAddingProject(true); }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 w-full md:w-auto justify-center"
          >
            <Plus size={18} /> {t(`${boardPrefix}.newTask`)}
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 min-h-0 overflow-x-auto p-6 flex gap-6 custom-scrollbar relative">
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

        {columns.map((column) => (
          <BoardColumn
            key={column.id}
            column={column}
            tasks={filteredTasks.filter((item) => item.status === column.id)}
            boardPrefix={boardPrefix}
            t={t}
            priorityLabel={priorityLabel}
            onEdit={openEdit}
            onDelete={(id) => void handleDeleteTask(id)}
            onStatusChange={(id, status) => void updateTaskStatus(id, status)}
            onBudgetChange={(id, budget) => void updateTaskBudget(id, budget)}
            onAddInColumn={(form) => { setAddForm(form); setIsAddingProject(true); }}
            selectedProjectName={selectedProjectName}
          />
        ))}
      </div>
    </div>
  );
}
