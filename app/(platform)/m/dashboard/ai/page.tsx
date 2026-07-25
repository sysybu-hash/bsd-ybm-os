"use client";

import dynamic from "next/dynamic";
import { Bot } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { MobileScreenHeader } from "@/components/dashboard-mobile/MobileScreenHeader";
import { classicSectionById } from "@/lib/classic/sections";

const AiChatFullWidget = dynamic(
  () => import("@/components/os/widgets/AiChatFullWidget"),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3 p-4">
        <div className="h-full min-h-[60vh] animate-pulse rounded-2xl bg-[color:var(--surface-soft)]" />
      </div>
    ),
  },
);

export default function AiTabPage() {
  const { t } = useI18n();
  const section = classicSectionById("aiChat");

  return (
    <div>
      {section ? <MobileScreenHeader title={t(section.labelKey)} icon={Bot} /> : null}
      <AiChatFullWidget />
    </div>
  );
}
