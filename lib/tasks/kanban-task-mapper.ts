import type { Prisma } from "@prisma/client";
import {
  parseClientFromDescription,
  boardPriorityFromDb,
  boardStatusFromDb,
  type BoardColumnId,
  type BoardPriorityId,
} from "@/lib/tasks/board-mapping";
import { getTaskTradeNotes } from "@/lib/project-task-trade";

export type TaskKanbanMetadata = {
  clientName?: string;
  contactId?: string;
  budget?: number;
};

export function parseTaskKanbanMetadata(raw: unknown): TaskKanbanMetadata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const budget =
    typeof record.budget === "number"
      ? record.budget
      : typeof record.budget === "string"
        ? Number(record.budget)
        : undefined;
  return {
    clientName: typeof record.clientName === "string" ? record.clientName : undefined,
    contactId: typeof record.contactId === "string" ? record.contactId : undefined,
    budget: budget !== undefined && !Number.isNaN(budget) ? budget : undefined,
  };
}

export function buildTaskKanbanMetadataJson(
  opts: TaskKanbanMetadata,
): Prisma.InputJsonValue {
  const meta: Record<string, unknown> = {};
  const clientName = opts.clientName?.trim();
  if (clientName) meta.clientName = clientName;
  if (opts.contactId?.trim()) meta.contactId = opts.contactId.trim();
  if (typeof opts.budget === "number" && !Number.isNaN(opts.budget)) {
    meta.budget = opts.budget;
  }
  return meta as Prisma.InputJsonValue;
}

export function mergeTaskKanbanMetadata(
  existing: unknown,
  patch: TaskKanbanMetadata,
): Prisma.InputJsonValue {
  const base = parseTaskKanbanMetadata(existing);
  return buildTaskKanbanMetadataJson({ ...base, ...patch });
}

export function parseBudgetFromDescription(description: string | null | undefined): number {
  if (!description) return 0;
  const m = description.match(/Budget:\s*([\d.]+)/i);
  return m ? Number(m[1]) || 0 : 0;
}

export function stripManagedDescription(description: string | null | undefined): string {
  if (!description) return "";
  const tradeNotes = getTaskTradeNotes(description);
  const withoutTrade = tradeNotes || description;
  return withoutTrade
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p && !/^Client:/i.test(p) && !/^Budget:/i.test(p))
    .join(" | ");
}

export type BoardTaskRow = {
  id: string;
  title: string;
  description: string;
  project: string;
  projectName: string;
  projectId: string;
  clientName: string;
  contactId: string;
  budget: number;
  status: BoardColumnId;
  priority: BoardPriorityId;
  dueDate: string;
};

type TaskWithProject = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  projectId: string;
  metadata: unknown;
  project: {
    name: string;
    budget: number;
    primaryContactId: string | null;
    contacts: { id: string; name: string }[];
  };
};

export function mapPrismaTaskToBoardRow(task: TaskWithProject): BoardTaskRow {
  const meta = parseTaskKanbanMetadata(task.metadata);
  const contactId =
    meta.contactId ?? task.project.primaryContactId ?? task.project.contacts[0]?.id ?? "";
  const clientFromDesc = parseClientFromDescription(task.description);
  const clientName =
    meta.clientName ?? task.project.contacts[0]?.name ?? clientFromDesc ?? "";
  const budgetFromMeta = meta.budget;
  const budget =
    typeof budgetFromMeta === "number" && budgetFromMeta > 0
      ? budgetFromMeta
      : task.project.budget > 0
        ? task.project.budget
        : parseBudgetFromDescription(task.description);

  return {
    id: task.id,
    title: task.title,
    description: stripManagedDescription(task.description),
    project: task.project.name,
    projectName: task.project.name,
    projectId: task.projectId,
    clientName,
    contactId,
    budget,
    status: boardStatusFromDb(task.status),
    priority: boardPriorityFromDb(task.priority),
    dueDate: task.dueDate ? task.dueDate.toISOString().split("T")[0]! : "",
  };
}
