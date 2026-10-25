/**
 * @jest-environment node
 */
import type { MeasuredHouseModel } from "@/lib/projects/building/house-booklet";

type Row = { id: string; organizationId: string; status: string; stage: string; state: unknown; error: string | null; lockedUntil: Date | null };
const rows = new Map<string, Row>();
const matches = (row: Row, where: Record<string, unknown>) => {
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.organizationId !== undefined && row.organizationId !== where.organizationId) return false;
  const status = where.status as { in?: string[] } | undefined;
  if (status?.in && !status.in.includes(row.status)) return false;
  const or = where.OR as Array<{ lockedUntil: null | { lt: Date } }> | undefined;
  if (or && !or.some((c) => (c.lockedUntil === null ? row.lockedUntil === null : row.lockedUntil != null && row.lockedUntil < c.lockedUntil.lt))) return false;
  return true;
};
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
jest.mock("@/lib/prisma", () => ({
  prisma: {
    houseBookletJob: {
      create: jest.fn(async ({ data }: { data: Row }) => {
        rows.set(data.id, { ...clone(data), lockedUntil: data.lockedUntil ?? null, error: data.error ?? null });
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = rows.get(where.id)!;
        Object.assign(row, { ...data, state: data.state === undefined ? row.state : clone(data.state) });
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        const hit = [...rows.values()].filter((r) => matches(r, where));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const row = [...rows.values()].find((r) => matches(r, where));
        return row ? clone({ ...row, lockedUntil: undefined }) : null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => clone({ ...rows.get(where.id)!, lockedUntil: undefined })),
    },
  },
}));
jest.mock("@/lib/env", () => ({ env: {} }));
jest.mock("@/lib/gemini-model", () => ({
  getFloorplanVizModelChain: () => ["gemini-3-pro-image"],
  GEMINI_IMAGE_NANO_BANANA_21_MODEL: "gemini-nano-banana-2.1",
  GEMINI_IMAGE_LITE_MODEL: "gemini-3.1-flash-lite-image",
  GEMINI_STABLE_TEXT_MODEL: "gemini-3.7-flash",
}));
jest.mock("@/lib/pdf/render-html-pdf-chromium", () => ({ renderHtmlSectionsPdf: jest.fn(async () => Buffer.from("%PDF-1.7 booklet")) }));
jest.mock("@/lib/projects/building/booklet-html", () => ({ BUILDING_BOOKLET_PAGE: {} }));
jest.mock("@/lib/projects/building/house-project", () => ({
  houseSheetReader: (load: (n: string) => Promise<Buffer>) => ({ geometry: async (ref: { file: string }) => ({ file: (await load(ref.file)).toString() }), facades: async () => ({}) }),
}));

/** The clock the job's calls read: each step moves it on as long as the step would take. */
let clock = 1_000_000;
const PICTURES = ["view-hero.jpg", "view-aerial-top.jpg", "view-elev-south.jpg", "view-plan-floor-0.jpg", "view-plan-floor-1.jpg", "view-room-living.jpg"];

const mockStage = jest.fn(async (input: { stage: string; state: { artefacts?: Record<string, string>; viewsDone?: string[] }; store: { put(n: string, d: Buffer, t: string): Promise<string> }; deadline: number }) => {
  const state = { ...input.state, artefacts: { ...(input.state.artefacts ?? {}) } };
  if (input.stage === "model") {
    clock += 50_000;
    state.artefacts["sheet-floor-0.jpg"] = await input.store.put("sheet-floor-0.jpg", Buffer.from("sheet"), "image/jpeg");
    return { stage: "views", state: { ...state, viewsDone: [] } };
  }
  if (input.stage === "views") {
    // Two views a call, then the deadline: the stage hands back unfinished.
    for (const name of PICTURES.filter((n) => !(state.viewsDone ?? []).includes(n)).slice(0, 2)) {
      state.artefacts[name] = await input.store.put(name, Buffer.from(`render ${name}`), "image/jpeg");
      state.viewsDone = [...(state.viewsDone ?? []), name];
    }
    clock = input.deadline + 1;
    return { stage: (state.viewsDone ?? []).length < PICTURES.length ? "views" : "apartments", state };
  }
  if (input.stage === "apartments") return { stage: "assemble", state };
  throw new Error(`stage ${input.stage} is not the job's`);
});
jest.mock("@/lib/projects/building/dwf-booklet", () => ({ runBookletStage: (input: Parameters<typeof mockStage>[0]) => mockStage(input) }));
jest.mock("@/lib/projects/building/house-photoreal", () => ({
  paintingPlan: async (pics: { names(): string[] }) => ({ names: pics.names().filter((n) => n.startsWith("view-")), reused: [] }),
}));

const mockPaint = jest.fn(async (model: MeasuredHouseModel, input: { only?: (n: string) => boolean; spend?: { stopped: boolean } }) => {
  const names = Object.keys(model.state.artefacts ?? {}).filter((n) => n.startsWith("view-") && (input.only?.(n) ?? true));
  const painted = input.spend?.stopped ? [] : names.filter((n) => n !== mockPaint.refuse);
  for (const n of painted) model.artefacts.set(model.state.artefacts![n]!, Buffer.from(`painted ${n}`));
  return { planned: names, painted };
}) as jest.Mock & { refuse?: string };
const mockFinish = jest.fn(async (input: { models: MeasuredHouseModel[]; paint: boolean }) => ({ html: `<html>${input.models.map((m) => m.name).join(",")}</html>`, painted: 0, pictures: 0, unpainted: [] }));
const mockAudit = jest.fn(async () => [{ element: "גדר", issue: "חסרה", where: "צפון" }]);
const mockReadModel = jest.fn(async (input: { model: { name: string }; sheets: { geometry(ref: { file: string }): Promise<unknown> } }) => {
  await input.sheets.geometry({ file: "A-ground.dwf" });
  clock += 20_000;
  return { levels: { floors: [0, 3], roof: 6, parapet: 7 }, reading: { strip: {}, site: {}, yard: [], parking: 2, built: {}, counts: null }, truth: [], openings: [], lawnM2: null };
});
jest.mock("@/lib/projects/building/house-booklet", () => ({
  houseNorth: async () => ({ north: { x: 0, z: -1 }, northKnown: false }),
  readHouseFacades: async () => {
    clock += 30_000;
    return { ai: false, north: { x: 0, z: -1 }, hand: [], marked: [], read: [], frames: [], facts: [], proposal: null, levels: () => null };
  },
  storeHouseFacades: ({ levels: _l, ...rest }: Record<string, unknown>) => rest,
  houseFacadesBack: (s: Record<string, unknown>) => ({ ...s, levels: () => null }),
  readHouseModelSheets: (input: Parameters<typeof mockReadModel>[0]) => mockReadModel(input),
  houseStageInput: () => ({ projectName: "x", source: async () => Buffer.alloc(0) }),
  houseSubject: (name: string) => `subject ${name}`,
  houseSubtitle: () => "subtitle",
  auditHouseModel: () => mockAudit(),
  paintMeasuredModel: (model: MeasuredHouseModel, input: Parameters<typeof mockPaint>[1]) => mockPaint(model, input),
  finishMeasuredHouse: (input: { models: MeasuredHouseModel[]; paint: boolean }) => mockFinish(input),
}));

import {
  acceptHouseBookletUnpainted,
  approveHouseBookletJob,
  createHouseBookletJob,
  getHouseBookletJob,
  houseBookletView,
  houseReviewPictureRef,
  retryHouseBookletJob,
  type HouseBookletRecord,
} from "@/lib/projects/building/house-booklet-job";
import { advanceHouseBookletJob } from "@/lib/projects/building/house-booklet-steps";
import { memoryHouseStore, setHouseFileStore } from "@/lib/projects/building/house-store";

const ORG = "org-1";
const PROJECT = { models: [{ id: "A", name: "דגם A", floors: [{ file: "A-ground.dwf" }] }], facades: { file: "facades.dwf" }, style: "haredi_classic" };
const start = (ai = false) => createHouseBookletJob({ orgId: ORG, userId: "u1", name: "גוטליב", files: new Map([["A-ground.dwf", Buffer.from("dwf")]]), project: PROJECT, ai });
const now = () => clock;

/** Calls, one after another as QStash or the page makes them, each a fresh lock, until the job stops running. */
async function drive(id: string, max = 40): Promise<{ record: HouseBookletRecord; calls: Array<{ ms: number; from: string; to: string }> }> {
  const calls: Array<{ ms: number; from: string; to: string }> = [];
  for (let i = 0; i < max; i++) {
    const from = rows.get(id)!;
    if (from.status !== "measuring" && from.status !== "painting") break;
    clock += 300_000;
    const t0 = clock;
    await advanceHouseBookletJob(id, ORG, now);
    calls.push({ ms: clock - t0, from: from.stage, to: rows.get(id)!.stage });
  }
  return { record: (await getHouseBookletJob(ORG, id))!, calls };
}

describe("a private-house booklet, a step a call, that waits for the user's word before it paints", () => {
  let store: ReturnType<typeof memoryHouseStore>;
  beforeEach(() => {
    rows.clear();
    store = memoryHouseStore();
    setHouseFileStore(store);
    jest.clearAllMocks();
    mockPaint.refuse = undefined;
    delete process.env.HOUSE_BOOKLET_BUDGET_ILS;
  });
  afterAll(() => setHouseFileStore(null));

  it("measures in calls that each stop well inside a function's time, and stops at the review with an estimate", async () => {
    const job = await start();
    expect(rows.get(job.id)).toMatchObject({ status: "measuring", stage: "facades", organizationId: ORG });
    expect(store.files.get(`jobs/${job.id}/files/A-ground.dwf`)?.toString()).toBe("dwf");

    const { record, calls } = await drive(job.id);
    expect(record.status).toBe("awaiting_approval");
    expect(record.error).toBeUndefined();
    // Several calls, none past the 300 s a function is given.
    expect(calls.length).toBeGreaterThan(2);
    for (const c of calls) expect(c.ms).toBeLessThan(300_000);
    // The views were drawn over three calls, each picking up where the last stopped.
    expect(mockStage.mock.calls.filter(([i]) => i.stage === "views")).toHaveLength(3);

    expect(record.review!.models[0]).toMatchObject({ id: "A", pictures: PICTURES, reused: [] });
    expect(record.review!.estimate).toMatchObject({ model: "gemini-nano-banana-2.1", pictures: 6, toPaint: 6 });
    expect(record.review!.estimate.mostIls).toBeGreaterThan(record.review!.estimate.likelyIls);
    expect(record.review!.budgetIls).toBe(50);
    // Read by its lines alone: no vision call, nothing spent.
    expect(mockAudit).not.toHaveBeenCalled();
    expect(record.cost.measure.ils).toBe(0);

    const ref = houseReviewPictureRef(record, "A", "view-hero.jpg")!;
    expect((await store.get(ref))?.toString()).toBe("render view-hero.jpg");
    expect(houseReviewPictureRef(record, "A", "sheet-floor-0.jpg")).toBeNull();
    expect(mockPaint).not.toHaveBeenCalled();
    expect(mockFinish).not.toHaveBeenCalled();

    // Awaiting the word, a call takes nothing up.
    expect(await advanceHouseBookletJob(job.id, ORG, now)).toBeNull();
    expect(mockPaint).not.toHaveBeenCalled();
  });

  it("audits the renders against the sheets when it reads with the vision model", async () => {
    const job = await start(true);
    const { record } = await drive(job.id);
    expect(record.status).toBe("awaiting_approval");
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(record.review!.models[0]!.audit).toHaveLength(1);
  });

  it("does nothing while another call holds the job, and never takes up another organisation's", async () => {
    const job = await start();
    rows.get(job.id)!.lockedUntil = new Date(clock + 60_000);
    expect(await advanceHouseBookletJob(job.id, ORG, now)).toBeNull();
    rows.get(job.id)!.lockedUntil = null;
    expect(await advanceHouseBookletJob(job.id, "other-org", now)).toBeNull();
    expect(await getHouseBookletJob("other-org", job.id)).toBeNull();
    expect(await getHouseBookletJob(ORG, "../../etc")).toBeNull();
    expect(mockReadModel).not.toHaveBeenCalled();
  });

  it("paints on approval only, a few pictures a call, within the ceiling, and keeps the PDF", async () => {
    const job = await start();
    await drive(job.id);
    await approveHouseBookletJob((await getHouseBookletJob(ORG, job.id))!, { paint: true, budgetIls: 30 });
    expect(rows.get(job.id)).toMatchObject({ status: "painting", stage: "paint:0" });
    const { record } = await drive(job.id);
    expect(record.error).toBeUndefined();
    expect(record.status).toBe("done");
    // Six pictures, four a call.
    expect(mockPaint).toHaveBeenCalledTimes(2);
    const firstOnly = mockPaint.mock.calls[0]![1].only!;
    expect(PICTURES.filter((n) => firstOnly(n))).toHaveLength(4);
    expect(mockPaint.mock.calls[0]![1].spend.budgetIls).toBe(30);
    const sent = mockFinish.mock.calls[0]![0];
    expect(sent.paint).toBe(false);
    const model = sent.models[0]!;
    expect(model.artefacts.get(model.state.artefacts!["view-hero.jpg"]!)?.toString()).toBe("painted view-hero.jpg");
    expect(model.state.painted).toHaveLength(6);
    expect(record.unpainted).toEqual([]);
    expect(store.files.get(`jobs/${job.id}/booklet.pdf`)?.toString()).toContain("%PDF");
    // Only the booklet is kept: the sheets, renders and paintings are gone.
    expect([...store.files.keys()].filter((p) => p.startsWith(`jobs/${job.id}/`))).toEqual([`jobs/${job.id}/booklet.pdf`]);
    expect(record.cleaned).toBe(true);
    expect(houseBookletView(record).review).toBeNull();
    await expect(approveHouseBookletJob(record, { paint: true })).rejects.toThrow(/אינה ממתינה/);
  });

  it("puts the measured booklet together for free when told not to paint", async () => {
    const job = await start();
    await drive(job.id);
    await approveHouseBookletJob((await getHouseBookletJob(ORG, job.id))!, { paint: false });
    const { record } = await drive(job.id);
    expect(record.status).toBe("done");
    expect(record.approval).toMatchObject({ paint: false, budgetIls: null });
    expect(mockPaint).not.toHaveBeenCalled();
    expect(mockFinish.mock.calls[0]![0].models[0]!.state.painted).toBeUndefined();
  });

  it("makes no booklet where a picture paid to be painted did not hold; approved again, or accepted as it stands", async () => {
    mockPaint.refuse = "view-hero.jpg";
    const job = await start();
    await drive(job.id);
    await approveHouseBookletJob((await getHouseBookletJob(ORG, job.id))!, { paint: true, budgetIls: 30 });
    let { record } = await drive(job.id);
    expect(record.status).toBe("failed");
    expect(record.resumable).toBe(true);
    expect(record.error).toMatch(/view-hero\.jpg/);
    expect(store.files.get(`jobs/${job.id}/booklet.pdf`)).toBeUndefined();

    // Again: only the picture that did not hold is tried, under a higher ceiling.
    await expect(approveHouseBookletJob(record, { paint: true, budgetIls: record.cost.paint.ils })).rejects.toThrow(/התקרה החדשה/);
    mockPaint.mockClear();
    await approveHouseBookletJob(record, { paint: true, budgetIls: 60 });
    ({ record } = await drive(job.id));
    expect(record.status).toBe("failed");
    expect(mockPaint).toHaveBeenCalledTimes(1);
    expect(PICTURES.filter((n) => mockPaint.mock.calls[0]![1].only!(n))).toEqual(["view-hero.jpg"]);

    // As it stands: no call, the booklet made with the measured render in its place.
    mockPaint.mockClear();
    await acceptHouseBookletUnpainted(record);
    ({ record } = await drive(job.id));
    expect(record.status).toBe("done");
    expect(mockPaint).not.toHaveBeenCalled();
    expect(record.unpainted).toEqual(["דגם A: view-hero.jpg"]);
    expect(store.files.get(`jobs/${job.id}/booklet.pdf`)?.toString()).toContain("%PDF");
  });

  it("fails a step that throws, resumable, and takes it up again from that step", async () => {
    mockReadModel.mockImplementationOnce(async () => {
      throw new Error("גיליון פגום");
    });
    const job = await start();
    let { record } = await drive(job.id);
    expect(record).toMatchObject({ status: "failed", resumable: true, error: "גיליון פגום", at: { kind: "read", model: 0 } });
    await retryHouseBookletJob(record);
    ({ record } = await drive(job.id));
    expect(record.status).toBe("awaiting_approval");
    // The facades were not read twice.
    expect(mockStage.mock.calls.filter(([i]) => i.stage === "model")).toHaveLength(1);
  });

  it("fails a step that keeps dying with its call, rather than taking it up for ever", async () => {
    const job = await start();
    // As three calls that died in the first step leave the job: their lock run out, their tries counted.
    const row = rows.get(job.id)!;
    row.state = { ...(row.state as HouseBookletRecord), tries: 3 };
    const record = (await advanceHouseBookletJob(job.id, ORG, now))!;
    expect(record).toMatchObject({ status: "failed", resumable: true });
    expect(record.error).toMatch(/facades נקטע 3 פעמים/);
    await retryHouseBookletJob(record);
    expect((await drive(job.id)).record.status).toBe("awaiting_approval");
  });
});
