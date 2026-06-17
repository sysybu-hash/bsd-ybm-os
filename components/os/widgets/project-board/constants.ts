import type { BoardColumnId } from "@/lib/tasks/board-mapping";
import type { Task, TaskFormState } from "./types";

export const initialTasks: Task[] = [];

export const columns: { id: BoardColumnId; titleKey: string; color: string }[] = [
  { id: "todo", titleKey: "todo", color: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
  { id: "in-progress", titleKey: "inProgress", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { id: "review", titleKey: "review", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { id: "done", titleKey: "done", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
];

export const emptyForm = (projectName = ""): TaskFormState => ({
  title: "",
  description: "",
  projectName,
  contactId: "",
  budget: 0,
  dueDate: new Date().toISOString().split("T")[0]!,
  status: "todo",
  priority: "medium",
});

export function taskToForm(task: Task): TaskFormState {
  return {
    title: task.title,
    description: task.description ?? "",
    projectName: task.project,
    contactId: task.contactId ?? "",
    budget: task.budget,
    dueDate: task.dueDate || new Date().toISOString().split("T")[0]!,
    status: task.status,
    priority: task.priority,
  };
}

export async function syncTask(payload: Record<string, unknown>) {
  const projectId =
    typeof payload.projectId === "string" && payload.projectId.trim()
      ? payload.projectId.trim()
      : undefined;
  const taskId = typeof payload.id === "string" ? payload.id : undefined;
  const isUpdate = Boolean(taskId && !/^\d+$/.test(taskId));

  if (projectId) {
    const url = `/api/projects/${encodeURIComponent(projectId)}/tasks`;
    const body = isUpdate
      ? {
          id: taskId,
          title: payload.title,
          description: payload.description,
          status: payload.status,
          priority: payload.priority,
          dueDate: payload.dueDate,
          clientName: payload.clientName,
          contactId: payload.contactId,
          budget: payload.budget,
        }
      : {
          title: payload.title,
          description: payload.description,
          status: payload.status,
          priority: payload.priority,
          dueDate: payload.dueDate,
          clientName: payload.clientName,
          contactId: payload.contactId,
          budget: payload.budget,
        };

    const res = await fetch(url, {
      method: isUpdate ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      task?: { id?: string };
    };
    if (!res.ok || data.success === false) {
      throw new Error(data.error ?? "שגיאת שמירה");
    }
    return data;
  }

  const res = await fetch("/api/projects/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
  if (!res.ok || data.success === false) {
    throw new Error(data.error ?? "שגיאת שמירה");
  }
  return data;
}
