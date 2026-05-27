"use client";

import { Briefcase, ExternalLink } from "lucide-react";
import { calendarColorStyle } from "@/lib/client/google-calendar-colors";
import { isSameDay } from "@/lib/client/google-calendar-week";
import { formatEventTime } from "./format-event-time";
import type { CalendarEventRow } from "./types";

type CalendarEventCardProps = {
  ev: CalendarEventRow;
  locale: string;
  calendarColor?: string | null;
  allDayLabel: string;
  fromTaskLabel: string;
  openInGoogleLabel: string;
  compact?: boolean;
};

export function CalendarEventCard({
  ev,
  locale,
  calendarColor,
  allDayLabel,
  fromTaskLabel,
  openInGoogleLabel,
  compact,
}: CalendarEventCardProps) {
  const isTask = ev.entityType === "TASK";
  const colorStyle = calendarColorStyle(calendarColor, isTask);

  return (
    <article
      className={`group relative rounded-xl border transition-colors gcal-event-chip ${
        compact ? "p-2" : "p-3"
      }`}
      style={colorStyle}
    >
      <div className="flex justify-between gap-2 items-start">
        <div className="min-w-0 flex-1">
          <p className={`font-bold text-[color:var(--foreground-main)] truncate ${compact ? "text-xs" : "text-sm"}`}>
            {ev.summary}
          </p>
          <p className={`text-[color:var(--foreground-muted)] tabular-nums ${compact ? "text-[10px]" : "text-xs"}`}>
            {formatEventTime(ev, locale, allDayLabel)}
          </p>
        </div>
        {ev.htmlLink ? (
          <a
            href={ev.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 p-1 rounded-lg text-violet-500 opacity-70 group-hover:opacity-100 hover:bg-violet-500/10"
            aria-label={openInGoogleLabel}
          >
            <ExternalLink size={compact ? 12 : 14} />
          </a>
        ) : null}
      </div>
      {isTask ? (
        <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
          <Briefcase size={10} />
          {fromTaskLabel}
        </span>
      ) : null}
    </article>
  );
}

export function isTodayDay(day: Date): boolean {
  return isSameDay(day, new Date());
}
