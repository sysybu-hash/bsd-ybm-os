export type CalendarEventRow = {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay?: boolean;
  htmlLink?: string | null;
  entityType?: string;
};

export type CalendarViewMode = "week" | "agenda" | "month";

export type CalendarFetchState = {
  loading: boolean;
  suggested: boolean;
  active: boolean;
  events: CalendarEventRow[];
  error: string | null;
  calendarSummary: string | null;
  calendarColor: string | null;
  canWrite: boolean;
};
