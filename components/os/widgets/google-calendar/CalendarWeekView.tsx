"use client";

import { CalendarDayTimeGrid } from "./CalendarDayTimeGrid";
import { isTodayDay, CalendarEventCard } from "./CalendarEventCard";
import { formatDayHeader } from "./format-event-time";
import type { CalendarEventRow } from "./types";

type CalendarWeekViewProps = {
  dir: "rtl" | "ltr";
  locale: string;
  weekDays: Date[];
  eventsByDay: Map<string, CalendarEventRow[]>;
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  calendarColor: string | null;
  canWrite: boolean;
  allDayLabel: string;
  fromTaskLabel: string;
  openInGoogleLabel: string;
  noEventsDayLabel: string;
  moreEventsLabel: (n: number) => string;
  dragHintLabel: string;
  onCreateRange: (start: Date, end: Date) => Promise<boolean>;
};

export function CalendarWeekView({
  dir,
  locale,
  weekDays,
  eventsByDay,
  selectedDay,
  onSelectDay,
  calendarColor,
  canWrite,
  allDayLabel,
  fromTaskLabel,
  openInGoogleLabel,
  noEventsDayLabel,
  dragHintLabel,
  onCreateRange,
}: CalendarWeekViewProps) {
  const selectedKey = selectedDay.toISOString().slice(0, 10);
  const selectedEvents = eventsByDay.get(selectedKey) ?? [];

  return (
    <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden gcal-print-surface" dir={dir}>
      {/* Day selector strip — bold compact cards with an event-count badge */}
      <div className="grid grid-cols-7 gap-1.5 p-3 shrink-0 lg:flex-[2] min-h-0 lg:content-start border-b lg:border-b-0 lg:border-e border-[color:var(--border-main)]/60">
        {weekDays.map((day) => {
          const key = day.toISOString().slice(0, 10);
          const count = (eventsByDay.get(key) ?? []).length;
          const { weekday } = formatDayHeader(day, locale);
          const today = isTodayDay(day);
          const selected = selectedKey === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(day)}
              aria-pressed={selected}
              className={`group relative flex flex-col items-center gap-1 rounded-2xl px-1 py-2.5 transition-all duration-200 ${
                today
                  ? "bg-gradient-to-b from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/30"
                  : selected
                    ? "bg-violet-500/15 text-[color:var(--foreground-main)] ring-2 ring-violet-500/40"
                    : "bg-[color:var(--surface-card)]/40 text-[color:var(--foreground-main)] hover:bg-[color:var(--surface-card)]/80 hover:-translate-y-0.5"
              }`}
            >
              <span
                className={`text-[9px] font-black uppercase tracking-wide ${
                  today ? "text-white/85" : "text-[color:var(--foreground-muted)]"
                }`}
              >
                {weekday}
              </span>
              <span className="text-lg font-black leading-none tabular-nums">{day.getDate()}</span>
              {count > 0 ? (
                <span
                  className={`mt-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-black ${
                    today
                      ? "bg-white/25 text-white"
                      : "bg-violet-500/20 text-violet-600 dark:text-violet-300"
                  }`}
                >
                  {count}
                </span>
              ) : (
                <span className="mt-0.5 h-[6px] w-[6px] rounded-full bg-current opacity-15" />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day — time grid + event list */}
      <aside className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[color:var(--border-main)]/50 shrink-0">
          <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 shadow-sm" />
          <h3 className="text-sm font-black text-[color:var(--foreground-main)]">
            {formatDayHeader(selectedDay, locale).weekday}, {formatDayHeader(selectedDay, locale).date}
          </h3>
          {selectedEvents.length > 0 ? (
            <span className="ms-auto rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-black text-violet-600 dark:text-violet-300">
              {selectedEvents.length}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col lg:flex-row flex-1 min-h-0">
          <div className="flex min-h-0 flex-1 flex-col p-2 border-b lg:border-b-0 lg:border-e border-[color:var(--border-main)]/40">
            <CalendarDayTimeGrid
              day={selectedDay}
              events={selectedEvents}
              locale={locale}
              calendarColor={calendarColor}
              canWrite={canWrite}
              allDayLabel={allDayLabel}
              dragHintLabel={dragHintLabel}
              onCreateRange={onCreateRange}
            />
          </div>
          <ul className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar min-h-0">
            {selectedEvents.length === 0 ? (
              <li className="flex flex-col items-center gap-2 py-8 text-center text-sm text-[color:var(--foreground-muted)]">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-2xl">
                  📅
                </span>
                {noEventsDayLabel}
              </li>
            ) : (
              selectedEvents.map((ev) => (
                <li key={ev.id}>
                  <CalendarEventCard
                    ev={ev}
                    locale={locale}
                    calendarColor={calendarColor}
                    allDayLabel={allDayLabel}
                    fromTaskLabel={fromTaskLabel}
                    openInGoogleLabel={openInGoogleLabel}
                    compact
                  />
                </li>
              ))
            )}
          </ul>
        </div>
      </aside>
    </div>
  );
}
