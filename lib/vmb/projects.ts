import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { vmbJobProgressSchema } from "@/lib/validation/schemas/vmb-projects";
import { currentStage, type StageProgress } from "@/lib/vmb/progress";

/** Only projects in an office the user belongs to; one query, no membership round trip. */
export function projectsOfUser(userId: string): Prisma.VmbProjectWhereInput {
  return { workspace: { members: { some: { userId } } } };
}

const jobSelect = {
  id: true,
  kind: true,
  status: true,
  percent: true,
  etaSeconds: true,
  progress: true,
  error: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
  costCredits: true,
} satisfies Prisma.VmbJobSelect;

type JobRow = Prisma.VmbJobGetPayload<{ select: typeof jobSelect }>;

export type VmbJobView = Omit<JobRow, "progress"> & { stages: StageProgress[]; stage: string | null; stageDetail: string | null };

/** What every shell's progress bar reads: stored numbers plus the current stage. Bad JSON shows as no stages. */
export function toJobView(job: JobRow): VmbJobView {
  const { progress, ...rest } = job;
  const parsed = vmbJobProgressSchema.safeParse(progress);
  const stages = parsed.success ? parsed.data.stages : [];
  const cur = currentStage(stages);
  return { ...rest, stages, stage: cur?.key ?? null, stageDetail: cur?.detail ?? null };
}

export async function listProjects(userId: string) {
  const rows = await prisma.vmbProject.findMany({
    where: projectsOfUser(userId),
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      kind: true,
      status: true,
      updatedAt: true,
      jobs: { orderBy: { createdAt: "desc" }, take: 1, select: jobSelect },
    },
  });
  return rows.map(({ jobs, ...p }) => ({ ...p, lastJob: jobs[0] ? toJobView(jobs[0]) : null }));
}

export async function getProject(userId: string, projectId: string) {
  const p = await prisma.vmbProject.findFirst({
    where: { id: projectId, ...projectsOfUser(userId) },
    select: {
      id: true,
      name: true,
      kind: true,
      status: true,
      manifest: true,
      filesDeleteAt: true,
      createdAt: true,
      updatedAt: true,
      jobs: { orderBy: { createdAt: "desc" }, take: 20, select: jobSelect },
      files: { orderBy: { relPath: "asc" }, select: { id: true, relPath: true, kind: true, size: true } },
      scans: {
        orderBy: [{ fileName: "asc" }, { round: "asc" }],
        select: { fileName: true, round: true, counts: true, inkCoverage: true, unread: true, createdAt: true },
      },
    },
  });
  if (!p) return null;
  return { ...p, jobs: p.jobs.map(toJobView) };
}

export async function getJob(userId: string, jobId: string): Promise<VmbJobView | null> {
  const job = await prisma.vmbJob.findFirst({
    where: { id: jobId, project: projectsOfUser(userId) },
    select: jobSelect,
  });
  return job ? toJobView(job) : null;
}
