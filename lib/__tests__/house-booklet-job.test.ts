/**
 * @jest-environment node
 */
import type { MeasuredHouseModel } from "@/lib/projects/building/house-booklet";
import {
  acceptHouseBookletUnpainted,
  approveHouseBookletJob,
  forgetHouseBookletJobs,
  getHouseBookletJob,
  houseBookletPdf,
  houseReviewPicture,
  retryHouseBookletJob,
  startHouseBookletJob,
  type HouseBookletJob,
} from "@/lib/projects/building/house-booklet-job";
import { memoryHouseStore, setHouseFileStore } from "@/lib/projects/building/house-store";

jest.setTimeout(30_000);

jest.mock("@/lib/gemini-model", () => ({
  getFloorplanVizModelChain: () => ["gemini-3-pro-image"],
  GEMINI_IMAGE_NANO_BANANA_21_MODEL: "gemini-nano-banana-2.1",
  GEMINI_IMAGE_LITE_MODEL: "gemini-3.1-flash-lite-image",
  GEMINI_STABLE_TEXT_MODEL: "gemini-3.7-flash",
}));
jest.mock("@/lib/pdf/render-html-pdf-chromium", () => ({ renderHtmlSectionsPdf: jest.fn(async () => Buffer.from("%PDF-1.7 booklet")) }));

const mockFinish = jest.fn(async (input: { models: MeasuredHouseModel[]; paint: boolean }): Promise<{ html: string; painted: number; pictures: number; unpainted?: string[] }> => ({
  html: `<html><body>${input.models.map((m) => m.name).join(",")}</body></html>`,
  painted: input.paint ? 1 : 0,
  pictures: 2,
}));

jest.mock("@/lib/projects/building/house-booklet", () => ({
  PRIVATE_HOUSE_STYLE: "haredi_classic",
  houseSubject: (name: string) => `subject ${name}`,
  runPrivateHouseBooklet: jest.fn(async (input: { load: (n: string) => Promise<Buffer>; say: (s: string) => void; measured?: (m: MeasuredHouseModel) => Promise<void> }) => {
    await input.load("A-ground.dwf");
    input.say("דגם A");
    await input.measured?.({
      id: "A",
      name: "דגם A",
      projectName: "גוטליב — דגם A",
      state: { artefacts: { "view-hero.jpg": "view-hero.jpg", "unit-1.jpg": "unit-1.jpg", "sheet-floor-0.jpg": "sheet-floor-0.jpg" }, audit: [] },
      artefacts: new Map([
        ["view-hero.jpg", Buffer.from("hero")],
        ["unit-1.jpg", Buffer.from("unit")],
        ["sheet-floor-0.jpg", Buffer.from("sheet")],
      ]),
    });
    return { html: "", painted: 0, pictures: 2 };
  }),
  finishMeasuredHouse: (input: { models: MeasuredHouseModel[]; paint: boolean }) => mockFinish(input),
}));

const ORG = "org-1";
const NAME = "גוטליב";

async function until(job: HouseBookletJob, ...statuses: string[]) {
  for (let i = 0; i < 200 && !statuses.includes(job.status); i++) await new Promise((r) => setTimeout(r, 20));
  expect(statuses).toContain(job.status);
}

const PROJECT = { models: [{ id: "A", name: "דגם A", floors: [{ file: "A-ground.dwf" }] }], facades: { file: "facades.dwf" }, style: "haredi_classic" };
const start = () => startHouseBookletJob({ orgId: ORG, name: NAME, files: new Map([["A-ground.dwf", Buffer.from("dwf")]]), project: PROJECT });

describe("a private-house booklet waits for the user's word before it paints", () => {
  let store: ReturnType<typeof memoryHouseStore>;
  beforeEach(() => {
    store = memoryHouseStore();
    setHouseFileStore(store);
    forgetHouseBookletJobs();
    mockFinish.mockClear();
    delete process.env.HOUSE_BOOKLET_BUDGET_ILS;
    delete process.env.HOUSE_BOOKLET_MAX_RSS_MB;
  });
  afterAll(() => setHouseFileStore(null));

  it("measures, keeps the sheets and the renders, and stops at the review with an estimate", async () => {
    const job = await start();
    await until(job, "awaiting_approval", "failed");
    expect(job.error).toBeUndefined();
    expect(store.files.get(`jobs/${job.id}/files/A-ground.dwf`)?.toString()).toBe("dwf");
    expect(job.review!.models[0]).toMatchObject({ id: "A", pictures: ["view-hero.jpg", "unit-1.jpg"], reused: [] });
    expect(job.review!.estimate).toMatchObject({ model: "gemini-nano-banana-2.1", pictures: 2, toPaint: 2 });
    expect(job.review!.estimate.mostIls).toBeGreaterThan(job.review!.estimate.likelyIls);
    expect(job.review!.budgetIls).toBe(50);
    expect((await houseReviewPicture(job, "A", "view-hero.jpg"))?.toString()).toBe("hero");
    expect(await houseReviewPicture(job, "A", "sheet-floor-0.jpg")).toBeNull();
    expect(mockFinish).not.toHaveBeenCalled();
  });

  it("makes no booklet where a picture paid to be painted did not hold, and can be taken up again", async () => {
    mockFinish.mockImplementationOnce(async () => ({ html: "<html></html>", painted: 1, pictures: 2, unpainted: ["דגם A: view-hero.jpg"] }));
    const job = await start();
    await until(job, "awaiting_approval");
    approveHouseBookletJob(job, { paint: true, budgetIls: 30 });
    await until(job, "done", "failed");
    expect(job.status).toBe("failed");
    expect(job.resumable).toBe(true);
    expect(job.error).toMatch(/view-hero\.jpg/);
    expect(store.files.get(`jobs/${job.id}/booklet.pdf`)).toBeUndefined();
  });

  it("after a painting that stopped short, is approved again under a higher ceiling", async () => {
    mockFinish.mockImplementationOnce(async () => ({ html: "<html></html>", painted: 1, pictures: 2, unpainted: ["דגם A: view-hero.jpg"] }));
    const job = await start();
    await until(job, "awaiting_approval");
    approveHouseBookletJob(job, { paint: true, budgetIls: 30 });
    await until(job, "done", "failed");
    expect(job.status).toBe("failed");
    approveHouseBookletJob(job, { paint: true, budgetIls: 60 });
    await until(job, "done", "failed");
    expect(job.status).toBe("done");
    expect(job.approval).toMatchObject({ paint: true, budgetIls: 60 });
    expect(job.paintSpend.budgetIls).toBe(60);
  });

  it("after a painting that stopped short, makes the booklet as it stands, with no further call", async () => {
    mockFinish.mockImplementation(async () => ({ html: "<html></html>", painted: 1, pictures: 2, unpainted: ["דגם A: view-hero.jpg"] }));
    try {
      const job = await start();
      await until(job, "awaiting_approval");
      approveHouseBookletJob(job, { paint: true, budgetIls: 30 });
      await until(job, "done", "failed");
      expect(job.status).toBe("failed");
      acceptHouseBookletUnpainted(job);
      await until(job, "done", "failed");
      expect(job.status).toBe("done");
      expect(job.approval?.acceptUnpainted).toBe(true);
      expect(job.paintSpend.stopped).toBe(true);
      expect(job.unpainted).toEqual(["דגם A: view-hero.jpg"]);
      expect(store.files.get(`jobs/${job.id}/booklet.pdf`)?.toString()).toContain("%PDF");
    } finally {
      mockFinish.mockReset();
      mockFinish.mockImplementation(async (input) => ({ html: `<html><body>${input.models.map((m) => m.name).join(",")}</body></html>`, painted: input.paint ? 1 : 0, pictures: 2 }));
    }
  });

  it("holds the measuring run's vision reading to its own ceiling", async () => {
    const job = await start();
    await until(job, "awaiting_approval");
    expect(job.measureSpend.budgetIls).toBe(3);
  });

  it("paints within the approved ceiling, and keeps the PDF", async () => {
    const job = await start();
    await until(job, "awaiting_approval");
    approveHouseBookletJob(job, { paint: true, budgetIls: 30 });
    await until(job, "done", "failed");
    expect(job.error).toBeUndefined();
    expect(mockFinish).toHaveBeenCalledTimes(1);
    const sent = mockFinish.mock.calls[0]![0];
    expect(sent.paint).toBe(true);
    expect(sent.models[0]!.artefacts.get("view-hero.jpg")?.toString()).toBe("hero");
    expect(job.approval).toMatchObject({ paint: true, budgetIls: 30 });
    expect(job.paintSpend.budgetIls).toBe(30);
    expect(store.files.get(`jobs/${job.id}/booklet.pdf`)?.toString()).toContain("%PDF");
    expect(() => approveHouseBookletJob(job, { paint: true })).toThrow(/אינה ממתינה/);
  });

  it("puts the measured booklet together for free when told not to paint", async () => {
    const job = await start();
    await until(job, "awaiting_approval");
    approveHouseBookletJob(job, { paint: false });
    await until(job, "done", "failed");
    expect(mockFinish.mock.calls[0]![0].paint).toBe(false);
    expect(job.approval).toMatchObject({ paint: false, budgetIls: null });
  });

  it("outlives a restart: the job is read back, a run cut off is resumable, and taken up again", async () => {
    const job = await start();
    await until(job, "awaiting_approval");
    approveHouseBookletJob(job, { paint: true });
    await until(job, "done");
    // As a restart in the middle of the painting leaves it.
    const record = JSON.parse(store.files.get(`jobs/${job.id}/job.json`)!.toString());
    store.files.set(`jobs/${job.id}/job.json`, Buffer.from(JSON.stringify({ ...record, status: "painting", pdfRef: undefined })));
    forgetHouseBookletJobs();

    expect(await getHouseBookletJob("other-org", job.id)).toBeNull();
    const back = (await getHouseBookletJob(ORG, job.id))!;
    expect(back.status).toBe("failed");
    expect(back.resumable).toBe(true);
    expect(back.review!.models[0]!.pictures).toEqual(["view-hero.jpg", "unit-1.jpg"]);
    retryHouseBookletJob(back);
    await until(back, "done", "failed");
    expect(back.error).toBeUndefined();
    expect((await houseBookletPdf(back))?.toString()).toContain("%PDF");
    expect(await getHouseBookletJob(ORG, "../../etc")).toBeNull();
  });

  it("stops a run past the server's memory, resumable", async () => {
    process.env.HOUSE_BOOKLET_MAX_RSS_MB = "1";
    mockFinish.mockImplementationOnce(() => new Promise(() => undefined));
    const job = await start();
    await until(job, "awaiting_approval", "failed");
    if (job.status === "awaiting_approval") approveHouseBookletJob(job, { paint: true });
    for (let i = 0; i < 400 && job.status !== "failed"; i++) await new Promise((r) => setTimeout(r, 25));
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/מגבלת הזיכרון/);
    expect(job.resumable).toBe(true);
    expect(job.paintSpend.stopped).toBe(true);
  });
});
