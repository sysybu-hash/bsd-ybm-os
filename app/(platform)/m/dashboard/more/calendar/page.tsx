"use client";

import dynamic from "next/dynamic";

const PlannerCalendar = dynamic(
  () => import("@/components/planner/PlannerCalendar"),
  { ssr: false, loading: () => <div className="m-4 h-64 animate-pulse bg-[color:var(--surface-soft)]" /> },
);

export default function CalendarPage() {
  return (
    <div className="p-4">
      <PlannerCalendar />
    </div>
  );
}
