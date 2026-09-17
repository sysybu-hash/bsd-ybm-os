import { wallBodiesForSheet, wallInkThreshold } from "@/lib/projects/floorplan-solid";
import { WALL_MIN_LINE_WIDTH, type VectorSegment } from "@/lib/projects/floorplan-vector";

const seg = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lineWidth: number,
): VectorSegment => ({ x1, y1, x2, y2, lineWidth });

/** A sales sheet: thin furniture and annotation, a few heavier wall lines. */
function salesSheetSegments(): VectorSegment[] {
  const out: VectorSegment[] = [];
  for (let i = 0; i < 80; i++) out.push(seg(0, i, 40, i, 2));
  for (let i = 0; i < 30; i++) out.push(seg(0, 200 + i, 40, 200 + i, 5));
  return out;
}

/** A plotted CAD sheet: every line at 4 and up, the walls at 12 and 14. */
function plottedSheetSegments(): VectorSegment[] {
  const out: VectorSegment[] = [];
  for (let i = 0; i < 80; i++) out.push(seg(0, i, 40, i, 5));
  for (let i = 0; i < 30; i++) out.push(seg(0, 200 + i, 40, 200 + i, 13));
  return out;
}

describe("wall ink threshold", () => {
  it("leaves a sales sheet on the constant", () => {
    // 28 to 34 per cent of these sheets' lines are at wall weight, which is
    // exactly the separation the constant was chosen for.
    expect(wallInkThreshold(salesSheetSegments())).toBe(WALL_MIN_LINE_WIDTH);
  });

  it("raises the bar on a sheet that plots everything heavy", () => {
    // On 28-8-23-2 every line clears the constant, so it separates nothing and
    // the segmenter treated dimension chains and wardrobes as walls.
    const cut = wallInkThreshold(plottedSheetSegments());
    expect(cut).toBeGreaterThan(WALL_MIN_LINE_WIDTH);
    expect(cut).toBeLessThanOrEqual(13);
  });

  it("keeps the constant when there is too little to judge", () => {
    expect(wallInkThreshold([seg(0, 0, 10, 0, 9)])).toBe(WALL_MIN_LINE_WIDTH);
  });
});

describe("walls on a plotted sheet", () => {
  it("builds a body from two heavy lines a partition apart, and none from annotation", () => {
    // 10 cm at 28 units per metre: the thickness every internal wall on
    // 28-8-23-2 is drawn at, and the hatch detector finds none of them because
    // the draughtsman hatched only the envelope.
    const upm = 28;
    const thickness = 0.1 * upm;
    const segments: VectorSegment[] = [];
    // Twelve partitions, each drawn as a pair of heavy lines.
    for (let i = 0; i < 12; i++) {
      const y = 100 + i * 60;
      segments.push(seg(0, y, 5 * upm, y, 13));
      segments.push(seg(0, y + thickness, 5 * upm, y + thickness, 13));
    }
    // A dimension chain at the same spacing, drawn at annotation weight.
    segments.push(seg(0, 2000, 5 * upm, 2000, 5));
    segments.push(seg(0, 2000 + thickness, 5 * upm, 2000 + thickness, 5));
    for (let i = 0; i < 60; i++) segments.push(seg(i, 2400, i + 20, 2400, 5));

    const bodies = wallBodiesForSheet(segments, { unitsPerMetre: upm });
    const wall = bodies.find((b) => Math.abs(b.centre - (100 + thickness / 2)) < 2);
    expect(wall).toBeDefined();
    expect((wall!.thickness / upm) * 100).toBeCloseTo(10, 0);
    expect(bodies.some((b) => Math.abs(b.centre - (2000 + thickness / 2)) < 2)).toBe(false);
  });
});
