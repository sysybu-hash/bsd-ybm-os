"use client";

import React, { useMemo } from "react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import type { OpenWorkspaceWidgetFn } from "@/components/os/widgets/CrmTableWidget";
import { CalendarAgendaView } from "./google-calendar/CalendarAgendaView";
import { CalendarEmptyPanel } from "./google-calendar/CalendarEmptyPanel";
import { CalendarMonthView } from "./google-calendar/CalendarMonthView";
import { CalendarWeekView } from "./google-calendar/CalendarWeekView";
import { CalendarWidgetHeader } from "./google-calendar/CalendarWidgetHeader";
import { formatMonthYear, formatWeekRange } from "./google-calendar/format-event-time";
import { useGoogleCalendarWidget } from "./google-calendar/useGoogleCalendarWidget";
import "./google-calendar/calendar-print.css";

const S = "workspaceWidgets.googleCalendar";

type GoogleCalendarWidgetProps = {
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
};

export default function GoogleCalendarWidget({ openWorkspaceWidget }: GoogleCalendarWidgetProps) {
  const { t, dir, locale } = useI18n();
  const layoutDir: "rtl" | "ltr" = dir === "rtl" ? "rtl" : "ltr";

  const {
    ready, loading, suggested, active, localOnly, error,
    calendarSummary, calendarColor, canWrite,
    viewMode, setViewMode, viewAnchor, weekStart, weekEnd, weekDays, monthDays,
    selectedDay, setSelectedDay, eventsByDay, fetchEvents,
    goToday, shiftPeriod, createEvent, printCalendar,
  } = useGoogleCalendarWidget(locale, t(`${S}.loadFailed`), t(`${S}.newEventTitle`));

  const rangeLabel = useMemo(() => {
    if (viewMode === "month") return formatMonthYear(viewAnchor, locale);
    return formatWeekRange(weekStart, weekEnd, locale);
  }, [viewMode, viewAnchor, weekStart, weekEnd, locale]);

  const printViewLabel = useMemo(() => {
    if (viewMode === "month") return t(`${S}.viewMonth`);
    if (viewMode === "agenda") return t(`${S}.viewAgenda`);
    return t(`${S}.viewWeek`);
  }, [viewMode, t]);

  const handleCreateRange = async (start: Date, end: Date) => {
    const ok = await createEvent(start, end);
    if (ok) toast.success(t(`${S}.eventCreated`));
    else toast.error(t(`${S}.eventCreateFailed`));
    return ok;
  };

  if (!ready) return <WidgetState variant="loading" message={t(`${S}.loading`)} />;

  if (!active) {
    return (
      <CalendarEmptyPanel
        dir={layoutDir}
        suggested={suggested}
        title={t(`${S}.emptyTitle`)}
        suggestBody={t(`${S}.emptySuggest`)}
        inactiveBody={t(`${S}.emptyInactive`)}
        openSettingsLabel={t(`${S}.openSettings`)}
        openWorkspaceWidget={openWorkspaceWidget}
      />
    );
  }

  if (error) {
    return (
      <WidgetState
        variant="error"
        message={error}
        onRetry={() => void fetchEvents()}
        retryLabel={t(`${S}.retry`)}
      />
    );
  }

  const moreEventsLabel = (n: number) => t(`${S}.moreEvents`, { count: String(n) });

  return (
    <div
      id="google-calendar-print-root"
      data-widget-sticky-chrome
      data-widget-fill-height
      className="flex h-full min-h-0 flex-col overflow-x-hidden bg-transparent text-[color:var(--foreground-main)]"
      dir={layoutDir}
    >
      {localOnly && (
        <div className="flex shrink-0 items-center gap-2 border-b border-blue-400/20 bg-blue-50/60 px-3 py-2 text-xs dark:bg-blue-900/10">
          <span className="shrink-0 text-blue-600 dark:text-blue-400">📅</span>
          <span className="flex-1 text-blue-800 dark:text-blue-300">
            מציג משימות ופרויקטים בלבד. לסנכרון עם Google Calendar —
          </span>
          <button
            type="button"
            onClick={() => openWorkspaceWidget?.("settings", { tab: "calendar" })}
            className="shrink-0 rounded-lg bg-blue-600 px-2 py-1 font-bold text-white hover:bg-blue-500"
          >
            חבר
          </button>
        </div>
      )}

      <div className="gcal-print-only border-b border-neutral-300 px-4 py-3">
        <h1 className="text-xl font-bold text-black">{t(`${S}.title`)}</h1>
        <p className="text-sm text-neutral-700">
          {calendarSummary ? `${calendarSummary} · ` : ""}
          {printViewLabel} · {rangeLabel}
        </p>
      </div>

      <CalendarWidgetHeader
        dir={layoutDir}
        title={t(`${S}.title`)}
        subtitle={t(`${S}.subtitle`)}
        calendarName={calendarSummary}
        rangeLabel={rangeLabel}
        todayLabel={t(`${S}.today`)}
        refreshLabel={t(`${S}.refresh`)}
        printLabel={t(`${S}.print`)}
        viewWeekLabel={t(`${S}.viewWeek`)}
        viewMonthLabel={t(`${S}.viewMonth`)}
        viewAgendaLabel={t(`${S}.viewAgenda`)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onPrevPeriod={() => shiftPeriod(-1)}
        onNextPeriod={() => shiftPeriod(1)}
        onToday={goToday}
        onRefresh={() => void fetchEvents()}
        onPrint={printCalendar}
        refreshing={loading}
      />

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <WidgetState variant="loading" message={t(`${S}.loading`)} />
        </div>
      ) : viewMode === "month" ? (
        <CalendarMonthView
          dir={layoutDir}
          locale={locale}
          monthDays={monthDays}
          viewAnchor={viewAnchor}
          eventsByDay={eventsByDay}
          calendarColor={calendarColor}
          canWrite={canWrite}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          onCreateRange={handleCreateRange}
          dragHintLabel={t(`${S}.dragCreateMonth`)}
          moreEventsLabel={moreEventsLabel}
        />
      ) : viewMode === "week" ? (
        <CalendarWeekView
          dir={layoutDir}
          locale={locale}
          weekDays={weekDays}
          eventsByDay={eventsByDay}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          calendarColor={calendarColor}
          canWrite={canWrite}
          allDayLabel={t(`${S}.allDay`)}
          fromTaskLabel={t(`${S}.fromTask`)}
          openInGoogleLabel={t(`${S}.openInGoogle`)}
          noEventsDayLabel={t(`${S}.noEventsDay`)}
          moreEventsLabel={moreEventsLabel}
          dragHintLabel={t(`${S}.dragCreateWeek`)}
          onCreateRange={handleCreateRange}
        />
      ) : (
        <CalendarAgendaView
          dir={layoutDir}
          locale={locale}
          weekDays={weekDays}
          eventsByDay={eventsByDay}
          calendarColor={calendarColor}
          allDayLabel={t(`${S}.allDay`)}
          fromTaskLabel={t(`${S}.fromTask`)}
          openInGoogleLabel={t(`${S}.openInGoogle`)}
          noEventsWeekLabel={t(`${S}.noEventsWeek`)}
        />
      )}
    </div>
  );
}
