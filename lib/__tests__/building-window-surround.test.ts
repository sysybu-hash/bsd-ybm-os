import { floorPrimitives, type FloorSpec } from "@/lib/projects/building/assemble";
import type { Primitive } from "@/lib/projects/building/model";
import type { PlanOpening } from "@/lib/projects/building/plan-openings";
import type { PlanWalls } from "@/lib/projects/building/plan-walls";

/**
 * A 10 × 8 m storey, its south wall (y 7.75…8) holding windows. The stone
 * frame is laid round the opening, as a mason sets it: the glass is the
 * opening the sheet draws, not the opening less the frame.
 */
const FRAME = 0.16;
const floor: FloorSpec = {
  id: "floor-0",
  level: 0,
  height: 2.97,
  outline: [
    [0, 0],
    [10, 0],
    [10, 8],
    [0, 8],
  ],
  window: { sill: 1.1, head: 2.1, surround: FRAME },
  facade: "renderBrown",
  interior: "plaster",
  surroundMaterial: "jerusalemStone",
};
const walls = {
  bands: [
    { orientation: "h", x: 0, y: 0, w: 10, h: 0.25 },
    { orientation: "h", x: 0, y: 7.75, w: 10, h: 0.25 },
    { orientation: "v", x: 0, y: 0, w: 0.25, h: 8 },
    { orientation: "v", x: 9.75, y: 0, w: 0.25, h: 8 },
  ],
} as unknown as PlanWalls;

const opening = (x: number, w: number): PlanOpening => ({ orientation: "h", x, y: 7.75, w, h: 0.25, exterior: true, kind: "window", outward: 1 });

const glassOf = (prims: Primitive[]) => prims.filter((p): p is Extract<Primitive, { type: "box" }> => p.type === "box" && p.material === "glass");
const piecesOf = (prims: Primitive[], suffix: string) =>
  prims.filter((p): p is Extract<Primitive, { type: "box" }> => p.type === "box" && (p.tag ?? "").endsWith(suffix));

describe("a window's stone frame, round the opening", () => {
  it("glazes a narrow bathroom window its whole drawn width, not a slit", () => {
    const prims = floorPrimitives(walls, [opening(4, 0.4)], floor);
    const [glass] = glassOf(prims);
    expect(glass).toBeDefined();
    expect(glass!.size.x).toBeCloseTo(0.4, 2);
    expect(glass!.size.y).toBeCloseTo(1.0, 2);
  });

  it("lays the frame on the wall either side and above, the sill ledge below", () => {
    const prims = floorPrimitives(walls, [opening(4, 1.2)], floor);
    const surround = piecesOf(prims, ":surround");
    const left = Math.min(...surround.map((p) => p.centre.x - p.size.x / 2));
    const right = Math.max(...surround.map((p) => p.centre.x + p.size.x / 2));
    expect(left).toBeCloseTo(4 - FRAME, 3);
    expect(right).toBeCloseTo(5.2 + FRAME, 3);
    const top = Math.max(...surround.map((p) => p.centre.y + p.size.y / 2));
    expect(top).toBeCloseTo(2.1 + FRAME, 3);
    const [sill] = piecesOf(prims, ":sill");
    expect(sill!.centre.y + sill!.size.y / 2).toBeCloseTo(1.1, 3);
    expect(sill!.centre.y - sill!.size.y / 2).toBeCloseTo(1.1 - FRAME, 3);
  });

  it("splits a wide window into two leaves", () => {
    const prims = floorPrimitives(walls, [opening(4, 1.2)], floor);
    const mullions = piecesOf(prims, ":window").filter((p) => p.material !== "glass" && p.size.y > 0.5);
    expect(mullions).toHaveLength(3);
  });

  it("stops a jamb at the building's corner rather than standing it out in the air", () => {
    const prims = floorPrimitives(walls, [opening(0.1, 0.6)], floor);
    const surround = piecesOf(prims, ":surround");
    const left = Math.min(...surround.map((p) => p.centre.x - p.size.x / 2));
    expect(left).toBeGreaterThanOrEqual(0 - 1e-6);
  });
});
