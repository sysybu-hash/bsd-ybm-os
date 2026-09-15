import {
  compareRasterToVector,
  rasterNeedsOutlineConfirm,
  segmentsFromGrey,
} from "@/lib/projects/floorplan-raster";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

describe("rasterToSegments", () => {
  it("reads a 45-degree hatch run as a segment", () => {
    // A wall is a strip of 45° ink. A blank page must not invent walls.
    const width = 40;
    const height = 40;
    const grey = new Uint8Array(width * height).fill(220);
    for (let i = 0; i < 20; i++) grey[(5 + i) * width + (5 + i)] = 30;
    const result = segmentsFromGrey(grey, width, height);
    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.segments[0]!.x2 - result.segments[0]!.x1).toBeGreaterThan(5);
  });

  it("asks the operator to confirm when the hatch is too thin to be a wall plate", () => {
    const grey = new Uint8Array(20 * 20).fill(250);
    const result = segmentsFromGrey(grey, 20, 20);
    expect(rasterNeedsOutlineConfirm(result)).toBe(true);
  });

  it("measures how much CAD ink a raster pass recovered", () => {
    const vector: VectorSegment[] = [
      { x1: 0, y1: 0, x2: 10, y2: 10, lineWidth: 4 },
      { x1: 100, y1: 100, x2: 110, y2: 110, lineWidth: 4 },
    ];
    const raster: VectorSegment[] = [{ x1: 1, y1: 1, x2: 9, y2: 9, lineWidth: 4 }];
    const cmp = compareRasterToVector(raster, vector);
    expect(cmp.recovered).toBe(0.5);
  });
});
