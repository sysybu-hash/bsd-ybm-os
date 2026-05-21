/** Kanban column ids used by ProjectBoardWidget */
export type BoardColumnId = "todo" | "in-progress" | "review" | "done";

export type BoardPriorityId = "low" | "medium" | "high";

const STATUS_TO_DB: Record<BoardColumnId, string> = {
  todo: "TODO",
  "in-progress": "IN_PROGRESS",
  review: "REVIEW",
  done: "DONE",
};

export function boardStatusToDb(columnId: string): string | undefined {
  const key = columnId as BoardColumnId;
  if (key in STATUS_TO_DB) return STATUS_TO_DB[key];
  const s = String(columnId ?? "").toLowerCase().replace(/_/g, "-");
  if (s === "todo" || s === "לביצוע") return "TODO";
  if (s === "in-progress" || s === "in_progress" || s === "בתהליך") return "IN_PROGRESS";
  if (s === "review" || s === "בביקורת") return "REVIEW";
  if (s === "done" || s === "הושלם") return "DONE";
  const upper = String(columnId ?? "").toUpperCase();
  if (upper === "TODO") return "TODO";
  if (upper === "IN_PROGRESS" || upper === "IN-PROGRESS") return "IN_PROGRESS";
  if (upper === "REVIEW") return "REVIEW";
  if (upper === "DONE") return "DONE";
  return undefined;
}

export function boardStatusFromDb(dbStatus: string): BoardColumnId {
  const s = String(dbStatus ?? "").toUpperCase().replace(/-/g, "_");
  if (s === "TODO") return "todo";
  if (s === "IN_PROGRESS") return "in-progress";
  if (s === "REVIEW") return "review";
  if (s === "DONE") return "done";
  return "todo";
}

export function boardPriorityToDb(priority: string): string | undefined {
  const p = String(priority ?? "").toLowerCase();
  if (p === "low" || p === "נמוך") return "LOW";
  if (p === "high" || p === "גבוה") return "HIGH";
  if (p === "medium" || p === "בינוני") return "MEDIUM";
  const upper = String(priority ?? "").toUpperCase();
  if (upper === "LOW" || upper === "HIGH" || upper === "MEDIUM") return upper;
  return undefined;
}

export function boardPriorityFromDb(dbPriority: string): BoardPriorityId {
  const p = String(dbPriority ?? "").toUpperCase();
  if (p === "LOW") return "low";
  if (p === "HIGH") return "high";
  return "medium";
}

export function formatBoardDueDate(dueDate: string | null | undefined): string {
  if (!dueDate || !String(dueDate).trim()) return "—";
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function parseClientFromDescription(description: string | null | undefined): string {
  if (!description) return "";
  const m = description.match(/Client:\s*([^|]+)/i);
  return m ? (m[1] ?? "").trim() : "";
}

export function buildTaskDescription(
  clientName: string | undefined,
  budget: number | undefined,
  description?: string | null,
): string | null {
  const base = description?.trim() || "";
  const parts: string[] = [];
  if (clientName?.trim()) parts.push(`Client: ${clientName.trim()}`);
  if (typeof budget === "number" && !Number.isNaN(budget)) parts.push(`Budget: ${budget}`);
  if (base && !base.match(/^Client:/i) && !base.match(/^Budget:/i)) {
    return parts.length ? `${base} | ${parts.join(" | ")}` : base;
  }
  return parts.length ? parts.join(" | ") : base || null;
}
