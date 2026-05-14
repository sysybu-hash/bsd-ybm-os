export type ActivityEvent = {
  id: string;
  label: string;
  time: string; // formatted
  axis: "finance" | "clients" | "ai" | "neutral";
};

const dotClassByAxis: Record<ActivityEvent["axis"], string> = {
  finance: "timeline-dot--finance",
  clients: "timeline-dot--clients",
  ai: "timeline-dot--ai",
  neutral: "timeline-dot--success",
};

/**
 * ActivityTimeline — פס אופקי של אירועי פעילות אחרונים עם נקודות צבעוניות.
 */
export function ActivityTimeline({
  events,
  emptyLabel,
}: {
  events: ActivityEvent[];
  emptyLabel?: string;
}) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[color:var(--line-strong)] px-4 py-6 text-center text-sm text-[color:var(--ink-500)]">
        {emptyLabel ?? "No activity yet"}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* horizontal line */}
      <div className="absolute left-0 right-0 top-[11px] h-[2px] bg-[color:var(--line)] rounded-full" />
      {/* events */}
      <ol className="relative flex flex-wrap gap-x-6 gap-y-4">
        {events.map((event) => (
          <li key={event.id} className="flex min-w-[7rem] flex-col items-center gap-2">
            <span
              className={`timeline-dot ${dotClassByAxis[event.axis]} h-2.5 w-2.5 ring-4 ring-[color:var(--canvas-raised)]`}
              aria-hidden
            />
            <span className="text-[11px] font-black uppercase tracking-wider opacity-60">
              {event.time}
            </span>
            <span className="text-center text-[12px] font-semibold line-clamp-2 max-w-[10rem]">
              {event.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
