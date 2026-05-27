"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  daysInMonthGrid,
  daysInWeek,
  endOfWeek,
  eventOverlapsDay,
  monthGridRange,
  startOfWeek,
  weekStartsOnForLocale,
} from "@/lib/client/google-calendar-week";
import type { CalendarEventRow, CalendarViewMode } from "./types";

function buildEventsByDay(events: CalendarEventRow[], days: Date[]): Map<string, CalendarEventRow[]> {
  const map = new Map<string, CalendarEventRow[]>();
  for (const day of days) {
    const key = day.toISOString().slice(0, 10);
    const dayEvents = events
      .filter((ev) => eventOverlapsDay(new Date(ev.start), new Date(ev.end), day))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    map.set(key, dayEvents);
  }
  return map;
}

export function useGoogleCalendarWidget(
  locale: string,
  loadFailedMessage: string,
  newEventDefaultTitle: string,
) {
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [suggested, setSuggested] = useState(false);
  const [active, setActive] = useState(false);
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [calendarSummary, setCalendarSummary] = useState<string | null>(null);
  const [calendarColor, setCalendarColor] = useState<string | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("week");
  const [viewAnchor, setViewAnchor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [creating, setCreating] = useState(false);

  const weekStartsOn = weekStartsOnForLocale(locale);

  const weekStart = useMemo(
    () => startOfWeek(viewAnchor, weekStartsOn),
    [viewAnchor, weekStartsOn],
  );
  const weekEnd = useMemo(() => endOfWeek(weekStart), [weekStart]);
  const weekDays = useMemo(() => daysInWeek(weekStart), [weekStart]);
  const monthDays = useMemo(
    () => daysInMonthGrid(viewAnchor, weekStartsOn),
    [viewAnchor, weekStartsOn],
  );

  const fetchRange = useMemo(() => {
    if (viewMode === "month") return monthGridRange(viewAnchor, weekStartsOn);
    return { from: weekStart, to: weekEnd };
  }, [viewMode, viewAnchor, weekStartsOn, weekStart, weekEnd]);

  const displayDays = viewMode === "month" ? monthDays : weekDays;

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = fetchRange.from.toISOString();
      const to = fetchRange.to.toISOString();
      const res = await fetch(
        `/api/integrations/google-calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { credentials: "include", cache: "no-store" },
      );
      const data = (await res.json()) as {
        active?: boolean;
        suggested?: boolean;
        events?: CalendarEventRow[];
        message?: string;
        calendarSummary?: string | null;
        calendarColor?: string | null;
        canWrite?: boolean;
      };
      setActive(Boolean(data.active));
      setSuggested(Boolean(data.suggested));
      setEvents(data.events ?? []);
      setCalendarSummary(data.calendarSummary ?? null);
      setCalendarColor(data.calendarColor ?? null);
      setCanWrite(Boolean(data.canWrite));
      if (data.message && !data.active) setError(data.message);
    } catch {
      setError(loadFailedMessage);
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [fetchRange.from, fetchRange.to, loadFailedMessage]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const eventsByDay = useMemo(
    () => buildEventsByDay(events, displayDays),
    [events, displayDays],
  );

  const selectedDayEvents = useMemo(() => {
    const key = selectedDay.toISOString().slice(0, 10);
    return eventsByDay.get(key) ?? [];
  }, [eventsByDay, selectedDay]);

  const goToday = () => {
    const now = new Date();
    setViewAnchor(now);
    setSelectedDay(now);
  };

  const shiftPeriod = (delta: number) => {
    if (viewMode === "month") {
      setViewAnchor((prev) => addMonths(prev, delta));
    } else {
      setViewAnchor((prev) => addDays(prev, delta * 7));
    }
  };

  const createEvent = useCallback(
    async (start: Date, end: Date, summary?: string) => {
      if (!canWrite) return false;
      setCreating(true);
      try {
        const res = await fetch("/api/integrations/google-calendar", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: summary?.trim() || newEventDefaultTitle,
            start: start.toISOString(),
            end: end.toISOString(),
          }),
        });
        if (!res.ok) return false;
        await fetchEvents();
        return true;
      } catch {
        return false;
      } finally {
        setCreating(false);
      }
    },
    [canWrite, newEventDefaultTitle, fetchEvents],
  );

  const printCalendar = useCallback(() => {
    window.print();
  }, []);

  return {
    ready,
    loading,
    suggested,
    active,
    events,
    error,
    calendarSummary,
    calendarColor,
    canWrite,
    creating,
    viewMode,
    setViewMode,
    viewAnchor,
    weekStart,
    weekEnd,
    weekDays,
    monthDays,
    displayDays,
    selectedDay,
    setSelectedDay,
    eventsByDay,
    selectedDayEvents,
    fetchEvents,
    goToday,
    shiftPeriod,
    createEvent,
    printCalendar,
  };
}
