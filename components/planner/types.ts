import type { PlannerKind } from "@/lib/planner/meta";

export type PlannerEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
  kind: PlannerKind;
  reminderMinutes: number | null;
  editable: boolean;
  source: "planner";
};

export type PlannerDraft = {
  summary: string;
  start: Date;
  end: Date;
  allDay: boolean;
  kind: PlannerKind;
  reminderMinutes: number | null;
};

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Build 6×7 month cells starting Sunday (RTL Hebrew week often starts Sunday). */
export function buildMonthCells(anchor: Date): Date[] {
  const first = startOfMonth(anchor);
  const startPad = first.getDay(); // 0 = Sunday
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startPad);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }
  return cells;
}

export function groupEventsByDay(events: PlannerEvent[]): Map<string, PlannerEvent[]> {
  const map = new Map<string, PlannerEvent[]>();
  for (const ev of events) {
    const start = new Date(ev.start);
    const end = new Date(ev.end);
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    // Cap multi-day span
    for (let i = 0; i < 60 && cursor <= last; i++) {
      const k = dayKey(cursor);
      const list = map.get(k) ?? [];
      list.push(ev);
      map.set(k, list);
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return map;
}
