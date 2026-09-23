import { trimToHatchAlong, type SpanRow, type WallBody } from "@/lib/projects/floorplan-solid";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

/**
 * A hatched wall is its hatch — except where the flat's floor says otherwise.
 *
 * Two failures pinned here, both measured on the reference sheets:
 *
 * - דירה 14: a 2.5 m wall at the top of the page grew into a 15.5 m slab down
 *   thirteen metres of grid line with no hatch on it. It stood in the render as
 *   a wall of the flat and stretched the frame until the apartment sat small in
 *   an empty picture.
 * - דירה 19 and 23: cutting to the longest hatched run removed the last three
 *   metres of the partition between two bedrooms, whose hatch thins out there,
 *   and the two bedrooms came back as one.
 *
 * The rule that holds for both: a blank tail is cut only where no floor of the
 * flat runs beside it.
 */

const UPM = 100;

/** Diagonal hatch strokes along a vertical wall at x=100, from y0 to y1. */
function hatch(y0: number, y1: number): VectorSegment[] {
  const out: VectorSegment[] = [];
  for (let y = y0; y < y1; y += 6) {
    out.push({ x1: 92, y1: y, x2: 104, y2: y + 12, lineWidth: 0.3 } as VectorSegment);
  }
  return out;
}

/** A vertical wall 15 m long, hatched only along its first 2.5 m. */
const wall = (): WallBody => ({
  orientation: "v",
  centre: 100,
  thickness: 20,
  from: 0,
  to: 1500,
  source: "hatch",
});

function floorBeside(y0: number, y1: number): SpanRow[] {
  const rows: SpanRow[] = [];
  for (let y = y0; y < y1; y += 2) rows.push({ y, spans: [[115, 400]] });
  return rows;
}

describe("a hatched wall, cut back to its hatch", () => {
  it("cuts the grid line that grew a 2.5 m wall into a 15 m slab", () => {
    // No floor anywhere beside the long blank tail: it is not this flat's.
    const [trimmed] = trimToHatchAlong([wall()], hatch(0, 250), {
      unitsPerMetre: UPM,
      floor: floorBeside(0, 250),
    });
    expect(trimmed!.to).toBeLessThan(300);
  });

  it("keeps a wall's thinly hatched end where the flat's floor runs beside it", () => {
    // The partition between two bedrooms: hatch thins out, the floor does not.
    const [kept] = trimToHatchAlong([wall()], hatch(0, 250), {
      unitsPerMetre: UPM,
      floor: floorBeside(0, 1500),
    });
    expect(kept!.to).toBe(1500);
  });

  it("bridges a doorway rather than ending the wall at it", () => {
    // Hatch, a 90 cm opening, hatch again: one wall, not two halves.
    const [kept] = trimToHatchAlong([wall()], [...hatch(0, 600), ...hatch(690, 1500)], {
      unitsPerMetre: UPM,
    });
    expect(kept!.from).toBe(0);
    expect(kept!.to).toBe(1500);
  });

  it("leaves a wall alone when it carries no hatch to read", () => {
    const [kept] = trimToHatchAlong([wall()], [], { unitsPerMetre: UPM });
    expect(kept).toEqual(wall());
  });
});
