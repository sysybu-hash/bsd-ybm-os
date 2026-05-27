import type { CalendarEventRow } from "./types";

export function formatEventTime(
  ev: CalendarEventRow,
  locale: string,
  allDayLabel: string,
): string {
  if (ev.allDay) return allDayLabel;
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  return `${start.toLocaleTimeString(locale, opts)} – ${end.toLocaleTimeString(locale, opts)}`;
}

export function formatDayHeader(day: Date, locale: string): { weekday: string; date: string } {
  return {
    weekday: day.toLocaleDateString(locale, { weekday: "short" }),
    date: day.toLocaleDateString(locale, { day: "numeric", month: "short" }),
  };
}

export function formatWeekRange(weekStart: Date, weekEnd: Date, locale: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const yOpts: Intl.DateTimeFormatOptions = { ...opts, year: "numeric" };
  const sameYear = weekStart.getFullYear() === weekEnd.getFullYear();
  const startStr = weekStart.toLocaleDateString(locale, sameYear ? opts : yOpts);
  const endStr = weekEnd.toLocaleDateString(locale, yOpts);
  return `${startStr} – ${endStr}`;
}

export function formatMonthYear(anchor: Date, locale: string): string {
  return anchor.toLocaleDateString(locale, { month: "long", year: "numeric" });
}
