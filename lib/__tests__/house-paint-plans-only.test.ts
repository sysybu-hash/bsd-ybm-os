/**
 * @jest-environment node
 */
import { assertElevationsAllowed, plansReadyOk, readPlansReady } from "@/lib/projects/building/plans-ready";
import { assertProductionPlanPaintEnv, housePaintPlansOnly } from "@/lib/projects/building/plan-geometry-gate";
import { existsSync } from "node:fs";
import path from "node:path";

describe("world-class plans production locks", () => {
  it("blocks elevations until project plans-ready", () => {
    const root = path.join("previews", "booklet-plans-world");
    const ready = existsSync(path.join(root, "plans-ready.json")) ? readPlansReady(root) : null;
    if (!ready) {
      expect(assertElevationsAllowed(null).ok).toBe(false);
      return;
    }
    expect(plansReadyOk(ready)).toBe(true);
    expect(assertElevationsAllowed(ready).ok).toBe(true);
  });

  it("forbids KEEP_RENDER in production env", () => {
    expect(assertProductionPlanPaintEnv({ KEEP_RENDER: "1:0,0,1,1" } as unknown as NodeJS.ProcessEnv).ok).toBe(false);
    expect(housePaintPlansOnly("view-elev-north.jpg")).toBe(false);
    expect(housePaintPlansOnly("view-planwhole-floor-0.jpg")).toBe(true);
  });
});
