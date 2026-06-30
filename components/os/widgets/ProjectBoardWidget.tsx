"use client";

import React, { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { BarChart3, Plus, Search, ArrowRight } from "lucide-react";
import AddProjectDialog from "@/components/os/widgets/shared/AddProjectDialog";
import ProjectPickerPanel from "@/components/os/widgets/shared/ProjectPickerPanel";
import ItemActions from "@/components/os/ItemActions";
import type { OpenWorkspaceWidgetFn } from "@/components/os/widgets/CrmTableWidget";
import { TaskFormModal } from "./project-board/TaskFormModal";
import CreateTaskPanel from "./project-board/CreateTaskPanel";
import { BoardColumn } from "./project-board/BoardColumn";
import { useProjectBoard } from "./project-board/useProjectBoard";
import { columns, emptyForm } from "./project-board/constants";
import type { BoardColumnId } from "@/lib/tasks/board-mapping";
import { TaskCard } from "./project-board/TaskCard";
import MobileFieldUpdateList from "./project-board/MobileFieldUpdateList";
import { widgetScrollPaneClass } from "@/lib/workspace/widget-shell-layout";

export type ProjectBoardWidgetProps = {
  projectId?: string;
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
  /** When nested inside project dashboard — compact chrome without project switcher */
  embedded?: boolean;
};

export default function ProjectBoardWidget({ projectId, openWorkspaceWidget, embedded = false }: ProjectBoardWidgetProps) {
  const s = useProjectBoard({ projectId, openWorkspaceWidget });
  const {
    dir, t, boardPrefix,
    resolvedProjectId, selectedProjectName, projectsList, projectsListLoading,
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
    filteredTasks, priorityLabel, refreshTasks,
  } = s;

  const [activeCol, setActiveCol] = useState<BoardColumnId>("todo");
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [createDefaultStatus, setCreateDefaultStatus] = useState<BoardColumnId>("todo");

  const openCreatePanel = (status: BoardColumnId = "todo") => {
    setCreateDefaultStatus(status);
    setIsCreatePanelOpen(true);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setDraggingTaskId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingTaskId(null);
    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const task = filteredTasks.find((item) => item.id === taskId);
    if (!task) return;

    const overId = String(over.id);
    const columnMatch = columns.find((col) => col.id === overId);
    const overTask = filteredTasks.find((item) => item.id === overId);
    const newStatus = columnMatch?.id ?? overTask?.status;
    if (newStatus && newStatus !== task.status) {
      void updateTaskStatus(taskId, newStatus);
    }
  };

  const draggingTask = draggingTaskId
    ? filteredTasks.find((task) => task.id === draggingTaskId)
    : undefined;

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
      {!resolvedProjectId ? (
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
      ) : null}
      <TaskFormModal
        open={editingTaskId !== null}
        title={t(`${boardPrefix}.editTitle`)}
        form={editForm}
        contacts={contacts}
        lockedProjectName={selectedProjectName ?? undefined}
        taskId={editingTaskId ?? undefined}
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
      {...(embedded ? {} : { "data-widget-sticky-chrome": true })}
      className={`flex w-full flex-1 flex-col overflow-hidden bg-transparent text-[color:var(--foreground-main)] ${
        embedded ? "min-h-[400px] h-full" : "h-full min-h-0"
      }`}
      dir={dir}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      {!embedded ? (
      <div className="shrink-0 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50">
        {/* Top row: icon + title + new task */}
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-6 sm:py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-[color:var(--win-accent,#6366f1)] dark:text-indigo-400 sm:h-10 sm:w-10">
            <BarChart3 size={20} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-bold sm:text-xl">
              {selectedProjectName ?? t(`${boardPrefix}.headerTitle`)}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              if (resolvedProjectId) {
                openCreatePanel("todo");
              } else {
                setAddForm(emptyForm(selectedProjectName ?? ""));
                setIsAddingProject(true);
              }
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[color:var(--win-accent,#6366f1)] px-3 py-2 text-xs font-bold text-white hover:opacity-90 transition-all"
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
      ) : (
        <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--border-main)] px-3 py-2">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute end-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)]" size={14} aria-hidden />
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
            onClick={() => {
              if (resolvedProjectId) {
                openCreatePanel("todo");
              } else {
                setAddForm(emptyForm(selectedProjectName ?? ""));
                setIsAddingProject(true);
              }
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[color:var(--win-accent,#6366f1)] px-3 py-2 text-xs font-bold text-white hover:opacity-90 transition-all"
          >
            <Plus size={15} aria-hidden />
            {t(`${boardPrefix}.newTask`)}
          </button>
        </div>
      )}

      {/* ── Board body ───────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {modals}

        <div data-widget-scroll-pane className={`min-h-0 flex-1 ${widgetScrollPaneClass}`}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="hidden h-full min-h-[320px] gap-4 overflow-x-auto p-4 md:flex md:items-stretch">
              {columns.map((col) => (
                <BoardColumn
                  key={col.id}
                  column={col}
                  tasks={filteredTasks.filter((task) => task.status === col.id)}
                  boardPrefix={boardPrefix}
                  t={t}
                  priorityLabel={priorityLabel}
                  onEdit={openEdit}
                  onDelete={(id) => void handleDeleteTask(id)}
                  onStatusChange={(id, status) => void updateTaskStatus(id, status)}
                  onBudgetChange={(id, budget) => void updateTaskBudget(id, budget)}
                  onAddInColumn={(form) => {
                    if (resolvedProjectId) {
                      openCreatePanel(form.status);
                    } else {
                      setAddForm(form);
                      setIsAddingProject(true);
                    }
                  }}
                  selectedProjectName={selectedProjectName}
                />
              ))}
            </div>
            <DragOverlay>
              {draggingTask ? (
                <TaskCard
                  task={draggingTask}
                  boardPrefix={boardPrefix}
                  t={t}
                  priorityLabel={priorityLabel}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onStatusChange={() => {}}
                  onBudgetChange={() => {}}
                  isDragging
                />
              ) : null}
            </DragOverlay>
          </DndContext>

          {/* Mobile: שטח — עדכון מהיר במקום קנבן מלא */}
          <div className="p-3 md:hidden">
            {resolvedProjectId ? (
              <MobileFieldUpdateList
                tasks={filteredTasks}
                t={t}
                boardPrefix={boardPrefix}
                projectId={resolvedProjectId}
                projectName={selectedProjectName}
                onStatusChange={(taskId, status) => void updateTaskStatus(taskId, status)}
                onDiaryApplied={() => void refreshTasks()}
              />
            ) : (
              <>
                <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[color:var(--border-main)] pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                            ? "bg-[color:var(--win-accent,#6366f1)] text-white shadow-sm"
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
                <div className="mt-3 grid grid-cols-1 gap-2">
                  {filteredTasks
                    .filter((task) => task.status === activeCol)
                    .map((task) => (
                      <div
                        key={task.id}
                        className="flex items-start gap-3 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-3 transition-all hover:bg-[color:var(--surface-card)]/80"
                      >
                        <div className="min-w-0 flex-1">
                          <h4 className="line-clamp-2 text-sm font-bold leading-snug text-[color:var(--foreground-main)]">
                            {task.title}
                          </h4>
                        </div>
                        <ItemActions
                          onEdit={() => openEdit(task)}
                          onDelete={() => void handleDeleteTask(task.id)}
                          deleteConfirmMessage={t(`${boardPrefix}.deleteConfirm`)}
                          deleteTitle={t(`${boardPrefix}.deleteTitle`)}
                        />
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {resolvedProjectId ? (
        <CreateTaskPanel
          projectId={resolvedProjectId}
          open={isCreatePanelOpen}
          onClose={() => setIsCreatePanelOpen(false)}
          defaultStatus={createDefaultStatus}
        />
      ) : null}
    </div>
  );
}
