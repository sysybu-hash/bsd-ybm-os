"use client";

import { Pencil, Trash2 } from "lucide-react";
import type { PlannerEvent } from "./types";
import { KindIcon } from "./PlannerMonthGrid";

type Labels = {
  empty: string;
  reminderTag: (mins: number) => string;
  kindMeeting: string;
  kindTask: string;
  kindReminder: string;
  kindEvent: string;
  allDay: string;
  edit: string;
  remove: string;
};

type Props = {
  day: Date;
  events: PlannerEvent[];
  locale: string;
  labels: Labels;
  onEdit: (ev: PlannerEvent) => void;
  onDelete: (ev: PlannerEvent) => void;
  onAdd: () => void;
  addLabel: string;
};

function formatTime(iso: string, locale: string, allDay: boolean, allDayLabel: string): string {
  if (allDay) return allDayLabel;
  return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function kindLabel(kind: PlannerEvent["kind"], labels: Labels): string {
  if (kind === "meeting") return labels.kindMeeting;
  if (kind === "task") return labels.kindTask;
  if (kind === "reminder") return labels.kindReminder;
  return labels.kindEvent;
}

export function PlannerDayPanel({
  day,
  events,
  locale,
  labels,
  onEdit,
  onDelete,
  onAdd,
  addLabel,
}: Props) {
  const dayTitle = day.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <section className="flex min-h-0 flex-col border border-[color:var(--classic-rule,#e7e5e4)]">
      <div className="flex items-center justify-between gap-2 border-b border-[color:var(--classic-rule,#e7e5e4)] px-3 py-2.5">
        <h3 className="text-sm font-bold text-[color:var(--classic-ink,#1c1917)]">{dayTitle}</h3>
        <button
          type="button"
          onClick={onAdd}
          className="text-xs font-bold text-[color:var(--classic-accent,#3d5a73)] underline-offset-2 hover:underline"
        >
          {addLabel}
        </button>
      </div>

      {events.length === 0 ? (
        <p className="px-3 py-6 text-sm text-[color:var(--classic-muted,#78716c)]">{labels.empty}</p>
      ) : (
        <ul className="divide-y divide-[color:var(--classic-rule,#e7e5e4)] overflow-y-auto">
          {events.map((ev) => (
            <li key={ev.id} className="flex items-start gap-2 px-3 py-3">
              <span className="mt-0.5 text-[color:var(--classic-accent,#3d5a73)]">
                <KindIcon kind={ev.kind} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[color:var(--classic-ink,#1c1917)]">
                  {ev.summary}
                </p>
                <p className="mt-0.5 text-xs text-[color:var(--classic-muted,#78716c)]">
                  {kindLabel(ev.kind, labels)}
                  {" · "}
                  {formatTime(ev.start, locale, ev.allDay, labels.allDay)}
                  {!ev.allDay ? ` – ${formatTime(ev.end, locale, false, labels.allDay)}` : null}
                </p>
                {ev.reminderMinutes != null ? (
                  <p className="mt-1 text-[11px] font-medium text-amber-800">
                    {labels.reminderTag(ev.reminderMinutes)}
                  </p>
                ) : null}
              </div>
              {ev.editable ? (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={labels.edit}
                    onClick={() => onEdit(ev)}
                    className="rounded p-1.5 text-[color:var(--classic-muted,#78716c)] hover:bg-[color:var(--surface-soft,#f0ece7)] hover:text-[color:var(--classic-ink,#1c1917)]"
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={labels.remove}
                    onClick={() => onDelete(ev)}
                    className="rounded p-1.5 text-[color:var(--classic-muted,#78716c)] hover:bg-[color:var(--surface-soft,#f0ece7)] hover:text-red-700"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
