import { lintelBands, type WallBody } from "@/lib/projects/floorplan-solid";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

const UPM = 54;

/** One face of a wall, as a straight run. */
const face = (y: number, x0: number, x1: number): VectorSegment => ({
  x1: x0,
  y1: y,
  x2: x1,
  y2: y,
  lineWidth: 2,
});

const wall = (b: Partial<WallBody> = {}): WallBody => ({
  orientation: "h",
  centre: 546,
  thickness: 20,
  from: 231,
  to: 345,
  ...b,
});

describe("lintelBands", () => {
  // Faces carrying on across a window, in line with a wall that is really there.
  const faces = [face(536, 123, 211), face(556, 146, 290)];

  it("takes a window band as enclosure when it continues a real wall", () => {
    const found = lintelBands(faces, [wall()], UPM);
    expect(found).toHaveLength(1);
    expect(found[0]!.orientation).toBe("h");
    expect(found[0]!.centre).toBeCloseTo(546, 0);
    expect(found[0]!.from).toBeCloseTo(146, 0);
    expect(found[0]!.to).toBeCloseTo(211, 0);
  });

  it("ignores a band that continues nothing", () => {
    // Without the wall beside it, two parallel lines are just two lines — which
    // is why the hatch test cannot simply be dropped.
    expect(lintelBands(faces, [], UPM)).toEqual([]);
  });

  it("ignores a band on a different line from the wall", () => {
    expect(lintelBands(faces, [wall({ centre: 700 })], UPM)).toEqual([]);
  });

  it("ignores a band far along the line from the wall", () => {
    // A window is next to its wall; a metre and a half away it is something else.
    expect(lintelBands(faces, [wall({ from: 900, to: 1100 })], UPM)).toEqual([]);
  });

  it("ignores a band of the wrong thickness for the wall it claims to continue", () => {
    expect(lintelBands(faces, [wall({ thickness: 6 })], UPM)).toEqual([]);
  });
});
