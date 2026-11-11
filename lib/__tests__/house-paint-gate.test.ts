/**
 * @jest-environment node
 */
import { assertPaintGate, markPlansPaintedReady, measuredPlansReadyStub } from "@/lib/projects/building/plans-ready";
import { inferRequireCars, type HouseProject } from "@/lib/projects/building/house-project";

describe("assertPaintGate — the elevations are painted behind what the measured stage proved", () => {
  it("opens on a passed geometry gate with no plans-ready file (the server has none)", () => {
    expect(assertPaintGate({ geometry: { ok: true }, plansReady: null })).toEqual({ ok: true, faults: [] });
  });

  it("stays shut without a geometry gate, or with a blocked one", () => {
    expect(assertPaintGate({}).faults).toEqual(["geometryGateMissing"]);
    expect(assertPaintGate({ geometry: { ok: false } }).faults).toEqual(["geometryGateBlocked"]);
  });

  it("stays shut on a failed pixel QA or a failing accuracy certificate; a warning certificate passes", () => {
    expect(assertPaintGate({ geometry: { ok: true }, visual: { ok: false } }).faults).toEqual(["visualGateBlocked"]);
    expect(assertPaintGate({ geometry: { ok: true }, certificate: { grade: "fail" } }).faults).toEqual(["accuracyCertificateFail"]);
    expect(assertPaintGate({ geometry: { ok: true }, visual: { ok: true }, certificate: { grade: "warn" } }).ok).toBe(true);
  });

  it("a signed plans-ready file still opens it on its own", () => {
    const stub = measuredPlansReadyStub({ model: "m", floors: [{ floorId: "0", geometryOk: true, visualOk: true }] });
    expect(assertPaintGate({ plansReady: markPlansPaintedReady(stub, {}) }).ok).toBe(true);
    expect(assertPaintGate({ plansReady: stub }).ok).toBe(false);
  });
});

describe("inferRequireCars — as the Studio infers it", () => {
  const project = (files: string[]): Pick<HouseProject, "models"> => ({
    models: [{ id: "a", name: "A", floors: files.map((file) => ({ file })) }],
  });
  const reader = (parking: Record<string, number>) => ({
    inventory: async (ref: { file: string }) => ({ counts: { parking: parking[ref.file] ?? 0 } }) as never,
  });

  it("an all-DXF building that draws no parking (a school) is not held to the cars gate", async () => {
    expect(await inferRequireCars(project(["g.dxf", "1.dxf"]), reader({}))).toEqual({ requireCars: false, parkingDrawn: 0 });
  });

  it("a DXF house that draws parking is held to it", async () => {
    expect(await inferRequireCars(project(["g.dxf", "1.dxf"]), reader({ "g.dxf": 2 }))).toEqual({ requireCars: true, parkingDrawn: 2 });
  });

  it("a DWF strip cannot say, so the gate holds", async () => {
    expect((await inferRequireCars(project(["strip.dwf"]), reader({}))).requireCars).toBe(true);
  });
});
