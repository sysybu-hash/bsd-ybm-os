import { wallPieces } from "@/components/os/widgets/floorplan-viz/FloorplanViz3DViewer";

const wall = { orientation: "h" as const, centre: 100, thickness: 8, from: 0, to: 400 };

describe("walls in three dimensions", () => {
  it("leaves a wall whole when nothing opens through it", () => {
    expect(wallPieces(wall, [])).toEqual([{ from: 0, to: 400 }]);
  });

  it("cuts a doorway out, so the room is not bricked up", () => {
    const door = { orientation: "h" as const, centre: 100, thickness: 8, from: 150, to: 230 };
    expect(wallPieces(wall, [door])).toEqual([
      { from: 0, to: 150 },
      { from: 230, to: 400 },
    ]);
  });

  it("ignores an opening in another wall", () => {
    const elsewhere = { orientation: "v" as const, centre: 100, thickness: 8, from: 150, to: 230 };
    const faraway = { orientation: "h" as const, centre: 300, thickness: 8, from: 150, to: 230 };
    expect(wallPieces(wall, [elsewhere, faraway])).toEqual([{ from: 0, to: 400 }]);
  });

  it("clips an opening that runs past the wall's own ends", () => {
    const wide = { orientation: "h" as const, centre: 100, thickness: 8, from: -50, to: 120 };
    expect(wallPieces(wall, [wide])).toEqual([{ from: 120, to: 400 }]);
  });

  it("handles two doors in one wall, and two that overlap", () => {
    const a = { orientation: "h" as const, centre: 100, thickness: 8, from: 60, to: 120 };
    const b = { orientation: "h" as const, centre: 100, thickness: 8, from: 250, to: 310 };
    expect(wallPieces(wall, [b, a])).toEqual([
      { from: 0, to: 60 },
      { from: 120, to: 250 },
      { from: 310, to: 400 },
    ]);
    const overlapping = { orientation: "h" as const, centre: 100, thickness: 8, from: 100, to: 200 };
    expect(wallPieces(wall, [a, overlapping])).toEqual([
      { from: 0, to: 60 },
      { from: 200, to: 400 },
    ]);
  });

  it("returns nothing for a wall that is entirely an opening", () => {
    const all = { orientation: "h" as const, centre: 100, thickness: 8, from: 0, to: 400 };
    expect(wallPieces(wall, [all])).toEqual([]);
  });
});
