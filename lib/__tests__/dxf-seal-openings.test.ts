import { layerKind, GENERIC_CAD_PROFILE } from "@/lib/projects/building/cad-layers";
import { doorMarksOnWalls, sealDxfWallsForFlood } from "@/lib/projects/dxf-seal-openings";
import { markedOpeningBridges, type WallBody } from "@/lib/projects/floorplan-solid";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

describe("opening seals before the flood", () => {
  it("reads Weinberg layer names as walls, doors and windows", () => {
    expect(layerKind(GENERIC_CAD_PROFILE, "a-wl")).toBe("wall-int");
    expect(layerKind(GENERIC_CAD_PROFILE, "00-dor")).toBe("door");
    expect(layerKind(GENERIC_CAD_PROFILE, "00-win")).toBe("window");
    expect(layerKind(GENERIC_CAD_PROFILE, "a-ht")).toBeNull();
  });

  it("closes a wide gap only when a window block stands in it", () => {
    const bodies: WallBody[] = [
      { orientation: "h", centre: 0, thickness: 20, from: 0, to: 100 },
      { orientation: "h", centre: 0, thickness: 20, from: 300, to: 500 },
    ];
    expect(markedOpeningBridges(bodies, [], 320, 120)).toHaveLength(0);
    const bridged = markedOpeningBridges(bodies, [{ x: 200, y: 0 }], 320, 120);
    expect(bridged).toHaveLength(1);
    expect(bridged[0]).toMatchObject({ from: 100, to: 300 });
  });

  it("seals a door-width gap and leaves a passage with no block", () => {
    const seg = (x1: number, y1: number, x2: number, y2: number): VectorSegment => ({
      x1, y1, x2, y2, lineWidth: 1,
    });
    // Two faces, 20 cm apart, with an 80 cm door and a 2 m passage.
    const walls = [
      seg(0, 0, 100, 0),
      seg(0, 20, 100, 20),
      seg(180, 0, 400, 0),
      seg(180, 20, 400, 20),
      seg(600, 0, 900, 0),
      seg(600, 20, 900, 20),
    ];
    const seal = sealDxfWallsForFlood(walls, [], [], 100);
    const doors = seal.bridges.filter((b) => b.reason === "door");
    expect(doors.some((b) => b.from >= 90 && b.to <= 190)).toBe(true);
    expect(seal.bridges.some((b) => b.from >= 390 && b.to <= 610)).toBe(false);
    expect(seal.openGaps.some((g) => g.to - g.from > 150)).toBe(true);

    const glazed = sealDxfWallsForFlood(walls, [seg(420, 10, 560, 10)], [], 100);
    expect(glazed.bridges.some((b) => b.reason === "glazing" && b.from >= 390 && b.to <= 610)).toBe(true);
  });

  it("cuts a door-width opening where door ticks sit on an unbroken wall", () => {
    const seg = (x1: number, y1: number, x2: number, y2: number): VectorSegment => ({
      x1, y1, x2, y2, lineWidth: 3,
    });
    const units = 100;
    const walls = [seg(0, 0, 500, 0), seg(0, 20, 500, 20)];
    const ticks = [seg(160, 0, 160, 10), seg(240, 0, 240, 10)];
    const marks = doorMarksOnWalls(ticks, walls, units);
    expect(marks).toHaveLength(1);
    expect(marks[0]!.width).toBeCloseTo(80, 0);
    const seal = sealDxfWallsForFlood(walls, [], marks, units);
    expect(seal.bridges.some((bridge) => bridge.reason === "door" && bridge.from < 200 && bridge.to > 200)).toBe(true);
  });
});
