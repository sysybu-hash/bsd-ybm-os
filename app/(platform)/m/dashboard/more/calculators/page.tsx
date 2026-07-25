"use client";

import { Calculator } from "lucide-react";
import DashboardCalculators from "@/components/dashboard/DashboardCalculators";
import { useI18n } from "@/components/os/system/I18nProvider";
import { MobileScreenHeader } from "@/components/dashboard-mobile/MobileScreenHeader";
import { classicSectionById } from "@/lib/classic/sections";

export default function CalculatorsPage() {
  const { t } = useI18n();
  const section = classicSectionById("calculators");

  return (
    <div>
      {section ? (
        <MobileScreenHeader title={t(section.labelKey)} icon={Calculator} backHref="/m/dashboard/more" />
      ) : null}
      <div className="p-4">
        <DashboardCalculators />
      </div>
    </div>
  );
}
