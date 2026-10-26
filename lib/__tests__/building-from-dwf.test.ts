import { floorPrimitives, type FloorSpec } from "@/lib/projects/building/assemble";
import { curvedWallPrimitives, sheetLevel } from "@/lib/projects/building/from-dwf";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
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

  it("leaves out the marks it prints small, though they are more", () => {
    const marks = sheet(["+ 2.65", "+ 3.36", "+ 3.36", "+ 2.65", "+ 2.65", "+ 2.65"]);
    expect(sheetLevel(marks)).toBe(2.65);
    const small = { ...marks, texts: marks.texts.map((t) => (t.text === "+ 2.65" ? { ...t, height: 4 } : t)) };
    expect(sheetLevel(small)).toBe(3.36);
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

  it("frames a private-house window in Jerusalem stone", () => {
    const house: FloorSpec = {
      ...spec,
      facade: "renderBrown",
      window: { sill: 0.9, head: 2.2, surround: 0.16 },
      surroundMaterial: "jerusalemStone",
      frameMaterial: "jerusalemStone",
    };
    const prims = floorPrimitives(walls, [gap], house);
    const stone = prims.filter((p) => p.type === "box" && p.material === "jerusalemStone");
    expect(stone.some((p) => p.type === "box" && p.tag?.endsWith(":surround") && p.size.x > 0.1)).toBe(true);
    expect(stone.some((p) => p.type === "box" && p.tag?.endsWith(":window"))).toBe(true);
  });
});

describe("curvedWallPrimitives", () => {
  const k = DWF_FLOOR_UNITS_PER_METRE;
  // Wolf's lobby front: r 18.13–18.33 m, stone for 12°, then a ribbon window for 27°.
  const wall = { cx: 0, cy: 0, r0: 18.13 * k, r1: 18.33 * k, spans: [{ a0: 0, a1: (12 * Math.PI) / 180, glass: false }, { a0: (12 * Math.PI) / 180, a1: (39 * Math.PI) / 180, glass: true }] };
  const prims = curvedWallPrimitives(wall, { shift: { x: 0, y: 0 }, level: 3.36, height: 3.36, sill: 1.6, head: 2.6 }, "stone", "floor-1:curved");
  const boxes = prims.filter((p): p is Extract<typeof p, { type: "box" }> => p.type === "box");
  it("stands every facet on the wall's circle, under a metre long", () => {
    for (const b of boxes) {
      if (b.material === "frame" && b.size.x < 0.1) continue;
      expect(Math.hypot(b.centre.x, b.centre.z)).toBeGreaterThan(18.1);
      expect(Math.hypot(b.centre.x, b.centre.z)).toBeLessThan(18.35);
      expect(b.size.x).toBeLessThan(0.85);
    }
  });
  it("is stone where the walls' arcs run and a ribbon window where the windows' do", () => {
    const at = (deg: number) => boxes.filter((b) => Math.abs((Math.atan2(b.centre.z, b.centre.x) * 180) / Math.PI - deg) < 1.2);
    expect(at(6).every((b) => b.material === "stone" && b.size.y === 3.36)).toBe(true);
    const ribbon = at(25);
    expect(ribbon.some((b) => b.material === "glass" && Math.abs(b.centre.y - (3.36 + 2.1)) < 0.01)).toBe(true);
    expect(ribbon.filter((b) => b.material === "stone").map((b) => b.size.y.toFixed(2)).sort()).toEqual(["0.76", "1.60"]);
  });
});
