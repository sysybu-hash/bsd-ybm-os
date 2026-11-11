jest.mock("server-only", () => ({}));

const mockSettle = jest.fn();
const mockNotify = jest.fn();
jest.mock("@vercel/blob", () => ({ del: jest.fn() }));
jest.mock("@/lib/vmb/notify", () => ({ notifyJobEnd: (...a: unknown[]) => mockNotify(...a) }));
jest.mock("@/lib/vmb/credits", () => ({ settleHold: (...a: unknown[]) => mockSettle(...a) }));

const mockDb = {
  vmbJob: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  vmbProject: { findUnique: jest.fn(), update: jest.fn() },
};
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb;
  },
}));

import { claimNextJob, creditsUsed, failJob, finishJob, progressReporter, reapStalledJobs, runClaimed, STALLED_AFTER_MS, type RunOutput } from "@/lib/vmb/runner";
import type { JobProgress } from "@/lib/vmb/progress";
import { RunProjectError } from "@/lib/projects/pipeline/runProject";

const project = {
  id: "p1",
  kind: "house",
  manifest: { answers: { furniture: "basic" }, answersConfirmedAt: "2026-11-11T00:00:00Z", layerMaps: { "a.dxf": { "A-WALL-X": "wall", bad: 3 } } },
  scans: [],
  files: [{ relPath: "a.dxf", kind: "dxf", blobUrl: "https://blob/a.dxf" }],
};
const job = { id: "j1", workspaceId: "w1", projectId: "p1", startedAt: new Date(Date.now() - 5000), costCredits: 20, progress: null, project: { kind: "house", manifest: project.manifest, workspace: { fileRetentionDays: 30 } } };
const out: RunOutput = { bookletUrl: "https://blob/booklet.pdf", picturesPainted: 7, picturesFree: 2, assumptions: ["north: default"], route: "flat-dxf", unusedAnswers: ["north"] };

describe("VMB runner", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockDb.vmbJob.findFirst.mockResolvedValue({ id: "j1", projectId: "p1" });
    mockDb.vmbJob.updateMany.mockResolvedValue({ count: 1 });
    mockDb.vmbJob.findUnique.mockResolvedValue(job);
    mockDb.vmbProject.findUnique.mockResolvedValue(project);
    mockDb.vmbProject.update.mockResolvedValue({});
    mockSettle.mockResolvedValue(undefined);
  });

  it("bills the base plus each painted picture, never above the hold, and nothing when none was painted", () => {
    expect(creditsUsed("house", 7, 100)).toBe(4 + 7);
    expect(creditsUsed("house", 500, 20)).toBe(20);
    expect(creditsUsed("flat", 1, 20)).toBe(3);
    expect(creditsUsed("flat", 0, 20)).toBe(0);
    expect(creditsUsed("flat", -3, 20)).toBe(0);
    expect(creditsUsed("flat", Number.NaN, 20)).toBe(0);
  });

  it("claims the oldest queued job only when its own update moved it", async () => {
    const input = await claimNextJob();
    expect(mockDb.vmbJob.updateMany.mock.calls[0][0].where).toEqual({ id: "j1", status: "queued" });
    expect(input).toMatchObject({ jobId: "j1", projectId: "p1", kind: "house", files: project.files, layerMaps: { "a.dxf": { "A-WALL-X": "wall" } } });
    expect(input?.answers.furniture).toMatchObject({ value: "basic", source: "user" });
  });

  it("does not take a job another runner took first", async () => {
    mockDb.vmbJob.updateMany.mockResolvedValue({ count: 0 });
    expect(await claimNextJob()).toBeNull();
    expect(mockDb.vmbJob.updateMany).toHaveBeenCalledTimes(3);
  });

  it("returns nothing when the queue is empty", async () => {
    mockDb.vmbJob.findFirst.mockResolvedValue(null);
    expect(await claimNextJob()).toBeNull();
    expect(mockDb.vmbJob.updateMany).not.toHaveBeenCalled();
  });

  it("writes progress at most every two seconds, but always when a stage completes", async () => {
    let t = 10_000;
    const initial: JobProgress = { startedAt: 0, stages: [{ key: "read", weight: 1, done: 0, total: 2 }, { key: "build", weight: 1, done: 0, total: 1 }] };
    const { report, current } = progressReporter("j1", initial, { now: () => t });
    await report("read", 1);
    t += 500;
    await report("read", 1, 2, "sheet 1");
    expect(mockDb.vmbJob.updateMany).toHaveBeenCalledTimes(1);
    t += 100;
    await report("read", 2);
    expect(mockDb.vmbJob.updateMany).toHaveBeenCalledTimes(2);
    const data = mockDb.vmbJob.updateMany.mock.calls[1][0];
    expect(data.where).toEqual({ id: "j1", status: "running" });
    expect(data.data.percent).toBe(50);
    expect(current().stages[0]).toMatchObject({ done: 2, detail: "sheet 1" });
  });

  it("finishes a job: settles what was painted and puts the booklet on the project", async () => {
    expect(await finishJob("j1", out)).toBe(true);
    expect(mockSettle).toHaveBeenCalledWith("w1", "j1", 11);
    const upd = mockDb.vmbProject.update.mock.calls[0][0];
    expect(upd.data.status).toBe("done");
    expect(upd.data.manifest.booklet).toMatchObject({ url: out.bookletUrl, route: "flat-dxf", unusedAnswers: ["north"], picturesPainted: 7, picturesFree: 2, creditsUsed: 11 });
    expect(upd.data.manifest.answers).toEqual(project.manifest.answers);
    expect(mockNotify).toHaveBeenCalledWith("p1", { kind: "done" });
    expect(upd.data.filesDeleteAt.getTime() - Date.now()).toBeGreaterThan(29 * 86_400_000);
  });

  it("does not settle twice when the job is no longer running", async () => {
    mockDb.vmbJob.updateMany.mockResolvedValue({ count: 0 });
    expect(await finishJob("j1", out)).toBe(false);
    expect(await failJob("j1", "x")).toBe(false);
    expect(mockSettle).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("an engine that throws fails the job and gives every credit back", async () => {
    const r = await runClaimed({ jobId: "j1", projectId: "p1", kind: "house", files: [], answers: {} as never, layerMaps: {} }, async () => {
      throw new Error("reader crashed");
    });
    expect(r).toBe("failed");
    expect(mockSettle).toHaveBeenCalledWith("w1", "j1", 0);
    const data = mockDb.vmbProject.update.mock.calls[0][0].data;
    expect(data.status).toBe("failed");
    expect(data.manifest.stop).toMatchObject({ jobId: "j1", code: "error", message: null });
  });

  it("a stop the client can act on returns the project to answered with the engine words and the flats", async () => {
    const r = await runClaimed({ jobId: "j1", projectId: "p1", kind: "flat", files: [], answers: {} as never, layerMaps: {} }, async () => {
      throw new RunProjectError("unit-needed", "בקומה כמה דירות", { units: [14, 15, 16] });
    });
    expect(r).toBe("failed");
    expect(mockSettle).toHaveBeenCalledWith("w1", "j1", 0);
    expect(mockDb.vmbJob.updateMany.mock.calls.at(-1)[0].data).toMatchObject({ status: "failed", error: "unit-needed" });
    const data = mockDb.vmbProject.update.mock.calls[0][0].data;
    expect(data.status).toBe("answered");
    expect(data.manifest.stop).toMatchObject({ code: "unit-needed", message: "בקומה כמה דירות", units: [14, 15, 16] });
    expect(mockNotify).toHaveBeenCalledWith("p1", { kind: "stopped", message: "בקומה כמה דירות" });
  });

  it("fails jobs that stopped reporting and gives their credits back", async () => {
    mockDb.vmbJob.findMany.mockResolvedValue([{ id: "j1" }]);
    const now = Date.UTC(2026, 10, 11, 12);
    expect(await reapStalledJobs(now)).toBe(1);
    const where = mockDb.vmbJob.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ kind: "booklet", status: "running" });
    expect(where.updatedAt.lt.getTime()).toBe(now - STALLED_AFTER_MS);
    expect(mockDb.vmbJob.updateMany.mock.calls[0][0].data).toMatchObject({ status: "failed", error: "stalled" });
    expect(mockSettle).toHaveBeenCalledWith("w1", "j1", 0);
  });

  it("an engine that delivers finishes the job", async () => {
    const r = await runClaimed({ jobId: "j1", projectId: "p1", kind: "house", files: [], answers: {} as never, layerMaps: {} }, async (_i, report) => {
      await report("read", 1);
      return out;
    });
    expect(r).toBe("done");
    expect(mockSettle).toHaveBeenCalledWith("w1", "j1", 11);
  });
});
