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
import AddProjectDialog from "@/components/os/widgets/shared/AddProjectDialog";
import ProjectPickerPanel from "@/components/os/widgets/shared/ProjectPickerPanel";
import type { OpenWorkspaceWidgetFn } from "@/components/os/widgets/CrmTableWidget";
import { TaskFormModal } from "./project-board/TaskFormModal";
import CreateTaskPanel from "./project-board/CreateTaskPanel";
import { BoardColumn } from "./project-board/BoardColumn";
import { BoardHeader } from "./project-board/BoardHeader";
import { MobileColumnList } from "./project-board/MobileColumnList";
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
      <BoardHeader
        embedded={embedded}
        boardPrefix={boardPrefix}
        t={t}
        selectedProjectName={selectedProjectName}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onNewTask={() => {
          if (resolvedProjectId) {
            openCreatePanel("todo");
          } else {
            setAddForm(emptyForm(selectedProjectName ?? ""));
            setIsAddingProject(true);
          }
        }}
        onSwitchProject={handleClearProject}
      />

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
              <MobileColumnList
                boardPrefix={boardPrefix}
                t={t}
                filteredTasks={filteredTasks}
                activeCol={activeCol}
                setActiveCol={setActiveCol}
                onEdit={openEdit}
                onDelete={(id) => void handleDeleteTask(id)}
              />
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
