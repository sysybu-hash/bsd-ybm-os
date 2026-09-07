import {
  bodyRect,
  bridgeOpenings,
  buildWallBodies,
  closeCorners,
  endGapPatches,
  calibrateFromInterior,
  clipBodiesToBounds,
  extractHatchStrokes,
  HatchField,
  interiorSpans,
  spanArea,
  wallBodiesFromHatch,
  wallBodiesFromSegments,
} from "@/lib/projects/floorplan-solid";
import type { WallRun } from "@/lib/projects/floorplan-rooms";

const run = (orientation: "h" | "v", at: number, from: number, to: number): WallRun => ({
  orientation,
  at,
  from,
  to,
});

describe("pairing wall faces into bodies", () => {
  it("pairs two parallel faces into one wall with the gap as its thickness", () => {
    const bodies = buildWallBodies([run("h", 100, 0, 400), run("h", 112, 0, 400)]);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.centre).toBe(106);
    expect(bodies[0]!.thickness).toBe(12);
  });

  it("spans the union of the two faces, which stop at different places", () => {
    // A door reveal cuts one face short; the wall itself runs the full length.
    const bodies = buildWallBodies([run("v", 50, 0, 300), run("v", 58, 40, 340)]);
    expect(bodies[0]!.from).toBe(0);
    expect(bodies[0]!.to).toBe(340);
  });

  it("does not pair faces too far apart to be one wall", () => {
    // 60 units apart is a room, not a wall thickness.
    const bodies = buildWallBodies([run("h", 100, 0, 400), run("h", 160, 0, 400)]);
    expect(bodies).toHaveLength(2);
  });

  it("does not pair faces that never run alongside each other", () => {
    const bodies = buildWallBodies([run("h", 100, 0, 200), run("h", 108, 600, 800)]);
    expect(bodies).toHaveLength(2);
  });

  it("keeps a single-faced partition rather than losing it", () => {
    // Dropping unpaired faces left holes in the envelope.
    const bodies = buildWallBodies([run("v", 20, 0, 200)]);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.thickness).toBeGreaterThan(0);
  });
});

describe("rejecting what is drawn like a wall but is not one", () => {
  it("drops a grid line that runs past the building at both ends", () => {
    // דירה 14 has two of these a few units apart. Paired, they drew a solid bar
    // down the middle of the flat.
    const walls = [
      run("h", 100, 0, 400),
      run("h", 112, 0, 400),
      run("h", 500, 0, 400),
      run("h", 512, 0, 400),
      run("v", 200, -300, 900),
      run("v", 212, -300, 900),
    ];
    const bodies = buildWallBodies(walls);
    expect(bodies.every((b) => b.orientation === "h")).toBe(true);
  });

  it("keeps a long exterior wall that ends where the other walls do", () => {
    const bodies = buildWallBodies([
      run("h", 100, 0, 400),
      run("h", 112, 0, 400),
      run("h", 500, 0, 400),
      run("h", 512, 0, 400),
      run("v", 0, 100, 512),
      run("v", 12, 100, 512),
    ]);
    expect(bodies.some((b) => b.orientation === "v")).toBe(true);
  });

  it("drops a comb of evenly spaced parallel lines — paving, not partitions", () => {
    // The terrace hatch came back as a set of thin walls slicing it into strips.
    const teeth: WallRun[] = [];
    for (let i = 0; i < 10; i++) teeth.push(run("v", 100 + i * 10, 0, 300));
    const bodies = buildWallBodies([...teeth, run("h", 0, 0, 400), run("h", 12, 0, 400)]);
    expect(bodies.every((b) => b.orientation === "h")).toBe(true);
  });
});

describe("choosing bodies fit to build from", () => {
  const seg = (x1: number, y1: number, x2: number, y2: number) => ({
    x1,
    y1,
    x2,
    y2,
    lineWidth: 14,
  });
  const upm = 44;

  it("drops a short edge sitting on its own line — a counter, not a wall", () => {
    const bodies = wallBodiesFromSegments(
      [
        seg(0, 0, 400, 0),
        seg(0, 12, 400, 12),
        // A 20-unit edge (under half a metre) far from any wall line.
        seg(200, 300, 220, 300),
        seg(200, 308, 220, 308),
      ],
      { unitsPerMetre: upm },
    );
    expect(bodies.every((b) => b.to - b.from > upm * 0.5)).toBe(true);
  });

  it("keeps a short jamb that continues a real wall's line", () => {
    // Cutting on length alone deleted these and the rooms fell open.
    const bodies = wallBodiesFromSegments(
      [
        seg(0, 0, 300, 0),
        seg(0, 12, 300, 12),
        // Same line, resuming after a door: short, but structural.
        seg(340, 0, 370, 0),
        seg(340, 12, 370, 12),
      ],
      { unitsPerMetre: upm },
    );
    expect(bodies.length).toBeGreaterThanOrEqual(2);
  });

  it("returns every body when no scale is known to judge length by", () => {
    const bodies = wallBodiesFromSegments([seg(0, 0, 30, 0), seg(0, 8, 30, 8)]);
    expect(bodies).toHaveLength(1);
  });
});

describe("the rectangle a body covers", () => {
  it("straddles the centre line by half the thickness", () => {
    expect(bodyRect({ orientation: "h", centre: 100, thickness: 10, from: 0, to: 50 })).toEqual({
      x: 0,
      y: 95,
      w: 50,
      h: 10,
    });
    expect(bodyRect({ orientation: "v", centre: 100, thickness: 10, from: 0, to: 50 })).toEqual({
      x: 95,
      y: 0,
      w: 10,
      h: 50,
    });
  });
});

describe("closing the shell so inside can be told from outside", () => {
  const body = (
    orientation: "h" | "v",
    centre: number,
    from: number,
    to: number,
    thickness = 10,
  ) => ({ orientation, centre, from, to, thickness });

  it("bridges a doorway so the wall line is continuous", () => {
    const sealed = bridgeOpenings([body("h", 100, 0, 200), body("h", 100, 290, 500)], 120);
    expect(sealed).toHaveLength(1);
    expect(sealed[0]!.from).toBe(0);
    expect(sealed[0]!.to).toBe(500);
  });

  it("leaves a gap too wide to be an opening alone", () => {
    expect(bridgeOpenings([body("h", 100, 0, 200), body("h", 100, 900, 1100)], 120)).toHaveLength(2);
  });

  it("does not bridge across two different walls that share no line", () => {
    expect(bridgeOpenings([body("h", 100, 0, 200), body("h", 400, 210, 500)], 120)).toHaveLength(2);
  });

  it("extends a wall that stops short of the one it crosses", () => {
    // The east wall ends 8 units shy of the north wall; the flood escapes there.
    const [north, east] = bridgeOpenings(
      closeCorners([body("h", 0, 0, 500), body("v", 300, 8, 400)], 30),
      120,
    ).sort((a, b) => (a.orientation === "h" ? -1 : 1));
    expect(north!.orientation).toBe("h");
    expect(east!.from).toBeLessThanOrEqual(0);
  });

  it("patches the notch where an outline steps and neither end is extended", () => {
    // Neither endpoint lies on the other's line, so closeCorners cannot see it.
    const patches = endGapPatches([body("h", 100, 0, 300), body("v", 340, 130, 600)], 60);
    expect(patches.length).toBeGreaterThan(0);
    const p = patches[0]!;
    expect(p.w).toBeCloseTo(40);
    expect(p.h).toBeCloseTo(30);
  });

  it("does not patch two ends that are nowhere near each other", () => {
    expect(endGapPatches([body("h", 100, 0, 300), body("v", 900, 700, 1200)], 60)).toEqual([]);
  });
});

describe("the floor the walls enclose", () => {
  it("returns the inside of a sealed box and nothing outside it", () => {
    const box = [
      { orientation: "h" as const, centre: 0, from: 0, to: 400, thickness: 10 },
      { orientation: "h" as const, centre: 400, from: 0, to: 400, thickness: 10 },
      { orientation: "v" as const, centre: 0, from: 0, to: 400, thickness: 10 },
      { orientation: "v" as const, centre: 400, from: 0, to: 400, thickness: 10 },
    ];
    const rows = interiorSpans(box, { x: -20, y: -20, width: 440, height: 440 }, { resolution: 4 });
    expect(rows.length).toBeGreaterThan(0);
    const area = rows.reduce((sum, r) => sum + r.spans.reduce((t, [a, b]) => t + (b - a), 0), 0) * 4;
    // The 400x400 box, give or take the raster step.
    expect(area).toBeGreaterThan(150_000);
    expect(area).toBeLessThan(200_000);
  });

  it("finds no floor at all when the shell is open", () => {
    // One wall missing: the flood reaches everywhere and nothing is enclosed.
    const open = [
      { orientation: "h" as const, centre: 0, from: 0, to: 400, thickness: 10 },
      { orientation: "v" as const, centre: 0, from: 0, to: 400, thickness: 10 },
    ];
    const rows = interiorSpans(open, { x: -20, y: -20, width: 440, height: 440 }, {
      resolution: 4,
      maxOpeningUnits: 1,
      cornerReachUnits: 1,
    });
    const area = rows.reduce((sum, r) => sum + r.spans.reduce((t, [a, b]) => t + (b - a), 0), 0);
    expect(area).toBeLessThan(30_000);
  });
});

describe("walls the thickness rules used to throw away", () => {
  const run = (orientation: "h" | "v", at: number, from: number, to: number) => ({
    orientation,
    at,
    from,
    to,
  });

  it("accepts a 45 cm wall when the scale says that is 45 cm", () => {
    // דירה 14's north wall: faces 19.8 units apart at 43.67 units/m. A fixed
    // 18-unit ceiling rejected it, no body was built, and the flood fill escaped
    // through the hole into the living room.
    const bodies = buildWallBodies([run("h", 509.6, 420, 674), run("h", 529.4, 420, 673)], {
      unitsPerMetre: 43.67,
    });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.thickness).toBeCloseTo(19.8, 1);
  });

  it("still refuses a gap too wide to be any wall", () => {
    // 1.4 m apart is a corridor, not a wall.
    const bodies = buildWallBodies([run("h", 100, 0, 400), run("h", 161, 0, 400)], {
      unitsPerMetre: 43.67,
    });
    expect(bodies).toHaveLength(2);
  });

  it("keeps a thick wall that has hatch drawn inside it", () => {
    // The hatch lines pair up into parallel bodies at an even pitch, exactly
    // like terrace paving, and judging on spacing alone deleted the wall too.
    const hatch = [509.6, 516.4, 523.7, 529.4].map((at) => run("h", at, 420, 674));
    const bodies = buildWallBodies(hatch, { unitsPerMetre: 43.67 });
    expect(bodies.length).toBeGreaterThan(0);
  });
});

describe("solving the scale from the shell", () => {
  it("measures a mask's area from its row spans", () => {
    const rows = [
      { y: 0, spans: [[0, 100] as [number, number]] },
      { y: 10, spans: [[0, 100] as [number, number]] },
      { y: 20, spans: [[0, 50] as [number, number], [60, 100] as [number, number]] },
    ];
    // Row pitch is 10, so 100 + 100 + 90 wide over three rows.
    expect(spanArea(rows)).toBe(2900);
  });

  it("has no area to report for an empty mask", () => {
    expect(spanArea([])).toBe(0);
  });

  it("solves the scale that makes the mask the area the sheet prints", () => {
    // דירה 14: the seed put the flat at 207 m² against 132 of flat plus terrace.
    const upm = calibrateFromInterior(43.67, 395_864, 132.19)!;
    expect(upm).toBeGreaterThan(54);
    expect(upm).toBeLessThan(56);
    // And the mask then measures what it was solved against.
    expect(395_864 / (upm * upm)).toBeCloseTo(132.19, 1);
  });

  it("refuses an answer it cannot stand behind", () => {
    expect(calibrateFromInterior(0, 395_864, 132)).toBeNull();
    expect(calibrateFromInterior(43, 0, 132)).toBeNull();
    expect(calibrateFromInterior(43, 395_864, 1)).toBeNull();
    // A mask this small against that area would mean 3 units per metre.
    expect(calibrateFromInterior(43, 900, 132)).toBeNull();
  });
});

describe("finding walls by the hatch that fills them", () => {
  const seg = (x1: number, y1: number, x2: number, y2: number) => ({
    x1,
    y1,
    x2,
    y2,
    lineWidth: 2,
  });
  /** A hatched band: two faces with 45-degree strokes between them. */
  const hatchedWall = (x: number, y: number, length: number, thickness: number) => {
    const out = [seg(x, y, x + length, y), seg(x, y + thickness, x + length, y + thickness)];
    for (let i = 0; i < length; i += 4) {
      out.push(seg(x + i, y + thickness, x + i + thickness, y));
    }
    return out;
  };

  it("takes the 45-degree strokes and leaves the drawing's straight lines", () => {
    const strokes = extractHatchStrokes([
      seg(0, 0, 8, 8),
      seg(0, 0, 100, 0),
      seg(0, 0, 0, 100),
      // A door swing chord is long, not a hatch stroke.
      seg(0, 0, 300, 300),
    ]);
    expect(strokes).toHaveLength(1);
  });

  it("measures how much hatch sits inside a rectangle", () => {
    const field = new HatchField([
      { x: 10, y: 10 },
      { x: 12, y: 12 },
      { x: 500, y: 500 },
    ]);
    expect(field.density({ x: 0, y: 0, w: 30, h: 30 })).toBeGreaterThan(0);
    expect(field.density({ x: 200, y: 200, w: 30, h: 30 })).toBe(0);
  });

  it("finds a hatched band as a wall", () => {
    const bodies = wallBodiesFromHatch(hatchedWall(0, 100, 300, 12), { unitsPerMetre: 55 });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.orientation).toBe("h");
    expect(bodies[0]!.thickness).toBeCloseTo(12, 0);
  });

  it("refuses a counter, which is the same band with no hatch in it", () => {
    // Every length, thickness and parallel-face rule this replaced said yes to
    // this, and the counter run came back as a wall.
    const counter = [seg(0, 100, 300, 100), seg(0, 112, 300, 112)];
    expect(wallBodiesFromHatch(counter, { unitsPerMetre: 55 })).toEqual([]);
  });

  it("refuses terrace paving, which is parallel lines without hatch", () => {
    const paving = [];
    for (let i = 0; i < 8; i++) paving.push(seg(0, 100 + i * 12, 300, 100 + i * 12));
    expect(wallBodiesFromHatch(paving, { unitsPerMetre: 55 })).toEqual([]);
  });

  it("joins the two pieces a doorway leaves in one wall", () => {
    // Both faces stop at the reveal, so the pair spans only where both span and
    // the reconstruction came back dashed.
    const left = hatchedWall(0, 100, 200, 12);
    const right = hatchedWall(250, 100, 200, 12);
    const bodies = wallBodiesFromHatch([...left, ...right], { unitsPerMetre: 55 });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.to - bodies[0]!.from).toBeGreaterThan(400);
  });

  it("says nothing at all about a sheet with no hatch to read", () => {
    expect(wallBodiesFromHatch([seg(0, 0, 100, 0)], { unitsPerMetre: 55 })).toEqual([]);
  });
});

describe("keeping the bodies that are inside the drawing", () => {
  const body = (x: number, y: number) => ({
    orientation: "h" as const,
    centre: y,
    thickness: 10,
    from: x,
    to: x + 100,
  });

  it("drops a stray found in the title block", () => {
    // One stray at the far corner stretched the bounding box enough to throw the
    // scale off by a third and shrink the floor to 64 m².
    const kept = clipBodiesToBounds([body(100, 200), body(2000, 3000)], {
      x: 0,
      y: 0,
      width: 700,
      height: 1400,
    });
    expect(kept).toHaveLength(1);
    expect(kept[0]!.from).toBe(100);
  });

  it("keeps a wall that sits just on the boundary", () => {
    const kept = clipBodiesToBounds([body(0, 5)], { x: 2, y: 2, width: 200, height: 200 });
    expect(kept).toHaveLength(1);
  });
});
