"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { PlannerKind } from "@/lib/planner/meta";
import {
  addMonths,
  dayKey,
  groupEventsByDay,
  startOfMonth,
  type PlannerDraft,
  type PlannerEvent,
} from "./types";

export function usePlannerCalendar(locale: string, reminderToastLabel: (title: string, mins: number) => string) {
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [events, setEvents] = useState<PlannerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toastedRef = useRef<Set<string>>(new Set());

  const range = useMemo(() => {
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    from.setDate(from.getDate() - 7);
    const to = new Date(anchor.getFullYear(), anchor.getMonth() + 2, 0);
    to.setDate(to.getDate() + 7);
    return { from, to };
  }, [anchor]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      });
      const res = await fetch(`/api/planner?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("fetch_failed");
      const data = (await res.json()) as { events?: PlannerEvent[] };
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch {
      setError("fetch_failed");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  const eventsByDay = useMemo(() => groupEventsByDay(events), [events]);

  const selectedKey = dayKey(selectedDay);
  const dayEvents = useMemo(() => {
    const list = eventsByDay.get(selectedKey) ?? [];
    return [...list].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [eventsByDay, selectedKey]);

  const createEvent = useCallback(
    async (draft: PlannerDraft) => {
      setSaving(true);
      try {
        const res = await fetch("/api/planner", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: draft.summary,
            start: draft.start.toISOString(),
            end: draft.end.toISOString(),
            allDay: draft.allDay,
            kind: draft.kind,
            reminderMinutes: draft.reminderMinutes ?? undefined,
          }),
        });
        if (!res.ok) return false;
        await fetchEvents();
        return true;
      } catch {
        return false;
      } finally {
        setSaving(false);
      }
    },
    [fetchEvents],
  );

  const updateEvent = useCallback(
    async (id: string, draft: PlannerDraft) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/planner?id=${encodeURIComponent(id)}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: draft.summary,
            start: draft.start.toISOString(),
            end: draft.end.toISOString(),
            allDay: draft.allDay,
            kind: draft.kind,
            reminderMinutes: draft.reminderMinutes,
          }),
        });
        if (!res.ok) return false;
        await fetchEvents();
        return true;
      } catch {
        return false;
      } finally {
        setSaving(false);
      }
    },
    [fetchEvents],
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/planner?id=${encodeURIComponent(id)}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) return false;
        await fetchEvents();
        return true;
      } catch {
        return false;
      } finally {
        setSaving(false);
      }
    },
    [fetchEvents],
  );

  // In-app reminder toasts while planner is open
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      for (const ev of events) {
        if (ev.reminderMinutes == null && ev.kind !== "reminder") continue;
        const mins = ev.reminderMinutes ?? 15;
        const start = new Date(ev.start).getTime();
        const fireAt = start - mins * 60_000;
        if (now >= fireAt && now < start) {
          const key = `${ev.id}:${mins}`;
          if (toastedRef.current.has(key)) continue;
          toastedRef.current.add(key);
          toast.info(reminderToastLabel(ev.summary, mins));
        }
      }
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [events, reminderToastLabel]);

  const goToday = useCallback(() => {
    const now = new Date();
    setAnchor(startOfMonth(now));
    setSelectedDay(now);
  }, []);

  const shiftMonth = useCallback((delta: number) => {
    setAnchor((a) => addMonths(a, delta));
  }, []);

  const monthLabel = useMemo(
    () => anchor.toLocaleDateString(locale, { month: "long", year: "numeric" }),
    [anchor, locale],
  );

  return {
    anchor,
    selectedDay,
    setSelectedDay,
    events,
    eventsByDay,
    dayEvents,
    loading,
    error,
    saving,
    fetchEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    goToday,
    shiftMonth,
    monthLabel,
  };
}

export type { PlannerKind };
