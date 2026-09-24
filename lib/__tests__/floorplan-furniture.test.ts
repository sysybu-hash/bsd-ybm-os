import {
  classifyPiece,
  dedupeRectangles,
  dropNested,
  findCurveFixtures,
  findKitchenFittings,
  findRectangles,
  looksLikeKitchenIsland,
  findSeatsAroundTable,
  scaleFromBeds,
  settleFixtures,
  settleTables,
} from "@/lib/projects/floorplan-furniture";

const UPM = 54.7;
const box = (x: number, y: number, w: number, h: number) => [
  { x1: x, y1: y, x2: x + w, y2: y, lineWidth: 2 },
  { x1: x, y1: y + h, x2: x + w, y2: y + h, lineWidth: 2 },
  { x1: x, y1: y, x2: x, y2: y + h, lineWidth: 2 },
  { x1: x + w, y1: y, x2: x + w, y2: y + h, lineWidth: 2 },
];

describe("reading furniture off the sheet", () => {
  it("finds a closed rectangle", () => {
    const rects = findRectangles(box(100, 100, 51, 119), { unitsPerMetre: UPM });
    expect(rects).toHaveLength(1);
    expect(rects[0]!.w).toBeCloseTo(51);
  });

  it("ignores three sides — a hatch line is not a wardrobe", () => {
    const open = box(100, 100, 51, 119).slice(0, 3);
    expect(findRectangles(open, { unitsPerMetre: UPM })).toEqual([]);
  });

  it("ignores two edges that merely line up in different places", () => {
    const apart = [
      { x1: 0, y1: 100, x2: 50, y2: 100, lineWidth: 2 },
      { x1: 400, y1: 160, x2: 450, y2: 160, lineWidth: 2 },
    ];
    expect(findRectangles(apart, { unitsPerMetre: UPM })).toEqual([]);
  });
});

describe("naming a piece by its size", () => {
  it("calls 93 by 218 cm a single bed, either way round", () => {
    expect(classifyPiece(93, 218)).toBe("bed");
    expect(classifyPiece(218, 93)).toBe("bed");
  });

  it("calls a shallow long run storage — a wardrobe or a kitchen line", () => {
    expect(classifyPiece(220, 37)).toBe("storage");
    expect(classifyPiece(104, 36)).toBe("storage");
  });

  it("calls 73 by 156 cm a fixture, which is a bath", () => {
    expect(classifyPiece(73, 156)).toBe("fixture");
    expect(classifyPiece(62, 62)).toBe("fixture");
  });

  it("calls a bath drawn at its inner rim a fixture", () => {
    // דירה 14's bath measures 64 by 137; at a 140 floor its bathroom was a corridor.
    expect(classifyPiece(64, 137)).toBe("fixture");
  });

  it("calls an 80 cm square a shower tray, not unknown", () => {
    // Shower-only wet rooms were falling to circulation because the tray
    // never became a fixture and settleFixtures then had nothing to keep.
    expect(classifyPiece(80, 80)).toBe("fixture");
    expect(classifyPiece(90, 90)).toBe("fixture");
  });

  it("leaves a size it does not recognise unknown rather than guessing", () => {
    // A bed invented in the wrong place is the failure this pipeline is built
    // to stop; an unnamed block in the right place is honest.
    expect(classifyPiece(31, 21)).toBe("unknown");
    expect(classifyPiece(300, 300)).toBe("unknown");
  });

  it("does not call a double bed a single one", () => {
    expect(classifyPiece(140, 200)).not.toBe("bed");
  });
});

describe("what is drawn like furniture but is not", () => {
  it("drops a stair, which is a stack of rectangles on one spot", () => {
    // דירה 14's building stair: eleven treads, 93 wide, heights stepping down.
    const stair = [247, 226, 205, 184, 163].map((h, i) => ({ x: 296, y: 1196 + i * 12, w: 51, h }));
    const bed = { x: 146, y: 639, w: 51, h: 119 };
    expect(dropNested([...stair, bed])).toEqual([bed]);
  });

  it("keeps two wardrobes that merely share a wall line", () => {
    const two = [
      { x: 100, y: 100, w: 51, h: 20 },
      { x: 100, y: 400, w: 51, h: 20 },
    ];
    expect(dropNested(two)).toHaveLength(2);
  });

  it("keeps the largest rectangle where several describe one object", () => {
    const nested = [
      { x: 100, y: 100, w: 51, h: 119 },
      { x: 101, y: 101, w: 48, h: 116 },
    ];
    expect(dedupeRectangles(nested)).toHaveLength(1);
    expect(dedupeRectangles(nested)[0]!.w).toBe(51);
  });
});

describe("a fixture needs a wet room to stand in", () => {
  const piece = (x: number, y: number, wCm: number, dCm: number, kind: string) => ({
    x,
    y,
    w: (wCm / 100) * UPM,
    h: (dCm / 100) * UPM,
    widthCm: wCm,
    depthCm: dCm,
    kind: kind as never,
  });

  it("keeps a small fixture standing next to a bath", () => {
    const bath = piece(400, 1200, 73, 156, "fixture");
    const pan = piece(430, 1300, 62, 62, "fixture");
    const settled = settleFixtures([bath, pan], UPM);
    expect(settled.every((p) => p.kind === "fixture")).toBe(true);
  });

  it("demotes a small square standing alone in a bedroom", () => {
    // Three of these became toilets in bedrooms, in a still whose every other
    // check passed. Size alone cannot tell a bedside table from a pan.
    const bath = piece(400, 1200, 73, 156, "fixture");
    const lonely = piece(150, 300, 62, 62, "fixture");
    const settled = settleFixtures([bath, lonely], UPM);
    expect(settled.find((p) => p.x === 150)!.kind).toBe("unknown");
    expect(settled.find((p) => p.x === 400)!.kind).toBe("fixture");
  });

  it("never demotes the bath itself, which is what marks the wet room", () => {
    const bath = piece(400, 1200, 73, 156, "fixture");
    expect(settleFixtures([bath], UPM)[0]!.kind).toBe("fixture");
  });

  it("demotes two small squares beside a bed — those are nightstands", () => {
    const bed = piece(100, 200, 93, 218, "bed");
    const left = piece(80, 280, 50, 50, "fixture");
    const right = piece(200, 280, 50, 50, "fixture");
    const settled = settleFixtures([bed, left, right], UPM);
    expect(settled.filter((p) => p.kind === "fixture")).toHaveLength(0);
    expect(settled.filter((p) => p.kind === "unknown")).toHaveLength(2);
  });

  it("keeps two small fixtures clustered as a shower room, without a bath", () => {
    // The 3/10 bathroom score: a wet room with a tray and a pan, no bathtub,
    // had both pieces demoted and the room classified as circulation.
    const tray = piece(200, 200, 80, 80, "fixture");
    const pan = piece(240, 220, 40, 50, "fixture");
    const settled = settleFixtures([tray, pan], UPM);
    expect(settled.every((p) => p.kind === "fixture")).toBe(true);
  });

  it("recognises a free-standing island even when the rectangle was left unnamed", () => {
    expect(
      looksLikeKitchenIsland({
        x: 0,
        y: 0,
        w: 60,
        h: 220,
        widthCm: 60,
        depthCm: 220,
        kind: "unknown",
      }),
    ).toBe(true);
    expect(
      looksLikeKitchenIsland({
        x: 0,
        y: 0,
        w: 40,
        h: 90,
        widthCm: 40,
        depthCm: 90,
        kind: "storage",
      }),
    ).toBe(false);
  });

  it("keeps one dining table and demotes the rest", () => {
    const big = piece(500, 900, 160, 90, "table");
    const small = piece(100, 100, 130, 80, "table");
    const settled = settleTables([small, big]);
    expect(settled.filter((p) => p.kind === "table")).toHaveLength(1);
    expect(settled.find((p) => p.x === 500)!.kind).toBe("table");
  });
});

describe("reading the scale off the beds", () => {
  /** A closed 90x200 cm rectangle at a given scale. */
  const bedAt = (upm: number, x: number, y: number) => {
    const w = 0.93 * upm;
    const h = 2.18 * upm;
    return [
      { x1: x, y1: y, x2: x + w, y2: y, lineWidth: 2 },
      { x1: x, y1: y + h, x2: x + w, y2: y + h, lineWidth: 2 },
      { x1: x, y1: y, x2: x, y2: y + h, lineWidth: 2 },
      { x1: x + w, y1: y, x2: x + w, y2: y + h, lineWidth: 2 },
    ];
  };

  it("finds the scale the drawing was made at", () => {
    const drawn = [...bedAt(56, 100, 100), ...bedAt(56, 400, 100), ...bedAt(56, 700, 100)];
    const found = scaleFromBeds(drawn);
    expect(found).not.toBeNull();
    expect(Math.abs(found!.unitsPerMetre - 56)).toBeLessThanOrEqual(4);
    expect(found!.beds).toBeGreaterThanOrEqual(3);
  });

  it("says nothing when the sheet draws no beds to read", () => {
    // Better than an answer nothing supports: area and wall thickness both
    // produce a confident wrong number here.
    expect(scaleFromBeds([{ x1: 0, y1: 0, x2: 100, y2: 0, lineWidth: 2 }])).toBeNull();
  });
});

describe("fixtures a CAD draws with curves", () => {
  const seg = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2, lineWidth: 2 });
  /** A knot of short chords, the way a flattened pan or basin arrives. */
  const knot = (cx: number, cy: number, r: number, n = 12) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const b = ((i + 1) / n) * Math.PI * 2;
      out.push(seg(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(b) * r, cy + Math.sin(b) * r));
    }
    return out;
  };

  it("finds a pan drawn as curves, which the rectangle pass cannot see", () => {
    // דירה 14 draws one bath as a rectangle and every other fixture as curves,
    // so the furniture pass saw a single fixture in a flat with two bathrooms.
    const found = findCurveFixtures(knot(400, 1200, 0.3 * UPM), UPM);
    expect(found).toHaveLength(1);
    expect(found[0]!.kind).toBe("fixture");
    expect(found[0]!.widthCm).toBeGreaterThan(50);
    expect(found[0]!.widthCm).toBeLessThan(75);
  });

  it("keeps two fixtures apart when they are drawn apart", () => {
    const found = findCurveFixtures([...knot(400, 1200, 0.3 * UPM), ...knot(700, 1200, 0.3 * UPM)], UPM);
    expect(found).toHaveLength(2);
  });

  it("ignores a knot too small to be a fixture", () => {
    // A tap, or a door swing's flattened arc.
    expect(findCurveFixtures(knot(400, 1200, 0.05 * UPM), UPM)).toEqual([]);
  });

  it("ignores a sprawl too large to be a fixture", () => {
    expect(findCurveFixtures(knot(400, 1200, 1.6 * UPM), UPM)).toEqual([]);
  });

  it("has nothing to find on a sheet with no curves", () => {
    expect(findCurveFixtures([], UPM)).toEqual([]);
  });
});

describe("the hob and the sink, which make a kitchen a kitchen", () => {
  const seg = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2, lineWidth: 2 });
  const box = (x: number, y: number, w: number, h: number) => [
    seg(x, y, x + w, y),
    seg(x, y + h, x + w, y + h),
    seg(x, y, x, y + h),
    seg(x + w, y, x + w, y + h),
  ];
  const ring = (cx: number, cy: number, r: number, n = 10) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const b = ((i + 1) / n) * Math.PI * 2;
      out.push(seg(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(b) * r, cy + Math.sin(b) * r));
    }
    return out;
  };

  it("finds a hob by the burners inside it", () => {
    // A 64 cm square on its own looks exactly like a toilet, and was read as one.
    const side = 0.64 * UPM;
    const burners = [
      ...ring(100 + side * 0.3, 100 + side * 0.3, 0.07 * UPM),
      ...ring(100 + side * 0.7, 100 + side * 0.3, 0.07 * UPM),
      ...ring(100 + side * 0.3, 100 + side * 0.7, 0.07 * UPM),
      ...ring(100 + side * 0.7, 100 + side * 0.7, 0.07 * UPM),
    ];
    const found = findKitchenFittings(box(100, 100, side, side), burners, UPM);
    expect(found.filter((p) => p.kind === "hob")).toHaveLength(1);
  });

  it("does not call a plain square of that size a hob", () => {
    const side = 0.64 * UPM;
    expect(findKitchenFittings(box(100, 100, side, side), [], UPM).filter((p) => p.kind === "hob")).toEqual([]);
  });

  it("takes two basins side by side as the kitchen sink", () => {
    const rects = [...box(600, 600, 0.32 * UPM, 0.64 * UPM), ...box(600, 640, 0.32 * UPM, 0.64 * UPM)];
    expect(findKitchenFittings(rects, [], UPM).filter((p) => p.kind === "sink")).toHaveLength(2);
  });

  it("leaves a lone rectangle of that size alone — it is a bedside table", () => {
    // Two of דירה 14's bedside tables were coming back as sinks.
    const lone = box(200, 300, 0.54 * UPM, 0.32 * UPM);
    expect(findKitchenFittings(lone, [], UPM).filter((p) => p.kind === "sink")).toEqual([]);
  });
});

describe("chairs, which are told from basins by what they stand next to", () => {
  const seg = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2, lineWidth: 2 });
  const knot = (cx: number, cy: number, r: number, n = 10) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const b = ((i + 1) / n) * Math.PI * 2;
      out.push(seg(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cx + Math.cos(b) * r, cy + Math.sin(b) * r));
    }
    return out;
  };
  const table = {
    x: 400,
    y: 600,
    w: 1.6 * UPM,
    h: 0.9 * UPM,
    widthCm: 160,
    depthCm: 90,
    kind: "table" as const,
  };

  it("claims the knots standing round the table", () => {
    const chairs = [
      ...knot(table.x + 30, table.y - 20, 0.22 * UPM),
      ...knot(table.x + 90, table.y - 20, 0.22 * UPM),
      ...knot(table.x + 30, table.y + table.h + 20, 0.22 * UPM),
    ];
    expect(findSeatsAroundTable(chairs, table, UPM)).toHaveLength(3);
  });

  it("leaves a basin across the flat alone", () => {
    // A chair is the same shape and size as a washbasin; calling every such
    // knot a chair would put seating in the bathrooms.
    const farAway = knot(2000, 2000, 0.22 * UPM);
    expect(findSeatsAroundTable(farAway, table, UPM)).toEqual([]);
  });

  it("finds no chairs when no table was found", () => {
    expect(findSeatsAroundTable(knot(430, 590, 0.22 * UPM), undefined, UPM)).toEqual([]);
  });
});

describe("the short side is capped on its own", () => {
  const seg = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2, lineWidth: 2 });
  const blob = (x: number, y: number, w: number, h: number) => {
    const out = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const b = ((i + 1) / 24) * Math.PI * 2;
      out.push(
        seg(x + w / 2 + (Math.cos(a) * w) / 2, y + h / 2 + (Math.sin(a) * h) / 2,
            x + w / 2 + (Math.cos(b) * w) / 2, y + h / 2 + (Math.sin(b) * h) / 2),
      );
    }
    return out;
  };

  it("finds a wide cluster once the short side is allowed to be wide", () => {
    // A dining set is 208 by 147 cm on this sheet. The cap was folded into
    // maxCm at a flat 100 cm, so raising maxCm alone could never find it.
    const set = blob(300, 560, 2.4 * UPM, 2.0 * UPM);
    expect(findCurveFixtures(set, UPM, { cell: 14, minChords: 8, minCm: 100, maxCm: 400 })).toEqual([]);
    expect(
      findCurveFixtures(set, UPM, { cell: 14, minChords: 8, minCm: 100, maxCm: 400, maxShortCm: 260 }),
    ).toHaveLength(1);
  });

  it("still keeps a fixture narrow by default", () => {
    const wide = blob(300, 560, 1.8 * UPM, 1.5 * UPM);
    expect(findCurveFixtures(wide, UPM)).toEqual([]);
  });
});
