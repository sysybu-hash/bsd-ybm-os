import { runWithAiUsage } from "@/lib/ai-usage";
import { createLogger } from "@/lib/logger";
import { renderHtmlSectionsPdf } from "@/lib/pdf/render-html-pdf-chromium";
import { prisma } from "@/lib/prisma";
import { BUILDING_BOOKLET_PAGE } from "@/lib/projects/building/booklet-html";
import { runBookletStage, type ArtefactStore, type BookletState } from "@/lib/projects/building/dwf-booklet";
import {
  auditHouseModel,
  finishMeasuredHouse,
  houseFacadesBack,
  houseNorth,
  houseStageInput,
  houseStyleId,
  houseSubject,
  houseSubtitle,
  paintMeasuredModel,
  readHouseFacades,
  readHouseModelSheets,
  storeHouseFacades,
  type HouseModelReading,
  type MeasuredHouseModel,
  type StoredHouseFacades,
} from "@/lib/projects/building/house-booklet";
import {
  houseBookletCost,
  houseFileKey,
  houseImageModels,
  houseJobPath,
  houseStepLabel,
  isHouseJobRunning,
  measureSpendFor,
  plusCost,
  saveHouseBookletRecord,
  scheduleHouseStep,
  type HouseBookletRecord,
  type StoredModel,
} from "@/lib/projects/building/house-booklet-job";
import { costLines, costReport, defaultHouseBudgetIls, estimateHousePainting, formatCost, houseSpend, runWithTextBudget, spentSoFar, type HouseSpend } from "@/lib/projects/building/house-cost";
import { paintingPlan } from "@/lib/projects/building/house-photoreal";
import { houseSheetReader } from "@/lib/projects/building/house-project";
import { packHouseReading, unpackHouseReading } from "@/lib/projects/building/house-reading-pack";
import { answerMemo, houseFileStore, paintingCache, type HouseFileStore } from "@/lib/projects/building/house-store";
import { resolveFloorplanVizStyle } from "@/lib/projects/floorplan-viz-styles";

const log = createLogger("house-booklet-steps");

/*
 * A private-house booklet's steps, one function call at a time (see
 * house-booklet-job.ts). Each step is cut to finish well inside the 300 s a
 * function is given, and leaves its work in the house store and its place in
 * the job's row:
 *
 *   facades      the ground plan's north, the facades' marks and faces
 *   read:i       model i's sheets read against the facades, its truth counted
 *   build:i:…    model i's booklet stages: the building stood up, its views
 *                drawn one at a time, the deadline checked between them
 *   review:i     model i's renders audited against its sheets and costed
 *   estimate     the review: awaiting_approval — nothing paid is asked here
 *   paint:i      on approval only: a few of model i's pictures painted
 *   assemble     the pages put together and the PDF made
 */

/** A call takes up steps for this long; the function is allowed 300 s. */
const BUDGET_MS = 200_000;
/** The lock outlives a call by a margin, so a call that died is not waited on long. */
const LOCK_MS = 290_000;
/** A step is begun only this early in a call: each is made to finish within what is left. */
const START_BY_MS = 60_000;
/** The painting begins a batch, and the PDF is drawn, only at a call's start: either can take most of one. */
const FRESH_MS = 15_000;
/** Pictures a painting step paints, at once (paintHousePictures paints four together). */
const PAINT_BATCH = 4;
/** Calls that may die in one step before the job is failed, resumable. */
const MAX_TRIES = 3;
/** A record saved while a step runs, at most this often: what it has spent and said. */
const SAVE_EVERY_MS = 15_000;

type Ctx = {
  record: HouseBookletRecord;
  store: HouseFileStore;
  started: number;
  say: (step: string) => void;
  /** The ledger of the step in hand, counted in the record as it is saved. */
  live?: { run: "measure" | "paint"; spend: HouseSpend };
};

const safeId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, "_");

/** A model's pictures, in the store under the job's own name. */
function modelStore(store: HouseFileStore, jobId: string, modelId: string): ArtefactStore {
  return {
    put: (name, data, contentType) => store.put(houseJobPath(jobId, `models/${safeId(modelId)}/${houseFileKey(name)}`), data, contentType),
    async get(ref) {
      const data = await store.get(ref);
      if (!data) throw new Error(`חסרה תמונה שמורה: ${ref}`);
      return data;
    },
  };
}

async function readJson<T>(store: HouseFileStore, ref: string | undefined, what: string): Promise<T> {
  const data = ref ? await store.get(ref) : null;
  if (!data) throw new Error(`חסר הקובץ השמור ${what}`);
  return JSON.parse(data.toString("utf8")) as T;
}

async function readReading(store: HouseFileStore, ref: string | undefined): Promise<HouseModelReading> {
  const data = ref ? await store.get(ref) : null;
  if (!data) throw new Error("חסר הקובץ השמור reading.json");
  return unpackHouseReading<HouseModelReading>(data);
}

/** The record with the step in hand's spend counted in. */
function withLive(ctx: Ctx): HouseBookletRecord {
  const { record, live } = ctx;
  if (!live) return record;
  const now = spentSoFar(live.spend);
  return { ...record, cost: { ...record.cost, [live.run]: plusCost(record.cost[live.run], now) } };
}

/** The step's spend folded into the record, once it is over. */
function foldLive(ctx: Ctx): void {
  if (!ctx.live) return;
  ctx.record.cost = withLive(ctx).cost;
  ctx.live = undefined;
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

/** A measuring step's vision calls, on a ledger of their own held to what is left of the measuring ceiling. */
async function measuring<T>(ctx: Ctx, fn: () => Promise<T>): Promise<T> {
  const spend = measureSpendFor(ctx.record);
  ctx.live = { run: "measure", spend };
  try {
    return await runWithAiUsage(spend.ledger, () => runWithTextBudget(spend, fn));
  } finally {
    foldLive(ctx);
  }
}

function sheetsOf(ctx: Ctx) {
  const { record, store } = ctx;
  return houseSheetReader(async (name) => {
    const ref = record.files[name];
    const bytes = ref ? await store.get(ref) : null;
    if (!bytes) throw new Error(`חסר הקובץ ${name}`);
    return bytes;
  });
}

/** One step of the job; the record is left at the next. */
export async function runHouseStep(ctx: Ctx): Promise<void> {
  const { record, store, say } = ctx;
  const { project } = record;
  const at = record.at;
  const memo = answerMemo(store);

  if (at.kind === "facades") {
    await measuring(ctx, async () => {
      const sheets = sheetsOf(ctx);
      const groundPlan = await sheets.geometry(project.models[0]!.floors[0]!);
      const { north, northKnown } = await houseNorth({ project, groundPlan, ai: record.ai, say });
      const facades = await readHouseFacades({ facades: await sheets.facades(project.facades), groundPlan, ai: record.ai, say, project, north, answers: memo });
      record.facadesRef = await store.put(houseJobPath(record.id, "facades.json"), Buffer.from(JSON.stringify(storeHouseFacades(facades))), "application/json");
      record.north = north;
      record.northKnown = northKnown;
    });
    record.at = { kind: "read", model: 0 };
    return;
  }

  if (at.kind === "read") {
    const model = project.models[at.model]!;
    say(model.name);
    const facades = houseFacadesBack(await readJson<StoredHouseFacades>(store, record.facadesRef, "facades.json"), project);
    const read = await measuring(ctx, () => readHouseModelSheets({ model, project, sheets: sheetsOf(ctx), facades, ai: record.ai, say }));
    const readingRef = await store.put(houseJobPath(record.id, `models/${safeId(model.id)}/reading.json`), packHouseReading(read.reading), "application/json");
    const style = resolveFloorplanVizStyle(houseStyleId(project, read.reading));
    record.work = {
      readingRef,
      levels: read.levels,
      truth: read.truth,
      openings: read.openings,
      lawnM2: read.lawnM2,
      state: { subtitle: houseSubtitle(style), ...(read.reading.ai ? { ai: read.reading.ai } : {}) },
    };
    record.at = { kind: "build", model: at.model, stage: "model" };
    return;
  }

  if (at.kind === "build") {
    const model = project.models[at.model]!;
    const work = record.work!;
    const reading = await readReading(store, work.readingRef);
    const result = await measuring(ctx, () =>
      runBookletStage({
        ...houseStageInput({
          model,
          project,
          projectName: `${record.name} — ${model.name}`,
          reading,
          levels: work.levels,
          north: record.north!,
          northKnown: record.northKnown ?? true,
          ai: record.ai,
          say,
        }),
        stage: at.stage,
        state: work.state,
        store: modelStore(store, record.id, model.id),
        deadline: ctx.started + BUDGET_MS - 60_000,
        viewBatch: 1,
      }),
    );
    work.state = result.state;
    // A house's booklet is put together whole, its models' pages one file (finishMeasuredHouse): its own assembly is not run.
    record.at = result.stage === "assemble" || result.stage === "done" ? { kind: "review", model: at.model } : { kind: "build", model: at.model, stage: result.stage };
    return;
  }

  if (at.kind === "review") {
    const model = project.models[at.model]!;
    const work = record.work!;
    const reading = await readReading(store, work.readingRef);
    const refs = work.state.artefacts ?? {};
    const artefacts: Record<string, string> = Object.fromEntries(Object.values(refs).map((r) => [r, r]));
    const measured = await loadModel(store, { id: model.id, name: model.name, projectName: `${record.name} — ${model.name}`, styleId: project.style, state: work.state, artefacts });
    const pics = { names: () => Object.keys(refs), get: (n: string) => (refs[n] ? measured.artefacts.get(refs[n]!) : undefined) };
    const audit = record.ai ? await measuring(ctx, () => auditHouseModel(pics, { name: model.name, reading, north: record.north!, say })) : undefined;
    const state: BookletState = { ...work.state, ...(audit ? { audit } : {}), ...(work.openings.length ? { openings: work.openings } : {}), ...(work.lawnM2 != null ? { lawnM2: work.lawnM2 } : {}) };
    const style = resolveFloorplanVizStyle(project.style);
    const plan = await paintingPlan(pics, { subject: houseSubject(model.name), style, models: houseImageModels(), cache: paintingCache(store) });
    record.models = [...(record.models ?? []).filter((m) => m.id !== model.id), { id: model.id, name: model.name, projectName: measured.projectName, styleId: project.style, state, artefacts }];
    record.reviewing = [
      ...(record.reviewing ?? []).filter((m) => m.id !== model.id),
      { id: model.id, name: model.name, pictures: plan.names, reused: plan.reused, audit: state.audit ?? [], truth: work.truth },
    ];
    say(`${model.name}: ${plan.names.length} pictures measured and kept${plan.reused.length ? `, ${plan.reused.length} of them already painted` : ""}`);
    record.work = undefined;
    record.at = at.model + 1 < project.models.length ? { kind: "read", model: at.model + 1 } : { kind: "estimate" };
    return;
  }

  if (at.kind === "estimate") {
    const review = record.reviewing ?? [];
    const total = review.reduce((n, m) => n + m.pictures.length, 0);
    const reused = review.reduce((n, m) => n + m.reused.length, 0);
    record.review = { models: review, estimate: estimateHousePainting({ pictures: total, reused, model: houseImageModels()[0] ?? "unknown" }), budgetIls: defaultHouseBudgetIls() };
    record.reviewing = undefined;
    const e = record.review.estimate;
    say(`cost of measuring: ${formatCost(record.cost.measure)}`);
    say(`review: ${e.toPaint} pictures to paint, ${e.reused} reused; painting ≈ ₪${e.likelyIls.toFixed(0)}, at most ₪${e.mostIls.toFixed(0)} with ${e.model}`);
    record.status = "awaiting_approval";
    record.finishedAt = Date.now();
    return;
  }

  if (at.kind === "paint") {
    const approval = record.approval;
    // Nothing is painted without the user's word: a job here without one is put together unpainted.
    if (!approval?.paint) {
      record.at = { kind: "assemble" };
      return;
    }
    const stored = record.models?.[at.model];
    const reviewed = record.review?.models.find((m) => m.id === stored?.id);
    if (!stored || !reviewed) {
      record.at = { kind: "assemble" };
      return;
    }
    const paint = (record.paint ??= { tried: {}, painted: {}, pictures: [] });
    const tried = paint.tried[stored.id] ?? [];
    const batch = reviewed.pictures.filter((n) => !tried.includes(n)).slice(0, PAINT_BATCH);
    if (!batch.length) {
      record.at = at.model + 1 < (record.models?.length ?? 0) ? { kind: "paint", model: at.model + 1 } : { kind: "assemble" };
      return;
    }
    // What earlier steps already spent on this painting counts against its ceiling.
    const left = approval.budgetIls == null ? null : Math.max(0, approval.budgetIls - record.cost.paint.ils);
    const spend = houseSpend({ budgetIls: left ?? undefined });
    // Past the ceiling, or accepted as it stands: paintings already held are reused from the store, nothing new is asked.
    if (left === 0 || approval.acceptUnpainted || paint.stopped) spend.stopped = true;
    if (at.model === 0 && tried.length === 0) say(`budget: ₪${approval.budgetIls} for the painting (estimate)${left != null && left !== approval.budgetIls ? `, ₪${left.toFixed(2)} of it left` : ""}`);
    ctx.live = { run: "paint", spend };
    try {
      const model = await loadModel(store, stored);
      const result = await paintMeasuredModel(model, {
        say,
        spend,
        only: (n) => batch.includes(n),
        images: { models: houseImageModels(), cache: paintingCache(store) },
      });
      const held = (paint.painted[stored.id] ??= {});
      for (const name of result.painted.filter((n) => batch.includes(n))) {
        const data = model.artefacts.get(model.state.artefacts?.[name] ?? "");
        if (data) held[name] = await store.put(houseJobPath(record.id, `models/${safeId(stored.id)}/painted/${houseFileKey(name)}`), data, "image/jpeg");
      }
      paint.tried[stored.id] = [...tried, ...batch];
      paint.pictures.push(...spend.pictures);
      if (spend.stopped) paint.stopped = true;
      for (const line of costLines(spend)) say(line);
    } finally {
      foldLive(ctx);
    }
    return;
  }

  if (at.kind === "assemble") {
    const approval = record.approval;
    const paint = record.paint ?? { tried: {}, painted: {}, pictures: [] };
    const models: MeasuredHouseModel[] = [];
    const unpainted: string[] = [];
    for (const stored of record.models ?? []) {
      const model = await loadModel(store, stored);
      const held = paint.painted[stored.id] ?? {};
      const state: BookletState = { ...model.state };
      if (approval?.paint) {
        for (const [name, ref] of Object.entries(held)) {
          const data = await store.get(ref);
          if (data && model.state.artefacts?.[name]) model.artefacts.set(model.state.artefacts[name]!, data);
        }
        const pictures = record.review?.models.find((m) => m.id === stored.id)?.pictures ?? [];
        const missing = pictures.filter((n) => !held[n]);
        state.painted = Object.keys(held);
        if (paint.stopped && approval.budgetIls != null) state.budget = { ils: approval.budgetIls, unpainted: missing.length };
        unpainted.push(...missing.map((n) => `${stored.name}: ${n}`));
      }
      models.push({ ...model, state });
    }
    if (approval?.paint) {
      const painted = Object.values(paint.painted).reduce((n, p) => n + Object.keys(p).length, 0);
      say(`photoreal: ${painted} of ${painted + unpainted.length} pictures painted`);
      if (paint.stopped && approval.budgetIls != null) say(`photoreal: stopped at the budget of ₪${approval.budgetIls}; ${unpainted.length} pictures kept as measured renders unpainted`);
      record.report = { ...costReport({ ...houseSpend(), pictures: paint.pictures }), total: record.cost.paint };
      record.unpainted = unpainted;
      // A booklet that was paid to be painted is painted whole, or the user
      // says otherwise: the run fails, resumable, and waits for one of three
      // words — go on within what is left of the ceiling, a higher ceiling
      // (approved again), or the booklet as it stands, each picture that did
      // not hold marked as the measured render. What held is kept and not
      // paid for again.
      if (unpainted.length && !approval.acceptUnpainted) {
        say(`photoreal: not painted — ${unpainted.join(", ")}`);
        throw new Error(
          `${unpainted.length} תמונות לא נצבעו (${unpainted.join(", ")})${paint.stopped ? " — הצביעה הגיעה לתקרת התקציב" : " — הן לא עמדו בבדיקת הנאמנות"}. החוברת לא הופקה; מה שכבר נצבע נשמר ולא ישולם שוב. אפשר להמשיך, להעלות את התקרה, או להפיק את החוברת עם ההדמיה המדודה במקומן.`,
        );
      }
    }
    const { html } = await finishMeasuredHouse({ models, paint: false, say });
    say("assembling the PDF");
    const pdf = Buffer.from(await renderHtmlSectionsPdf(html, { waitForImages: true, timeoutMs: 200_000, sheet: BUILDING_BOOKLET_PAGE, jpegQuality: 86 }));
    record.pdfRef = await store.put(houseJobPath(record.id, "booklet.pdf"), pdf, "application/pdf");
    record.bytes = pdf.length;
    // The booklet is all that is kept: the sheets, the model, its renders and
    // paintings go once the PDF is. The cache of paintings and answers, kept
    // apart from the job, stays, so the same sheets are not paid for twice.
    try {
      const removed = await store.removeUnder(houseJobPath(record.id, ""), [record.pdfRef]);
      record.files = {};
      record.cleaned = true;
      say(`removed ${removed} working files`);
    } catch (err: unknown) {
      log.warn("house booklet working files not removed", { id: record.id, error: err instanceof Error ? err.message : String(err) });
    }
    record.status = "done";
    record.at = { kind: "done" };
    record.finishedAt = Date.now();
    say(`done, ${(pdf.length / 1024 / 1024).toFixed(1)} MB`);
    return;
  }
}

/** Whether a call `elapsed` ms in may begin the job's next step. */
export function mayBegin(record: HouseBookletRecord, elapsed: number): boolean {
  if (record.at.kind === "paint" || record.at.kind === "assemble") return elapsed < FRESH_MS;
  // The review and the estimate are a few vision calls at most; the reading and the drawing want a call's worth.
  return elapsed < START_BY_MS;
}

/**
 * One call's worth of the job: steps taken up until the call's time is
 * spent, each saved as it ends. Answers the job as it is now, or null when
 * another call holds it (or it is not running, or not this organisation's).
 */
export async function advanceHouseBookletJob(id: string, orgId?: string, now: () => number = Date.now): Promise<HouseBookletRecord | null> {
  const started = now();
  const claimed = await prisma.houseBookletJob.updateMany({
    where: {
      id,
      ...(orgId ? { organizationId: orgId } : {}),
      status: { in: ["measuring", "painting"] },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date(started) } }],
    },
    data: { lockedUntil: new Date(started + LOCK_MS) },
  });
  if (claimed.count === 0) return null;
  const row = await prisma.houseBookletJob.findUniqueOrThrow({ where: { id } });
  const record = row.state as unknown as HouseBookletRecord;
  const store = await houseFileStore();

  let saving: Promise<void> = Promise.resolve();
  let savedAt = 0;
  const ctx: Ctx = { record, store, started, say: () => undefined };
  const persist = () => {
    savedAt = now();
    const snapshot = withLive(ctx);
    saving = saving.then(() => saveHouseBookletRecord(snapshot)).catch((err: unknown) => {
      log.warn("house booklet record not saved", { id, error: err instanceof Error ? err.message : String(err) });
    });
    return saving;
  };
  ctx.say = (step) => {
    record.steps.push(`${((now() - record.startedAt) / 1000).toFixed(0)}s ${step}`);
    log.info("house booklet step", { id, stage: houseStepLabel(record.at), step });
    if (now() - savedAt > SAVE_EVERY_MS) void persist();
  };

  try {
    while (isHouseJobRunning(record) && record.at.kind !== "done" && mayBegin(record, now() - started)) {
      // A step that keeps dying fails the job, resumable, rather than being taken up for ever.
      record.tries = (record.tries ?? 0) + 1;
      if (record.tries > MAX_TRIES) throw new Error(`השלב ${houseStepLabel(record.at)} נקטע ${MAX_TRIES} פעמים ברציפות (זמן או זיכרון של השרת)`);
      await persist();
      await runHouseStep(ctx);
      record.tries = 0;
      await persist();
    }
  } catch (err: unknown) {
    foldLive(ctx);
    record.status = "failed";
    record.resumable = true;
    record.error = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
    record.finishedAt = now();
    log.error("house booklet step failed", { id, stage: houseStepLabel(record.at), error: record.error });
  }
  await saving;
  await saveHouseBookletRecord(record, { lockedUntil: null });
  if (isHouseJobRunning(record)) await scheduleHouseStep(id);
  log.info("house booklet call", { id, stage: houseStepLabel(record.at), status: record.status, ms: now() - started, cost: houseBookletCost(record).ils });
  return record;
}
