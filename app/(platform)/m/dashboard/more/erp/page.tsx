"use client";

import dynamic from "next/dynamic";
import { FileText } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { MobileScreenHeader } from "@/components/dashboard-mobile/MobileScreenHeader";
import { classicSectionById } from "@/lib/classic/sections";

const DocumentCreatorWidget = dynamic(
  () => import("@/components/os/widgets/DocumentCreatorWidget"),
  { ssr: false, loading: () => <div className="m-4 h-64 animate-pulse rounded-2xl bg-[color:var(--surface-soft)]" /> },
);

export default function ErpPage() {
  const { t } = useI18n();
  const section = classicSectionById("erp");

  return (
    <div>
      {section ? (
        <MobileScreenHeader title={t(section.labelKey)} icon={FileText} backHref="/m/dashboard/more" />
      ) : null}
      <DocumentCreatorWidget embeddedInHub />
    </div>
  );
}
