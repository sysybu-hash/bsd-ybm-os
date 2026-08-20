"use client";

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { PlannerKind } from "@/lib/planner/meta";
import type { PlannerDraft } from "./types";

export type PlannerItemModalLabels = {
  titleCreate: string;
  titleEdit: string;
  eventTitle: string;
  titlePlaceholder: string;
  date: string;
  start: string;
  end: string;
  allDay: string;
  kind: string;
  kindMeeting: string;
  kindTask: string;
  kindReminder: string;
  kindEvent: string;
  reminderMinutes: string;
  save: string;
  cancel: string;
  invalidRange: string;
};

type Props = {
  open: boolean;
  mode: "create" | "edit";
  defaultDate: Date;
  initial?: PlannerDraft | null;
  labels: PlannerItemModalLabels;
  saving?: boolean;
  onSubmit: (draft: PlannerDraft) => void;
  onCancel: () => void;
};

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const KINDS: PlannerKind[] = ["meeting", "task", "reminder", "event"];

export function PlannerItemModal({
  open,
  mode,
  defaultDate,
  initial,
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
  const [kind, setKind] = useState<PlannerKind>("meeting");
  const [reminderMinutes, setReminderMinutes] = useState(15);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setSummary(initial.summary);
      setDateStr(toDateInput(initial.start));
      setStartTime(toTimeInput(initial.start));
      setEndTime(toTimeInput(initial.end));
      setAllDay(initial.allDay);
      setKind(initial.kind);
      setReminderMinutes(initial.reminderMinutes ?? 15);
    } else {
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
      setKind("meeting");
      setReminderMinutes(15);
    }
    setErr(null);
  }, [open, defaultDate, initial]);

  const kindLabel = (k: PlannerKind) => {
    if (k === "meeting") return labels.kindMeeting;
    if (k === "task") return labels.kindTask;
    if (k === "reminder") return labels.kindReminder;
    return labels.kindEvent;
  };

  const submit = () => {
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) {
      setErr(labels.invalidRange);
      return;
    }
    let start: Date;
    let end: Date;
    if (allDay || kind === "reminder") {
      const [sh, sm] = (kind === "reminder" ? startTime : "00:00").split(":").map(Number);
      start = new Date(y, m - 1, d, sh || 0, sm || 0, 0, 0);
      if (kind === "reminder") {
        end = new Date(start.getTime() + 15 * 60_000);
      } else {
        end = new Date(y, m - 1, d, 23, 59, 59, 999);
      }
    } else {
      const [sh, sm] = startTime.split(":").map(Number);
      const [eh, em] = endTime.split(":").map(Number);
      start = new Date(y, m - 1, d, sh || 0, sm || 0, 0, 0);
      end = new Date(y, m - 1, d, eh || 0, em || 0, 0, 0);
    }
    if (end < start) {
      setErr(labels.invalidRange);
      return;
    }
    if (!summary.trim()) {
      setErr(labels.invalidRange);
      return;
    }
    onSubmit({
      summary: summary.trim(),
      start,
      end,
      allDay: allDay && kind !== "reminder",
      kind,
      reminderMinutes: kind === "reminder" || reminderMinutes > 0 ? reminderMinutes : null,
    });
  };

  return (
    <Dialog open={open} onClose={onCancel} className="relative z-[80]">
      <DialogBackdrop className="fixed inset-0 bg-black/40" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md border border-[color:var(--classic-rule,#e7e5e4)] bg-[color:var(--surface-card,#fff)] p-5 shadow-lg">
          <DialogTitle className="text-lg font-bold text-[color:var(--classic-ink,#1c1917)]">
            {mode === "edit" ? labels.titleEdit : labels.titleCreate}
          </DialogTitle>

          <div className="mt-4 space-y-3">
            <label className="block text-xs font-semibold text-[color:var(--classic-muted,#78716c)]">
              {labels.kind}
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as PlannerKind)}
                className="mt-1 w-full border border-[color:var(--classic-rule,#e7e5e4)] bg-transparent px-3 py-2 text-sm text-[color:var(--classic-ink,#1c1917)]"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {kindLabel(k)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-semibold text-[color:var(--classic-muted,#78716c)]">
              {labels.eventTitle}
              <input
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder={labels.titlePlaceholder}
                className="mt-1 w-full border border-[color:var(--classic-rule,#e7e5e4)] bg-transparent px-3 py-2 text-sm text-[color:var(--classic-ink,#1c1917)]"
              />
            </label>

            <label className="block text-xs font-semibold text-[color:var(--classic-muted,#78716c)]">
              {labels.date}
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                className="mt-1 w-full border border-[color:var(--classic-rule,#e7e5e4)] bg-transparent px-3 py-2 text-sm text-[color:var(--classic-ink,#1c1917)]"
              />
            </label>

            {kind !== "reminder" ? (
              <label className="flex items-center gap-2 text-sm text-[color:var(--classic-ink,#1c1917)]">
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                {labels.allDay}
              </label>
            ) : null}

            {!allDay || kind === "reminder" ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-[color:var(--classic-muted,#78716c)]">
                  {labels.start}
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="mt-1 w-full border border-[color:var(--classic-rule,#e7e5e4)] bg-transparent px-3 py-2 text-sm"
                  />
                </label>
                {kind !== "reminder" ? (
                  <label className="block text-xs font-semibold text-[color:var(--classic-muted,#78716c)]">
                    {labels.end}
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="mt-1 w-full border border-[color:var(--classic-rule,#e7e5e4)] bg-transparent px-3 py-2 text-sm"
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            <label className="block text-xs font-semibold text-[color:var(--classic-muted,#78716c)]">
              {labels.reminderMinutes}
              <input
                type="number"
                min={0}
                max={1440}
                value={reminderMinutes}
                onChange={(e) => setReminderMinutes(Number(e.target.value) || 0)}
                className="mt-1 w-full border border-[color:var(--classic-rule,#e7e5e4)] bg-transparent px-3 py-2 text-sm"
              />
            </label>

            {err ? <p className="text-sm text-red-700">{err}</p> : null}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-semibold text-[color:var(--classic-muted,#78716c)]"
            >
              {labels.cancel}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={submit}
              className="inline-flex items-center gap-2 bg-[color:var(--classic-accent,#3d5a73)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {labels.save}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
