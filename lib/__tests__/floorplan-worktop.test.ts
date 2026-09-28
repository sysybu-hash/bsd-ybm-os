import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";
import { findWorktopRuns } from "@/lib/projects/floorplan-worktop";

const UPM = 50;
const seg = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2, lineWidth: 2 });
const piece = (kind: FurniturePiece["kind"], x: number, y: number, w: number, h: number): FurniturePiece => ({
  kind,
  x,
  y,
  w,
  h,
  widthCm: (w / UPM) * 100,
  depthCm: (h / UPM) * 100,
});

// A wall along the bottom, its room-side face at y = 500.
const wall = { x: 0, y: 500, w: 400, h: 10 };
// Two basins against it, 30 by 60 cm.
const sinks = [piece("sink", 100, 470, 30, 18), piece("sink", 135, 470, 30, 18)];

describe("the worktop run the hob and the sink are set into", () => {
  it("runs along the front line the sheet draws, across its breaks", () => {
    // The front line 0.6 m off the wall, broken where an appliance stands.
    const lines = [seg(40, 470, 150, 470), seg(155, 470, 260, 470)];
    const runs = findWorktopRuns(lines, sinks, [wall], UPM);
    expect(runs).toHaveLength(1);
    const run = runs[0]!;
    expect(run.kind).toBe("counter");
    expect(run.x).toBeCloseTo(40);
    expect(run.x + run.w).toBeCloseTo(260);
    expect(run.y).toBeCloseTo(470);
    expect(run.y + run.h).toBeCloseTo(500);
  });

  it("is only the cabinet under the fitting where no front line is drawn", () => {
    const runs = findWorktopRuns([], sinks, [wall], UPM);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.w).toBeCloseTo(65);
    expect(runs[0]!.h).toBeCloseTo(0.6 * UPM);
  });

  it("ignores a line too far off the wall to be a worktop's edge", () => {
    const runs = findWorktopRuns([seg(0, 440, 400, 440)], sinks, [wall], UPM);
    expect(runs[0]!.w).toBeCloseTo(65);
  });

  it("builds nothing for a fitting with no wall behind it", () => {
    expect(findWorktopRuns([], [piece("hob", 100, 100, 30, 30)], [wall], UPM)).toEqual([]);
  });

  it("does not repeat a counter already measured there", () => {
    const existing = [piece("counter", 40, 470, 220, 30)];
    expect(findWorktopRuns([seg(40, 470, 260, 470)], sinks, [wall], UPM, existing)).toEqual([]);
  });
});
