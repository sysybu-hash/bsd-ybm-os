"use client";

import { useCallback, useRef, useState } from "react";
import { calendarColorStyle } from "@/lib/client/google-calendar-colors";
import { addDays, isSameMonth, weekStartsOnForLocale } from "@/lib/client/google-calendar-week";
import { isTodayDay } from "./CalendarEventCard";
import type { CalendarEventRow } from "./types";

type CalendarMonthViewProps = {
  dir: "rtl" | "ltr";
  locale: string;
  monthDays: Date[];
  viewAnchor: Date;
  eventsByDay: Map<string, CalendarEventRow[]>;
  calendarColor: string | null;
  canWrite: boolean;
  selectedDay: Date;
  onSelectDay: (day: Date) => void;
  onCreateRange: (start: Date, end: Date) => Promise<boolean>;
  dragHintLabel: string;
  moreEventsLabel: (n: number) => string;
};

const MAX_VISIBLE = 2;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function CalendarMonthView({
  locale, monthDays, viewAnchor, eventsByDay, calendarColor, canWrite,
  selectedDay, onSelectDay, onCreateRange, dragHintLabel, moreEventsLabel,
}: CalendarMonthViewProps) {
  const weekStartsOn = weekStartsOnForLocale(locale);
  const baseSunday = new Date(2024, 0, 7);
  const weekdayLabels = Array.from({ length: 7 }, (_, i) => {
    const dayIndex = (weekStartsOn + i) % 7;
    return addDays(baseSunday, dayIndex).toLocaleDateString(locale, { weekday: "short" });
  });

  const [dragStartKey, setDragStartKey] = useState<string | null>(null);
  const [dragEndKey, setDragEndKey] = useState<string | null>(null);
  const dragging = useRef(false);

  const inDragRange = useCallback(
    (key: string) => {
      if (!dragStartKey || !dragEndKey) return false;
      const keys = monthDays.map(dayKey);
      const a = keys.indexOf(dragStartKey);
      const b = keys.indexOf(dragEndKey);
      const c = keys.indexOf(key);
      if (a < 0 || b < 0 || c < 0) return false;
      return c >= Math.min(a, b) && c <= Math.max(a, b);
    },
    [dragEndKey, dragStartKey, monthDays],
  );

  const finishMonthDrag = useCallback(async () => {
    if (!dragStartKey || !dragEndKey) {
      setDragStartKey(null);
      setDragEndKey(null);
      dragging.current = false;
      return;
    }
    const keys = monthDays.map(dayKey);
    const lo = Math.min(keys.indexOf(dragStartKey), keys.indexOf(dragEndKey));
    const hi = Math.max(keys.indexOf(dragStartKey), keys.indexOf(dragEndKey));
    const startDay = monthDays[lo];
    const endDay = monthDays[hi];
    setDragStartKey(null);
    setDragEndKey(null);
    dragging.current = false;
    if (!startDay || !endDay) return;
    const start = new Date(startDay);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDay);
    end.setDate(end.getDate() + 1);
    end.setHours(0, 0, 0, 0);
    await onCreateRange(start, end);
  }, [dragEndKey, dragStartKey, monthDays, onCreateRange]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden max-md:flex-none max-md:overflow-visible">
      {canWrite ? (
        <p className="shrink-0 px-4 py-1.5 text-[10px] text-[color:var(--foreground-muted)]">{dragHintLabel}</p>
      ) : null}

      <div className="grid shrink-0 grid-cols-7 gap-px px-1.5 pb-1.5">
        {weekdayLabels.map((label) => (
          <div key={label} className="text-center text-[10px] font-black uppercase tracking-wide text-[color:var(--foreground-muted)]">
            {label}
          </div>
        ))}
      </div>

      <div
        className="auto-rows-fr grid min-h-0 flex-1 grid-cols-7 gap-1 px-1.5 pb-2 overflow-y-auto custom-scrollbar max-md:flex-none max-md:overflow-visible"
        onPointerUp={() => { if (dragging.current) void finishMonthDrag(); }}
        onPointerLeave={() => { if (dragging.current) void finishMonthDrag(); }}
      >
        {monthDays.map((day) => {
          const key = dayKey(day);
          const dayEvents = eventsByDay.get(key) ?? [];
          const inMonth = isSameMonth(day, viewAnchor);
          const today = isTodayDay(day);
          const selected = dayKey(selectedDay) === key;
          const inRange = inDragRange(key);

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(day)}
              onPointerDown={(e) => {
                if (!canWrite || e.button !== 0) return;
                dragging.current = true;
                setDragStartKey(key);
                setDragEndKey(key);
              }}
              onPointerEnter={() => {
                if (dragging.current && dragStartKey) setDragEndKey(key);
              }}
              className={`group flex min-h-[68px] flex-col gap-1 rounded-xl p-1.5 text-start transition-all duration-150 ${
                inRange
                  ? "bg-violet-500/20 ring-1 ring-violet-500/40"
                  : selected
                    ? "bg-violet-500/10 ring-2 ring-violet-500/50"
                    : inMonth
                      ? "bg-[color:var(--surface-card)]/30 hover:bg-violet-500/5"
                      : "bg-transparent"
              }`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-black tabular-nums ${
                    today
                      ? "bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/30"
                      : inMonth
                        ? "text-[color:var(--foreground-main)]"
                        : "text-[color:var(--foreground-muted)]/40"
                  }`}
                >
                  {day.getDate()}
                </span>
                {dayEvents.length > 0 && !today ? (
                  <span className="me-0.5 h-1.5 w-1.5 rounded-full bg-violet-500/70" aria-hidden />
                ) : null}
              </div>
              <div className="min-h-0 flex-1 space-y-1 overflow-hidden">
                {dayEvents.slice(0, MAX_VISIBLE).map((ev) => (
                  <div
                    key={ev.id}
                    className="gcal-event-chip truncate rounded-md border px-1.5 py-0.5 text-[9px] font-bold leading-tight"
                    style={calendarColorStyle(calendarColor, ev.entityType === "TASK")}
                    title={ev.summary}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {ev.summary}
                  </div>
                ))}
                {dayEvents.length > MAX_VISIBLE ? (
                  <p className="ps-1 text-[9px] font-black text-violet-600 dark:text-violet-400">
                    {moreEventsLabel(dayEvents.length - MAX_VISIBLE)}
                  </p>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
