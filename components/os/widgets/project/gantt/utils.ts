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
  if (scale === "weeks") {
    const day = cursor.getDay();
    cursor.setDate(cursor.getDate() - day);
  } else {
    cursor.setDate(1);
  }
  while (cursor.getTime() <= max + 86400000) {
    const t = cursor.getTime();
    ticks.push({
      label: scale === "weeks"
        ? cursor.toLocaleDateString("he-IL", { day: "numeric", month: "short" })
        : cursor.toLocaleDateString("he-IL", { month: "short", year: "2-digit" }),
      left: ((t - min) / span) * 100,
    });
    if (scale === "weeks") cursor.setDate(cursor.getDate() + 7);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  return ticks;
}

export function formatDateHe(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL");
}
