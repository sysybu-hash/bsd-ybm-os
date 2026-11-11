jest.mock("server-only", () => ({}));

const mockDb = { vmbProject: { findFirst: jest.fn(), update: jest.fn() } };
jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockDb;
  },
}));

import { projectBooklet, projectStop, projectUnit } from "@/lib/vmb/outcome";
import { setUnit } from "@/lib/vmb/answers-store";

describe("VMB run outcome", () => {
  beforeEach(() => jest.resetAllMocks());

  it("reads a stop and a booklet only when their shape holds", () => {
    expect(projectStop({ stop: { jobId: "j", code: "unit-needed", message: "x", units: [14, 15], at: "t" } })).toMatchObject({ units: [14, 15] });
    expect(projectStop({ stop: { code: "x" } })).toBeNull();
    expect(projectStop(null)).toBeNull();
    const b = projectBooklet({ booklet: { url: "https://b.example/booklet.pdf", jobId: "j", picturesPainted: 0, picturesFree: 6, creditsUsed: 0, at: "t" } });
    expect(b).toMatchObject({ assumptions: [], unusedAnswers: [] });
    expect(projectBooklet({ booklet: { url: "not a url" } })).toBeNull();
    expect(projectUnit({ unit: 14 })).toBe(14);
    expect(projectUnit({ unit: "14" })).toBeNull();
  });

  it("takes only a flat the engine offered, then clears the stop", async () => {
    mockDb.vmbProject.findFirst.mockResolvedValue({ id: "p1", status: "answered", manifest: { answers: {}, stop: { units: [14, 15] } } });
    expect(await setUnit("u1", "p1", 16)).toEqual({ ok: false, code: "not_offered" });
    expect(await setUnit("u1", "p1", 15)).toEqual({ ok: true });
    expect(mockDb.vmbProject.update.mock.calls[0][0].data.manifest).toEqual({ answers: {}, unit: 15 });
  });

  it("does not change the flat while a run is going", async () => {
    mockDb.vmbProject.findFirst.mockResolvedValue({ id: "p1", status: "running", manifest: {} });
    expect(await setUnit("u1", "p1", 3)).toEqual({ ok: false, code: "running" });
    expect(mockDb.vmbProject.update).not.toHaveBeenCalled();
  });
});
