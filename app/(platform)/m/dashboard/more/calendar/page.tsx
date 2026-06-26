"use client";

import dynamic from "next/dynamic";

const JewishCalendarWidget = dynamic(
  () => import("@/components/os/widgets/JewishCalendarWidget"),
  { ssr: false, loading: () => <div className="m-4 h-64 animate-pulse rounded-2xl bg-[color:var(--surface-soft)]" /> },
);

export default function CalendarPage() {
  return <JewishCalendarWidget />;
}
