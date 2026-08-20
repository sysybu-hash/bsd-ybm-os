"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus, X } from "lucide-react";
import { saveAppDataAction, listAppDataAction } from "@/app/actions/app-builder";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { AppBuilderCalendarUI } from "@/lib/validation/schemas/app-builder";

type Props = { schema: AppBuilderCalendarUI; schemaId?: string };

type CalEvent = {
  id: string;
  date: string;
  title: string;
  data: Record<string, unknown>;
};

const PREFIX = "workspaceWidgets.appBuilder.dynamicCalendar";

const hebrewDayFmt = new Intl.DateTimeFormat("he-IL-u-ca-hebrew", { day: "numeric" });
const hebrewMonthFmt = new Intl.DateTimeFormat("he-IL-u-ca-hebrew", { month: "long", year: "numeric" });

function toHebrewDay(year: number, month: number, day: number): string {
  try { return hebrewDayFmt.format(new Date(year, month, day)); }
  catch { return ""; }
}

function hebrewMonthYear(year: number, month: number): string {
  try { return hebrewMonthFmt.format(new Date(year, month, 1)); }
  catch { return ""; }
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function DynamicCalendarRenderer({ schema, schemaId }: Props) {
  const { t, locale } = useI18n();
  const dateField = schema.eventFields.find((f) => f.isDate);
  const titleField = schema.eventFields.find((f) => !f.isDate);

  const dayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, i) => t(`${PREFIX}.days.${i}`)),
    [t],
  );
  const monthLabels = useMemo(
    () => Array.from({ length: 12 }, (_, i) => t(`${PREFIX}.months.${i}`)),
    [t],
  );

  const [today] = useState(() => new Date());
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const loadEvents = useCallback(async () => {
    if (!schemaId) return;
    setLoading(true);
    try {
      const res = await listAppDataAction(schemaId);
      if (res.ok) {
        const mapped: CalEvent[] = res.rows
          .map((r) => {
            const d = r.data as Record<string, unknown>;
            const rawDate = dateField ? String(d[dateField.name] ?? "") : "";
            const title = titleField ? String(d[titleField.name] ?? t(`${PREFIX}.defaultEvent`)) : t(`${PREFIX}.defaultEvent`);
            return { id: r.id, date: rawDate.slice(0, 10), title, data: d };
          })
          .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date));
        setEvents(mapped);
      }
    } finally {
      setLoading(false);
    }
  }, [schemaId, dateField, titleField, t]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  const firstDay = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startDow = firstDay.getDay();
  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsOnDay = (day: number) => {
    const ymd = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter((e) => e.date === ymd);
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const openAddForm = (day: number) => {
    const ymd = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    setSelectedDay(ymd);
    const init: Record<string, string> = {};
    for (const f of schema.eventFields) {
      init[f.name] = f.isDate ? ymd : "";
    }
    setForm(init);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!schemaId) { toast.error(t(`${PREFIX}.saveAppFirst`)); return; }
    setSaving(true);
    try {
      const formData: Record<string, unknown> = {};
      for (const f of schema.eventFields) formData[f.name] = form[f.name] ?? "";
      const res = await saveAppDataAction({ schemaId, formData });
      if (res.ok) {
        await loadEvents();
        setShowForm(false);
        toast.success(t(`${PREFIX}.eventAdded`));
      } else {
        toast.error(res.error ?? t(`${PREFIX}.saveFailed`));
      }
    } finally {
      setSaving(false);
    }
  };

  const todayYMD = toYMD(today);

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-[color:var(--foreground-main)]">{schema.title}</h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={prevMonth} className="workspace-chrome-btn inline-flex">
            <ChevronRight size={14} aria-hidden />
          </button>
          <span className="min-w-[7rem] text-center text-sm font-semibold text-[color:var(--foreground-main)]">
            {monthLabels[viewMonth]} {viewYear}
          </span>
          <button type="button" onClick={nextMonth} className="workspace-chrome-btn inline-flex">
            <ChevronLeft size={14} aria-hidden />
          </button>
          {loading && <Loader2 size={12} className="animate-spin text-[color:var(--foreground-muted)]" />}
        </div>
        {locale === "he" ? (
          <p className="text-[10px] text-[color:var(--foreground-muted)] text-end pe-1">
            {hebrewMonthYear(viewYear, viewMonth)}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-7 text-center text-[10px] font-bold text-[color:var(--foreground-muted)]">
        {dayLabels.map((d) => <div key={d}>{d}</div>)}
      </div>

      <div className="grid content-start grid-cols-7 gap-px overflow-hidden rounded-xl border border-[color:var(--border-main)] bg-[color:var(--border-main)]">
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="min-h-[44px] sm:min-h-[56px] bg-[color:var(--background-main)]/60 p-0.5 sm:p-1" />;
          const ymd = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEvents = eventsOnDay(day);
          const isToday = ymd === todayYMD;
          const hebDay = locale === "he" ? toHebrewDay(viewYear, viewMonth, day) : "";
          return (
            <button
              key={i}
              type="button"
              onClick={() => openAddForm(day)}
              className={`group flex min-h-[44px] sm:min-h-[56px] flex-col gap-0.5 bg-[color:var(--background-main)] p-0.5 sm:p-1 text-start transition hover:bg-[color:var(--surface-soft)] ${
                isToday ? "ring-1 ring-inset ring-indigo-500" : ""
              }`}
            >
              <div className="flex items-start justify-between w-full">
                <span className={`text-[11px] font-bold ${isToday ? "text-indigo-400" : "text-[color:var(--foreground-muted)]"}`}>
                  {day}
                </span>
                {hebDay ? (
                  <span className="text-[9px] text-[color:var(--foreground-muted)]/70 font-medium leading-tight">
                    {hebDay}
                  </span>
                ) : null}
              </div>
              {dayEvents.slice(0, 3).map((ev) => {
                const timeVal = schema.eventFields.find((f) => f.type === "time");
                const evTime = timeVal ? String(ev.data[timeVal.name] ?? "") : "";
                return (
                  <span
                    key={ev.id}
                    className="flex items-center gap-0.5 truncate rounded bg-indigo-500/20 px-1 py-0.5 text-[9px] font-medium text-indigo-300"
                    title={ev.title}
                  >
                    {evTime ? <span className="shrink-0 opacity-80">{evTime}</span> : null}
                    <span className="truncate">{ev.title}</span>
                  </span>
                );
              })}
              {dayEvents.length > 3 && (
                <span className="text-[9px] text-[color:var(--foreground-muted)]">+{dayEvents.length - 3}</span>
              )}
              <Plus size={10} className="mt-auto hidden self-end text-[color:var(--foreground-muted)] group-hover:block" />
            </button>
          );
        })}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowForm(false)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[color:var(--foreground-main)]">
                {t(`${PREFIX}.addEventTitle`).replace("{date}", selectedDay ?? "")}
              </h3>
              <button type="button" onClick={() => setShowForm(false)} className="workspace-chrome-btn inline-flex">
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {schema.eventFields.map((f) => (
                <label key={f.name} className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-[color:var(--foreground-main)]">
                    {f.label}
                    {f.required && <span className="text-rose-400"> *</span>}
                  </span>
                  {f.type === "select" ? (
                    <select
                      value={form[f.name] ?? ""}
                      onChange={(e) => setForm((p) => ({ ...p, [f.name]: e.target.value }))}
                      className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    >
                      <option value="">{t(`${PREFIX}.selectOption`)}</option>
                      {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type={f.isDate || f.type === "date" ? "date" : f.type === "time" ? "time" : f.type === "number" ? "number" : "text"}
                      value={form[f.name] ?? ""}
                      onChange={(e) => setForm((p) => ({ ...p, [f.name]: e.target.value }))}
                      className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    />
                  )}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="mt-4 w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? t(`${PREFIX}.saving`) : t(`${PREFIX}.addEvent`)}
            </button>
          </div>
        </div>
      )}

      {!schemaId && (
        <p className="text-xs text-[color:var(--foreground-muted)]">{t(`${PREFIX}.saveAppHint`)}</p>
      )}
    </div>
  );
}
