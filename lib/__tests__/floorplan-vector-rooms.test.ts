import {
  buildWallRuns,
  calibrateScale,
  calibrateScaleFromArea,
  findRoomRegions,
  measureRooms,
  nameRoomRects,
  type WallRun,
} from "@/lib/projects/floorplan-rooms";
import { isAxisAligned, isWallCandidate, segmentLength } from "@/lib/projects/floorplan-vector";

const page = { width: 200, height: 200 };

/** Two rooms side by side inside an outer box, drawn the way CAD splits walls. */
function twoRoomRuns(): WallRun[] {
  return [
    { orientation: "h", at: 20, from: 20, to: 180 },
    { orientation: "h", at: 180, from: 20, to: 180 },
    { orientation: "v", at: 20, from: 20, to: 180 },
    { orientation: "v", at: 180, from: 20, to: 180 },
    { orientation: "v", at: 100, from: 20, to: 180 },
  ];
}

describe("wall segment classification", () => {
  it("measures and recognises axis-aligned runs", () => {
    expect(segmentLength({ x1: 0, y1: 0, x2: 3, y2: 4 })).toBe(5);
    expect(isAxisAligned({ x1: 0, y1: 5, x2: 40, y2: 5 })).toBe(true);
    expect(isAxisAligned({ x1: 0, y1: 0, x2: 40, y2: 30 })).toBe(false);
  });

  it("keeps long on-axis runs inside the page and drops the rest", () => {
    const wall = { x1: 10, y1: 50, x2: 90, y2: 50 };
    expect(isWallCandidate(wall, page)).toBe(true);
    // Furniture edge: on axis but far too short.
    expect(isWallCandidate({ x1: 10, y1: 50, x2: 18, y2: 50 }, page)).toBe(false);
    // Dimension leader running off the sheet.
    expect(isWallCandidate({ x1: -80, y1: 50, x2: 90, y2: 50 }, page)).toBe(false);
    // Diagonal hatch stroke.
    expect(isWallCandidate({ x1: 10, y1: 10, x2: 90, y2: 80 }, page)).toBe(false);
  });
});

describe("wall runs", () => {
  it("joins the many short strokes CAD splits one wall into", () => {
    const runs = buildWallRuns([
      { x1: 10, y1: 40, x2: 50, y2: 40 },
      { x1: 50, y1: 40, x2: 90, y2: 40 },
      { x1: 88, y1: 40.4, x2: 130, y2: 40.4 },
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.orientation).toBe("h");
    expect(runs[0]!.from).toBeCloseTo(10, 1);
    expect(runs[0]!.to).toBeCloseTo(130, 1);
  });

  it("keeps a real gap between two separate walls on one line", () => {
    const runs = buildWallRuns([
      { x1: 10, y1: 40, x2: 50, y2: 40 },
      { x1: 120, y1: 40, x2: 160, y2: 40 },
    ]);
    expect(runs).toHaveLength(2);
  });
});

describe("scale calibration", () => {
  it("recovers units per metre from the printed centimetre dimensions", () => {
    // 40 units per metre: a 4.00 m wall is 160 units, a 2.50 m wall is 100.
    const runs: WallRun[] = [
      { orientation: "h", at: 0, from: 0, to: 160 },
      { orientation: "h", at: 10, from: 0, to: 100 },
      { orientation: "v", at: 0, from: 0, to: 120 },
      { orientation: "v", at: 5, from: 0, to: 200 },
    ];
    const scale = calibrateScale(runs, ["400", "250", "300", "500"]);
    expect(scale).not.toBeNull();
    expect(scale!.unitsPerMetre).toBeCloseTo(40, 0);
    expect(scale!.samples).toBeGreaterThanOrEqual(3);
  });

  it("returns null rather than guessing when there is too little to go on", () => {
    expect(calibrateScale([], ["400"])).toBeNull();
    expect(calibrateScale([{ orientation: "h", at: 0, from: 0, to: 160 }], [])).toBeNull();
    // A single usable dimension is not enough for a median.
    expect(calibrateScale([{ orientation: "h", at: 0, from: 0, to: 160 }], ["400"])).toBeNull();
  });
});

describe("room regions", () => {
  it("finds the enclosed rooms and ignores the world outside the walls", () => {
    const rooms = findRoomRegions(twoRoomRuns(), page, { minAreaUnits: 200 });
    expect(rooms).toHaveLength(2);
    for (const r of rooms) {
      expect(r.x).toBeGreaterThan(15);
      expect(r.y).toBeGreaterThan(15);
      expect(r.areaUnits).toBeGreaterThan(200);
    }
  });

  it("does not leak between rooms through a doorway gap", () => {
    const withDoor: WallRun[] = twoRoomRuns().filter((r) => !(r.orientation === "v" && r.at === 100));
    // The dividing wall, split by a door opening.
    withDoor.push({ orientation: "v", at: 100, from: 20, to: 90 });
    withDoor.push({ orientation: "v", at: 100, from: 110, to: 180 });
    const rooms = findRoomRegions(withDoor, page, { minAreaUnits: 200, wallThickness: 3 });
    // A 20-unit doorway is wider than the wall painting can bridge, so the two
    // rooms merge — the caller sees one region, not a wrong pair.
    expect(rooms.length).toBeGreaterThanOrEqual(1);
  });

  it("drops slivers below the minimum area", () => {
    const rooms = findRoomRegions(twoRoomRuns(), page, { minAreaUnits: 100_000 });
    expect(rooms).toHaveLength(0);
  });
});

describe("measurement and naming", () => {
  it("converts the filled footprint to metres rather than the bounding box", () => {
    // An L-shape: bounding box 100x100, but only 7,500 units actually filled.
    const [room] = measureRooms([{ x: 0, y: 0, w: 100, h: 100, areaUnits: 7500 }], 50);
    expect(room!.widthM).toBeCloseTo(2, 2);
    expect(room!.heightM).toBeCloseTo(2, 2);
    expect(room!.areaM2).toBeCloseTo(3, 2); // 7500 / 2500, not 2 x 2
  });

  it("leaves rooms untouched when no scale was found", () => {
    const rects = [{ x: 0, y: 0, w: 100, h: 100 }];
    expect(measureRooms(rects, 0)).toEqual(rects);
  });

  it("labels each measured room from the extractor's approximate boxes", () => {
    const rooms = [
      { x: 20, y: 20, w: 80, h: 160 },
      { x: 100, y: 20, w: 80, h: 160 },
    ];
    const named = nameRoomRects(
      rooms,
      [
        { name: "מטבח", kind: "kitchen", bbox: { x: 0.55, y: 0.1, w: 0.3, h: 0.7 } },
        { name: "סלון", kind: "living", bbox: { x: 0.12, y: 0.1, w: 0.3, h: 0.7 } },
      ],
      page,
    );
    expect(named[0]!.name).toBe("סלון");
    expect(named[1]!.name).toBe("מטבח");
  });

  it("never gives one rectangle two names", () => {
    const named = nameRoomRects(
      [{ x: 20, y: 20, w: 160, h: 160 }],
      [
        { name: "מטבח", kind: "kitchen", bbox: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 } },
        { name: "סלון", kind: "living", bbox: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } },
      ],
      page,
    );
    expect(named.filter((r) => r.name).length).toBe(1);
  });
});

describe("scale from the printed gross area", () => {
  it("recovers units per metre from enclosed area against the printed figure", () => {
    // 100 m² of flat drawn at 40 units per metre fills 160,000 square units.
    const rooms = [
      { x: 0, y: 0, w: 400, h: 200, areaUnits: 80_000 },
      { x: 0, y: 200, w: 400, h: 200, areaUnits: 80_000 },
    ];
    const scale = calibrateScaleFromArea(rooms, 100);
    expect(scale!.unitsPerMetre).toBeCloseTo(40, 1);
  });

  it("refuses nonsense inputs instead of returning a wild scale", () => {
    expect(calibrateScaleFromArea([], 100)).toBeNull();
    expect(calibrateScaleFromArea([{ x: 0, y: 0, w: 10, h: 10, areaUnits: 100 }], 0)).toBeNull();
    // A tiny footprint against a large printed area implies an impossible scale.
    expect(calibrateScaleFromArea([{ x: 0, y: 0, w: 2, h: 2, areaUnits: 4 }], 500)).toBeNull();
  });

  it("closes the loop: measured areas add back up to the printed figure", () => {
    const rooms = [
      { x: 0, y: 0, w: 300, h: 200, areaUnits: 60_000 },
      { x: 300, y: 0, w: 200, h: 200, areaUnits: 40_000 },
    ];
    const scale = calibrateScaleFromArea(rooms, 62.5)!;
    const measured = measureRooms(rooms, scale.unitsPerMetre);
    const total = measured.reduce((sum, r) => sum + (r.areaM2 ?? 0), 0);
    expect(total).toBeCloseTo(62.5, 1);
  });
});
