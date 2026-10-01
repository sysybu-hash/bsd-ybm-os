import { floorPrimitives, type FloorSpec } from "@/lib/projects/building/assemble";
import { sheetLevel } from "@/lib/projects/building/from-dwf";
import type { PlanWalls } from "@/lib/projects/building/plan-walls";
import { emptyMask, traceOutline } from "@/lib/projects/building/raster";
import type { DwfGeometry, PlacedText } from "@/lib/projects/floorplan-dwf";

describe("a floor's outline, traced", () => {
  it("traces an L as its six corners, the stair a slanted wall leaves straightened", () => {
    const mask = emptyMask(40, 40);
    for (let y = 5; y < 35; y++) for (let x = 5; x < 35; x++) if (x < 20 || y >= 20) mask.data[y * 40 + x] = 1;
    const ring = traceOutline(mask);
    expect(ring).toHaveLength(6);
    const xs = ring.map(([x]) => x);
    const ys = ring.map(([, y]) => y);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([5, 35, 5, 35]);
  });

  it("keeps the largest part and ignores a speck beside it", () => {
    const mask = emptyMask(30, 30);
    for (let y = 2; y < 20; y++) for (let x = 2; x < 20; x++) mask.data[y * 30 + x] = 1;
    mask.data[25 * 30 + 25] = 1;
    const ring = traceOutline(mask);
    expect(Math.max(...ring.map(([x]) => x))).toBe(20);
  });
});

describe("a floor sheet's level", () => {
  const sheet = (marks: string[]): DwfGeometry => ({
    pageWidth: 1000,
    pageHeight: 1000,
    segments: [],
    curves: [],
    walls: [],
    fills: [],
    arcs: [],
    texts: marks.map((text, i): PlacedText => ({ x: 100 + i * 200, y: 100 + i * 120, text, height: 10 })),
  });

  it("is the level its rooms are marked at, not the terrace below's or the survey's", () => {
    expect(sheetLevel(sheet(["+ 5.90", "+ 5.90", "5.90 +", "+ 2.93", "+ 923.20"]))).toBe(5.9);
  });

  it("is unknown on a sheet that marks none", () => {
    expect(sheetLevel(sheet(["סלון"]))).toBeNull();
  });
});

describe("an opening onto a terrace", () => {
  // A 4 m wall along y = 0 with a 1.6 m gap in it, the floor to the south.
  const walls: PlanWalls = {
    box: { x: 0, y: 0, width: 10, height: 10 },
    unitsPerMetre: 1,
    cm: 2,
    mask: emptyMask(1, 1),
    bands: [
      { orientation: "h", x: 0, y: 0, w: 1.2, h: 0.2 },
      { orientation: "h", x: 2.8, y: 0, w: 1.2, h: 0.2 },
    ],
  };
  const spec: FloorSpec = {
    id: "f",
    level: 10,
    height: 3,
    outline: [[0, 0], [4, 0], [4, 4], [0, 4]],
    window: { sill: 0.9, head: 2.2, surround: 0 },
    facade: "stone",
    interior: "plaster",
  };
  const gap = { orientation: "h" as const, x: 1.2, y: 0, w: 1.6, h: 0.2, exterior: true, kind: "window" as const, outward: -1 as const };
  const glassBottom = (full: boolean) => {
    const glass = floorPrimitives(walls, [{ ...gap, full }], spec).filter((p) => p.type === "box" && p.material === "glass");
    return Math.min(...glass.map((p) => (p.type === "box" ? p.centre.y - p.size.y / 2 : Infinity)));
  };

  it("is glazed from the floor, where a window stands on its sill", () => {
    expect(glassBottom(false)).toBeCloseTo(10.9, 5);
    expect(glassBottom(true)).toBeCloseTo(10, 5);
  });
});
