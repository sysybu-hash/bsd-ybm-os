/** עזרי תאריך לתצוגת שבוע בווידג'ט יומן (ללא תלות ב-timezone חיצוני). */

export type WeekStartsOn = 0 | 1;

export function weekStartsOnForLocale(locale: string): WeekStartsOn {
  if (locale === "he") return 0;
  if (locale === "en") return 1;
  return 1;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function startOfWeek(d: Date, weekStartsOn: WeekStartsOn): Date {
  const day = d.getDay();
  let diff = day - weekStartsOn;
  if (diff < 0) diff += 7;
  return startOfDay(addDays(d, -diff));
}

export function endOfWeek(weekStart: Date): Date {
  return endOfDay(addDays(weekStart, 6));
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function daysInWeek(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

export function eventOverlapsDay(eventStart: Date, eventEnd: Date, day: Date): boolean {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  return eventStart <= dayEnd && eventEnd >= dayStart;
}

export function startOfMonth(d: Date): Date {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonth(d: Date): Date {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** 42 ימים — רשת חודש מלאה (6 שבועות) */
export function daysInMonthGrid(anchor: Date, weekStartsOn: WeekStartsOn): Date[] {
  const gridStart = startOfWeek(startOfMonth(anchor), weekStartsOn);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function monthGridRange(anchor: Date, weekStartsOn: WeekStartsOn): { from: Date; to: Date } {
  const days = daysInMonthGrid(anchor, weekStartsOn);
  const first = days[0];
  const last = days[41];
  if (!first || !last) {
    const from = startOfMonth(anchor);
    const to = endOfMonth(anchor);
    return { from, to };
  }
  return { from: startOfDay(first), to: endOfDay(last) };
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}
