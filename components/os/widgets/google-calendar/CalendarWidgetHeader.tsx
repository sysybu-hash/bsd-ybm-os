"use client";

import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Plus,
  Printer,
  RefreshCw,
} from "lucide-react";
import type { CalendarViewMode } from "./types";
import { OsButton, OsIconButton } from "@/components/os/ui";

type CalendarWidgetHeaderProps = {
  dir: "rtl" | "ltr";
  title: string;
  subtitle: string;
  calendarName: string | null;
  rangeLabel: string;
  todayLabel: string;
  refreshLabel: string;
  printLabel: string;
  viewWeekLabel: string;
  viewMonthLabel: string;
  viewAgendaLabel: string;
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
  onToday: () => void;
  onRefresh: () => void;
  onPrint: () => void;
  refreshing?: boolean;
  addEventLabel: string;
  onAddEvent?: () => void;
};

export function CalendarWidgetHeader({
  dir,
  title,
  subtitle,
  calendarName,
  rangeLabel,
  todayLabel,
  refreshLabel,
  printLabel,
  viewWeekLabel,
  viewMonthLabel,
  viewAgendaLabel,
  viewMode,
  onViewModeChange,
  onPrevPeriod,
  onNextPeriod,
  onToday,
  onRefresh,
  onPrint,
  refreshing,
  addEventLabel,
  onAddEvent,
}: CalendarWidgetHeaderProps) {
  const PrevIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = dir === "rtl" ? ChevronLeft : ChevronRight;

  const viewBtn = (mode: CalendarViewMode, label: string, Icon: typeof LayoutGrid) => (
    <button
      type="button"
      onClick={() => onViewModeChange(mode)}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
        viewMode === mode
          ? "bg-violet-600 text-white shadow-sm"
          : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
      }`}
    >
      <Icon size={14} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );

  return (
    <header className="shrink-0 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/60 backdrop-blur-sm gcal-no-print">
      <div className="px-3 py-2.5 md:p-5 flex flex-col gap-2.5 md:gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 md:gap-4">
          <div className="hidden md:flex items-center gap-2.5 md:gap-3 min-w-0">
            <div className="w-9 h-9 md:w-11 md:h-11 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <Calendar size={20} className="text-violet-600 dark:text-violet-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base md:text-xl font-black text-[color:var(--foreground-main)] truncate">
                {title}
              </h2>
              <p className="text-xs text-[color:var(--foreground-muted)] truncate">
                {calendarName ? `${calendarName} · ` : ""}
                {subtitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-xl border border-[color:var(--border-main)] p-0.5 bg-[color:var(--surface-card)]/40">
              {viewBtn("week", viewWeekLabel, LayoutGrid)}
              {viewBtn("month", viewMonthLabel, CalendarDays)}
              {viewBtn("agenda", viewAgendaLabel, List)}
            </div>
            {onAddEvent ? (
              <OsButton
                variant="secondary"
                size="sm"
                className="bg-violet-600 text-white hover:bg-violet-500 border-transparent"
                icon={<Plus size={15} aria-hidden />}
                onClick={onAddEvent}
              >
                <span className="hidden sm:inline">{addEventLabel}</span>
              </OsButton>
            ) : null}
            <OsIconButton label={printLabel} onClick={onPrint}>
              <Printer size={16} aria-hidden />
            </OsIconButton>
            <OsIconButton label={refreshLabel} disabled={refreshing} onClick={onRefresh}>
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} aria-hidden />
            </OsIconButton>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <OsIconButton label="Previous" onClick={onPrevPeriod}>
              <PrevIcon size={18} aria-hidden />
            </OsIconButton>
            <OsButton
              variant="secondary"
              size="sm"
              className="border-violet-500/30 text-violet-600 hover:bg-violet-500/10 dark:text-violet-400"
              onClick={onToday}
            >
              {todayLabel}
            </OsButton>
            <OsIconButton label="Next" onClick={onNextPeriod}>
              <NextIcon size={18} aria-hidden />
            </OsIconButton>
          </div>
          <p className="text-sm font-bold text-[color:var(--foreground-main)] tabular-nums">
            {rangeLabel}
          </p>
        </div>
      </div>
    </header>
  );
}
