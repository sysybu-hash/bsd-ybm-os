"use client";

import { CalendarEventCard, isTodayDay } from "./CalendarEventCard";
import { formatDayHeader } from "./format-event-time";
import type { CalendarEventRow } from "./types";

type CalendarAgendaViewProps = {
  dir: "rtl" | "ltr";
  locale: string;
  weekDays: Date[];
  eventsByDay: Map<string, CalendarEventRow[]>;
  calendarColor: string | null;
  allDayLabel: string;
  fromTaskLabel: string;
  openInGoogleLabel: string;
  noEventsWeekLabel: string;
};

export function CalendarAgendaView({
  dir,
  locale,
  weekDays,
  eventsByDay,
  calendarColor,
  allDayLabel,
  fromTaskLabel,
  openInGoogleLabel,
  noEventsWeekLabel,
}: CalendarAgendaViewProps) {
  const hasAny = weekDays.some((d) => (eventsByDay.get(d.toISOString().slice(0, 10)) ?? []).length > 0);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar gcal-print-surface" dir={dir}>
      {!hasAny ? (
        <p className="text-sm text-[color:var(--foreground-muted)] text-center py-16">{noEventsWeekLabel}</p>
      ) : (
        <div className="space-y-6 max-w-2xl mx-auto">
          {weekDays.map((day) => {
            const key = day.toISOString().slice(0, 10);
            const dayEvents = eventsByDay.get(key) ?? [];
            if (dayEvents.length === 0) return null;
            const { weekday, date } = formatDayHeader(day, locale);
            const today = isTodayDay(day);

            return (
              <section key={key}>
                <div
                  className={`sticky top-0 z-10 flex items-center gap-2 py-2 mb-2 border-b border-[color:var(--border-main)]/50 backdrop-blur-sm ${
                    today ? "text-violet-600 dark:text-violet-400" : "text-[color:var(--foreground-muted)]"
                  }`}
                >
                  <span className="text-xs font-black uppercase tracking-widest">{weekday}</span>
                  <span className="text-sm font-bold text-[color:var(--foreground-main)] tabular-nums">
                    {date}
                  </span>
                  {today ? (
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-600">
                      •
                    </span>
                  ) : null}
                </div>
                <ul className="space-y-2">
                  {dayEvents.map((ev) => (
                    <li key={ev.id}>
                      <CalendarEventCard
                        ev={ev}
                        locale={locale}
                        calendarColor={calendarColor}
                        allDayLabel={allDayLabel}
                        fromTaskLabel={fromTaskLabel}
                        openInGoogleLabel={openInGoogleLabel}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
