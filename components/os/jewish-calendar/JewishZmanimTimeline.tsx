"use client";

import React from "react";
import type { ZmanEntry } from "@/lib/jewish-calendar/types";

type Props = {
  zmanim: ZmanEntry[];
  nowMinutes: number;
  nextZmanId: string | null;
  isToday: boolean;
};

export function JewishZmanimTimeline({ zmanim, nowMinutes, nextZmanId, isToday }: Props) {
  const dayZmanim = zmanim.filter((z) => z.minutesFromMidnight >= 0 && z.minutesFromMidnight <= 24 * 60);

  return (
    <div className="relative h-10 w-full rounded-lg bg-[color:var(--surface-soft)] px-1" dir="ltr">
      <div className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-[color:var(--border-main)]" />
      {isToday ? (
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-indigo-500"
          style={{ left: `calc(${(nowMinutes / (24 * 60)) * 100}% + 8px)` }}
          aria-hidden
        />
      ) : null}
      {dayZmanim.map((z) => {
        const pct = (z.minutesFromMidnight / (24 * 60)) * 100;
        const isNext = isToday && z.id === nextZmanId;
        return (
          <div
            key={z.id}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `calc(${pct}% + 8px)` }}
            title={z.labelHe}
          >
            <span
              className={`block h-2 w-2 rounded-full ${
                isNext ? "bg-amber-400 ring-2 ring-amber-400/40" : "bg-indigo-400/80"
              }`}
            />
          </div>
        );
      })}
      <div className="absolute bottom-0.5 start-2 text-[9px] text-[color:var(--foreground-muted)]">0</div>
      <div className="absolute bottom-0.5 end-2 text-[9px] text-[color:var(--foreground-muted)]">23</div>
    </div>
  );
}
