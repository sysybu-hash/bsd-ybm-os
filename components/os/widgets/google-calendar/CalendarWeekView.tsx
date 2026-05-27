"use client";

import { calendarColorStyle } from "@/lib/client/google-calendar-colors";
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

const MAX_VISIBLE = 3;

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
  moreEventsLabel,
  dragHintLabel,
  onCreateRange,
}: CalendarWeekViewProps) {
  const selectedKey = selectedDay.toISOString().slice(0, 10);
  const selectedEvents = eventsByDay.get(selectedKey) ?? [];

  return (
    <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden gcal-print-surface" dir={dir}>
      <div className="grid grid-cols-7 gap-1 p-3 lg:flex-[2] min-h-0 border-b lg:border-b-0 lg:border-e border-[color:var(--border-main)]">
        {weekDays.map((day) => {
          const key = day.toISOString().slice(0, 10);
          const dayEvents = eventsByDay.get(key) ?? [];
          const { weekday, date } = formatDayHeader(day, locale);
          const today = isTodayDay(day);
          const selected = selectedKey === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(day)}
              className={`flex flex-col min-h-[100px] lg:min-h-[200px] rounded-xl border text-start transition-all p-1.5 gap-1 ${
                selected
                  ? "border-violet-500/50 bg-violet-500/10 ring-1 ring-violet-500/30"
                  : "border-[color:var(--border-main)]/60 bg-[color:var(--surface-card)]/20 hover:bg-[color:var(--surface-card)]/40"
              }`}
            >
              <div
                className={`text-center py-1 rounded-lg ${
                  today ? "bg-violet-600 text-white" : ""
                }`}
              >
                <div className="text-[10px] font-black uppercase opacity-80">{weekday}</div>
                <div className={`text-sm font-black tabular-nums ${today ? "" : "text-[color:var(--foreground-main)]"}`}>
                  {date}
                </div>
              </div>
              <div className="flex-1 space-y-1 overflow-hidden">
                {dayEvents.length === 0 ? (
                  <p className="text-[9px] text-[color:var(--foreground-muted)] text-center py-2 opacity-60">
                    —
                  </p>
                ) : (
                  <>
                    {dayEvents.slice(0, MAX_VISIBLE).map((ev) => {
                      const style = calendarColorStyle(calendarColor, ev.entityType === "TASK");
                      return (
                        <div
                          key={ev.id}
                          className="gcal-event-chip truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold border"
                          style={style}
                          title={ev.summary}
                        >
                          {ev.summary}
                        </div>
                      );
                    })}
                    {dayEvents.length > MAX_VISIBLE ? (
                      <p className="text-[9px] font-bold text-violet-600 dark:text-violet-400 text-center">
                        {moreEventsLabel(dayEvents.length - MAX_VISIBLE)}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <aside className="lg:flex-1 flex flex-col min-h-0 max-h-[45vh] lg:max-h-none">
        <div className="px-4 py-2 border-b border-[color:var(--border-main)]/50 shrink-0">
          <h3 className="text-xs font-black uppercase tracking-widest text-[color:var(--foreground-muted)]">
            {formatDayHeader(selectedDay, locale).weekday},{" "}
            {formatDayHeader(selectedDay, locale).date}
          </h3>
        </div>
        <div className="flex flex-col lg:flex-row flex-1 min-h-0">
          <div className="flex-1 min-h-[200px] p-2 border-b lg:border-b-0 lg:border-e border-[color:var(--border-main)]/40">
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
            {selectedEvents.filter((ev) => ev.allDay).length === 0 && selectedEvents.length === 0 ? (
              <li className="text-sm text-[color:var(--foreground-muted)] py-4 text-center">
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
