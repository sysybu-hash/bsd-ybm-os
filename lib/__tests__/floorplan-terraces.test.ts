import {
  findTerraces,
  findLevelMarks,
  findTerracesOnFloor,
  terraceDiagonalSeeds,
  type SpanRow,
  type WallBody,
} from "@/lib/projects/floorplan-solid";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

const UPM = 54;
const HEAVY = 6;
const LIGHT = 1;

/** A rectangle of heavy line work, optionally left open on one side. */
function box(
  x: number,
  y: number,
  w: number,
  h: number,
  options?: { open?: boolean; lineWidth?: number },
): VectorSegment[] {
  const lineWidth = options?.lineWidth ?? HEAVY;
  const sides: VectorSegment[] = [
    { x1: x, y1: y, x2: x + w, y2: y, lineWidth },
    { x1: x, y1: y + h, x2: x + w, y2: y + h, lineWidth },
    { x1: x, y1: y, x2: x, y2: y + h, lineWidth },
  ];
  if (!options?.open) {
    sides.push({ x1: x + w, y1: y, x2: x + w, y2: y + h, lineWidth });
  }
  return sides;
}

// 2 m x 2 m at 54 units per metre.
const SIDE = UPM * 2;
const centre = { x: 100 + SIDE / 2, y: 100 + SIDE / 2 };

describe("findTerraces", () => {
  it("accepts a region that measures what its label prints", () => {
    const found = findTerraces(
      box(100, 100, SIDE, SIDE),
      [{ ...centre, value: 4 }],
      UPM,
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.printedM2).toBe(4);
    expect(found[0]!.floodedM2).toBeGreaterThan(3);
    expect(found[0]!.floodedM2).toBeLessThan(4.2);
  });

  it("rejects a region that does not measure what its label prints", () => {
    // Same 4 m² of ground, labelled 15 — so the label is not describing it.
    expect(
      findTerraces(box(100, 100, SIDE, SIDE), [{ ...centre, value: 15 }], UPM),
    ).toEqual([]);
  });

  it("rejects a region that leaks, rather than reporting the sheet", () => {
    // דירה 14's 3.16 terrace is not closed by heavy line work and floods to
    // 253 m². A leak has to omit a terrace, never invent one. The far corner
    // mark gives the flood the run of a sheet to escape into, which is what
    // makes this the real case rather than a box with one side missing.
    const sheet: VectorSegment[] = [
      ...box(100, 100, SIDE, SIDE, { open: true }),
      { x1: 1400, y1: 1400, x2: 1420, y2: 1400, lineWidth: HEAVY },
    ];
    expect(findTerraces(sheet, [{ ...centre, value: 4 }], UPM)).toEqual([]);
  });

  it("ignores light line work, which is the paving inside the terrace", () => {
    // Paving is drawn light and partitions the terrace into bricks; flooding
    // over it traps the seed in a single one.
    const paving: VectorSegment[] = [];
    for (let i = 1; i < 8; i++) {
      const y = 100 + (SIDE * i) / 8;
      paving.push({ x1: 100, y1: y, x2: 100 + SIDE, y2: y, lineWidth: LIGHT });
    }
    const found = findTerraces(
      [...box(100, 100, SIDE, SIDE), ...paving],
      [{ ...centre, value: 4 }],
      UPM,
    );
    expect(found).toHaveLength(1);
  });

  it("returns nothing when the sheet prints no areas", () => {
    expect(findTerraces(box(100, 100, SIDE, SIDE), [], UPM)).toEqual([]);
  });
});

describe("findTerracesOnFloor", () => {
  it("grows a paving-trapped label along the floor slab and stops at walls", () => {
    const upm = 50;
    const x0 = 200;
    const y0 = 400;
    const width = 2.2 * upm;
    const height = 2.3 * upm;
    const floor: SpanRow[] = [];
    for (let y = y0; y < y0 + height; y += 2) {
      floor.push({ y, spans: [[x0, x0 + width]] });
    }
    // A neighbouring living room on the same slab — a leak would swallow it.
    for (let y = 0; y < 8 * upm; y += 2) {
      floor.push({ y, spans: [[0, 6 * upm]] });
    }
    const bodies: WallBody[] = [
      { orientation: "h", centre: y0, thickness: 8, from: x0, to: x0 + width },
      { orientation: "h", centre: y0 + height, thickness: 8, from: x0, to: x0 + width },
      { orientation: "v", centre: x0, thickness: 8, from: y0, to: y0 + height },
      { orientation: "v", centre: x0 + width, thickness: 8, from: y0, to: y0 + height },
    ];
    const found = findTerracesOnFloor(
      floor,
      bodies,
      [{ x: x0 + width / 2, y: y0 + height / 2, value: 5.12 }],
      upm,
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.floodedM2).toBeGreaterThan(4);
    expect(found[0]!.floodedM2).toBeLessThan(6);
  });

  it("refuses a floor flood that is the living room, not the printed terrace", () => {
    const upm = 50;
    const floor: SpanRow[] = [];
    for (let y = 0; y < 6 * upm; y += 2) {
      floor.push({ y, spans: [[0, 6 * upm]] });
    }
    expect(
      findTerracesOnFloor(floor, [], [{ x: 50, y: 50, value: 5.12 }], upm),
    ).toEqual([]);
  });

  it("does not walk a hairline of floor to the next terrace", () => {
    // The footprint is closed by a third of a metre, which leaves a strip of
    // "floor" one row wide along the outside of a wall. On דירה 14 the 3.16 m²
    // roof terrace walked up it to the west terrace and was dropped.
    const upm = 50;
    const floor: SpanRow[] = [];
    for (let y = 0; y < 400; y += 2) {
      const spans: Array<[number, number]> =
        y < 100 ? [[0, 100]] : y < 200 ? [[48, 50]] : [[0, 300]];
      floor.push({ y, spans });
    }
    const found = findTerracesOnFloor(floor, [], [{ x: 50, y: 50, value: 4 }], upm);
    expect(found).toHaveLength(1);
    expect(found[0]!.floodedM2).toBeGreaterThan(3);
    expect(found[0]!.floodedM2).toBeLessThan(5);
  });
});

describe("the diagonal an Israeli sheet draws across a terrace", () => {
  it("finds it between the wall hatch below and the section lines above", () => {
    // Measured on the ten sheets: the terrace marks run 69 to 261 units on the
    // heavy pen, wall hatch is bounded by a wall's own thickness, and each
    // sheet carries a section line of 1400 units and more on the thin pen.
    const mark: VectorSegment = {
      x1: 100,
      y1: 100,
      x2: 200,
      y2: 200,
      lineWidth: 5,
    };
    const wallHatch: VectorSegment = {
      x1: 300,
      y1: 300,
      x2: 308,
      y2: 308,
      lineWidth: 5,
    };
    const sectionLine: VectorSegment = {
      x1: 0,
      y1: 0,
      x2: 1000,
      y2: 1200,
      lineWidth: 2,
    };
    const seeds = terraceDiagonalSeeds(
      [mark, wallHatch, sectionLine],
      UPM,
    );
    expect(seeds).toHaveLength(1);
    expect(seeds[0]!.x).toBeCloseTo(150, 0);
  });

  it("ignores an axis-aligned line, which is a wall or a course of paving", () => {
    const wall: VectorSegment = {
      x1: 100,
      y1: 100,
      x2: 300,
      y2: 100,
      lineWidth: 5,
    };
    expect(terraceDiagonalSeeds([wall], UPM)).toEqual([]);
  });
});

describe("the level mark a terrace carries", () => {
  const upm = 56;
  const seg = (x1: number, y1: number, x2: number, y2: number, lineWidth = 4): VectorSegment => ({ x1, y1, x2, y2, lineWidth });
  /** Four quarter chords round (cx, cy), and hatch strokes in two quarters. */
  const mark = (cx: number, cy: number, r: number, hatch = 8) => ({
    curves: [
      seg(cx + r, cy, cx, cy - r),
      seg(cx, cy - r, cx - r, cy),
      seg(cx - r, cy, cx, cy + r),
      seg(cx, cy + r, cx + r, cy),
    ],
    segments: Array.from({ length: hatch }, (_, i) => {
      const d = (i % 4) * 1.5 + 1;
      return i < 4 ? seg(cx - d, cy - 1, cx - 1, cy - d) : seg(cx + 1, cy + d, cx + d, cy + 1);
    }),
  });

  it("finds a terrace's mark — דירה 14's west terrace prints its area only as outlines", () => {
    const m = mark(257, 913, 11.3);
    expect(findLevelMarks(m.curves, m.segments, upm).map(({ x, y }) => ({ x, y }))).toEqual([{ x: 257, y: 913 }]);
  });

  it("hands back the mark's own hatch, which reads as a wall", () => {
    const m = mark(311, 1208, 8);
    const [found] = findLevelMarks(m.curves, m.segments, upm);
    expect(found!.strokes.length).toBeGreaterThanOrEqual(6);
    expect(found!.strokes.every((stroke) => m.segments.includes(stroke))).toBe(true);
    expect(found!.r).toBeCloseTo(8);
  });

  it("leaves out the flat's own, smaller mark in its number box", () => {
    const m = mark(591, 981, 5.7);
    expect(findLevelMarks(m.curves, m.segments, upm)).toEqual([]);
  });

  it("leaves out a plain circle — a grid bubble has no hatch", () => {
    const m = mark(100, 100, 9, 0);
    expect(findLevelMarks(m.curves, m.segments, upm)).toEqual([]);
  });
});

describe("a terrace seeded without a printed area", () => {
  const upm = 50;
  const floorOf = (w: number, h: number) => {
    const floor: SpanRow[] = [];
    for (let y = 0; y < h; y += 2) floor.push({ y, spans: [[0, w]] });
    return floor;
  };

  it("is accepted inside the window a terrace measures", () => {
    const found = findTerracesOnFloor(floorOf(150, 150), [], [{ x: 75, y: 75 }], upm);
    expect(found).toHaveLength(1);
    expect(found[0]!.printedM2).toBeUndefined();
  });

  it("gives a printed terrace back the rim the flood kept off its edges", () => {
    // A 2 m by 1.6 m terrace printed as 3.2 m²: flooded only where floor lies
    // on every side, it measures a rim short; given the rim back, it matches.
    const found = findTerracesOnFloor(floorOf(100, 80), [], [{ x: 50, y: 40, value: 3.2 }], upm);
    expect(found).toHaveLength(1);
    expect(found[0]!.floodedM2).toBeGreaterThan(3);
  });

  it("is refused when it floods more than any terrace", () => {
    expect(findTerracesOnFloor(floorOf(400, 400), [], [{ x: 75, y: 75 }], upm)).toEqual([]);
  });
});
