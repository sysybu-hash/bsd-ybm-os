import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { VMB_PROJECT_KINDS, type VmbProjectKind } from "@/lib/validation/schemas/vmb-projects";
import { questionsState } from "@/lib/vmb/answers-store";
import { settleHold } from "@/lib/vmb/credits";
import { VMB_BOOKLET_PRICING } from "@/lib/vmb/plans";
import { advance, etaSeconds, jobPercent, type JobProgress } from "@/lib/vmb/progress";
import type { CadKind } from "@/lib/projects/building/cad-layers";
import { RunProjectError, type Report, type RunFileKind, type RunInput, type RunOutput, type RunProjectErrorCode, type RunStage } from "@/lib/projects/pipeline/runProject";

/**
 * The VMB side of the runner: what takes a booklet job off the queue, writes its progress where every shell reads it,
 * and settles its credits at the end. The engine (`runProject`, M5) plugs in through `RunInput` / `RunReport` /
 * `RunOutput` and knows nothing about the queue, the ledger or the project's status.
 */

const log = createLogger("vmb-runner");

export const RUN_STAGES = ["read", "build", "render", "paint", "booklet"] as const satisfies readonly RunStage[];
export type { RunInput, RunOutput, RunStage };
export type RunReport = Report;

/** Why a job stopped, kept on the project so the page can say it (and offer the flats when one must be picked). */
export type RunStop = { jobId: string; code: RunProjectErrorCode | "error" | "stalled"; message: string | null; units?: number[]; at: string };

const FILE_KINDS: readonly RunFileKind[] = ["dxf", "dwg", "pdf", "dwf", "image"];

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const kindOf = (k: string): VmbProjectKind => ((VMB_PROJECT_KINDS as readonly string[]).includes(k) ? (k as VmbProjectKind) : "building");

/**
 * What a finished run is billed: the base for the kind plus each painted picture, never above what was held. A booklet
 * with no painted picture (all free renders, as long as painting is not wired) costs nothing.
 */
export function creditsUsed(kind: VmbProjectKind, picturesPainted: number, held: number): number {
  const painted = Math.max(0, Math.floor(Number.isFinite(picturesPainted) ? picturesPainted : 0));
  if (painted === 0) return 0;
  const used = VMB_BOOKLET_PRICING.base[kind] + painted * VMB_BOOKLET_PRICING.creditsPerPicture;
  return Math.max(0, Math.min(used, held));
}

function stringMaps(v: unknown): Record<string, Record<string, CadKind>> {
  const out: Record<string, Record<string, CadKind>> = {};
  for (const [path, layers] of Object.entries(asObject(v))) {
    const m: Record<string, CadKind> = {};
    // Only the server's own suggestions were stored (scan-store re-derives them), so a string here is a CadKind.
    for (const [layer, kind] of Object.entries(asObject(layers))) if (typeof kind === "string") m[layer] = kind as CadKind;
    out[path] = m;
  }
  return out;
}

async function inputFor(jobId: string, projectId: string): Promise<RunInput | null> {
  const p = await prisma.vmbProject.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      kind: true,
      manifest: true,
      scans: { select: { fileName: true, round: true, facts: true } },
      files: { orderBy: { relPath: "asc" }, select: { relPath: true, kind: true, blobUrl: true } },
    },
  });
  if (!p) return null;
  const q = questionsState(p);
  const unit = asObject(p.manifest).unit;
  return {
    jobId,
    projectId: p.id,
    kind: kindOf(p.kind),
    files: p.files.flatMap((f) => ((FILE_KINDS as readonly string[]).includes(f.kind) ? [{ ...f, kind: f.kind as RunFileKind }] : [])),
    answers: q.resolved as RunInput["answers"],
    layerMaps: stringMaps(asObject(p.manifest).layerMaps),
    projectName: p.name,
    ...(typeof unit === "number" && Number.isInteger(unit) ? { unit } : {}),
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
  const booklet = {
    url: out.bookletUrl,
    jobId,
    route: out.route,
    picturesPainted: out.picturesPainted,
    picturesFree: out.picturesFree,
    assumptions: out.assumptions,
    unusedAnswers: out.unusedAnswers,
    creditsUsed: used,
    at: finishedAt.toISOString(),
  };
  const manifest: Record<string, unknown> = { ...asObject(job.project.manifest), booklet };
  delete manifest.stop;
  await prisma.vmbProject.update({ where: { id: job.projectId }, data: { status: "done", manifest: manifest as Prisma.InputJsonValue } });
  log.info("job done", { jobId, used, painted: out.picturesPainted, free: out.picturesFree });
  return true;
}

/**
 * Stops a job that could not finish: nothing is billed, everything held goes back. A stop the client can act on (the
 * engine's RunProjectError: pick a flat, convert a DWG...) returns the project to "answered" with the engine's own words;
 * anything else is a fault, and the project shows a plain failure.
 */
export async function failJob(jobId: string, error: string, stop?: { code: RunProjectErrorCode; message: string; units?: number[] }): Promise<boolean> {
  const job = await jobOf(jobId);
  if (!job) return false;
  const moved = await prisma.vmbJob.updateMany({ where: { id: jobId, status: "running" }, data: { status: "failed", error: error.slice(0, 500), finishedAt: new Date(), etaSeconds: null } });
  if (moved.count !== 1) return false;
  await settleHold(job.workspaceId, jobId, 0);
  const at = new Date().toISOString();
  const record: RunStop = stop
    ? { jobId, code: stop.code, message: stop.message.slice(0, 500), ...(stop.units?.length ? { units: stop.units.slice(0, 200) } : {}), at }
    : { jobId, code: error === "stalled" ? "stalled" : "error", message: null, at };
  await prisma.vmbProject.update({
    where: { id: job.projectId },
    data: { status: stop ? "answered" : "failed", manifest: { ...asObject(job.project.manifest), stop: record } as Prisma.InputJsonValue },
  });
  log.warn("job failed", { jobId, error: error.slice(0, 200) });
  return true;
}

/**
 * A running job that has not written anything for this long is dead: no function lives past its maxDuration (800 s), so
 * nothing is still working on it.
 */
export const STALLED_AFTER_MS = 15 * 60_000;

/** Fails every running booklet job that stopped reporting, giving back what it held. Returns how many were failed. */
export async function reapStalledJobs(now = Date.now()): Promise<number> {
  const stalled = await prisma.vmbJob.findMany({
    where: { kind: "booklet", status: "running", updatedAt: { lt: new Date(now - STALLED_AFTER_MS) } },
    select: { id: true },
    take: 20,
  });
  let failed = 0;
  for (const j of stalled) if (await failJob(j.id, "stalled")) failed++;
  return failed;
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
    if (err instanceof RunProjectError) await failJob(input.jobId, err.code, { code: err.code, message: err.message, units: err.detail?.units });
    else await failJob(input.jobId, err instanceof Error ? err.message : String(err));
    return "failed";
  }
}
