import { roomDimensionScale, snapToDrawingScale } from "@/lib/projects/floorplan-build";
import type { WallBody } from "@/lib/projects/floorplan-solid";
import type { FloorplanLayout } from "@/lib/projects/floorplan-layout";

// A page 1000 units square, at 50 units a metre: rooms drawn 3 m by 4 m and
// 2.5 m by 3 m, printed as such.
const U = 50;
const wall = (orientation: "h" | "v", centre: number, from: number, to: number): WallBody => ({
  orientation,
  centre,
  thickness: 10,
  from,
  to,
});
const bodies: WallBody[] = [
  // Room A: x 100–250, y 100–300 between faces.
  wall("v", 95, 50, 350),
  wall("v", 255, 50, 350),
  wall("h", 95, 50, 450),
  wall("h", 305, 50, 450),
  // Room B: x 260–385, y 100–250.
  wall("v", 390, 50, 350),
  wall("h", 255, 255, 400),
];
const layout = (scale: number): FloorplanLayout =>
  ({
    rooms: [
      { name: "ח. שינה", kind: "bedroom", widthM: 3 * scale, lengthM: 4 * scale, bbox: { x: 0.1, y: 0.1, w: 0.15, h: 0.2 } },
      { name: "ח. שינה 2", kind: "bedroom", widthM: 2.5 * scale, lengthM: 3 * scale, bbox: { x: 0.26, y: 0.1, w: 0.125, h: 0.15 } },
      { name: "סלון", kind: "living", widthM: 9, lengthM: 9, bbox: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 } },
    ],
  }) as unknown as FloorplanLayout;
const page = { width: 1000, height: 1000 };

describe("the scale checked against the rooms' printed sizes", () => {
  it("finds nothing to correct where the rooms measure as printed", () => {
    expect(roomDimensionScale(bodies, layout(1), page, U)).toBeCloseTo(1, 2);
  });

  it("reads how much larger the rooms are printed than measured", () => {
    expect(roomDimensionScale(bodies, layout(1.06), page, U)).toBeCloseTo(1.06, 2);
  });

  it("does not answer on rooms that disagree among themselves", () => {
    const odd = layout(1);
    odd.rooms[1]!.widthM = 2.5 * 1.15;
    odd.rooms[1]!.lengthM = 3 * 1.15;
    expect(roomDimensionScale(bodies, odd, page, U)).toBeNull();
  });
});

describe("an architect's scale", () => {
  it("snaps to 1:50 in points within a point and a half per cent", () => {
    expect(snapToDrawingScale(56.84)).toBeCloseTo(72 / 0.0254 / 50, 5);
    expect(snapToDrawingScale(54.75)).toBe(54.75);
  });
});
