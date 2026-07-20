"use client";

import { Bell, CheckSquare, Users } from "lucide-react";
import type { PlannerKind } from "@/lib/planner/meta";
import { dayKey, sameDay, type PlannerEvent } from "./types";

const WEEKDAYS_HE = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

type Props = {
  cells: Date[];
  anchor: Date;
  selectedDay: Date;
  eventsByDay: Map<string, PlannerEvent[]>;
  onSelectDay: (d: Date) => void;
  locale: string;
};

function kindDot(kind: PlannerKind): string {
  if (kind === "meeting") return "bg-[color:var(--classic-accent,#3d5a73)]";
  if (kind === "task") return "bg-emerald-700";
  if (kind === "reminder") return "bg-amber-700";
  return "bg-stone-400";
}

export function PlannerMonthGrid({
  cells,
  anchor,
  selectedDay,
  eventsByDay,
  onSelectDay,
}: Props) {
  const today = new Date();

  return (
    <div className="border border-[color:var(--classic-rule,#e7e5e4)]">
      <div className="grid grid-cols-7 border-b border-[color:var(--classic-rule,#e7e5e4)]">
        {WEEKDAYS_HE.map((label) => (
          <div
            key={label}
            className="px-1 py-2 text-center text-[11px] font-bold text-[color:var(--classic-muted,#78716c)]"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day) => {
          const inMonth = day.getMonth() === anchor.getMonth();
          const selected = sameDay(day, selectedDay);
          const isToday = sameDay(day, today);
          const key = dayKey(day);
          const dayEvs = eventsByDay.get(key) ?? [];
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(day)}
              className={`min-h-[72px] border-b border-e border-[color:var(--classic-rule,#e7e5e4)] p-1.5 text-start transition-colors sm:min-h-[88px] ${
                selected
                  ? "bg-[color:var(--classic-accent-soft,#eef2f5)]"
                  : "hover:bg-[color:var(--surface-soft,#f0ece7)]"
              } ${!inMonth ? "opacity-40" : ""}`}
            >
              <span
                className={`inline-flex h-7 w-7 items-center justify-center text-sm font-semibold ${
                  isToday
                    ? "bg-[color:var(--classic-accent,#3d5a73)] text-white"
                    : "text-[color:var(--classic-ink,#1c1917)]"
                }`}
              >
                {day.getDate()}
              </span>
              <div className="mt-1 flex flex-wrap gap-0.5">
                {dayEvs.slice(0, 3).map((ev) => (
                  <span
                    key={ev.id}
                    className={`h-1.5 w-1.5 rounded-full ${kindDot(ev.kind)}`}
                    title={ev.summary}
                  />
                ))}
                {dayEvs.length > 3 ? (
                  <span className="text-[9px] font-bold text-[color:var(--classic-muted,#78716c)]">
                    +{dayEvs.length - 3}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function KindIcon({ kind, size = 14 }: { kind: PlannerKind; size?: number }) {
  if (kind === "meeting") return <Users size={size} aria-hidden />;
  if (kind === "task") return <CheckSquare size={size} aria-hidden />;
  if (kind === "reminder") return <Bell size={size} aria-hidden />;
  return <Users size={size} aria-hidden />;
}
