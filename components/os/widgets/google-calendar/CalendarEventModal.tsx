"use client";

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { OS_MODAL_BACKDROP_Z, OS_MODAL_PANEL_Z } from "@/lib/os-modal-z-index";

export type CalendarEventDraft = {
  summary: string;
  start: Date;
  end: Date;
  allDay: boolean;
};

export type CalendarEventModalLabels = {
  title: string;
  eventTitle: string;
  titlePlaceholder: string;
  date: string;
  start: string;
  end: string;
  allDay: string;
  save: string;
  cancel: string;
  invalidRange: string;
};

type Props = {
  open: boolean;
  /** Day the user is creating on (defaults the date + a 1h slot). */
  defaultDate: Date;
  labels: CalendarEventModalLabels;
  saving?: boolean;
  onSubmit: (draft: CalendarEventDraft) => void;
  onCancel: () => void;
};

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function CalendarEventModal({
  open,
  defaultDate,
  labels,
  saving = false,
  onSubmit,
  onCancel,
}: Props) {
  const [summary, setSummary] = useState("");
  const [dateStr, setDateStr] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const base = new Date(defaultDate);
    const start = new Date(base);
    start.setHours(9, 0, 0, 0);
    const end = new Date(base);
    end.setHours(10, 0, 0, 0);
    setSummary("");
    setDateStr(toDateInput(start));
    setStartTime(toTimeInput(start));
    setEndTime(toTimeInput(end));
    setAllDay(false);
    setErr(null);
  }, [open, defaultDate]);

  const submit = () => {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) {
      setErr(labels.invalidRange);
      return;
    }
    let start: Date;
    let end: Date;
    if (allDay) {
      start = new Date(y, m - 1, d, 0, 0, 0, 0);
      end = new Date(y, m - 1, d + 1, 0, 0, 0, 0); // exclusive next-day for all-day
    } else {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      start = new Date(y, m - 1, d, sh ?? 0, sm ?? 0, 0, 0);
      end = new Date(y, m - 1, d, eh ?? 0, em ?? 0, 0, 0);
      if (end.getTime() <= start.getTime()) {
        setErr(labels.invalidRange);
        return;
      }
    }
    onSubmit({ summary: summary.trim(), start, end, allDay });
  };

  const inputClass =
    "w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[color:var(--foreground-main)] outline-none focus:ring-2 focus:ring-violet-500";

  return (
    <Dialog open={open} onClose={onCancel} className="relative" style={{ zIndex: OS_MODAL_PANEL_Z }}>
      <DialogBackdrop
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        style={{ zIndex: OS_MODAL_BACKDROP_Z }}
      />
      <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: OS_MODAL_PANEL_Z }}>
        <DialogPanel
          className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-6 shadow-2xl"
          style={{ zIndex: OS_MODAL_PANEL_Z }}
        >
          <DialogTitle className="text-base font-black text-[color:var(--foreground-main)]">
            {labels.title}
          </DialogTitle>

          <label className="mt-4 block text-xs font-bold text-[color:var(--foreground-muted)]">
            {labels.eventTitle}
            <input
              type="text"
              value={summary}
              autoFocus
              placeholder={labels.titlePlaceholder}
              onChange={(e) => setSummary(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>

          <label className="mt-3 block text-xs font-bold text-[color:var(--foreground-muted)]">
            {labels.date}
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>

          {!allDay ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-xs font-bold text-[color:var(--foreground-muted)]">
                {labels.start}
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="block text-xs font-bold text-[color:var(--foreground-muted)]">
                {labels.end}
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
            </div>
          ) : null}

          <label className="mt-3 flex items-center gap-2 text-sm text-[color:var(--foreground-main)]">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="h-4 w-4"
            />
            {labels.allDay}
          </label>

          {err ? <p className="mt-3 text-xs font-bold text-rose-500">{err}</p> : null}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-[color:var(--border-main)] px-4 py-2 text-sm font-semibold text-[color:var(--foreground-muted)]"
            >
              {labels.cancel}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {labels.save}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
