/** Encode/decode planner kind + reminder minutes into GoogleCalendarEventLink.summary (no schema migration). */

export type PlannerKind = "meeting" | "task" | "reminder" | "event";

const META_RE = /^\[bsd:(meeting|task|reminder|event)(?::(\d+))?\]\s*/;

export function encodePlannerSummary(
  title: string,
  kind: PlannerKind,
  reminderMinutes?: number | null,
): string {
  const clean = title.replace(META_RE, "").trim();
  const mins =
    kind === "reminder"
      ? Math.max(0, Math.min(1440, reminderMinutes ?? 15))
      : reminderMinutes != null
        ? Math.max(0, Math.min(1440, reminderMinutes))
        : null;
  if (mins != null) return `[bsd:${kind}:${mins}] ${clean}`;
  return `[bsd:${kind}] ${clean}`;
}

export function decodePlannerSummary(summary: string): {
  title: string;
  kind: PlannerKind;
  reminderMinutes: number | null;
} {
  const m = summary.match(META_RE);
  if (!m) {
    // Legacy cosmetic prefixes from Google calendar route
    if (summary.startsWith("👥 ")) return { title: summary.slice(2).trim(), kind: "meeting", reminderMinutes: null };
    if (summary.startsWith("✅ ")) return { title: summary.slice(2).trim(), kind: "task", reminderMinutes: null };
    return { title: summary, kind: "event", reminderMinutes: null };
  }
  const kind = m[1] as PlannerKind;
  const mins = m[2] != null ? Number(m[2]) : kind === "reminder" ? 15 : null;
  return {
    title: summary.slice(m[0].length).trim() || summary,
    kind,
    reminderMinutes: Number.isFinite(mins) ? mins : null,
  };
}

export const LOCAL_PLANNER_CALENDAR_ID = "local";
