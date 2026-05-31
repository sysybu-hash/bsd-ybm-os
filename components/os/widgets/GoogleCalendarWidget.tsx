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

    ready,

    loading,

    suggested,

    active,

    error,

    calendarSummary,

    calendarColor,

    canWrite,

    viewMode,

    setViewMode,

    viewAnchor,

    weekStart,

    weekEnd,

    weekDays,

    monthDays,

    selectedDay,

    setSelectedDay,

    eventsByDay,

    fetchEvents,

    goToday,

    shiftPeriod,

    createEvent,

    printCalendar,

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



  if (!ready) {

    return <WidgetState variant="loading" message={t(`${S}.loading`)} />;

  }



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

      className="flex flex-col min-h-full bg-transparent text-[color:var(--foreground-main)] overflow-x-hidden"

      dir={layoutDir}

    >

      <div className="gcal-print-only px-4 py-3 border-b border-neutral-300">

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

        <div className="flex-1 flex items-center justify-center">

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


