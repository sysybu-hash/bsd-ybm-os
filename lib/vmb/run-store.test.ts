jest.mock("server-only", () => ({}));

const mockEnv = { VMB_RUNNER_READY: "1" as string | undefined };
jest.mock("@/lib/env", () => ({
  get env() {
    return mockEnv;
  },
}));

const mockDb = {
  vmbProject: { findFirst: jest.fn(), update: jest.fn() },
  vmbJob: { create: jest.fn(), delete: jest.fn(), updateMany: jest.fn() },
};
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb;
  },
}));

const mockCredits = { holdCredits: jest.fn(), settleHold: jest.fn() };
jest.mock("@/lib/vmb/credits", () => ({
  holdCredits: (...a: unknown[]) => mockCredits.holdCredits(...a),
  settleHold: (...a: unknown[]) => mockCredits.settleHold(...a),
}));

const mockEnt = jest.fn();
jest.mock("@/lib/vmb/entitlement", () => ({ getEntitlement: (...a: unknown[]) => mockEnt(...a) }));

import { cancelQueuedRun, projectCost, startRun } from "@/lib/vmb/run-store";

const project = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  kind: "house",
  status: "answered",
  workspaceId: "w1",
  manifest: { answers: { views: ["exterior_day", "aerial"] }, answersConfirmedAt: "2026-11-11T10:00:00Z" },
  scans: [],
  _count: { files: 2 },
  jobs: [],
  ...over,
});

describe("the run button on the server", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockEnv.VMB_RUNNER_READY = "1";
    mockDb.vmbProject.findFirst.mockResolvedValue(project());
    mockEnt.mockResolvedValue({ active: true, balance: 100, subscription: null });
    mockDb.vmbJob.create.mockResolvedValue({ id: "j1" });
    mockCredits.holdCredits.mockResolvedValue({ ok: true });
  });

  it("prices the booklet from the answered views", async () => {
    const c = await projectCost("u1", "p1");
    // house: base 4 + 4 exterior + 2 aerial.
    expect(c?.estimate.cap).toBe(10);
    expect(c?.block).toBeNull();
  });

  it("holds the ceiling for a new job and marks the project running", async () => {
    await expect(startRun("u1", "p1")).resolves.toEqual({ ok: true, jobId: "j1" });
    expect(mockCredits.holdCredits).toHaveBeenCalledWith("w1", "j1", 10);
    expect(mockDb.vmbJob.create.mock.calls[0][0].data).toMatchObject({ kind: "booklet", status: "queued", costCredits: 10 });
    expect(mockDb.vmbProject.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "running" } });
  });

  it("holds nothing and creates nothing while the runner is not connected", async () => {
    mockEnv.VMB_RUNNER_READY = undefined;
    await expect(startRun("u1", "p1")).resolves.toEqual({ ok: false, code: "runner_not_ready" });
    expect(mockDb.vmbJob.create).not.toHaveBeenCalled();
    expect(mockCredits.holdCredits).not.toHaveBeenCalled();
  });

  it("refuses before questions are confirmed, and when a job is already live", async () => {
    mockDb.vmbProject.findFirst.mockResolvedValue(project({ manifest: {} }));
    await expect(startRun("u1", "p1")).resolves.toEqual({ ok: false, code: "questions_pending" });
    mockDb.vmbProject.findFirst.mockResolvedValue(project({ jobs: [{ id: "j0", status: "running" }] }));
    await expect(startRun("u1", "p1")).resolves.toEqual({ ok: false, code: "already_running" });
    expect(mockDb.vmbJob.create).not.toHaveBeenCalled();
  });

  it("removes the job when the hold fails because the balance moved", async () => {
    mockCredits.holdCredits.mockResolvedValue({ ok: false, code: "insufficient", balance: 3 });
    await expect(startRun("u1", "p1")).resolves.toEqual({ ok: false, code: "insufficient_credits" });
    expect(mockDb.vmbJob.delete).toHaveBeenCalledWith({ where: { id: "j1" } });
    expect(mockDb.vmbProject.update).not.toHaveBeenCalled();
  });

  it("cancels a queued job once and gives everything back", async () => {
    mockDb.vmbProject.findFirst.mockResolvedValue(project({ jobs: [{ id: "j1", status: "queued" }] }));
    mockDb.vmbJob.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(cancelQueuedRun("u1", "p1")).resolves.toBe(true);
    expect(mockCredits.settleHold).toHaveBeenCalledWith("w1", "j1", 0);
    // A second click loses the race: nothing is given back twice.
    await expect(cancelQueuedRun("u1", "p1")).resolves.toBe(false);
    expect(mockCredits.settleHold).toHaveBeenCalledTimes(1);
  });

  it("does not cancel a running job", async () => {
    mockDb.vmbProject.findFirst.mockResolvedValue(project({ jobs: [{ id: "j1", status: "running" }] }));
    await expect(cancelQueuedRun("u1", "p1")).resolves.toBe(false);
    expect(mockDb.vmbJob.updateMany).not.toHaveBeenCalled();
  });
});
