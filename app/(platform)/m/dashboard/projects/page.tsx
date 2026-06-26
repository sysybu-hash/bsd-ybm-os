"use client";

import dynamic from "next/dynamic";

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
  return <ProjectBoardWidget embedded />;
}
