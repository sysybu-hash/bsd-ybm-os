import {
  dropUnhatchedBodies,
  type WallBody,
} from "@/lib/projects/floorplan-solid";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

const UPM = 54;

/** A band of 45° strokes filling a rectangle, which is how a wall is drawn. */
function hatch(x: number, y: number, w: number, h: number): VectorSegment[] {
  const out: VectorSegment[] = [];
  const span = Math.max(w, h);
  const across = Math.min(w, h);
  for (let t = 0; t < span; t += 5) {
    const x1 = w > h ? x + t : x;
    const y1 = w > h ? y : y + t;
    const reach = Math.min(4, across);
    out.push({ x1, y1, x2: x1 + reach, y2: y1 + reach, lineWidth: 0.5 });
  }
  return out;
}

const wall = (b: Partial<WallBody> = {}): WallBody => ({
  orientation: "h",
  centre: 100,
  thickness: 16,
  from: 0,
  to: 540,
  ...b,
});

describe("dropUnhatchedBodies", () => {
  it("keeps a band that carries hatch along its whole run", () => {
    const body = wall();
    expect(dropUnhatchedBodies([body], hatch(0, 94, 540, 16), UPM)).toEqual([
      body,
    ]);
  });

  it("drops a chain that picks up hatch only where it crosses walls", () => {
    // A cluster at each end and nothing along the 10 m between them, which is
    // what a dimension line running the height of the sheet looks like.
    const segments = [...hatch(0, 94, 30, 16), ...hatch(510, 94, 30, 16)];
    expect(dropUnhatchedBodies([wall()], segments, UPM)).toEqual([]);
  });

  it("does not penalise a thin partition, which is hatched just as densely", () => {
    const thin = wall({ thickness: 6 });
    expect(dropUnhatchedBodies([thin], hatch(0, 97, 540, 6), UPM)).toEqual([
      thin,
    ]);
  });

  it("leaves every body alone when the sheet carries no hatch at all", () => {
    const bodies = [wall(), wall({ centre: 300 })];
    expect(dropUnhatchedBodies(bodies, [], UPM)).toEqual(bodies);
  });
});
