import { randomUUID } from "node:crypto";

import { createLogger } from "@/lib/logger";
import { renderHtmlSectionsPdf } from "@/lib/pdf/render-html-pdf-chromium";
import { BUILDING_BOOKLET_PAGE } from "@/lib/projects/building/booklet-html";
import { runWithAiUsage } from "@/lib/ai-usage";
import type { BookletState } from "@/lib/projects/building/dwf-booklet";
import { finishMeasuredHouse, houseSubject, runPrivateHouseBooklet, type MeasuredHouseModel } from "@/lib/projects/building/house-booklet";
import type { HouseProject } from "@/lib/projects/building/house-project";
import type { HouseAuditFinding } from "@/lib/projects/building/house-audit";
import {
  costLines,
  costReport,
  defaultHouseBudgetIls,
  estimateHousePainting,
  HOUSE_IMAGE_MODELS,
  houseMeasureBudgetIls,
  houseSpend,
  runWithTextBudget,
  spentSoFar,
  type HouseCost,
  type HouseCostReport,
  type HouseSpend,
} from "@/lib/projects/building/house-cost";
import { paintingPlan } from "@/lib/projects/building/house-photoreal";
import { answerMemo, houseFileStore, paintingCache, type HouseFileStore } from "@/lib/projects/building/house-store";
import type { TruthFinding } from "@/lib/projects/building/house-truth";
import { resolveFloorplanVizStyle } from "@/lib/projects/floorplan-viz-styles";
import { houseKnob } from "@/lib/projects/building/house-knobs";

const log = createLogger("house-booklet-job");

/**
 * A private-house booklet in two runs, the second only on the user's word:
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
 * The record and its files (the uploads, every model's pictures and state,
 * the PDF) are kept in the house store: a restart loses the run in hand, not
 * the job — it is taken up again from the last finished run.
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

type StoredModel = { id: string; name: string; projectName: string; styleId?: string; state: BookletState; artefacts: Record<string, string> };

/** The job as kept: everything but what a running process holds. */
export type HouseBookletRecord = {
  id: string;
  orgId: string;
  name: string;
  status: HouseBookletStatus;
  /** The run the job is in, or was in when it stopped. */
  phase: "measure" | "paint";
  steps: string[];
  startedAt: number;
  finishedAt?: number;
  error?: string;
  /** A failed run that can be started again from where the last finished one left off. */
  resumable?: boolean;
  /** Each uploaded sheet's file name, and its reference in the store. */
  files: Record<string, string>;
  /** Which sheet is which, and what the notes beside them say (house-project.ts). */
  project: HouseProject;
  models?: StoredModel[];
  review?: HouseBookletReview;
  /** `acceptUnpainted`: the user's word, after a painting that did not finish, to make the booklet with what held — no further call. */
  approval?: { paint: boolean; budgetIls: number | null; at: number; acceptUnpainted?: boolean };
  /** The PDF's reference in the store. */
  pdfRef?: string;
  bytes?: number;
  /** What each run's calls came to, as last saved. */
  cost: { measure: HouseCost; paint: HouseCost };
  report?: HouseCostReport;
  /** The pictures the painting did not hold, "model: picture": the booklet shows them as measured renders. */
  unpainted?: string[];
};

export type HouseBookletJob = HouseBookletRecord & {
  /** This process's ledgers: the reading's calls, and the painting's within its ceiling. */
  measureSpend: HouseSpend;
  paintSpend: HouseSpend;
  /** Why the run in hand was stopped (time or memory); every later step refuses. */
  abort?: string;
  running?: boolean;
  pdf?: Buffer;
  savedAt?: number;
};

const ZERO: HouseCost = { calls: 0, images: 0, usd: 0, ils: 0 };
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const plus = (a: HouseCost, b: HouseCost): HouseCost => ({ calls: a.calls + b.calls, images: a.images + b.images, usd: a.usd + b.usd, ils: a.ils + b.ils });

/** The job's model calls, this process's and those of earlier processes, estimated in dollars and shekels. */
export function houseBookletCost(job: HouseBookletJob): HouseCost & { measure: HouseCost; paint: HouseCost; budgetIls: number | null; stopped: boolean } {
  const measure = plus(job.cost.measure, spentSoFar(job.measureSpend));
  const paint = plus(job.cost.paint, spentSoFar(job.paintSpend));
  return { ...plus(measure, paint), measure, paint, budgetIls: job.approval?.budgetIls ?? null, stopped: job.paintSpend.stopped };
}

const jobs: Map<string, HouseBookletJob> = ((globalThis as { __houseBookletJobs?: Map<string, HouseBookletJob> }).__houseBookletJobs ??= new Map());

const fileKey = (name: string) => encodeURIComponent(name);
const jobPath = (id: string, rest: string) => `jobs/${id}/${rest}`;

function recordOf(job: HouseBookletJob): HouseBookletRecord {
  const { measureSpend: _m, paintSpend: _p, abort: _a, running: _r, pdf: _pdf, savedAt: _s, ...record } = job;
  const now = houseBookletCost(job);
  return { ...record, cost: { measure: now.measure, paint: now.paint } };
}

async function save(job: HouseBookletJob): Promise<void> {
  job.savedAt = Date.now();
  try {
    const store = await houseFileStore();
    await store.put(jobPath(job.id, "job.json"), Buffer.from(JSON.stringify(recordOf(job))), "application/json");
  } catch (err: unknown) {
    log.warn("house booklet record not saved", { id: job.id, error: err instanceof Error ? err.message : String(err) });
  }
}

function fromRecord(record: HouseBookletRecord): HouseBookletJob {
  return { ...record, measureSpend: measureSpendFor(record), paintSpend: houseSpend() };
}

/** The measuring run's ledger, its vision reading held to what is left of its ceiling. */
function measureSpendFor(record: Pick<HouseBookletRecord, "cost">): HouseSpend {
  return houseSpend({ budgetIls: Math.max(0.01, houseMeasureBudgetIls() - (record.cost?.measure.ils ?? 0)) });
}

/** A copy on this machine's disk, for a server run locally; production keeps none. */
export async function keepHouseBookletOnDisk(job: HouseBookletJob): Promise<string | null> {
  const pdf = await houseBookletPdf(job);
  if (!pdf || process.env.NODE_ENV === "production") return null;
  const [{ mkdir, writeFile }, os, path] = await Promise.all([import("node:fs/promises"), import("node:os"), import("node:path")]);
  const dir = path.join(os.tmpdir(), "house-booklets");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${job.id}.pdf`);
  await writeFile(file, pdf);
  return file;
}

export async function houseBookletPdf(job: HouseBookletJob): Promise<Buffer | null> {
  if (job.pdf) return job.pdf;
  if (!job.pdfRef) return null;
  const store = await houseFileStore();
  return (job.pdf = (await store.get(job.pdfRef)) ?? undefined) ?? null;
}

/** The job, from this process or from the store; a run the store says was in hand, but no process holds, was cut off by a restart. */
export async function getHouseBookletJob(orgId: string, id: string): Promise<HouseBookletJob | null> {
  if (!ID.test(id)) return null;
  const held = jobs.get(id);
  if (held) return held.orgId === orgId ? held : null;
  const store = await houseFileStore();
  const raw = await store.get(jobPath(id, "job.json")).catch(() => null);
  if (!raw) return null;
  let record: HouseBookletRecord;
  try {
    record = JSON.parse(raw.toString("utf8")) as HouseBookletRecord;
  } catch {
    return null;
  }
  if (record.orgId !== orgId) return null;
  const job = fromRecord(record);
  if (job.status === "measuring" || job.status === "painting") {
    job.status = "failed";
    job.resumable = true;
    job.error = "השרת הופעל מחדש באמצע העבודה; אפשר להמשיך מאותו שלב";
    job.finishedAt = Date.now();
    await save(job);
  }
  jobs.set(id, job);
  return job;
}

/** The measured render a review shows, by its model and name. */
export async function houseReviewPicture(job: HouseBookletJob, modelId: string, name: string): Promise<Buffer | null> {
  const model = job.models?.find((m) => m.id === modelId);
  const review = job.review?.models.find((m) => m.id === modelId);
  if (!model || !review?.pictures.includes(name)) return null;
  const ref = model.artefacts[model.state.artefacts?.[name] ?? ""];
  if (!ref) return null;
  return (await houseFileStore()).get(ref);
}

/** The image models the painting asks: HOUSE_BOOKLET_IMAGE_MODEL alone where set, else HOUSE_IMAGE_MODELS. */
export function houseImageModels(): string[] {
  const only = houseKnob("HOUSE_BOOKLET_IMAGE_MODEL")?.trim();
  return only ? [only] : [...HOUSE_IMAGE_MODELS];
}

/**
 * The run's limits: a time, and the server's memory. Past either the run is
 * stopped — no further call is made, every later step refuses — and the job
 * fails, resumable.
 */
function guard(job: HouseBookletJob): { stop: Promise<never>; done: () => void } {
  const minutes = Number(houseKnob("HOUSE_BOOKLET_TIMEOUT_MIN")) > 0 ? Number(houseKnob("HOUSE_BOOKLET_TIMEOUT_MIN")) : 90;
  const maxMb = Number(houseKnob("HOUSE_BOOKLET_MAX_RSS_MB")) > 0 ? Number(houseKnob("HOUSE_BOOKLET_MAX_RSS_MB")) : 6144;
  const t0 = Date.now();
  let reject: (err: Error) => void = () => undefined;
  const stop = new Promise<never>((_, r) => (reject = r));
  stop.catch(() => undefined);
  const halt = (why: string) => {
    if (job.abort) return;
    job.abort = why;
    job.measureSpend.stopped = true;
    job.paintSpend.stopped = true;
    reject(new Error(why));
  };
  const timer = setInterval(() => {
    const rss = process.memoryUsage().rss / 1024 / 1024;
    if (Date.now() - t0 > minutes * 60_000) halt(`העבודה נעצרה: חרגה ממגבלת הזמן (${minutes} דקות)`);
    else if (rss > maxMb) halt(`העבודה נעצרה: חרגה ממגבלת הזיכרון (${Math.round(rss)}MB מתוך ${maxMb}MB)`);
  }, 5_000);
  timer.unref?.();
  return { stop, done: () => clearInterval(timer) };
}

function sayFor(job: HouseBookletJob) {
  return (step: string) => {
    if (job.abort) throw new Error(job.abort);
    job.steps.push(`${((Date.now() - job.startedAt) / 1000).toFixed(0)}s ${step}`);
    log.info("house booklet step", { id: job.id, step });
    if (Date.now() - (job.savedAt ?? 0) > 15_000) void save(job);
  };
}

async function run(job: HouseBookletJob, phase: "measure" | "paint", work: (say: (step: string) => void) => Promise<void>): Promise<void> {
  job.phase = phase;
  job.status = phase === "measure" ? "measuring" : "painting";
  job.error = undefined;
  job.resumable = undefined;
  job.abort = undefined;
  job.finishedAt = undefined;
  job.running = true;
  await save(job);
  const limits = guard(job);
  // A stopped run goes on until its next step refuses; what it throws then is no one's.
  const running = work(sayFor(job));
  running.catch(() => undefined);
  try {
    await Promise.race([running, limits.stop]);
  } catch (err: unknown) {
    job.status = "failed";
    job.resumable = true;
    job.error = job.abort ?? (err instanceof Error ? err.message : String(err));
    log.error("house booklet failed", { id: job.id, phase, error: job.error });
  } finally {
    limits.done();
    job.running = false;
    job.finishedAt = Date.now();
    await save(job);
  }
}

async function storeModel(store: HouseFileStore, jobId: string, model: MeasuredHouseModel): Promise<StoredModel> {
  const safe = model.id.replace(/[^A-Za-z0-9_-]/g, "_");
  const artefacts: Record<string, string> = {};
  for (const [ref, data] of model.artefacts) {
    artefacts[ref] = await store.put(jobPath(jobId, `models/${safe}/${fileKey(ref)}`), data, /\.png$/i.test(ref) ? "image/png" : "image/jpeg");
  }
  return { id: model.id, name: model.name, projectName: model.projectName, styleId: model.styleId, state: model.state, artefacts };
}

async function loadModel(store: HouseFileStore, model: StoredModel): Promise<MeasuredHouseModel> {
  const artefacts = new Map<string, Buffer>();
  for (const [ref, at] of Object.entries(model.artefacts)) {
    const data = await store.get(at);
    if (!data) throw new Error(`חסרה תמונה שמורה של ${model.name}: ${ref}`);
    artefacts.set(ref, data);
  }
  return { id: model.id, name: model.name, projectName: model.projectName, styleId: model.styleId, state: model.state, artefacts };
}

/** The first run: the sheets read and drawn, the review laid out, nothing painted. */
async function measure(job: HouseBookletJob): Promise<void> {
  await run(job, "measure", async (say) => {
    const store = await houseFileStore();
    const cache = paintingCache(store);
    const models = houseImageModels();
    const style = resolveFloorplanVizStyle(job.project.style);
    const stored: StoredModel[] = [];
    const review: HouseReviewModel[] = [];
    await runWithAiUsage(job.measureSpend.ledger, () => runWithTextBudget(job.measureSpend, () =>
      runPrivateHouseBooklet({
        project: job.project,
        projectName: job.name,
        photoreal: false,
        // A measure run again reads the facades as before, and draws the same renders.
        answers: answerMemo(store),
        say,
        spend: job.measureSpend,
        load: async (name) => {
          const ref = job.files[name];
          const bytes = ref ? await store.get(ref) : null;
          if (!bytes) throw new Error(`חסר הקובץ ${name}`);
          return bytes;
        },
        measured: async (model) => {
          const refs = model.state.artefacts ?? {};
          const pics = { names: () => Object.keys(refs), get: (n: string) => (refs[n] ? model.artefacts.get(refs[n]!) : undefined) };
          const plan = await paintingPlan(pics, { subject: houseSubject(model.name), style, models, cache });
          stored.push(await storeModel(store, job.id, model));
          review.push({ id: model.id, name: model.name, pictures: plan.names, reused: plan.reused, audit: model.state.audit ?? [], truth: model.truth ?? [] });
          say(`${model.name}: ${plan.names.length} pictures measured and kept${plan.reused.length ? `, ${plan.reused.length} of them already painted` : ""}`);
        },
      }),
    ));
    if (job.abort) return;
    const total = review.reduce((n, m) => n + m.pictures.length, 0);
    const reused = review.reduce((n, m) => n + m.reused.length, 0);
    job.models = stored;
    job.review = { models: review, estimate: estimateHousePainting({ pictures: total, reused, model: models[0] ?? "unknown" }), budgetIls: defaultHouseBudgetIls() };
    const e = job.review.estimate;
    for (const line of costLines(job.measureSpend)) say(line);
    say(`review: ${e.toPaint} pictures to paint, ${e.reused} reused; painting ≈ ₪${e.likelyIls.toFixed(0)}, at most ₪${e.mostIls.toFixed(0)} with ${e.model}`);
    job.status = "awaiting_approval";
  });
}

/** The second run, on approval: the reviewed renders painted within the ceiling, the pages and the PDF. */
async function paint(job: HouseBookletJob): Promise<void> {
  await run(job, "paint", async (say) => {
    const store = await houseFileStore();
    const approval = job.approval!;
    // What earlier processes already spent on this painting counts against its ceiling.
    const left = approval.budgetIls == null ? null : Math.max(0, approval.budgetIls - job.cost.paint.ils);
    job.paintSpend = houseSpend({ budgetIls: left ?? undefined });
    // Accepted as it stands: paintings already held are reused from the store, nothing new is asked.
    if (left === 0 || approval.acceptUnpainted) job.paintSpend.stopped = true;
    if (approval.paint) say(`budget: ₪${approval.budgetIls} for the painting (estimate)${left != null && left !== approval.budgetIls ? `, ₪${left.toFixed(2)} of it left` : ""}`);
    const models: MeasuredHouseModel[] = [];
    for (const m of job.models ?? []) models.push(await loadModel(store, m));
    const { html, painted, pictures, unpainted } = await finishMeasuredHouse({
      models,
      paint: approval.paint,
      say,
      spend: job.paintSpend,
      images: { models: houseImageModels(), cache: paintingCache(store) },
    });
    if (approval.paint) {
      say(`photoreal: ${painted} of ${pictures} pictures painted`);
      if (job.paintSpend.stopped && approval.budgetIls != null) say(`photoreal: stopped at the budget of ₪${approval.budgetIls}; ${job.paintSpend.skipped.length} pictures kept as measured renders unpainted`);
      for (const line of costLines(job.paintSpend)) say(line);
      job.report = costReport(job.paintSpend);
      job.unpainted = unpainted ?? [];
      // A booklet that was paid to be painted is painted whole, or the user
      // says otherwise: the run fails, resumable, and waits for one of three
      // words — go on within what is left of the ceiling, a higher ceiling
      // (approved again), or the booklet as it stands, each picture that did
      // not hold marked as the measured render. What held is kept
      // (house-store's cache) and not paid for again.
      if (job.unpainted.length && !approval.acceptUnpainted) {
        say(`photoreal: not painted — ${job.unpainted.join(", ")}`);
        throw new Error(
          `${job.unpainted.length} תמונות לא נצבעו (${job.unpainted.join(", ")})${job.paintSpend.stopped ? " — הצביעה הגיעה לתקרת התקציב" : " — הן לא עמדו בבדיקת הנאמנות"}. החוברת לא הופקה; מה שכבר נצבע נשמר ולא ישולם שוב. אפשר להמשיך, להעלות את התקרה, או להפיק את החוברת עם ההדמיה המדודה במקומן.`,
        );
      }
    }
    say("assembling the PDF");
    const pdf = Buffer.from(await renderHtmlSectionsPdf(html, { waitForImages: true, timeoutMs: 600_000, sheet: BUILDING_BOOKLET_PAGE, jpegQuality: 86 }));
    if (job.abort) return;
    job.pdf = pdf;
    job.bytes = pdf.length;
    job.pdfRef = await store.put(jobPath(job.id, "booklet.pdf"), pdf, "application/pdf");
    job.status = "done";
    const onDisk = await keepHouseBookletOnDisk(job);
    say(`done, ${(pdf.length / 1024 / 1024).toFixed(1)} MB${onDisk ? ` · ${onDisk}` : ""}`);
  });
}

/** A new job: its sheets kept, then measured. Nothing is painted until it is approved. */
export async function startHouseBookletJob(input: { orgId: string; name: string; files: Map<string, Buffer>; project: HouseProject }): Promise<HouseBookletJob> {
  const id = randomUUID();
  const store = await houseFileStore();
  const files: Record<string, string> = {};
  for (const [name, data] of input.files) files[name] = await store.put(jobPath(id, `files/${fileKey(name)}`), data, "application/octet-stream");
  const job = fromRecord({
    id,
    orgId: input.orgId,
    name: input.name,
    status: "measuring",
    phase: "measure",
    steps: [],
    startedAt: Date.now(),
    files,
    project: input.project,
    cost: { measure: ZERO, paint: ZERO },
  });
  jobs.set(id, job);
  void measure(job);
  return job;
}

export class HouseBookletStateError extends Error {}

/** A painting run that stopped, its measured models kept: it can be approved again or accepted as it stands. */
const paintStopped = (job: HouseBookletJob) => job.status === "failed" && job.phase === "paint" && !job.running && Boolean(job.models?.length);

/** The job's spend so far carried into its record, and fresh ledgers for the next run. */
function carrySpend(job: HouseBookletJob): void {
  const spent = houseBookletCost(job);
  job.cost = { measure: spent.measure, paint: spent.paint };
  job.measureSpend = measureSpendFor(job);
  job.paintSpend = houseSpend();
}

/**
 * The user's word on the review: paint within `budgetIls` (the default
 * ceiling where none is given), or put the measured booklet together
 * unpainted, for free. After a painting that stopped short, the word again:
 * the new ceiling is the painting's whole, what it already spent within it.
 */
export function approveHouseBookletJob(job: HouseBookletJob, input: { paint: boolean; budgetIls?: number | null }): void {
  const again = paintStopped(job);
  if (job.status !== "awaiting_approval" && !again) throw new HouseBookletStateError("החוברת אינה ממתינה לאישור");
  const budgetIls = input.paint ? (input.budgetIls ?? defaultHouseBudgetIls()) : null;
  if (again) {
    carrySpend(job);
    if (budgetIls != null && budgetIls <= job.cost.paint.ils) {
      throw new HouseBookletStateError(`התקרה החדשה חייבת להיות גבוהה מ־₪${job.cost.paint.ils.toFixed(2)} שכבר הוצאו על הצביעה`);
    }
  } else {
    job.cost = { ...job.cost, paint: ZERO };
  }
  job.approval = { paint: input.paint, budgetIls, at: Date.now() };
  void paint(job);
}

/** After a painting that stopped short: the booklet made as it stands — what held is reused, the rest are the measured renders, marked; no call is made. */
export function acceptHouseBookletUnpainted(job: HouseBookletJob): void {
  if (!paintStopped(job) || !job.approval?.paint) throw new HouseBookletStateError("אין צביעה שנעצרה להפיק ממנה חוברת");
  carrySpend(job);
  job.approval = { ...job.approval, acceptUnpainted: true, at: Date.now() };
  void paint(job);
}

/** A failed run started again from where the last finished one left off: the review's renders and every held painting are kept. */
export function retryHouseBookletJob(job: HouseBookletJob): void {
  if (job.status !== "failed" || !job.resumable || job.running) throw new HouseBookletStateError("אין שלב להמשיך ממנו");
  carrySpend(job);
  if (job.phase === "paint" && job.approval && job.models?.length) void paint(job);
  else void measure(job);
}

/** For tests: forget the jobs this process holds. */
export function forgetHouseBookletJobs(): void {
  jobs.clear();
}
