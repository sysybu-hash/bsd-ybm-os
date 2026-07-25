"use client";

import dynamic from "next/dynamic";
import { Settings } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { MobileScreenHeader } from "@/components/dashboard-mobile/MobileScreenHeader";
import { classicSectionById } from "@/lib/classic/sections";

const SettingsWidget = dynamic(
  () => import("@/components/os/widgets/SettingsWidget"),
  { ssr: false, loading: () => <div className="m-4 h-64 animate-pulse rounded-2xl bg-[color:var(--surface-soft)]" /> },
);

export default function SettingsPage() {
  const { t } = useI18n();
  const section = classicSectionById("settings");

  return (
    <div>
      {section ? (
        <MobileScreenHeader title={t(section.labelKey)} icon={Settings} backHref="/m/dashboard/more" />
      ) : null}
      <SettingsWidget />
    </div>
  );
}
