"use client";

import dynamic from "next/dynamic";
import { ScanLine } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { MobileScreenHeader } from "@/components/dashboard-mobile/MobileScreenHeader";
import { classicSectionById } from "@/lib/classic/sections";

const AiScannerWidget = dynamic(
  () => import("@/components/os/widgets/AiScannerWidget"),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3 p-4">
        <div className="h-40 animate-pulse rounded-2xl bg-[color:var(--surface-soft)]" />
        <div className="h-12 animate-pulse rounded-xl bg-[color:var(--surface-soft)]" />
      </div>
    ),
  },
);

export default function ScannerTabPage() {
  const { t } = useI18n();
  const section = classicSectionById("scan");

  return (
    <div>
      {section ? <MobileScreenHeader title={t(section.labelKey)} icon={ScanLine} /> : null}
      <AiScannerWidget embeddedInHub />
    </div>
  );
}
