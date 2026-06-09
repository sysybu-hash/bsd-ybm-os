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
      <div className="p-4 md:p-5 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <Calendar size={22} className="text-violet-600 dark:text-violet-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg md:text-xl font-black text-[color:var(--foreground-main)] truncate">
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
              <button
                type="button"
                onClick={onAddEvent}
                className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-violet-500"
              >
                <Plus size={15} />
                <span className="hidden sm:inline">{addEventLabel}</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={onPrint}
              className="p-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] transition-colors"
              aria-label={printLabel}
              title={printLabel}
            >
              <Printer size={16} />
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="p-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] transition-colors disabled:opacity-50"
              aria-label={refreshLabel}
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPrevPeriod}
              className="p-2 rounded-lg hover:bg-[color:var(--surface-card)]/80 text-[color:var(--foreground-muted)]"
              aria-label="Previous"
            >
              <PrevIcon size={18} />
            </button>
            <button
              type="button"
              onClick={onToday}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-violet-500/30 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10"
            >
              {todayLabel}
            </button>
            <button
              type="button"
              onClick={onNextPeriod}
              className="p-2 rounded-lg hover:bg-[color:var(--surface-card)]/80 text-[color:var(--foreground-muted)]"
              aria-label="Next"
            >
              <NextIcon size={18} />
            </button>
          </div>
          <p className="text-sm font-bold text-[color:var(--foreground-main)] tabular-nums">
            {rangeLabel}
          </p>
        </div>
      </div>
    </header>
  );
}
