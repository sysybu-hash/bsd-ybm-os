import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { VmbLink } from "@/components/vmb/VmbLink";
import { AccountMenu } from "@/components/vmb/studio/AccountMenu";
import { StudioShell } from "@/components/vmb/studio/StudioShell";
import { StudioWorkbench } from "@/components/vmb/studio3d/StudioWorkbench";
import { projectBooklet, projectCameras, projectUnit } from "@/lib/vmb/outcome";
import { getProject } from "@/lib/vmb/projects";
import { kindLabels } from "@/lib/vmb/projects-labels";
import { studioWord, workbenchLabels } from "@/lib/vmb/studio3d-labels";
import { frameLabels, getStudioContext, stepLabels, vmbStudioT } from "@/lib/vmb/studio-context";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: vmbStudioT("vmb.m3.title"), robots: { index: false } };

/** Step 6, the studio (plan M3): the delivered flat's model in 3D, over its sheet, and the cameras for the next run. */
export default async function VmbStudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, credits } = await getStudioContext();
  const project = await getProject(user.id, id);
  if (!project) notFound();
  const booklet = projectBooklet(project.manifest);
  const unit = projectUnit(project.manifest);

  return (
    <StudioShell
      current={5}
      credits={credits}
      account={<AccountMenu name={user.name ?? user.email} image={user.image} logoutLabel={vmbStudioT("vmb.studio.logout")} />}
      labels={{
        ...frameLabels(),
        projectName: project.name,
        projectMeta: [studioWord("title"), kindLabels()[project.kind] ?? project.kind, unit != null ? vmbStudioT("vmb.run.projectUnit", { n: String(unit) }) : null].filter(Boolean).join(" · "),
        steps: stepLabels(),
      }}
    >
      <div className="space-y-4">
        <VmbLink href={`/app/p/${project.id}`} className="inline-flex items-center gap-1.5 text-sm text-[color:var(--vmb-ink-soft)] hover:text-[color:var(--vmb-ink)]">
          <ArrowRight className="h-4 w-4" aria-hidden />
          {studioWord("back")}
        </VmbLink>
        {booklet?.studio ? (
          <>
            <StudioWorkbench projectId={project.id} saved={projectCameras(project.manifest)} labels={workbenchLabels()} />
            <section className="vmb-card p-5">
              <h2 className="text-sm font-bold">{studioWord("assumptionsTitle")}</h2>
              <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-[color:var(--vmb-ink-soft)]">
                {booklet.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-[color:var(--vmb-muted)]">{studioWord("assumptionsHint")}</p>
            </section>
          </>
        ) : (
          <p className="vmb-card p-5 text-sm text-[color:var(--vmb-ink-soft)]">{studioWord("none")}</p>
        )}
      </div>
    </StudioShell>
  );
}
