"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { FolderKanban } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";

const CrmTableWidget = dynamic(
  () => import("@/components/os/widgets/CrmTableWidget"),
  { ssr: false, loading: () => <TabSkeleton /> },
);

function TabSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-[color:var(--surface-soft)]" />
      ))}
    </div>
  );
}

export default function CrmTabPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-0">
      <div className="border-b border-[color:var(--classic-rule)] px-4 py-3">
        <Link
          href="/m/dashboard/projects"
          className="inline-flex items-center gap-2 text-sm font-bold text-[color:var(--classic-accent)] underline-offset-2 hover:underline"
        >
          <FolderKanban size={16} aria-hidden />
          {t("workspaceWidgets.classicDashboard.overview.myProjectsLink")}
        </Link>
      </div>
      <CrmTableWidget />
    </div>
  );
}
