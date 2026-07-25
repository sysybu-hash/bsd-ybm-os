"use client";

import dynamic from "next/dynamic";
import { CalendarDays } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { MobileScreenHeader } from "@/components/dashboard-mobile/MobileScreenHeader";
import { classicSectionById } from "@/lib/classic/sections";

const PlannerCalendar = dynamic(
  () => import("@/components/planner/PlannerCalendar"),
  { ssr: false, loading: () => <div className="m-4 h-64 animate-pulse bg-[color:var(--surface-soft)]" /> },
);

export default function CalendarPage() {
  const { t } = useI18n();
  const section = classicSectionById("calendar");

  return (
    <div>
      {section ? (
        <MobileScreenHeader title={t(section.labelKey)} icon={CalendarDays} backHref="/m/dashboard/more" />
      ) : null}
      <div className="p-4">
        <PlannerCalendar />
      </div>
    </div>
  );
}
