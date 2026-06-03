import type { ProjectSubDomainId } from "@/lib/project-sub-domains";
import type { GanttTask, GanttTaskDraft, Scale } from "./types";

export const TRADE_BAR: Partial<Record<ProjectSubDomainId, string>> = {
  SKELETON: "from-stone-600/90 to-stone-500/80",
  PLUMBING: "from-cyan-600/90 to-blue-600/80",
  ELECTRICAL: "from-amber-500/90 to-orange-600/80",
  HVAC: "from-sky-600/90 to-indigo-600/80",
  PAINTING: "from-pink-600/90 to-rose-600/80",
  SALES: "from-emerald-600/90 to-teal-600/80",
  OPERATIONS: "from-cyan-600/90 to-sky-600/80",
  FINANCE: "from-amber-600/90 to-yellow-600/80",
  HR: "from-violet-600/90 to-purple-600/80",
  PRODUCT: "from-indigo-600/90 to-blue-600/80",
  MARKETING: "from-rose-600/90 to-pink-600/80",
  GENERAL: "from-indigo-600/90 to-violet-600/80",
};

export function parseTime(iso: string | null, fallback: number): number {
  if (!iso) return fallback;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? fallback : t;
}

export function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function parseDependencyIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
  } catch { /* */ }
  return raw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
}

export function emptyDraft(): GanttTaskDraft {
  const today = new Date().toISOString().slice(0, 10);
  const next = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  return { title: "", startDate: today, endDate: next, progress: 0, tradeId: "", dependencies: "", linkedBoqLineId: "" };
}

export function draftFromTask(task: GanttTask): GanttTaskDraft {
  return {
    title: task.title,
    startDate: toDateInput(task.startDate),
    endDate: toDateInput(task.endDate),
    progress: task.progress,
    tradeId: task.tradeId ?? "",
    dependencies: parseDependencyIds(task.dependencies).join(", "),
    linkedBoqLineId: task.linkedBoqLineId ?? "",
  };
}

export function buildTicks(min: number, max: number, scale: Scale): { label: string; left: number }[] {
  const ticks: { label: string; left: number }[] = [];
  const span = max - min || 1;
  const cursor = new Date(min);
  cursor.setHours(0, 0, 0, 0);

  if (scale === "days") {
    // Start from the day that contains min
  } else if (scale === "weeks") {
    const day = cursor.getDay();
    cursor.setDate(cursor.getDate() - day);
  } else {
    cursor.setDate(1);
  }

  const maxTicks = 120;
  let count = 0;
  while (cursor.getTime() <= max + 86400000 && count < maxTicks) {
    const t = cursor.getTime();
    let label: string;
    if (scale === "days") {
      label = cursor.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
    } else if (scale === "weeks") {
      label = cursor.toLocaleDateString("he-IL", { day: "numeric", month: "short" });
    } else {
      label = cursor.toLocaleDateString("he-IL", { month: "short", year: "2-digit" });
    }
    ticks.push({ label, left: ((t - min) / span) * 100 });

    if (scale === "days") cursor.setDate(cursor.getDate() + 1);
    else if (scale === "weeks") cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
    count++;
  }
  return ticks;
}

/** Choose the best default scale given the project span in ms */
export function autoScale(spanMs: number): Scale {
  const days = spanMs / 86400000;
  if (days <= 35) return "days";
  if (days <= 200) return "weeks";
  return "months";
}

export function formatDateHe(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL");
}

export type FlatTask = GanttTask & { depth: number; hasChildren: boolean };

/** Flatten tasks tree in DFS order, tracking depth */
export function flattenTaskTree(
  tasks: GanttTask[],
  collapsed: Set<string>,
): FlatTask[] {
  const childrenOf = new Map<string | null, GanttTask[]>();
  for (const t of tasks) {
    const pid = t.parentTaskId ?? null;
    if (!childrenOf.has(pid)) childrenOf.set(pid, []);
    childrenOf.get(pid)!.push(t);
  }

  const result: FlatTask[] = [];

  function visit(id: string | null, depth: number) {
    const children = childrenOf.get(id) ?? [];
    for (const t of children) {
      const kids = childrenOf.get(t.id) ?? [];
      result.push({ ...t, depth, hasChildren: kids.length > 0 });
      if (kids.length > 0 && !collapsed.has(t.id)) {
        visit(t.id, depth + 1);
      }
    }
  }

  visit(null, 0);

  // If no root tasks exist (all have parents but some parents are missing), fall back to flat list
  if (result.length === 0 && tasks.length > 0) {
    return tasks.map((t) => ({ ...t, depth: 0, hasChildren: false }));
  }
  return result;
}

/** Compute average progress of a task including all descendants */
export function computeAggregateProgress(taskId: string, tasks: GanttTask[]): number {
  const children = tasks.filter((t) => t.parentTaskId === taskId);
  if (children.length === 0) return tasks.find((t) => t.id === taskId)?.progress ?? 0;
  const avg = children.reduce((sum, c) => sum + computeAggregateProgress(c.id, tasks), 0) / children.length;
  return Math.round(avg);
}

/** Returns true if the task date range covers a weekend day */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 5 || day === 6; // Friday=5, Saturday=6 for Israel
}

/** Build weekend shade bands for the days scale */
export function buildWeekendBands(
  min: number,
  max: number,
): { left: number; width: number }[] {
  const span = max - min || 1;
  const bands: { left: number; width: number }[] = [];
  const cursor = new Date(min);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= max) {
    if (isWeekend(cursor)) {
      const start = cursor.getTime();
      const end = start + 86400000;
      bands.push({
        left: ((start - min) / span) * 100,
        width: (86400000 / span) * 100,
      });
      // Skip the next day if it's also weekend
      cursor.setDate(cursor.getDate() + 1);
      if (isWeekend(cursor)) {
        const s2 = cursor.getTime();
        bands.push({
          left: ((s2 - min) / span) * 100,
          width: (86400000 / span) * 100,
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return bands;
}
