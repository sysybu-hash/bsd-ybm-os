import {
  findTerraces,
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
