import { findTerraces } from "@/lib/projects/floorplan-solid";
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
