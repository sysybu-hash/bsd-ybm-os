/**
 * @jest-environment node
 */
jest.mock("@/lib/prisma", () => ({
  prisma: {
    buildingBookletJob: {
      updateMany: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));
jest.mock("@/lib/env", () => ({ env: { QSTASH_TOKEN: "qstash-token", CRON_SECRET: "cron-secret", NEXT_PUBLIC_SITE_URL: "https://app.example" } }));
const publishJSON = jest.fn();
jest.mock("@upstash/qstash", () => ({ Client: jest.fn().mockImplementation(() => ({ publishJSON })) }));
jest.mock("@/lib/pdf/render-html-pdf-chromium", () => ({ renderHtmlSectionsPdf: jest.fn(async () => new Uint8Array([37, 80, 68, 70])) }));
const put = jest.fn(async (name: string) => ({ url: `https://store.public.blob.vercel-storage.com/${name}` }));
const del = jest.fn();
jest.mock("@vercel/blob", () => ({ put: (...a: unknown[]) => put(...(a as [string])), del: (...a: unknown[]) => del(...a) }));
jest.mock("@/lib/projects/building/dwf-booklet", () => ({ runBookletStage: jest.fn() }));
jest.mock("@/lib/projects/building/booklet-html", () => ({ BUILDING_BOOKLET_PAGE: {} }));

import { prisma } from "@/lib/prisma";
import { advanceBookletJob } from "@/lib/projects/building/booklet-job";
import { runBookletStage } from "@/lib/projects/building/dwf-booklet";

const db = prisma.buildingBookletJob as unknown as Record<string, jest.Mock>;
const stage = runBookletStage as unknown as jest.Mock;
const row = (over: Record<string, unknown> = {}) => ({
  id: "job1",
  organizationId: "org1",
  name: "בניין מגורים",
  status: "running",
  stage: "views",
  state: { viewsDone: ["a"] },
  sourceUrl: "https://store.public.blob.vercel-storage.com/source.w2d",
  resultUrl: null,
  error: null,
  createdAt: new Date(0),
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  db.findUniqueOrThrow!.mockResolvedValue(row());
  db.findFirst!.mockResolvedValue(row());
});

describe("a building booklet's job, a step at a time", () => {
  it("does nothing while another call holds the job", async () => {
    db.updateMany!.mockResolvedValue({ count: 0 });
    expect(await advanceBookletJob("job1")).toBeNull();
    expect(stage).not.toHaveBeenCalled();
  });

  it("keeps where it stopped, lets the job go, and asks QStash for the next step", async () => {
    db.updateMany!.mockResolvedValue({ count: 1 });
    // The views run out of time and hand back unfinished, so the call stops there.
    stage.mockImplementation(async (input: { deadline: number }) => {
      jest.spyOn(Date, "now").mockReturnValue(input.deadline + 1);
      return { stage: "views", state: { viewsDone: ["a", "b"] } };
    });
    await advanceBookletJob("job1");
    jest.restoreAllMocks();
    const last = db.update!.mock.calls.at(-1)![0] as { data: Record<string, unknown> };
    expect(last.data).toMatchObject({ stage: "views", state: { viewsDone: ["a", "b"] }, lockedUntil: null });
    expect(publishJSON).toHaveBeenCalledWith(expect.objectContaining({ url: "https://app.example/api/cron/building-booklet-step?id=job1" }));
  });

  it("puts the booklet in Blob when assembled, and clears away what it was made from", async () => {
    db.updateMany!.mockResolvedValue({ count: 1 });
    db.findUniqueOrThrow!.mockResolvedValue(row({ stage: "assemble", state: { artefacts: { "view-hero.jpg": "https://store.public.blob.vercel-storage.com/hero.jpg" } } }));
    stage.mockResolvedValue({ stage: "done", state: { artefacts: { "view-hero.jpg": "https://store.public.blob.vercel-storage.com/hero.jpg" } }, html: "<html></html>" });
    await advanceBookletJob("job1");
    const done = db.update!.mock.calls.find((c) => (c[0] as { data: { status?: string } }).data.status === "done");
    expect(done).toBeDefined();
    expect((done![0] as { data: { resultUrl: string } }).data.resultUrl).toMatch(/\.pdf$/);
    expect(del).toHaveBeenCalledWith(["https://store.public.blob.vercel-storage.com/hero.jpg", "https://store.public.blob.vercel-storage.com/source.w2d"]);
  });

  it("marks the job failed with what went wrong, and lets it go", async () => {
    db.updateMany!.mockResolvedValue({ count: 1 });
    stage.mockRejectedValue(new Error("לא ניתן לקרוא את קובץ ה-DWF"));
    await advanceBookletJob("job1");
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed", error: "לא ניתן לקרוא את קובץ ה-DWF", lockedUntil: null }) }));
  });
});
