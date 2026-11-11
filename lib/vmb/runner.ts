import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { VMB_PROJECT_KINDS, type VmbProjectKind } from "@/lib/validation/schemas/vmb-projects";
import { questionsState } from "@/lib/vmb/answers-store";
import { settleHold } from "@/lib/vmb/credits";
import { VMB_BOOKLET_PRICING } from "@/lib/vmb/plans";
import { advance, etaSeconds, jobPercent, type JobProgress } from "@/lib/vmb/progress";

/**
 * The VMB side of the runner: what takes a booklet job off the queue, writes its progress where every shell reads it,
 * and settles its credits at the end. The engine (`runProject`, M5) plugs in through `RunInput` / `RunReport` /
 * `RunOutput` and knows nothing about the queue, the ledger or the project's status.
 */

const log = createLogger("vmb-runner");

export const RUN_STAGES = ["read", "build", "render", "paint", "booklet"] as const;
export type RunStage = (typeof RUN_STAGES)[number];

export type RunInput = {
  jobId: string;
  projectId: string;
  kind: VmbProjectKind;
  files: Array<{ relPath: string; kind: string; blobUrl: string }>;
  /** Every question with its resolved value and where it came from (rule 13.2). */
  answers: Record<string, { value: unknown; source: string; from?: string }>;
  /** Per file: the layers the client approved in the further scan. */
  layerMaps: Record<string, Record<string, string>>;
};

export type RunReport = (stage: RunStage, done: number, total?: number, detail?: string) => Promise<void>;

export type RunOutput = {
  bookletUrl: string;
  /** Pictures delivered painted: the only ones billed (rule 13.8). */
  picturesPainted: number;
  /** Pictures that went out as the free render after painting failed (rule 13.6). */
  picturesFree: number;
  /** Every value the engine assumed rather than read (rule 13.2); the booklet's assumptions page. */
  assumptions: string[];
};

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const kindOf = (k: string): VmbProjectKind => ((VMB_PROJECT_KINDS as readonly string[]).includes(k) ? (k as VmbProjectKind) : "building");

/** What a finished run is billed: the base for the kind plus each painted picture, never above what was held. */
export function creditsUsed(kind: VmbProjectKind, picturesPainted: number, held: number): number {
  const painted = Math.max(0, Math.floor(Number.isFinite(picturesPainted) ? picturesPainted : 0));
  const used = VMB_BOOKLET_PRICING.base[kind] + painted * VMB_BOOKLET_PRICING.creditsPerPicture;
  return Math.max(0, Math.min(used, held));
}

function stringMaps(v: unknown): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [path, layers] of Object.entries(asObject(v))) {
    const m: Record<string, string> = {};
    for (const [layer, kind] of Object.entries(asObject(layers))) if (typeof kind === "string") m[layer] = kind;
    out[path] = m;
  }
  return out;
}

async function inputFor(jobId: string, projectId: string): Promise<RunInput | null> {
  const p = await prisma.vmbProject.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      kind: true,
      manifest: true,
      scans: { select: { fileName: true, round: true, facts: true } },
      files: { orderBy: { relPath: "asc" }, select: { relPath: true, kind: true, blobUrl: true } },
    },
  });
  if (!p) return null;
  const q = questionsState(p);
  return {
    jobId,
    projectId: p.id,
    kind: kindOf(p.kind),
    files: p.files,
    answers: q.resolved as RunInput["answers"],
    layerMaps: stringMaps(asObject(p.manifest).layerMaps),
  };
}

/**
 * Takes the oldest queued booklet job. Only the call whose update moves it out of "queued" gets it, so two runners never
 * take the same job; a job that was cancelled in between is simply not there any more.
 */
export async function claimNextJob(): Promise<RunInput | null> {
  for (let tries = 0; tries < 3; tries++) {
    const next = await prisma.vmbJob.findFirst({ where: { kind: "booklet", status: "queued" }, orderBy: { createdAt: "asc" }, select: { id: true, projectId: true } });
    if (!next) return null;
    const moved = await prisma.vmbJob.updateMany({ where: { id: next.id, status: "queued" }, data: { status: "running", startedAt: new Date() } });
    if (moved.count !== 1) continue;
    const input = await inputFor(next.id, next.projectId);
    if (!input) {
      await failJob(next.id, "project_missing");
      continue;
    }
    log.info("job claimed", { jobId: next.id, projectId: next.projectId });
    return input;
  }
  return null;
}

/** Seconds between progress writes; a stage that completes is always written. */
const WRITE_EVERY_MS = 2_000;

/**
 * The engine's progress callback for one job: keeps the stage list in memory, writes it with percent and time left, and
 * skips writes that come faster than the UI polls. A write only lands while the job is still running.
 */
export function progressReporter(jobId: string, initial: JobProgress, opts: { now?: () => number } = {}): { report: RunReport; current: () => JobProgress } {
  const now = opts.now ?? Date.now;
  let progress = initial;
  let lastWrite = 0;
  const report: RunReport = async (stage, done, total, detail) => {
    const before = progress.stages.find((s) => s.key === stage);
    progress = advance(progress, stage, done, total, detail);
    const after = progress.stages.find((s) => s.key === stage);
    const completed = !!after && after.total > 0 && after.done >= after.total && !(before && before.done >= before.total);
    const t = now();
    if (!completed && t - lastWrite < WRITE_EVERY_MS) return;
    lastWrite = t;
    await prisma.vmbJob.updateMany({
      where: { id: jobId, status: "running" },
      data: { progress: progress as unknown as Prisma.InputJsonValue, percent: jobPercent(progress.stages), etaSeconds: etaSeconds(progress, t) },
    });
  };
  return { report, current: () => progress };
}

async function jobOf(jobId: string) {
  return prisma.vmbJob.findUnique({
    where: { id: jobId },
    select: { id: true, workspaceId: true, projectId: true, startedAt: true, costCredits: true, progress: true, project: { select: { kind: true, manifest: true } } },
  });
}

/** Finishes a job: bills what was delivered painted, gives back the rest, and puts the booklet on the project. */
export async function finishJob(jobId: string, out: RunOutput): Promise<boolean> {
  const job = await jobOf(jobId);
  if (!job) return false;
  const finishedAt = new Date();
  const moved = await prisma.vmbJob.updateMany({
    where: { id: jobId, status: "running" },
    data: { status: "done", percent: 100, etaSeconds: 0, finishedAt, computeMs: job.startedAt ? finishedAt.getTime() - job.startedAt.getTime() : null },
  });
  if (moved.count !== 1) return false;
  const used = creditsUsed(kindOf(job.project.kind), out.picturesPainted, job.costCredits ?? 0);
  await settleHold(job.workspaceId, jobId, used);
  const booklet = { url: out.bookletUrl, jobId, picturesPainted: out.picturesPainted, picturesFree: out.picturesFree, assumptions: out.assumptions, creditsUsed: used, at: finishedAt.toISOString() };
  await prisma.vmbProject.update({
    where: { id: job.projectId },
    data: { status: "done", manifest: { ...asObject(job.project.manifest), booklet } as Prisma.InputJsonValue },
  });
  log.info("job done", { jobId, used, painted: out.picturesPainted, free: out.picturesFree });
  return true;
}

/** Stops a job that could not finish: nothing is billed, everything held goes back. */
export async function failJob(jobId: string, error: string): Promise<boolean> {
  const job = await jobOf(jobId);
  if (!job) return false;
  const moved = await prisma.vmbJob.updateMany({ where: { id: jobId, status: "running" }, data: { status: "failed", error: error.slice(0, 500), finishedAt: new Date(), etaSeconds: null } });
  if (moved.count !== 1) return false;
  await settleHold(job.workspaceId, jobId, 0);
  await prisma.vmbProject.update({ where: { id: job.projectId }, data: { status: "failed" } });
  log.warn("job failed", { jobId, error: error.slice(0, 200) });
  return true;
}

/**
 * Runs one job end to end with the given engine. Whatever the engine throws fails the job and releases its credits, so a
 * crash never keeps a client's credits held.
 */
export async function runClaimed(input: RunInput, engine: (input: RunInput, report: RunReport) => Promise<RunOutput>): Promise<"done" | "failed"> {
  const job = await jobOf(input.jobId);
  const initial = (job?.progress as unknown as JobProgress | null) ?? { startedAt: Date.now(), stages: RUN_STAGES.map((key) => ({ key, weight: 1, done: 0, total: 1 })) };
  const { report } = progressReporter(input.jobId, { ...initial, startedAt: Date.now() });
  try {
    const out = await engine(input, report);
    return (await finishJob(input.jobId, out)) ? "done" : "failed";
  } catch (err: unknown) {
    await failJob(input.jobId, err instanceof Error ? err.message : String(err));
    return "failed";
  }
}
