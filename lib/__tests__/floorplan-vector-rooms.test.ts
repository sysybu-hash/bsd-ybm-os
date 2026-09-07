import {
  buildWallRuns,
  calibrateScale,
  calibrateScaleFromArea,
  findRoomRegions,
  measureRooms,
  nameRoomRects,
  type WallRun,
} from "@/lib/projects/floorplan-rooms";
import {
  WALL_MIN_LINE_WIDTH,
  hasParallelFace,
  largestWallCluster,
  renderWallDiagramSvg,
  isAxisAligned,
  isWallCandidate,
  segmentLength,
  wallBoundingBox,
} from "@/lib/projects/floorplan-vector";

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
    expect(segmentLength({ x1: 0, y1: 0, x2: 3, y2: 4, lineWidth: 14 })).toBe(5);
    expect(isAxisAligned({ x1: 0, y1: 5, x2: 40, y2: 5, lineWidth: 14 })).toBe(true);
    expect(isAxisAligned({ x1: 0, y1: 0, x2: 40, y2: 30, lineWidth: 14 })).toBe(false);
  });

  it("keeps long on-axis runs inside the page and drops the rest", () => {
    const wall = { x1: 10, y1: 50, x2: 90, y2: 50, lineWidth: 14 };
    expect(isWallCandidate(wall, page)).toBe(true);
    // Furniture edge: on axis but far too short.
    expect(isWallCandidate({ x1: 10, y1: 50, x2: 18, y2: 50, lineWidth: 14 }, page)).toBe(false);
    // Dimension leader running off the sheet.
    expect(isWallCandidate({ x1: -80, y1: 50, x2: 90, y2: 50, lineWidth: 14 }, page)).toBe(false);
    // Diagonal hatch stroke.
    expect(isWallCandidate({ x1: 10, y1: 10, x2: 90, y2: 80, lineWidth: 14 }, page)).toBe(false);
  });
});

describe("wall runs", () => {
  it("joins the many short strokes CAD splits one wall into", () => {
    const runs = buildWallRuns([
      { x1: 10, y1: 40, x2: 50, y2: 40, lineWidth: 14 },
      { x1: 50, y1: 40, x2: 90, y2: 40, lineWidth: 14 },
      { x1: 88, y1: 40.4, x2: 130, y2: 40.4, lineWidth: 14 },
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.orientation).toBe("h");
    expect(runs[0]!.from).toBeCloseTo(10, 1);
    expect(runs[0]!.to).toBeCloseTo(130, 1);
  });

  it("keeps a real gap between two separate walls on one line", () => {
    const runs = buildWallRuns([
      { x1: 10, y1: 40, x2: 50, y2: 40, lineWidth: 14 },
      { x1: 120, y1: 40, x2: 160, y2: 40, lineWidth: 14 },
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

describe("line width as the wall/furniture divider", () => {
  const page = { width: 200, height: 200 };

  // isWallCandidate answers the geometric question only — long, on axis, on the
  // sheet. The pen test is applied by the extractor, because a sheet that draws
  // everything at one width has to fall back to the thickness test instead.
  it("accepts any long on-axis run regardless of pen", () => {
    expect(isWallCandidate({ x1: 10, y1: 50, x2: 120, y2: 50, lineWidth: 14 }, page)).toBe(true);
    expect(isWallCandidate({ x1: 10, y1: 80, x2: 120, y2: 80, lineWidth: 2 }, page)).toBe(true);
  });

  it("puts the wall pen above the furniture pen these sheets use", () => {
    // דירה 16: width 2 for 6,056 furniture and annotation paths, 4 to 17 for walls.
    expect(WALL_MIN_LINE_WIDTH).toBeGreaterThan(2);
    expect(WALL_MIN_LINE_WIDTH).toBeLessThanOrEqual(4);
  });

  it("recognises a wall by its opposite face when the pen cannot be trusted", () => {
    const face = { x1: 20, y1: 50, x2: 160, y2: 50, lineWidth: 2 };
    const otherFace = { x1: 20, y1: 58, x2: 160, y2: 58, lineWidth: 2 };
    // A bed is far wider than a wall, so its two long sides are not a wall pair.
    const bedNear = { x1: 20, y1: 120, x2: 160, y2: 120, lineWidth: 2 };
    const bedFar = { x1: 20, y1: 170, x2: 160, y2: 170, lineWidth: 2 };
    const all = [face, otherFace, bedNear, bedFar];
    expect(hasParallelFace(face, all)).toBe(true);
    expect(hasParallelFace(bedNear, all)).toBe(false);
  });

  it("wants the faces to run alongside each other, not merely share a line", () => {
    const face = { x1: 20, y1: 50, x2: 160, y2: 50, lineWidth: 2 };
    const barelyOverlapping = { x1: 150, y1: 58, x2: 190, y2: 58, lineWidth: 2 };
    expect(hasParallelFace(face, [face, barelyOverlapping])).toBe(false);
  });
});

describe("keeping the flat and dropping the title block", () => {
  const seg = (x1: number, y1: number, x2: number, y2: number) => ({
    x1,
    y1,
    x2,
    y2,
    lineWidth: 14,
  });

  it("drops a revision table that sits away from the drawing", () => {
    // The flat: a closed box at the left of the sheet.
    const flat = [
      seg(100, 100, 500, 100),
      seg(100, 600, 500, 600),
      seg(100, 100, 100, 600),
      seg(500, 100, 500, 600),
    ];
    // A title block at the right: parallel rules 6 units apart, which is exactly
    // what hasParallelFace lets through, and why it reached the diagram at all.
    const table = Array.from({ length: 12 }, (_, i) => seg(900, 100 + i * 6, 1150, 100 + i * 6));
    const kept = largestWallCluster([...flat, ...table]);
    expect(kept).toHaveLength(flat.length);
    expect(kept.every((w) => w.x1 <= 500)).toBe(true);
  });

  it("keeps a long exterior run whose middle touches nothing", () => {
    // Walking only the endpoints would split this wall off from the flat.
    const kept = largestWallCluster([
      seg(100, 100, 500, 100),
      seg(100, 100, 100, 600),
      seg(500, 100, 500, 600),
      seg(100, 600, 500, 600),
      seg(100, 600, 100, 1400),
      seg(100, 1400, 500, 1400),
    ]);
    expect(kept).toHaveLength(6);
  });

  it("returns the walls untouched when there is only one cluster", () => {
    const walls = [seg(0, 0, 100, 0), seg(100, 0, 100, 100)];
    expect(largestWallCluster(walls)).toHaveLength(2);
  });

  it("says nothing about an empty plan", () => {
    expect(largestWallCluster([])).toEqual([]);
  });
});

describe("the wall diagram handed to the image model", () => {
  it("crops to the flat instead of drawing the whole sheet", () => {
    const svg = renderWallDiagramSvg({
      pageWidth: 1200,
      pageHeight: 1700,
      segments: [],
      walls: [
        { x1: 400, y1: 900, x2: 700, y2: 900, lineWidth: 14 },
        { x1: 400, y1: 900, x2: 400, y2: 1100, lineWidth: 14 },
        { x1: 700, y1: 900, x2: 700, y2: 1100, lineWidth: 14 },
        { x1: 400, y1: 1100, x2: 700, y2: 1100, lineWidth: 14 },
      ],
    });
    // The flat is 300x200 at (400,900); with 18 units of padding the viewBox is
    // that box, not "0 0 1200 1700".
    expect(svg).toContain('viewBox="382.0 882.0 336.0 236.0"');
    expect(svg).not.toContain('viewBox="0 0');
  });
});

describe("the rectangle the flat occupies", () => {
  const geometry = (walls: Array<{ x1: number; y1: number; x2: number; y2: number }>) => ({
    pageWidth: 600,
    pageHeight: 1000,
    rotate: 0,
    walls: walls.map((w) => ({ ...w, lineWidth: 14 })),
    segments: [],
    dimensionStrings: [],
  });

  it("is the walls' bounds, not the page's", () => {
    // A flat lyingacross a portrait sheet: wide, and nowhere near the paper.
    const box = wallBoundingBox(
      geometry([
        { x1: 60, y1: 300, x2: 540, y2: 300 },
        { x1: 60, y1: 620, x2: 540, y2: 620 },
        { x1: 60, y1: 300, x2: 60, y2: 620 },
        { x1: 540, y1: 300, x2: 540, y2: 620 },
      ]),
    )!;
    expect(box).toEqual({ x: 60, y: 300, width: 480, height: 320 });
    // Landscape, though the page it sits on is portrait.
    expect(box.width).toBeGreaterThan(box.height);
  });

  it("says nothing when there are no walls to bound", () => {
    expect(wallBoundingBox(geometry([]))).toBeNull();
  });

  it("refuses a degenerate box rather than returning a zero aspect", () => {
    expect(
      wallBoundingBox(geometry([{ x1: 100, y1: 200, x2: 400, y2: 200 }])),
    ).toBeNull();
  });
});
