/**
 * @jest-environment node
 */
import {
  assertElevationsAllowed,
  markPlansPaintedReady,
  measuredPlansReadyStub,
  plansReadyOk,
} from "@/lib/projects/building/plans-ready";

describe("plans-ready", () => {
  it("measured stub is not ready for elevations", () => {
    const stub = measuredPlansReadyStub({
      model: "C",
      floors: [
        { floorId: "floor-0", geometryOk: true, visualOk: true },
        { floorId: "floor-1", geometryOk: true, visualOk: true },
      ],
    });
    expect(plansReadyOk(stub)).toBe(false);
    expect(assertElevationsAllowed(stub).ok).toBe(false);
  });

  it("markPlansPaintedReady opens elevations only when all floors pass", () => {
    const stub = measuredPlansReadyStub({
      model: "C",
      floors: [
        { floorId: "floor-0", geometryOk: true, visualOk: true },
        { floorId: "floor-1", geometryOk: true, visualOk: true },
      ],
    });
    const ready = markPlansPaintedReady(stub, { spentIls: 1.2 });
    expect(plansReadyOk(ready)).toBe(true);
    expect(assertElevationsAllowed(ready).ok).toBe(true);
  });
});
