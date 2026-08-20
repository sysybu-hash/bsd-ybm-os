"use client";

import React, { useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { buildMonthCells, type PlannerDraft, type PlannerEvent } from "./types";
import { usePlannerCalendar } from "./usePlannerCalendar";
import { PlannerMonthGrid } from "./PlannerMonthGrid";
import { PlannerDayPanel } from "./PlannerDayPanel";
import { PlannerItemModal, type PlannerItemModalLabels } from "./PlannerItemModal";
import { PlannerZmanimPane } from "./PlannerZmanimPane";

const S = "workspaceWidgets.classicDashboard.planner";

type Props = {
  /** Optional extra class on the root (for OS embed later). */
  className?: string;
};

/**
 * Full planner calendar: month + day agenda + Jewish zmanim side pane.
 * Portable — not coupled to DashboardShell; wrap in `.dashboard-theme` for classic tokens.
 */
export default function PlannerCalendar({ className }: Props) {
  const { t, dir, locale } = useI18n();
  const reminderToastLabel = useCallback(
    (title: string, mins: number) => t(`${S}.reminderToast`, { title, mins: String(mins) }),
    [t],
  );

  const {
    anchor,
    selectedDay,
    setSelectedDay,
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
  } = usePlannerCalendar(locale, reminderToastLabel);

  const [mobileTab, setMobileTab] = useState<"diary" | "zmanim">("diary");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<PlannerEvent | null>(null);

  const cells = useMemo(() => buildMonthCells(anchor), [anchor]);

  const modalLabels: PlannerItemModalLabels = useMemo(
    () => ({
      titleCreate: t(`${S}.modal.create`),
      titleEdit: t(`${S}.modal.edit`),
      eventTitle: t(`${S}.modal.title`),
      titlePlaceholder: t(`${S}.modal.titlePlaceholder`),
      date: t(`${S}.modal.date`),
      start: t(`${S}.modal.start`),
      end: t(`${S}.modal.end`),
      allDay: t(`${S}.modal.allDay`),
      kind: t(`${S}.modal.kind`),
      kindMeeting: t(`${S}.kinds.meeting`),
      kindTask: t(`${S}.kinds.task`),
      kindReminder: t(`${S}.kinds.reminder`),
      kindEvent: t(`${S}.kinds.event`),
      reminderMinutes: t(`${S}.modal.reminderMinutes`),
      save: t(`${S}.modal.save`),
      cancel: t(`${S}.modal.cancel`),
      invalidRange: t(`${S}.modal.invalidRange`),
    }),
    [t],
  );

  const openCreate = () => {
    setEditing(null);
    setModalMode("create");
    setModalOpen(true);
  };

  const openEdit = (ev: PlannerEvent) => {
    setEditing(ev);
    setModalMode("edit");
    setModalOpen(true);
  };

  const handleSubmit = async (draft: PlannerDraft) => {
    const ok = editing
      ? await updateEvent(editing.id, draft)
      : await createEvent(draft);
    if (ok) {
      toast.success(t(`${S}.saved`));
      setModalOpen(false);
      setEditing(null);
    } else {
      toast.error(t(`${S}.saveFailed`));
    }
  };

  const handleDelete = async (ev: PlannerEvent) => {
    if (!window.confirm(t(`${S}.confirmDelete`))) return;
    const ok = await deleteEvent(ev.id);
    if (ok) toast.success(t(`${S}.deleted`));
    else toast.error(t(`${S}.saveFailed`));
  };

  const initialDraft: PlannerDraft | null = editing
    ? {
        summary: editing.summary,
        start: new Date(editing.start),
        end: new Date(editing.end),
        allDay: editing.allDay,
        kind: editing.kind,
        reminderMinutes: editing.reminderMinutes,
      }
    : null;

  return (
    <div dir={dir} className={`flex min-h-0 flex-col gap-4 ${className ?? ""}`}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label={t(`${S}.prevMonth`)}
            className="rounded p-2 text-[color:var(--classic-muted,#78716c)] hover:bg-[color:var(--surface-soft,#f0ece7)]"
          >
            <ChevronRight size={18} className="rtl:rotate-0 ltr:rotate-180" aria-hidden />
          </button>
          <h2 className="min-w-[9rem] text-center text-base font-bold text-[color:var(--classic-ink,#1c1917)]">
            {monthLabel}
          </h2>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label={t(`${S}.nextMonth`)}
            className="rounded p-2 text-[color:var(--classic-muted,#78716c)] hover:bg-[color:var(--surface-soft,#f0ece7)]"
          >
            <ChevronLeft size={18} className="rtl:rotate-0 ltr:rotate-180" aria-hidden />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="ms-1 text-xs font-bold text-[color:var(--classic-accent,#3d5a73)] underline-offset-2 hover:underline"
          >
            {t(`${S}.today`)}
          </button>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 border border-[color:var(--classic-accent,#3d5a73)] px-3 py-2 text-sm font-bold text-[color:var(--classic-accent,#3d5a73)] hover:bg-[color:var(--classic-accent-soft,#eef2f5)]"
        >
          <Plus size={16} aria-hidden />
          {t(`${S}.add`)}
        </button>
      </div>

      {/* Mobile tabs */}
      <div className="flex gap-1 border-b border-[color:var(--classic-rule,#e7e5e4)] lg:hidden">
        {(["diary", "zmanim"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setMobileTab(tab)}
            className={`relative px-3 py-2 text-sm ${
              mobileTab === tab
                ? "font-bold text-[color:var(--classic-ink,#1c1917)]"
                : "font-medium text-[color:var(--classic-muted,#78716c)]"
            }`}
          >
            {tab === "diary" ? t(`${S}.tabDiary`) : t(`${S}.tabZmanim`)}
            {mobileTab === tab ? (
              <span className="absolute inset-x-2 -bottom-px h-0.5 bg-[color:var(--classic-accent,#3d5a73)]" />
            ) : null}
          </button>
        ))}
      </div>

      {loading && eventsByDay.size === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center text-[color:var(--classic-muted,#78716c)]">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        </div>
      ) : error ? (
        <div className="py-8 text-center text-sm text-[color:var(--classic-muted,#78716c)]">
          <p>{t(`${S}.loadFailed`)}</p>
          <button type="button" onClick={() => void fetchEvents()} className="mt-2 font-bold text-[color:var(--classic-accent,#3d5a73)]">
            {t(`${S}.retry`)}
          </button>
        </div>
      ) : (
        <div className="grid min-h-0 gap-4 lg:grid-cols-[1fr_280px]">
          <div className={`flex min-h-0 flex-col gap-4 ${mobileTab !== "diary" ? "hidden lg:flex" : "flex"}`}>
            <PlannerMonthGrid
              cells={cells}
              anchor={anchor}
              selectedDay={selectedDay}
              eventsByDay={eventsByDay}
              onSelectDay={setSelectedDay}
              locale={locale}
            />
            <PlannerDayPanel
              day={selectedDay}
              events={dayEvents}
              locale={locale}
              addLabel={t(`${S}.add`)}
              onAdd={openCreate}
              onEdit={openEdit}
              onDelete={(ev) => void handleDelete(ev)}
              labels={{
                empty: t(`${S}.dayEmpty`),
                reminderTag: (mins) => t(`${S}.reminderTag`, { mins: String(mins) }),
                kindMeeting: t(`${S}.kinds.meeting`),
                kindTask: t(`${S}.kinds.task`),
                kindReminder: t(`${S}.kinds.reminder`),
                kindEvent: t(`${S}.kinds.event`),
                allDay: t(`${S}.modal.allDay`),
                edit: t(`${S}.edit`),
                remove: t(`${S}.delete`),
              }}
            />
          </div>

          <div className={mobileTab !== "zmanim" ? "hidden lg:block" : "block"}>
            <PlannerZmanimPane
              day={selectedDay}
              labels={{
                title: t(`${S}.zmanimTitle`),
                loading: t(`${S}.loading`),
                loadFailed: t(`${S}.zmanimFailed`),
              }}
            />
          </div>
        </div>
      )}

      <PlannerItemModal
        open={modalOpen}
        mode={modalMode}
        defaultDate={selectedDay}
        initial={initialDraft}
        labels={modalLabels}
        saving={saving}
        onSubmit={(d) => void handleSubmit(d)}
        onCancel={() => {
          setModalOpen(false);
          setEditing(null);
        }}
      />
    </div>
  );
}
