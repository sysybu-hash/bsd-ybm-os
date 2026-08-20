"use client";

import dynamic from "next/dynamic";
import { FolderKanban } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { MobileScreenHeader } from "@/components/dashboard-mobile/MobileScreenHeader";
import { classicSectionById } from "@/lib/classic/sections";

const ProjectBoardWidget = dynamic(
  () => import("@/components/os/widgets/ProjectBoardWidget"),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3 p-4">
        <div className="h-10 animate-pulse rounded-xl bg-[color:var(--surface-soft)]" />
        <div className="h-48 animate-pulse rounded-xl bg-[color:var(--surface-soft)]" />
      </div>
    ),
  },
);

export default function ProjectsTabPage() {
  const { t } = useI18n();
  const section = classicSectionById("tasks");

  return (
    <div>
      {section ? (
        <MobileScreenHeader title={t(section.labelKey)} icon={FolderKanban} backHref="/m/dashboard/more" />
      ) : null}
      <ProjectBoardWidget embedded />
    </div>
  );
}
