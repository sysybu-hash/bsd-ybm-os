"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useProjectPicker } from "@/hooks/use-project-picker";
import type { BoardColumnId } from "@/lib/tasks/board-mapping";
import type { OpenWorkspaceWidgetFn } from "@/components/os/widgets/CrmTableWidget";
import { createLogger } from "@/lib/logger";
import { emptyForm, taskToForm, syncTask, initialTasks } from "./constants";

const log = createLogger("project-board");
import type { Task, Contact, TaskFormState } from "./types";

const boardPrefix = "workspaceWidgets.projectBoard";

export function useProjectBoard({
  projectId,
  openWorkspaceWidget,
}: {
  projectId?: string;
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
}) {
  const { dir, t } = useI18n();

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

  void setSelectedProjectName;

  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<TaskFormState>(emptyForm());
  const [editForm, setEditForm] = useState<TaskFormState>(emptyForm());
  const [contacts, setContacts] = useState<Contact[]>([]);

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
      log.error("fetch_contacts_failed", { message: error instanceof Error ? error.message : String(error) });
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
            priority: (row.priority || "medium") as import("@/lib/tasks/board-mapping").BoardPriorityId,
          })),
        );
      } else {
        setTasks([]);
      }
    } catch (error) {
      log.error("fetch_tasks_failed", { message: error instanceof Error ? error.message : String(error) });
      toast.error(t(`${boardPrefix}.loadFailed`));
    }
  }, [resolvedProjectId, t]);

  useEffect(() => {
    if (showProjectPicker) { void loadProjectsList(); return; }
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
    () => ({ projectId: resolvedProjectId, projectName: selectedProjectName ?? undefined }),
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
      if (!res.ok || data.success === false) throw new Error(data.error);
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

  const priorityLabel = (p: import("@/lib/tasks/board-mapping").BoardPriorityId) =>
    t(`${boardPrefix}.priority.${p}`);

  return {
    dir, t, boardPrefix,
    resolvedProjectId, selectedProjectName,
    projectsList, projectsListLoading, showProjectPicker, loadProjectsList, selectProject,
    tasks, searchQuery, setSearchQuery,
    isAddingProject, setIsAddingProject,
    editingTaskId, setEditingTaskId,
    addForm, setAddForm,
    editForm, setEditForm,
    contacts,
    handleClearProject,
    openEdit,
    handleAddProject, handleSaveEdit, handleDeleteTask,
    updateTaskStatus, updateTaskBudget,
    filteredTasks, priorityLabel,
    openWorkspaceWidget,
  };
}
