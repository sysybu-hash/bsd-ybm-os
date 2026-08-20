"use client";

import dynamic from "next/dynamic";
import { Cpu } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { MobileScreenHeader } from "@/components/dashboard-mobile/MobileScreenHeader";
import { classicSectionById } from "@/lib/classic/sections";

const AppBuilderWidget = dynamic(
  () => import("@/components/os/widgets/AppBuilderWidget"),
  { ssr: false, loading: () => <div className="m-4 h-64 animate-pulse rounded-2xl bg-[color:var(--surface-soft)]" /> },
);

export default function BuilderPage() {
  const { t } = useI18n();
  const section = classicSectionById("customOs");

  return (
    <div>
      {section ? (
        <MobileScreenHeader title={t(section.labelKey)} icon={Cpu} backHref="/m/dashboard/more" />
      ) : null}
      <AppBuilderWidget embeddedInHub />
    </div>
  );
}
