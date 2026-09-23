import { findHatchGaps, type WallBody } from "@/lib/projects/floorplan-solid";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

/**
 * A window is a break in the wall's hatch.
 *
 * The builder pairs the two faces of a wall, so a window leaves no gap between
 * bodies and the gap rule cannot see one: דירה 14 measured six openings and
 * not a single window, for a flat whose every room has one. The hatch itself
 * is the signal — diagonal ink between the faces, absent where the opening is.
 */

const UPM = 100;

/** A wall six metres long, hatched everywhere except the given stretch. */
function hatchedWall(
  gapFrom: number,
  gapTo: number,
  options?: { pitch?: number; angleDeg?: number },
): { wall: WallBody; ink: VectorSegment[] } {
  const wall: WallBody = { orientation: "h", centre: 200, thickness: 20, from: 0, to: 600 };
  const pitch = options?.pitch ?? 6;
  const angle = ((options?.angleDeg ?? 45) * Math.PI) / 180;
  const ink: VectorSegment[] = [];
  for (let at = wall.from; at < wall.to; at += pitch) {
    if (at >= gapFrom && at < gapTo) continue;
    ink.push({
      x1: at,
      y1: wall.centre - wall.thickness / 2,
      x2: at + Math.cos(angle) * 14,
      y2: wall.centre - wall.thickness / 2 + Math.sin(angle) * 14,
      lineWidth: 0.4,
    } as VectorSegment);
  }
  return { wall, ink };
}

describe("openings read from the hatch", () => {
  it("finds the break the sheet leaves for a window", () => {
    const { wall, ink } = hatchedWall(250, 340);
    const found = findHatchGaps([wall], ink, UPM);
    expect(found).toHaveLength(1);
    expect(found[0]!.from).toBeGreaterThanOrEqual(240);
    expect(found[0]!.to).toBeLessThanOrEqual(350);
    expect(found[0]!.centre).toBe(wall.centre);
    expect(found[0]!.thickness).toBe(wall.thickness);
  });

  it("says nothing about a wall that is hatched the whole way", () => {
    const { wall, ink } = hatchedWall(-1, -1);
    expect(findHatchGaps([wall], ink, UPM)).toEqual([]);
  });

  it("says nothing about a wall the sheet does not hatch at all", () => {
    const { wall } = hatchedWall(250, 340);
    expect(findHatchGaps([wall], [], UPM)).toEqual([]);
  });

  it("ignores ink on the axes — dimensions, furniture and the faces themselves", () => {
    const { wall, ink } = hatchedWall(250, 340, { angleDeg: 0 });
    expect(findHatchGaps([wall], ink, UPM)).toEqual([]);
  });

  it("takes a break at the end of a wall for the end of the wall", () => {
    const { wall, ink } = hatchedWall(0, 90);
    expect(findHatchGaps([wall], ink, UPM)).toEqual([]);
    const tail = hatchedWall(510, 600);
    expect(findHatchGaps([tail.wall], tail.ink, UPM)).toEqual([]);
  });

  it("leaves a gap too narrow to walk through, and one too wide to be an opening", () => {
    expect(findHatchGaps([hatchedWall(250, 280).wall], hatchedWall(250, 280).ink, UPM)).toEqual([]);
    const wide = hatchedWall(100, 480);
    expect(findHatchGaps([wide.wall], wide.ink, UPM)).toEqual([]);
  });
});
