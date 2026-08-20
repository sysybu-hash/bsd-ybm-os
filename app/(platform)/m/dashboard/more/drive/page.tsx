"use client";

import dynamic from "next/dynamic";
import { HardDrive } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { MobileScreenHeader } from "@/components/dashboard-mobile/MobileScreenHeader";
import { classicSectionById } from "@/lib/classic/sections";

const GoogleDriveWidget = dynamic(
  () => import("@/components/os/widgets/GoogleDriveWidget"),
  { ssr: false, loading: () => <div className="m-4 h-64 animate-pulse rounded-2xl bg-[color:var(--surface-soft)]" /> },
);

export default function DrivePage() {
  const { t } = useI18n();
  const section = classicSectionById("drive");

  return (
    <div>
      {section ? (
        <MobileScreenHeader title={t(section.labelKey)} icon={HardDrive} backHref="/m/dashboard/more" />
      ) : null}
      <GoogleDriveWidget />
    </div>
  );
}
