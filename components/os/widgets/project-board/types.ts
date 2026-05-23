import type { BoardColumnId, BoardPriorityId } from "@/lib/tasks/board-mapping";

export interface Contact {
  id: string;
  name: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  project: string;
  projectId?: string;
  clientName: string;
  contactId?: string;
  budget: number;
  status: BoardColumnId;
  priority: BoardPriorityId;
  dueDate: string;
}

export type TaskFormState = {
  title: string;
  description: string;
  projectName: string;
  contactId: string;
  budget: number;
  dueDate: string;
  status: BoardColumnId;
  priority: BoardPriorityId;
};
