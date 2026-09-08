import {
  bodyRect,
  bridgeOpenings,
  buildWallBodies,
  closeCorners,
  endGapPatches,
  calibrateFromInterior,
  clipBodiesToBounds,
  extractHatchStrokes,
  findOpenings,
  footprintByScanFill,
  HatchField,
  interiorComponents,
  interiorSpans,
  openingRect,
  pickComponentByArea,
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

describe("how the hatch is measured", () => {
  it("counts strokes on a fine grid, so a band cannot borrow its neighbour's", () => {
    // At a coarse cell an empty patch of floor beside a wall measured as much
    // hatch as a real thin partition.
    const field = new HatchField([{ x: 100, y: 100 }, { x: 101, y: 101 }]);
    expect(field.count({ x: 96, y: 96, w: 10, h: 10 })).toBe(2);
    expect(field.count({ x: 140, y: 140, w: 10, h: 10 })).toBe(0);
  });

  it("offers hatch per unit length as well as per unit area", () => {
    const field = new HatchField([{ x: 10, y: 10 }, { x: 12, y: 10 }]);
    const band = { x: 0, y: 8, w: 100, h: 6 };
    expect(field.density(band)).toBeGreaterThan(0);
    expect(field.perLength(band)).toBeCloseTo(2, 1);
  });
});

describe("bridging groups walls by their own line, not by a chain", () => {
  const body = (centre: number, from: number, to: number, thickness = 6) => ({
    orientation: "h" as const,
    centre,
    thickness,
    from,
    to,
  });

  it("does not chain across a run of nearby lines", () => {
    // Bodies at 1140, 1150, 1160, 1172 joined hand to hand into one group far
    // wider than any wall, and the merged body took the first member's centre —
    // so a real 2.17 m bathroom partition disappeared into a wall 30 cm away.
    const merged = bridgeOpenings(
      [body(1140, 0, 100), body(1150, 0, 100), body(1160, 0, 100), body(1172, 366, 502)],
      120,
    );
    expect(merged.some((b) => Math.abs(b.centre - 1172) < 4)).toBe(true);
  });

  it("still joins two pieces of one wall on the same line", () => {
    const merged = bridgeOpenings([body(100, 0, 200), body(101, 250, 500)], 120);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.to).toBe(500);
  });

  it("keeps two walls a room apart separate", () => {
    expect(bridgeOpenings([body(100, 0, 200), body(400, 0, 200)], 120)).toHaveLength(2);
  });
});

describe("telling one flat from what is drawn beside it", () => {
  const wall = (
    orientation: "h" | "v",
    centre: number,
    from: number,
    to: number,
    thickness: number,
  ) => ({ orientation, centre, from, to, thickness });

  /** Two boxes side by side, divided by a thick party wall. */
  const twoFlats = [
    wall("h", 0, 0, 800, 20),
    wall("h", 400, 0, 800, 20),
    wall("v", 0, 0, 400, 20),
    wall("v", 800, 0, 400, 20),
    wall("v", 400, 0, 400, 20),
  ];

  it("finds the enclosed regions of a sheet separately", () => {
    const components = interiorComponents(
      twoFlats,
      { x: -40, y: -40, width: 880, height: 480 },
      { resolution: 4, barrierThicknessUnits: 15 },
    );
    expect(components.length).toBeGreaterThanOrEqual(2);
  });

  it("picks the region whose area matches what the sheet prints", () => {
    const components = interiorComponents(
      twoFlats,
      { x: -40, y: -40, width: 880, height: 480 },
      { resolution: 4, barrierThicknessUnits: 15 },
    );
    // Each half is about 380x380 units; at 40 units/m that is roughly 90 m².
    const picked = pickComponentByArea(components, 40, 90);
    expect(picked).not.toBeNull();
    expect(spanArea(picked!) / 1600).toBeGreaterThan(50);
  });

  it("has nothing to pick from an empty sheet", () => {
    expect(pickComponentByArea([], 40, 90)).toBeNull();
  });

  it("counts thin partitions as floor so a flat does not fall into rooms", () => {
    // Leaving every wall out fragmented the flat into 37 rooms, since a room is
    // exactly what a wall encloses.
    const withPartition = [...twoFlats, wall("h", 200, 20, 380, 6)];
    const components = interiorComponents(
      withPartition,
      { x: -40, y: -40, width: 880, height: 480 },
      { resolution: 4, barrierThicknessUnits: 15 },
    );
    const left = components.filter((c) => c[0]!.spans[0]![0] < 400);
    expect(left.length).toBe(1);
  });
});

describe("hatch has to run all the way across a wall", () => {
  const seg = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2, lineWidth: 2 });
  const face = (y: number, from: number, to: number) => seg(from, y, to, y);
  const hatchBetween = (y0: number, y1: number, from: number, to: number) => {
    const out = [];
    for (let x = from; x < to; x += 4) out.push(seg(x, y1, x + (y1 - y0), y0));
    return out;
  };

  it("accepts a band whose hatch fills it face to face", () => {
    const wall = [face(100, 0, 300), face(112, 0, 300), ...hatchBetween(100, 112, 0, 300)];
    expect(wall.length).toBeGreaterThan(2);
    expect(wallBodiesFromHatch(wall, { unitsPerMetre: 55 })).toHaveLength(1);
  });

  it("refuses a pair made of two different walls with room between them", () => {
    // Hatch at both ends, bare floor in the middle: the mean looked fine and
    // thirty of דירה 14's walls came out 40 to 55 cm thick.
    const twoWalls = [
      face(100, 0, 300),
      face(110, 0, 300),
      ...hatchBetween(100, 110, 0, 300),
      face(140, 0, 300),
      face(150, 0, 300),
      ...hatchBetween(140, 150, 0, 300),
    ];
    const bodies = wallBodiesFromHatch(twoWalls, { unitsPerMetre: 55 });
    // Two walls, not one 50 cm slab spanning both.
    expect(bodies.every((b) => b.thickness < 20)).toBe(true);
  });
});

describe("two walls stacked one above the other are two walls", () => {
  const seg = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2, lineWidth: 2 });
  /**
   * A hatched band. Strokes are short and staggered across the thickness, the
   * way CAD draws them — a stroke spanning a thick wall corner to corner is
   * longer than a hatch stroke ever is, and extractHatchStrokes rejects it.
   */
  const hatched = (y0: number, y1: number, from: number, to: number) => {
    const out = [seg(from, y0, to, y0), seg(from, y1, to, y1)];
    const thickness = y1 - y0;
    const step = 3;
    for (let x = from; x < to; x += step) {
      for (let k = 0; k < 3; k++) {
        const y = y0 + (thickness / 3) * k;
        out.push(seg(x, y + thickness / 3, x + thickness / 3, y));
      }
    }
    return out;
  };

  it("keeps both when one sits directly above the other", () => {
    // דירה 14's top-right wall sits 24 units from the one above it, each about
    // 20 to 28 thick. The old duplicate test — centres within the sum of half
    // thicknesses — is satisfied by any two stacked walls, so the thicker one
    // deleted the thinner and 190 hatch strokes went uncovered at the step in
    // the outline.
    const stacked = [...hatched(480, 508, 420, 762), ...hatched(510, 530, 420, 762)];
    const bodies = wallBodiesFromHatch(stacked, { unitsPerMetre: 56 });
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    expect(bodies.some((b) => Math.abs(b.centre - 520) < 6)).toBe(true);
  });

  it("still collapses one wall found twice", () => {
    // A reveal line inside a wall yields a second, tighter band on the same
    // centre; that is a duplicate and only one should survive.
    const wall = hatched(500, 524, 100, 500);
    const bodies = wallBodiesFromHatch(wall, { unitsPerMetre: 56 });
    const onSameCentre = bodies.filter((b) => Math.abs(b.centre - 512) < 8);
    expect(onSameCentre.length).toBeLessThanOrEqual(1);
  });
});

describe("the doorways, taken from the gaps between wall pieces", () => {
  const piece = (centre: number, from: number, to: number, thickness = 10) => ({
    orientation: "h" as const,
    centre,
    thickness,
    from,
    to,
  });

  it("finds the gap between two pieces of one wall", () => {
    const openings = findOpenings([piece(100, 0, 200), piece(100, 290, 500)], 200, 40);
    expect(openings).toHaveLength(1);
    expect(openings[0]!.from).toBe(200);
    expect(openings[0]!.to).toBe(290);
  });

  it("ignores a joint too narrow to be a door", () => {
    // דירה 14 has nineteen of these, 5 to 40 cm, against five real openings.
    expect(findOpenings([piece(100, 0, 200), piece(100, 210, 500)], 200, 40)).toEqual([]);
  });

  it("ignores a gap too wide to be an opening", () => {
    expect(findOpenings([piece(100, 0, 200), piece(100, 900, 1100)], 200, 40)).toEqual([]);
  });

  it("does not read a gap between two different walls as a door", () => {
    expect(findOpenings([piece(100, 0, 200), piece(400, 290, 500)], 200, 40)).toEqual([]);
  });

  it("gives the opening the thickness of the wall it sits in", () => {
    const openings = findOpenings([piece(100, 0, 200, 14), piece(100, 290, 500, 14)], 200, 40);
    expect(openings[0]!.thickness).toBe(14);
    expect(openingRect(openings[0]!)).toEqual({ x: 200, y: 93, w: 90, h: 14 });
  });
});

describe("the footprint, taken from the walls rather than by flooding", () => {
  const wall = (
    orientation: "h" | "v",
    centre: number,
    from: number,
    to: number,
    thickness = 10,
  ) => ({ orientation, centre, from, to, thickness });

  it("fills a closed box", () => {
    const box = [
      wall("h", 0, 0, 400),
      wall("h", 400, 0, 400),
      wall("v", 0, 0, 400),
      wall("v", 400, 0, 400),
    ];
    const rows = footprintByScanFill(box, { x: -20, y: -20, width: 440, height: 440 }, {
      resolution: 4,
    });
    const area = spanArea(rows);
    expect(area).toBeGreaterThan(140_000);
    expect(area).toBeLessThan(200_000);
  });

  it("fills a box with a door in it, which a flood cannot", () => {
    // Every room has a door and a door is a gap, so the hatch never closes
    // around anything: rasterised as barriers it encloses 0.0 m².
    const withDoor = [
      wall("h", 0, 0, 400),
      wall("h", 400, 0, 150),
      wall("h", 400, 250, 400),
      wall("v", 0, 0, 400),
      wall("v", 400, 0, 400),
    ];
    expect(spanArea(footprintByScanFill(withDoor, { x: -20, y: -20, width: 440, height: 440 }, {
      resolution: 4,
    }))).toBeGreaterThan(140_000);
  });

  it("keeps a step in the outline, which one axis alone squares off", () => {
    // An L: rows alone square off the notch, columns alone square off the other
    // one, and the intersection keeps the step.
    const ell = [
      wall("h", 0, 0, 400),
      wall("v", 0, 0, 400),
      wall("h", 400, 0, 200),
      wall("v", 200, 200, 400),
      wall("h", 200, 200, 400),
      wall("v", 400, 0, 200),
    ];
    const rows = footprintByScanFill(ell, { x: -20, y: -20, width: 440, height: 440 }, {
      resolution: 4,
    });
    const full = 400 * 400;
    // An L is about three quarters of its bounding box, not all of it.
    expect(spanArea(rows)).toBeLessThan(full * 0.95);
    expect(spanArea(rows)).toBeGreaterThan(full * 0.5);
  });

  it("has no footprint without walls", () => {
    expect(footprintByScanFill([], { x: 0, y: 0, width: 100, height: 100 })).toEqual([]);
  });
});
