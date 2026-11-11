import type { Prisma } from "@prisma/client";

jest.mock("server-only", () => ({}));

const mockDb = {
  vmbProject: { findMany: jest.fn(), findFirst: jest.fn() },
  vmbJob: { findFirst: jest.fn() },
};
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb;
  },
}));

import { getJob, getProject, listProjects, toJobView } from "@/lib/vmb/projects";

const job = (progress: Prisma.JsonValue) => ({
  id: "j1",
  kind: "build",
  status: "running",
  percent: 40,
  etaSeconds: 30,
  progress,
  error: null,
  createdAt: new Date(0),
  startedAt: new Date(0),
  finishedAt: null,
  costCredits: null,
});

describe("VMB projects", () => {
  beforeEach(() => jest.clearAllMocks());

  it("scopes every query to offices the user belongs to", async () => {
    mockDb.vmbProject.findMany.mockResolvedValue([]);
    mockDb.vmbProject.findFirst.mockResolvedValue(null);
    mockDb.vmbJob.findFirst.mockResolvedValue(null);
    await listProjects("u1");
    await getProject("u1", "p1");
    await getJob("u1", "j1");
    const scope = { workspace: { members: { some: { userId: "u1" } } } };
    expect(mockDb.vmbProject.findMany.mock.calls[0][0].where).toEqual(scope);
    expect(mockDb.vmbProject.findFirst.mock.calls[0][0].where).toEqual({ id: "p1", ...scope });
    expect(mockDb.vmbJob.findFirst.mock.calls[0][0].where).toEqual({ id: "j1", project: scope });
  });

  it("returns null for a project or job outside the user's offices", async () => {
    mockDb.vmbProject.findFirst.mockResolvedValue(null);
    mockDb.vmbJob.findFirst.mockResolvedValue(null);
    await expect(getProject("u1", "other")).resolves.toBeNull();
    await expect(getJob("u1", "other")).resolves.toBeNull();
  });

  it("names the current stage from stored progress", () => {
    const v = toJobView(
      job({
        startedAt: 0,
        stages: [
          { key: "read", weight: 1, done: 2, total: 2 },
          { key: "build", weight: 2, done: 1, total: 4, detail: "floor 2 of 4" },
        ],
      }),
    );
    expect(v.stage).toBe("build");
    expect(v.stageDetail).toBe("floor 2 of 4");
    expect(v).not.toHaveProperty("progress");
  });

  it("shows bad or missing progress as no stages instead of failing", () => {
    expect(toJobView(job(null)).stages).toEqual([]);
    expect(toJobView(job({ stages: "x" })).stage).toBeNull();
  });

  it("attaches the latest job to each listed project", async () => {
    mockDb.vmbProject.findMany.mockResolvedValue([
      { id: "p1", name: "A", kind: "flat", status: "draft", updatedAt: new Date(0), jobs: [] },
      { id: "p2", name: "B", kind: "house", status: "running", updatedAt: new Date(0), jobs: [job(null)] },
    ]);
    const list = await listProjects("u1");
    expect(list[0]!.lastJob).toBeNull();
    expect(list[1]!.lastJob?.id).toBe("j1");
    expect(list[1]).not.toHaveProperty("jobs");
  });
});
