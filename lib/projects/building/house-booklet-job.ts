import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { scheduleNextStep } from "@/lib/projects/building/booklet-job";
import type { North } from "@/lib/projects/building/compass";
import type { BookletStage, BookletState } from "@/lib/projects/building/dwf-booklet";
import type { HouseAuditFinding } from "@/lib/projects/building/house-audit";
import {
  defaultHouseBudgetIls,
  estimateHousePainting,
  HOUSE_IMAGE_MODELS,
  houseMeasureBudgetIls,
  houseSpend,
  type HouseCost,
  type HouseCostReport,
  type HouseSpend,
  type PictureCost,
} from "@/lib/projects/building/house-cost";
import { houseKnob } from "@/lib/projects/building/house-knobs";
import type { HouseLevels, HouseProject } from "@/lib/projects/building/house-project";
import { houseFileStore } from "@/lib/projects/building/house-store";
import type { TruthFinding } from "@/lib/projects/building/house-truth";

/**
 * A private-house booklet made on the platform, one function call at a time,
 * in two runs — the second only on the user's word:
 *
 * - measuring: the sheets read, every model stood up and drawn — the measured
 *   renders, the audit, the truth check. A few text calls; no picture is
 *   painted. It stops at awaiting_approval with the review: the renders a
 *   painting would go over, what the checks found, and what painting them
 *   would cost.
 * - painting: on approval, those very renders painted within the approved
 *   ceiling (or none, for the measured booklet), the pages put together, the
 *   PDF made.
 *
 * Each run is cut into steps that each finish well inside a function's
 * 300 s (house-booklet-steps.ts). The record — where the job is, its review,
 * its approval, what it has spent — is the job's row; its files (the uploads,
 * every model's pictures and state, the paintings, the PDF) are in the house
 * store. QStash calls for the next step where it is configured; the page
 * that started the job calls while it is open. A call that finds the job
 * taken goes away; one that died is taken up again from its last step.
 *
 * This half holds the rows and the user's words; the steps, which carry the
 * renderer, Chromium and the painter, are apart, so a function that only
 * reads a job does not carry the engine.
 */
export type HouseBookletStatus = "measuring" | "awaiting_approval" | "painting" | "done" | "failed";

export type HouseReviewModel = {
  id: string;
  name: string;
  /** The measured renders a painting goes over, by name. */
  pictures: string[];
  /** Of those, the ones whose painting is already held: reused, unpaid. */
  reused: string[];
  audit: HouseAuditFinding[];
  /** Each storey counted against its sheet: the CAD's inventory, or the vision model's count. */
  truth: Array<TruthFinding & { text: string }>;
};

export type HouseBookletReview = {
  models: HouseReviewModel[];
  /** Painting every picture that is not reused, with the booklet's image model: three calls a picture at most. */
  estimate: ReturnType<typeof estimateHousePainting>;
  /** The ceiling suggested: HOUSE_BOOKLET_BUDGET_ILS, else ₪50. */
  budgetIls: number;
};

/** One model as measured: its booklet's state, and each of its pictures' reference in the store, by the state's references. */
export type StoredModel = { id: string; name: string; projectName: string; styleId?: string; state: BookletState; artefacts: Record<string, string> };

/** The step a call takes up next. */
export type HouseStep =
  | { kind: "facades" }
  | { kind: "read"; model: number }
  | { kind: "build"; model: number; stage: BookletStage }
  | { kind: "review"; model: number }
  | { kind: "estimate" }
  | { kind: "paint"; model: number }
  | { kind: "assemble" }
  | { kind: "done" };

export function houseStepLabel(step: HouseStep): string {
  switch (step.kind) {
    case "read":
    case "review":
    case "paint":
      return `${step.kind}:${step.model}`;
    case "build":
      return `build:${step.model}:${step.stage}`;
    default:
      return step.kind;
  }
}

/** The job as kept in its row. */
export type HouseBookletRecord = {
  id: string;
  orgId: string;
  name: string;
  status: HouseBookletStatus;
  /** The run the job is in, or was in when it stopped. */
  phase: "measure" | "paint";
  /** The step next, or the one it stopped in. */
  at: HouseStep;
  /** Calls that took up the step in hand: one that keeps dying fails the job, resumable, rather than being tried for ever. */
  tries?: number;
  steps: string[];
  startedAt: number;
  finishedAt?: number;
  error?: string;
  /** A failed run that can be started again from where it stopped. */
  resumable?: boolean;
  /** Read the sheets with the vision model too: a few text calls within the measuring ceiling. False: by their lines alone, nothing paid. */
  ai: boolean;
  /** Each uploaded sheet's file name, and its reference in the store. */
  files: Record<string, string>;
  /** Which sheet is which, and what the notes beside them say (house-project.ts). */
  project: HouseProject;
  /** True north, as the first step read it, and whether it was read or taken for the sheet's up. */
  north?: North;
  northKnown?: boolean;
  /** The facades as read, in the store (house-booklet.ts, StoredHouseFacades). */
  facadesRef?: string;
  /** The model being measured: its reading in the store, its levels and truth, and its booklet's state so far. */
  work?: {
    readingRef: string;
    levels: HouseLevels;
    truth: Array<TruthFinding & { text: string }>;
    openings: NonNullable<BookletState["openings"]>;
    lawnM2: number | null;
    state: BookletState;
  };
  models?: StoredModel[];
  /** The review's models as each is measured; the review itself once all are. */
  reviewing?: HouseReviewModel[];
  review?: HouseBookletReview;
  /** `acceptUnpainted`: the user's word, after a painting that did not finish, to make the booklet with what held — no further call. */
  approval?: { paint: boolean; budgetIls: number | null; at: number; acceptUnpainted?: boolean };
  /** The painting so far: each model's pictures tried, the paintings that held (their references in the store), whether the ceiling was reached. */
  paint?: { tried: Record<string, string[]>; painted: Record<string, Record<string, string>>; stopped?: boolean; pictures: PictureCost[] };
  /** The PDF's reference in the store. */
  pdfRef?: string;
  bytes?: number;
  /** What each run's calls came to, as last saved. */
  cost: { measure: HouseCost; paint: HouseCost };
  report?: HouseCostReport;
  /** The pictures the painting did not hold, "model: picture": the booklet shows them as measured renders. */
  unpainted?: string[];
  /** The working files are gone, the PDF made: only the booklet is kept. */
  cleaned?: boolean;
};

export const ZERO_COST: HouseCost = { calls: 0, images: 0, usd: 0, ils: 0 };
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const plusCost = (a: HouseCost, b: HouseCost): HouseCost => ({ calls: a.calls + b.calls, images: a.images + b.images, usd: a.usd + b.usd, ils: a.ils + b.ils });

export const houseFileKey = (name: string) => encodeURIComponent(name);
export const houseJobPath = (id: string, rest: string) => `jobs/${id}/${rest}`;

const RUNNING: HouseBookletStatus[] = ["measuring", "painting"];
export const isHouseJobRunning = (record: Pick<HouseBookletRecord, "status">) => RUNNING.includes(record.status);

/** The job's model calls, estimated in dollars and shekels. */
export function houseBookletCost(job: HouseBookletRecord): HouseCost & { measure: HouseCost; paint: HouseCost; budgetIls: number | null; stopped: boolean } {
  return { ...plusCost(job.cost.measure, job.cost.paint), measure: job.cost.measure, paint: job.cost.paint, budgetIls: job.approval?.budgetIls ?? null, stopped: job.paint?.stopped ?? false };
}

/** The measuring run's ledger, its vision reading held to what is left of its ceiling. */
export function measureSpendFor(record: Pick<HouseBookletRecord, "cost">): HouseSpend {
  return houseSpend({ budgetIls: Math.max(0.01, houseMeasureBudgetIls() - (record.cost?.measure.ils ?? 0)) });
}

/** The image models the painting asks: HOUSE_BOOKLET_IMAGE_MODEL alone where set, else HOUSE_IMAGE_MODELS. */
export function houseImageModels(): string[] {
  const only = houseKnob("HOUSE_BOOKLET_IMAGE_MODEL")?.trim();
  return only ? [only] : [...HOUSE_IMAGE_MODELS];
}

function rowOf(record: HouseBookletRecord) {
  return { status: record.status, stage: houseStepLabel(record.at), state: record as unknown as Prisma.InputJsonValue, error: record.error ?? null };
}

/** The record written to its row; `lockedUntil` too where given (null lets the job go). */
export async function saveHouseBookletRecord(record: HouseBookletRecord, lock?: { lockedUntil: Date | null }): Promise<void> {
  await prisma.houseBookletJob.update({ where: { id: record.id }, data: { ...rowOf(record), ...(lock ?? {}) } });
}

/** A new job: its sheets kept in the store, its row written. Nothing is read or painted here. */
export async function createHouseBookletJob(input: { orgId: string; userId: string; name: string; files: Map<string, Buffer>; project: HouseProject; ai?: boolean; notes?: string[] }): Promise<HouseBookletRecord> {
  const id = randomUUID();
  const store = await houseFileStore();
  const files: Record<string, string> = {};
  for (const [name, data] of input.files) files[name] = await store.put(houseJobPath(id, `files/${houseFileKey(name)}`), data, "application/octet-stream");
  const record: HouseBookletRecord = {
    id,
    orgId: input.orgId,
    name: input.name,
    status: "measuring",
    phase: "measure",
    at: { kind: "facades" },
    steps: (input.notes ?? []).map((n) => `0s ${n}`),
    startedAt: Date.now(),
    ai: input.ai !== false,
    files,
    project: input.project,
    cost: { measure: ZERO_COST, paint: ZERO_COST },
  };
  await prisma.houseBookletJob.create({ data: { id, organizationId: input.orgId, userId: input.userId, name: input.name, ...rowOf(record) } });
  return record;
}

/** The job, this organisation's only. */
export async function getHouseBookletJob(orgId: string, id: string): Promise<HouseBookletRecord | null> {
  if (!ID.test(id)) return null;
  const row = await prisma.houseBookletJob.findFirst({ where: { id, organizationId: orgId } });
  return row ? (row.state as unknown as HouseBookletRecord) : null;
}

/** Ask QStash for the job's next step; without it, the open page makes it. */
export function scheduleHouseStep(id: string): Promise<boolean> {
  return scheduleNextStep(id, "/api/cron/house-booklet-step");
}

/** What the page is shown of the job. */
export function houseBookletView(job: HouseBookletRecord) {
  return {
    id: job.id,
    name: job.name,
    status: job.status,
    phase: job.phase,
    stage: houseStepLabel(job.at),
    steps: job.steps,
    error: job.error ?? null,
    resumable: job.resumable ?? false,
    seconds: Math.round(((job.finishedAt ?? Date.now()) - job.startedAt) / 1000),
    bytes: job.bytes ?? 0,
    review: job.cleaned ? null : (job.review ?? null),
    approval: job.approval ?? null,
    cost: houseBookletCost(job),
    report: job.report ?? null,
    unpainted: job.unpainted ?? [],
  };
}

/** The store's reference of a measured render the review shows, by its model and name. */
export function houseReviewPictureRef(job: HouseBookletRecord, modelId: string, name: string): string | null {
  if (job.cleaned) return null;
  const model = job.models?.find((m) => m.id === modelId);
  const review = job.review?.models.find((m) => m.id === modelId);
  if (!model || !review?.pictures.includes(name)) return null;
  return model.artefacts[model.state.artefacts?.[name] ?? ""] ?? null;
}

export async function houseBookletPdf(job: HouseBookletRecord): Promise<Buffer | null> {
  if (!job.pdfRef) return null;
  return (await houseFileStore()).get(job.pdfRef);
}

/** A copy on this machine's disk, for a server run locally; production keeps none. */
export async function keepHouseBookletOnDisk(job: HouseBookletRecord): Promise<string | null> {
  const pdf = await houseBookletPdf(job);
  if (!pdf || process.env.NODE_ENV === "production") return null;
  const [{ mkdir, writeFile }, os, path] = await Promise.all([import("node:fs/promises"), import("node:os"), import("node:path")]);
  const dir = path.join(os.tmpdir(), "house-booklets");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${job.id}.pdf`);
  await writeFile(file, pdf);
  return file;
}

export class HouseBookletStateError extends Error {}

/** A painting run that stopped, its measured models kept: it can be approved again or accepted as it stands. */
const paintStopped = (job: HouseBookletRecord) => job.status === "failed" && job.phase === "paint" && Boolean(job.models?.length);

/** The painting's pictures tried again where they did not hold; those that did are kept. */
function keepPainted(paint: HouseBookletRecord["paint"]): NonNullable<HouseBookletRecord["paint"]> {
  const painted = paint?.painted ?? {};
  return { tried: Object.fromEntries(Object.entries(painted).map(([m, p]) => [m, Object.keys(p)])), painted, pictures: paint?.pictures ?? [] };
}

/** The job set going again at `at`, in `phase`. */
function resume(job: HouseBookletRecord, phase: HouseBookletRecord["phase"], at: HouseStep): void {
  job.phase = phase;
  job.status = phase === "measure" ? "measuring" : "painting";
  job.at = at;
  job.tries = 0;
  job.error = undefined;
  job.resumable = undefined;
  job.finishedAt = undefined;
}

async function go(job: HouseBookletRecord): Promise<void> {
  await prisma.houseBookletJob.update({ where: { id: job.id }, data: { ...rowOf(job), lockedUntil: null } });
  await scheduleHouseStep(job.id);
}

/**
 * The user's word on the review: paint within `budgetIls` (the default
 * ceiling where none is given), or put the measured booklet together
 * unpainted, for free. After a painting that stopped short, the word again:
 * the new ceiling is the painting's whole, what it already spent within it.
 */
export async function approveHouseBookletJob(job: HouseBookletRecord, input: { paint: boolean; budgetIls?: number | null }): Promise<void> {
  const again = paintStopped(job);
  if (job.status !== "awaiting_approval" && !again) throw new HouseBookletStateError("החוברת אינה ממתינה לאישור");
  const budgetIls = input.paint ? (input.budgetIls ?? defaultHouseBudgetIls()) : null;
  if (again) {
    if (budgetIls != null && budgetIls <= job.cost.paint.ils) {
      throw new HouseBookletStateError(`התקרה החדשה חייבת להיות גבוהה מ־₪${job.cost.paint.ils.toFixed(2)} שכבר הוצאו על הצביעה`);
    }
    job.paint = keepPainted(job.paint);
  } else {
    job.cost = { ...job.cost, paint: ZERO_COST };
    job.paint = { tried: {}, painted: {}, pictures: [] };
  }
  job.approval = { paint: input.paint, budgetIls, at: Date.now() };
  job.unpainted = undefined;
  resume(job, "paint", input.paint ? { kind: "paint", model: 0 } : { kind: "assemble" });
  job.steps.push(`${((Date.now() - job.startedAt) / 1000).toFixed(0)}s approved: ${input.paint ? `paint within ₪${budgetIls}` : "the measured booklet, unpainted"}`);
  await go(job);
}

/** After a painting that stopped short: the booklet made as it stands — what held is reused, the rest are the measured renders, marked; no call is made. */
export async function acceptHouseBookletUnpainted(job: HouseBookletRecord): Promise<void> {
  if (!paintStopped(job) || !job.approval?.paint) throw new HouseBookletStateError("אין צביעה שנעצרה להפיק ממנה חוברת");
  job.approval = { ...job.approval, acceptUnpainted: true, at: Date.now() };
  resume(job, "paint", { kind: "assemble" });
  await go(job);
}

/** A failed run started again from where it stopped: the measured models and every held painting are kept. */
export async function retryHouseBookletJob(job: HouseBookletRecord): Promise<void> {
  if (job.status !== "failed" || !job.resumable) throw new HouseBookletStateError("אין שלב להמשיך ממנו");
  if (job.phase === "paint" && job.approval && job.models?.length) {
    // Within what is left of the ceiling: the pictures that did not hold are tried again.
    job.paint = keepPainted(job.paint);
    resume(job, "paint", job.approval.paint && !job.approval.acceptUnpainted ? { kind: "paint", model: 0 } : { kind: "assemble" });
  } else {
    resume(job, "measure", job.at);
  }
  await go(job);
}
