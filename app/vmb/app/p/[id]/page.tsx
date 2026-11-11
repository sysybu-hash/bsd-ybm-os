import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountMenu } from "@/components/vmb/studio/AccountMenu";
import { StudioShell } from "@/components/vmb/studio/StudioShell";
import { LiveJobCard } from "@/components/vmb/projects/LiveJobCard";
import { UploadZone } from "@/components/vmb/upload/UploadZone";
import { ScanPanel } from "@/components/vmb/scan/ScanPanel";
import type { JobItem } from "@/components/vmb/projects/types";
import { getProject } from "@/lib/vmb/projects";
import { kindLabels, progressText, scanLabels, uploadLabels } from "@/lib/vmb/projects-labels";
import { toScanViews } from "@/lib/vmb/scan-view";
import { frameLabels, getStudioContext, railStep, stepLabels, vmbStudioT } from "@/lib/vmb/studio-context";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: vmbStudioT("vmb.projects.title"), robots: { index: false } };

const p = (k: string, vars?: Record<string, string>) => vmbStudioT(`vmb.projects.${k}`, vars);

/** One project: its rail, its live job (if any), and the next step to take. */
export default async function VmbProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, credits } = await getStudioContext();
  const project = await getProject(user.id, id);
  if (!project) notFound();

  const latest = project.jobs[0] ? (JSON.parse(JSON.stringify(project.jobs[0])) as JobItem) : null;
  const showJob = latest && (latest.status === "queued" || latest.status === "running" || latest.status === "failed");
  const created = project.createdAt.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" });

  return (
    <StudioShell
      current={railStep(project.status)}
      credits={credits}
      account={<AccountMenu name={user.name ?? user.email} image={user.image} logoutLabel={vmbStudioT("vmb.studio.logout")} />}
      labels={{
        ...frameLabels(),
        projectName: project.name,
        projectMeta: `${kindLabels()[project.kind] ?? project.kind} · ${p("created", { date: created })}`,
        steps: stepLabels(),
      }}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <UploadZone projectId={project.id} initial={project.files} labels={uploadLabels()} />
          {project.files.length ? <ScanPanel projectId={project.id} files={project.files} initial={toScanViews(project.scans)} labels={scanLabels()} /> : null}
        </div>
        <div className="space-y-4">
          {showJob && latest ? (
            <LiveJobCard
              initial={latest}
              labels={{
                title: vmbStudioT("vmb.studio.progressTitle"),
                leave: vmbStudioT("vmb.studio.progressLeave"),
                failedTitle: p("failedTitle"),
                progress: progressText(),
              }}
            />
          ) : null}
          <section className="vmb-card p-5">
            <h2 className="text-sm font-bold">{p("nextTitle")}</h2>
            <ol className="mt-3 space-y-2.5 text-sm text-[color:var(--vmb-ink-soft)]">
              {["next1", "next2", "next3"].map((k, i) => (
                <li key={k} className="flex gap-2.5">
                  <span className="vmb-mono grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[color:var(--vmb-line-strong)] text-[10px]">{i + 1}</span>
                  {p(k)}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </StudioShell>
  );
}
