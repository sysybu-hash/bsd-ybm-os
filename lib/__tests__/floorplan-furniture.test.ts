import {
  classifyPiece,
  dedupeRectangles,
  dropNested,
  findRectangles,
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
