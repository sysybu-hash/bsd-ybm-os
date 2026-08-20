"use client";

import React, { useRef, useState } from "react";
import type { GanttTask } from "./types";

type ScheduleBarTask = Pick<
  GanttTask,
  "id" | "title" | "startDate" | "endDate" | "progress" | "status"
>;

type DraggableGanttBarProps = {
  task: ScheduleBarTask;
  displayProgress: number;
  pixelsPerDay: number;
  colorCls: string;
  showLabel: boolean;
  disabled?: boolean;
  onDatesChange: (taskId: string, newStart: string, newEnd: string) => void;
  onProgressPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
};

function toDateOnly(value: string | null | undefined): string {
  if (!value) return new Date().toISOString().split("T")[0]!;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().split("T")[0]!;
  return parsed.toISOString().split("T")[0]!;
}

export function DraggableGanttBar({
  task,
  displayProgress,
  pixelsPerDay,
  colorCls,
  showLabel,
  disabled = false,
  onDatesChange,
  onProgressPointerDown,
}: DraggableGanttBarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const startXRef = useRef(0);

  const startYmd = toDateOnly(task.startDate);
  const endYmd = toDateOnly(task.endDate);
  const start = new Date(`${startYmd}T00:00:00`);
  const end = new Date(`${endYmd}T00:00:00`);
  const progressWidth = `${Math.max(0, Math.min(100, displayProgress))}%`;
  const isDone = task.status === "DONE" || displayProgress >= 100;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || disabled) return;
    const deltaPx = e.clientX - startXRef.current;
    setDragOffset(deltaPx);
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || disabled) return;
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);

    const safePixelsPerDay = pixelsPerDay > 0 ? pixelsPerDay : 1;
    const daysShift = Math.round(dragOffset / safePixelsPerDay);

    if (daysShift !== 0) {
      const newStart = new Date(start);
      newStart.setDate(newStart.getDate() + daysShift);
      const newEnd = new Date(end);
      newEnd.setDate(newEnd.getDate() + daysShift);
      onDatesChange(task.id, toDateOnly(newStart.toISOString()), toDateOnly(newEnd.toISOString()));
    }

    setDragOffset(0);
  };

  return (
    <div
      data-bar-id={task.id}
      className={`absolute inset-y-3 inset-x-0 z-[2] overflow-hidden rounded-md shadow-sm ${
        disabled
          ? "cursor-default opacity-80"
          : `cursor-grab active:cursor-grabbing ${isDragging ? "z-50 opacity-90 shadow-lg" : "hover:shadow-md"}`
      }`}
      style={{
        transform: `translateX(${dragOffset}px)`,
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      title={`${task.title} · ${displayProgress}%`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-md border border-[color:var(--border-main)]/40 bg-[color:var(--surface-soft)]">
        <div
          className={`h-full transition-all ${isDone ? "bg-emerald-500" : colorCls}`}
          style={{ width: progressWidth }}
        />
        {showLabel ? (
          <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center truncate px-2 text-center text-[9px] font-semibold text-white drop-shadow-sm">
            {displayProgress}%
          </span>
        ) : null}
      </div>

      {!disabled && onProgressPointerDown ? (
        <div
          className="absolute end-0 top-0 bottom-0 z-[3] w-2 cursor-ew-resize rounded-e-md bg-white/25 hover:bg-white/40"
          onPointerDown={(e) => {
            e.stopPropagation();
            onProgressPointerDown(e);
          }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}
