"use client";

import { useCallback, useRef, useState } from "react";
import { calendarColorStyle } from "@/lib/client/google-calendar-colors";
import { formatEventTime } from "./format-event-time";
import type { CalendarEventRow } from "./types";

const GRID_START_HOUR = 7;
const GRID_END_HOUR = 21;
const SLOT_MINUTES = 30;
const SLOT_PX = 28;

type CalendarDayTimeGridProps = {
  day: Date;
  events: CalendarEventRow[];
  locale: string;
  calendarColor: string | null;
  canWrite: boolean;
  allDayLabel: string;
  dragHintLabel: string;
  onCreateRange: (start: Date, end: Date) => Promise<boolean>;
};

function minutesFromMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

function clampMinutes(m: number): number {
  const min = GRID_START_HOUR * 60;
  const max = GRID_END_HOUR * 60;
  return Math.max(min, Math.min(max, m));
}

function slotIndexFromMinutes(m: number): number {
  return Math.floor((clampMinutes(m) - GRID_START_HOUR * 60) / SLOT_MINUTES);
}

function dateAtSlot(day: Date, slot: number): Date {
  const totalMinutes = GRID_START_HOUR * 60 + slot * SLOT_MINUTES;
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(totalMinutes);
  return d;
}

const TOTAL_SLOTS = ((GRID_END_HOUR - GRID_START_HOUR) * 60) / SLOT_MINUTES;

export function CalendarDayTimeGrid({
  day,
  events,
  locale,
  calendarColor,
  canWrite,
  allDayLabel,
  dragHintLabel,
  onCreateRange,
}: CalendarDayTimeGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);

  const timedEvents = events.filter((ev) => !ev.allDay);

  const slotFromClientY = useCallback((clientY: number): number => {
    const el = gridRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const y = clientY - rect.top;
    const idx = Math.floor(y / SLOT_PX);
    return Math.max(0, Math.min(TOTAL_SLOTS - 1, idx));
  }, []);

  const finishDrag = useCallback(async () => {
    if (dragStart === null || dragEnd === null) {
      setDragStart(null);
      setDragEnd(null);
      return;
    }
    const lo = Math.min(dragStart, dragEnd);
    const hi = Math.max(dragStart, dragEnd);
    const start = dateAtSlot(day, lo);
    const end = dateAtSlot(day, hi + 1);
    if (end.getTime() - start.getTime() < SLOT_MINUTES * 60 * 1000) {
      end.setTime(start.getTime() + SLOT_MINUTES * 60 * 1000);
    }
    setDragStart(null);
    setDragEnd(null);
    await onCreateRange(start, end);
  }, [day, dragEnd, dragStart, onCreateRange]);

  const selection =
    dragStart !== null && dragEnd !== null
      ? {
          top: Math.min(dragStart, dragEnd) * SLOT_PX,
          height: (Math.abs(dragEnd - dragStart) + 1) * SLOT_PX,
        }
      : null;

  return (
    <div className="flex flex-col min-h-0 flex-1 max-md:flex-none">
      {canWrite ? (
        <p className="text-[10px] text-[color:var(--foreground-muted)] px-1 pb-2">{dragHintLabel}</p>
      ) : null}
      <div className="flex flex-1 min-h-0 overflow-y-auto custom-scrollbar max-md:flex-none max-md:overflow-visible">
        <div className="w-10 shrink-0 text-[10px] text-[color:var(--foreground-muted)] tabular-nums pe-1">
          {Array.from({ length: TOTAL_SLOTS }, (_, i) => {
            if (i % 2 !== 0) return null;
            const h = GRID_START_HOUR + Math.floor((i * SLOT_MINUTES) / 60);
            return (
              <div key={i} style={{ height: SLOT_PX * 2 }} className="flex items-start justify-end pt-0.5">
                {String(h).padStart(2, "0")}:00
              </div>
            );
          })}
        </div>
        <div
          ref={gridRef}
          className="relative flex-1 border-s border-[color:var(--border-main)]/50"
          style={{ height: TOTAL_SLOTS * SLOT_PX }}
          onPointerDown={(e) => {
            if (!canWrite || e.button !== 0) return;
            const slot = slotFromClientY(e.clientY);
            setDragStart(slot);
            setDragEnd(slot);
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragStart === null) return;
            setDragEnd(slotFromClientY(e.clientY));
          }}
          onPointerUp={() => {
            if (dragStart !== null) void finishDrag();
          }}
          onPointerCancel={() => {
            setDragStart(null);
            setDragEnd(null);
          }}
        >
          {Array.from({ length: TOTAL_SLOTS }, (_, i) => (
            <div
              key={i}
              className="absolute inset-x-0 border-b border-[color:var(--border-main)]/30"
              style={{ top: i * SLOT_PX, height: SLOT_PX }}
            />
          ))}
          {selection ? (
            <div
              className="absolute inset-x-1 rounded-md bg-violet-500/25 border border-violet-500/50 pointer-events-none z-10"
              style={{ top: selection.top, height: selection.height }}
            />
          ) : null}
          {timedEvents.map((ev) => {
            const start = new Date(ev.start);
            const end = new Date(ev.end);
            const topSlot = slotIndexFromMinutes(minutesFromMidnight(start));
            const endSlot = slotIndexFromMinutes(minutesFromMidnight(end));
            const heightSlots = Math.max(1, endSlot - topSlot);
            const style = calendarColorStyle(calendarColor, ev.entityType === "TASK");
            return (
              <div
                key={ev.id}
                className="absolute inset-x-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold truncate z-20 gcal-event-chip border"
                style={{
                  top: topSlot * SLOT_PX,
                  height: heightSlots * SLOT_PX,
                  ...style,
                }}
                title={ev.summary}
              >
                <span className="block truncate">{ev.summary}</span>
                <span className="opacity-80 font-normal">{formatEventTime(ev, locale, allDayLabel)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
