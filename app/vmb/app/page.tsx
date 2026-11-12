import type { Metadata } from "next";
import { AccountMenu } from "@/components/vmb/studio/AccountMenu";
import { StudioFrame } from "@/components/vmb/studio/StudioFrame";
import { ProjectsBoard } from "@/components/vmb/projects/ProjectsBoard";
import type { ProjectItem } from "@/components/vmb/projects/types";
import { listProjects } from "@/lib/vmb/projects";
import { boardLabels } from "@/lib/vmb/projects-labels";
import { frameLabels, getStudioContext, vmbStudioT } from "@/lib/vmb/studio-context";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: vmbStudioT("vmb.projects.title"), robots: { index: false } };

/** The office's projects: one card each, a live bar on any that is running, and "new project". */
export default async function VmbProjectsPage() {
  const { user, credits } = await getStudioContext();
  // Same shape the board polls from /api/vmb/projects: dates as ISO strings.
  const initial = JSON.parse(JSON.stringify(await listProjects(user.id))) as ProjectItem[];
  return (
    <StudioFrame
      labels={frameLabels()}
      active="projects"
      credits={credits}
      account={<AccountMenu name={user.name ?? user.email} image={user.image} logoutLabel={vmbStudioT("vmb.studio.logout")} />}
    >
      <div className="py-4">
        <ProjectsBoard initial={initial} labels={boardLabels()} />
      </div>
    </StudioFrame>
  );
}
