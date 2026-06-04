"use client";

import { useCallback, useRef, useState } from "react";
import { calendarAccentBar, calendarColorStyle } from "@/lib/client/google-calendar-colors";
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

  const accent = calendarAccentBar(calendarColor);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {canWrite ? (
        <p className="shrink-0 px-4 py-1 text-[10px] text-[color:var(--foreground-muted)]">{dragHintLabel}</p>
      ) : null}

      <div className="grid shrink-0 grid-cols-7 border-b border-[color:var(--border-main)]/50">
        {weekdayLabels.map((label) => (
          <div key={label} className="py-2 text-center text-[10px] font-black uppercase text-[color:var(--foreground-muted)]">
            {label}
          </div>
        ))}
      </div>

      <div
        className="auto-rows-fr grid min-h-0 flex-1 grid-cols-7"
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
              className={`flex min-h-[72px] flex-col border border-[color:var(--border-main)]/40 p-1 text-start transition-colors ${
                inRange ? "bg-violet-500/15 ring-1 ring-violet-500/40" : ""
              } ${selected ? "z-[1] ring-2 ring-violet-500/50" : ""} ${
                inMonth ? "bg-[color:var(--surface-card)]/15" : "bg-[color:var(--surface-card)]/5 opacity-60"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black tabular-nums ${
                    today ? "bg-violet-600 text-white" : "text-[color:var(--foreground-main)]"
                  }`}
                  style={today ? undefined : { borderInlineStart: `3px solid ${accent}` }}
                >
                  {day.getDate()}
                </span>
              </div>
              <div className="mt-0.5 flex-1 space-y-0.5 overflow-hidden">
                {dayEvents.slice(0, MAX_VISIBLE).map((ev) => (
                  <div
                    key={ev.id}
                    className="gcal-event-chip truncate rounded border px-1 py-0.5 text-[9px] font-bold"
                    style={calendarColorStyle(calendarColor, ev.entityType === "TASK")}
                    title={ev.summary}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {ev.summary}
                  </div>
                ))}
                {dayEvents.length > MAX_VISIBLE ? (
                  <p className="text-[9px] font-bold text-violet-600 dark:text-violet-400">
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
