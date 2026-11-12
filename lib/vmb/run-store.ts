import "server-only";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
import { VMB_PROJECT_KINDS, type VmbProjectKind } from "@/lib/validation/schemas/vmb-projects";
import { questionsState } from "@/lib/vmb/answers-store";
import { holdCredits, settleHold } from "@/lib/vmb/credits";
import { getEntitlement } from "@/lib/vmb/entitlement";
import { estimateBooklet, runBlock, type BookletEstimate, type RunBlock } from "@/lib/vmb/estimate";
import type { JobProgress } from "@/lib/vmb/progress";
import { projectsOfUser } from "@/lib/vmb/projects";
import { dispatchRun } from "@/lib/vmb/run-queue";

const log = createLogger("vmb-run");

const LIVE = ["queued", "running"];
const kindOf = (k: string): VmbProjectKind => ((VMB_PROJECT_KINDS as readonly string[]).includes(k) ? (k as VmbProjectKind) : "building");
export const runnerReady = () => env.VMB_RUNNER_READY === "1";

/** What the cost card shows: the estimate, the balance, and why the button is off (null when it is on). */
export type CostState = { estimate: BookletEstimate; balance: number; active: boolean; block: RunBlock | null; queuedJobId: string | null };

async function loadProject(userId: string, projectId: string) {
  return prisma.vmbProject.findFirst({
    where: { id: projectId, ...projectsOfUser(userId) },
    select: {
      id: true,
      kind: true,
      status: true,
      workspaceId: true,
      manifest: true,
      scans: { select: { fileName: true, round: true, facts: true } },
      _count: { select: { files: true } },
      jobs: { where: { status: { in: LIVE } }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true } },
    },
  });
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadProject>>>;

async function costOf(p: Loaded): Promise<CostState> {
  const q = questionsState(p);
  const views = q.resolved.views?.value;
  const estimate = estimateBooklet(kindOf(p.kind), Array.isArray(views) ? views : []);
  const ent = await getEntitlement(p.workspaceId);
  const live = p.jobs[0] ?? null;
  return {
    estimate,
    balance: ent.balance,
    active: ent.active,
    block: runBlock({ confirmed: !!q.confirmedAt, files: p._count.files, active: ent.active, balance: ent.balance, cap: estimate.cap, liveJob: !!live, runnerReady: runnerReady() }),
    queuedJobId: live?.status === "queued" ? live.id : null,
  };
}

export async function projectCost(userId: string, projectId: string): Promise<CostState | null> {
  const p = await loadProject(userId, projectId);
  return p ? costOf(p) : null;
}

/** The booklet job's stages, before any of them ran. */
function initialProgress(pictures: number): JobProgress {
  return {
    startedAt: Date.now(),
    stages: [
      { key: "read", weight: 1, done: 0, total: 1 },
      { key: "build", weight: 2, done: 0, total: 1 },
      { key: "render", weight: 2, done: 0, total: Math.max(1, pictures) },
      { key: "paint", weight: 4, done: 0, total: pictures },
      { key: "booklet", weight: 1, done: 0, total: 1 },
    ],
  };
}

export type StartOutcome = { ok: true; jobId: string } | { ok: false; code: RunBlock | "not_found" };

/**
 * The one button: re-checks everything the card showed, creates the job, and holds its ceiling. If the hold fails (the
 * balance moved since the card was drawn), the job is removed and nothing is held.
 */
export async function startRun(userId: string, projectId: string): Promise<StartOutcome> {
  const p = await loadProject(userId, projectId);
  if (!p) return { ok: false, code: "not_found" };
  const cost = await costOf(p);
  if (cost.block) return { ok: false, code: cost.block };
  const { estimate } = cost;
  const job = await prisma.vmbJob.create({
    data: { workspaceId: p.workspaceId, projectId: p.id, kind: "booklet", status: "queued", progress: initialProgress(estimate.pictures), costCredits: estimate.cap },
    select: { id: true },
  });
  const held = await holdCredits(p.workspaceId, job.id, estimate.cap);
  if (!held.ok) {
    await prisma.vmbJob.delete({ where: { id: job.id } });
    return { ok: false, code: "insufficient_credits" };
  }
  await prisma.vmbProject.update({ where: { id: p.id }, data: { status: "running" } });
  log.info("run queued", { projectId: p.id, jobId: job.id, cap: estimate.cap });
  // Started now by the queue; if the message cannot be sent, the sweeper (cron/vmb-runner) takes it within 15 minutes.
  await dispatchRun(job.id);
  return { ok: true, jobId: job.id };
}

/** Cancels a job that has not started yet and gives back everything it held. A running job is not cancelled here. */
export async function cancelQueuedRun(userId: string, projectId: string): Promise<boolean> {
  const p = await loadProject(userId, projectId);
  const job = p?.jobs[0];
  if (!p || !job || job.status !== "queued") return false;
  // Only the request that moves it out of "queued" gives the credits back.
  const moved = await prisma.vmbJob.updateMany({ where: { id: job.id, status: "queued" }, data: { status: "cancelled", finishedAt: new Date() } });
  if (moved.count !== 1) return false;
  await settleHold(p.workspaceId, job.id, 0);
  await prisma.vmbProject.update({ where: { id: p.id }, data: { status: "answered" } });
  log.info("run cancelled", { projectId: p.id, jobId: job.id });
  return true;
}
