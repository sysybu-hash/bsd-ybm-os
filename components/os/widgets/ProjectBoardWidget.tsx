"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import ItemActions from "@/components/os/ItemActions";
import ProjectPickerPanel from "@/components/os/widgets/shared/ProjectPickerPanel";
import type { OpenWorkspaceWidgetFn } from "@/components/os/widgets/CrmTableWidget";
import { useProjectPicker } from "@/hooks/use-project-picker";
import React, { useState, useEffect, useCallback } from "react";
import { BarChart3, Plus, Clock, Search, User, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { formatBoardDueDate, type BoardColumnId, type BoardPriorityId } from "@/lib/tasks/board-mapping";
import { TaskFormModal } from "./project-board/TaskFormModal";
import { columns, emptyForm, taskToForm, syncTask, initialTasks } from "./project-board/constants";
import type { Task, Contact, TaskFormState } from "./project-board/types";

export type ProjectBoardWidgetProps = {
  projectId?: string;
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
};

export default function ProjectBoardWidget({
  projectId,
  openWorkspaceWidget,
}: ProjectBoardWidgetProps) {
  const { dir, t } = useI18n();
  const boardPrefix = "workspaceWidgets.projectBoard";
  const {
    resolvedProjectId,
    selectedProjectName,
    projectsList,
    projectsListLoading,
    showProjectPicker,
    loadProjectsList,
    selectProject,
    clearProject,
    syncProjectName,
    setSelectedProjectName,
  } = useProjectPicker({
    initialProjectId: projectId ?? "",
    listErrorKey: `${boardPrefix}.loadFailed`,
  });
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<TaskFormState>(emptyForm());
  const [editForm, setEditForm] = useState<TaskFormState>(emptyForm());
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Suppress unused-variable lint for setSelectedProjectName (kept for future use)
  void setSelectedProjectName;

  const handleClearProject = useCallback(() => {
    clearProject();
    setTasks([]);
    setSearchQuery("");
  }, [clearProject]);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/contacts", { credentials: "include" });
      const data = (await res.json()) as { contacts?: { id: string; name: string }[] };
      const rows = Array.isArray(data.contacts) ? data.contacts : [];
      setContacts(rows.map((c) => ({ id: c.id, name: c.name })));
    } catch (error) {
      console.error("Failed to fetch contacts:", error);
    }
  }, []);

  const fetchTasks = useCallback(async () => {
    if (!resolvedProjectId) return;
    try {
      const res = await fetch(
        `/api/projects/update?projectId=${encodeURIComponent(resolvedProjectId)}`,
        { credentials: "include" },
      );
      const data = (await res.json()) as Task[] | unknown;
      if (Array.isArray(data)) {
        setTasks(
          (data as Task[]).map((row) => ({
            ...row,
            status: (row.status || "todo") as BoardColumnId,
            priority: (row.priority || "medium") as BoardPriorityId,
          })),
        );
      } else {
        setTasks([]);
      }
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
      toast.error(t(`${boardPrefix}.loadFailed`));
    }
  }, [resolvedProjectId, t]);

  useEffect(() => {
    if (showProjectPicker) {
      void loadProjectsList();
      return;
    }
    void fetchContacts();
    void fetchTasks();
  }, [showProjectPicker, loadProjectsList, fetchContacts, fetchTasks]);

  useEffect(() => {
    if (!resolvedProjectId || selectedProjectName) return;
    void (async () => {
      const list = projectsList.length ? projectsList : await loadProjectsList();
      syncProjectName(resolvedProjectId, list);
    })();
  }, [resolvedProjectId, selectedProjectName, projectsList, loadProjectsList, syncProjectName]);

  const taskPayloadBase = useCallback(
    () => ({
      projectId: resolvedProjectId,
      projectName: selectedProjectName ?? undefined,
    }),
    [resolvedProjectId, selectedProjectName],
  );

  const openEdit = (task: Task) => {
    setEditingTaskId(task.id);
    setEditForm(taskToForm(task));
  };

  const handleAddProject = async () => {
    const contact = contacts.find((c) => c.id === addForm.contactId);
    const projectLabel = selectedProjectName ?? addForm.projectName.trim();
    if (!addForm.title.trim() || !contact || (!resolvedProjectId && !projectLabel)) {
      toast.error(t(`${boardPrefix}.requiredFields`));
      return;
    }

    const optimisticId = `temp-${Date.now()}`;
    const optimistic: Task = {
      id: optimisticId,
      title: addForm.title.trim(),
      description: addForm.description.trim(),
      project: projectLabel,
      projectId: resolvedProjectId,
      clientName: contact.name,
      contactId: addForm.contactId,
      budget: addForm.budget,
      status: addForm.status,
      priority: addForm.priority,
      dueDate: addForm.dueDate,
    };

    setTasks((prev) => [optimistic, ...prev]);
    setIsAddingProject(false);
    setAddForm(emptyForm(selectedProjectName ?? ""));

    try {
      const data = (await syncTask({
        ...taskPayloadBase(),
        title: optimistic.title,
        description: optimistic.description,
        projectName: projectLabel,
        contactId: addForm.contactId,
        clientName: contact.name,
        budget: optimistic.budget,
        status: optimistic.status,
        priority: optimistic.priority,
        dueDate: optimistic.dueDate,
      })) as { task?: { id?: string } };
      if (data.task?.id) {
        setTasks((prev) =>
          prev.map((item) => (item.id === optimisticId ? { ...item, id: data.task!.id! } : item)),
        );
      }
      toast.success(t(`${boardPrefix}.created`));
      void fetchTasks();
    } catch {
      setTasks((prev) => prev.filter((item) => item.id !== optimisticId));
      toast.error(t(`${boardPrefix}.saveFailed`));
    }
  };

  const handleSaveEdit = async () => {
    if (!editingTaskId) return;
    const task = tasks.find((item) => item.id === editingTaskId);
    if (!task) return;

    const contact = contacts.find((c) => c.id === editForm.contactId);
    const projectLabel = selectedProjectName ?? editForm.projectName.trim();
    if (!editForm.title.trim() || (!resolvedProjectId && !projectLabel)) {
      toast.error(t(`${boardPrefix}.requiredFields`));
      return;
    }

    const updated: Task = {
      ...task,
      title: editForm.title.trim(),
      description: editForm.description.trim(),
      project: projectLabel,
      projectId: resolvedProjectId ?? task.projectId,
      clientName: contact?.name ?? task.clientName,
      contactId: editForm.contactId,
      budget: editForm.budget,
      status: editForm.status,
      priority: editForm.priority,
      dueDate: editForm.dueDate,
    };

    const prev = tasks;
    setTasks((list) => list.map((item) => (item.id === editingTaskId ? updated : item)));
    setEditingTaskId(null);

    try {
      await syncTask({
        ...taskPayloadBase(),
        id: task.id,
        title: updated.title,
        description: updated.description,
        projectName: projectLabel,
        contactId: editForm.contactId || undefined,
        clientName: updated.clientName,
        budget: updated.budget,
        status: updated.status,
        priority: updated.priority,
        dueDate: updated.dueDate,
      });
      toast.success(t(`${boardPrefix}.updated`));
    } catch {
      setTasks(prev);
      toast.error(t(`${boardPrefix}.saveFailed`));
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const prev = tasks;
    setTasks((list) => list.filter((item) => item.id !== taskId));
    if (editingTaskId === taskId) setEditingTaskId(null);

    try {
      const res = await fetch(`/api/projects/update?id=${encodeURIComponent(taskId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || data.success === false) {
        throw new Error(data.error);
      }
      toast.success(t(`${boardPrefix}.deleted`));
    } catch {
      setTasks(prev);
      toast.error(t(`${boardPrefix}.deleteFailed`));
    }
  };

  const updateTaskStatus = async (taskId: string, newStatus: BoardColumnId) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === newStatus) return;

    const prev = tasks;
    setTasks((list) => list.map((item) => (item.id === taskId ? { ...item, status: newStatus } : item)));

    try {
      await syncTask({ ...taskPayloadBase(), ...task, status: newStatus });
      toast.success(t(`${boardPrefix}.statusUpdated`));
    } catch {
      setTasks(prev);
      toast.error(t(`${boardPrefix}.saveFailed`));
    }
  };

  const updateTaskBudget = async (taskId: string, newBudget: number) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.budget === newBudget) return;

    const prev = tasks;
    setTasks((list) =>
      list.map((item) => (item.id === taskId ? { ...item, budget: newBudget } : item)),
    );

    try {
      await syncTask({ ...taskPayloadBase(), ...task, budget: newBudget });
      toast.success(t(`${boardPrefix}.budgetUpdated`));
    } catch {
      setTasks(prev);
      toast.error(t(`${boardPrefix}.saveFailed`));
    }
  };

  const filteredTasks = tasks.filter(
    (item) =>
      item.title.includes(searchQuery) ||
      item.project.includes(searchQuery) ||
      item.clientName.includes(searchQuery),
  );

  const priorityLabel = (p: BoardPriorityId) => t(`${boardPrefix}.priority.${p}`);

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
            <Search
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              size={16}
            />
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
            onClick={() => {
              setAddForm(emptyForm(selectedProjectName ?? ""));
              setIsAddingProject(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 w-full md:w-auto justify-center"
          >
            <Plus size={18} /> {t(`${boardPrefix}.newTask`)}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto p-6 flex gap-6 custom-scrollbar relative">
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
          <div key={column.id} className="flex-shrink-0 w-72 flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${column.color}`}
                >
                  {t(`${boardPrefix}.columns.${column.titleKey}`)}
                </span>
                <span className="text-xs text-slate-500 font-bold">
                  {filteredTasks.filter((item) => item.status === column.id).length}
                </span>
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-3">
              {filteredTasks
                .filter((item) => item.status === column.id)
                .map((task) => (
                  <div
                    key={task.id}
                    className="bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-2xl p-4 hover:bg-[color:var(--surface-card)]/80 transition-all group shadow-sm dark:shadow-none"
                  >
                    <div className="flex justify-between items-start mb-3 gap-2">
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0 ${
                          task.priority === "high"
                            ? "bg-rose-500/20 text-rose-600 dark:text-rose-400"
                            : task.priority === "medium"
                              ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                              : "bg-[color:var(--foreground-muted)]/20 text-[color:var(--foreground-muted)]"
                        }`}
                      >
                        {priorityLabel(task.priority)}
                      </span>
                      <div className="flex items-center gap-1">
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ItemActions
                            onEdit={() => openEdit(task)}
                            onDelete={() => void handleDeleteTask(task.id)}
                            deleteConfirmMessage={t(`${boardPrefix}.deleteConfirm`)}
                            deleteTitle={t(`${boardPrefix}.deleteTitle`)}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-[color:var(--foreground-muted)]">₪</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          defaultValue={task.budget}
                          onBlur={(e) =>
                            updateTaskBudget(task.id, parseFloat(e.target.value) || 0)
                          }
                          className="w-16 bg-transparent border-none text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold focus:ring-0 p-0 text-left"
                          aria-label={t(`${boardPrefix}.fields.budget`)}
                        />
                      </div>
                    </div>

                    <h4 className="text-sm font-bold text-[color:var(--foreground-main)] mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-2">
                      {task.title}
                    </h4>

                    {task.description ? (
                      <p className="text-[10px] text-[color:var(--foreground-muted)] mb-2 line-clamp-2">
                        {task.description}
                      </p>
                    ) : null}

                    <div className="flex items-center gap-2 mb-3">
                      <select
                        value={task.status}
                        onChange={(e) =>
                          updateTaskStatus(task.id, e.target.value as BoardColumnId)
                        }
                        className="bg-[color:var(--surface-card)] border border-[color:var(--border-main)] rounded-lg px-2 py-1 text-[10px] font-bold text-[color:var(--foreground-muted)] outline-none focus:ring-1 focus:ring-indigo-500/50"
                        aria-label={t(`${boardPrefix}.fields.status`)}
                      >
                        {columns.map((col) => (
                          <option key={col.id} value={col.id}>
                            {t(`${boardPrefix}.columns.${col.titleKey}`)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-0.5 mb-4">
                      <div className="flex items-center gap-1.5 text-[10px] text-[color:var(--foreground-muted)] opacity-80">
                        <User size={10} aria-hidden />
                        <span>{task.clientName || "—"}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center border-t border-[color:var(--border-main)]/30 pt-3">
                      <div className="flex items-center gap-1.5 text-[color:var(--foreground-muted)]">
                        <Clock size={12} aria-hidden />
                        <span className="text-[10px] font-medium">
                          {formatBoardDueDate(task.dueDate)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEdit(task)}
                        className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity md:opacity-100"
                      >
                        {t("workspaceWidgets.itemActions.edit")}
                      </button>
                    </div>
                  </div>
                ))}

              <button
                type="button"
                onClick={() => {
                  setAddForm({ ...emptyForm(selectedProjectName ?? ""), status: column.id });
                  setIsAddingProject(true);
                }}
                className="w-full py-3 border-2 border-dashed border-[color:var(--border-main)] rounded-2xl text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] hover:border-[color:var(--foreground-muted)] transition-all text-xs font-bold flex items-center justify-center gap-2"
              >
                <Plus size={14} /> {t(`${boardPrefix}.addCard`)}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
