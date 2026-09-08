import { lockScale } from "@/lib/projects/floorplan-scale";

/** A hatched wall band, drawn the way CAD draws one. */
const hatchedWall = (
  orientation: "h" | "v",
  at: number,
  from: number,
  to: number,
  thickness: number,
) => {
  const out: Array<{ x1: number; y1: number; x2: number; y2: number; lineWidth: number }> = [];
  const seg = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2, lineWidth: 2 });
  if (orientation === "h") {
    out.push(seg(from, at, to, at), seg(from, at + thickness, to, at + thickness));
    for (let x = from; x < to; x += 3) {
      for (let k = 0; k < 3; k++) {
        const y = at + (thickness / 3) * k;
        out.push(seg(x, y + thickness / 3, x + thickness / 3, y));
      }
    }
  } else {
    out.push(seg(at, from, at, to), seg(at + thickness, from, at + thickness, to));
    for (let y = from; y < to; y += 3) {
      for (let k = 0; k < 3; k++) {
        const x = at + (thickness / 3) * k;
        out.push(seg(x + thickness / 3, y, x, y + thickness / 3));
      }
    }
  }
  return out;
};

const bed = (upm: number, x: number, y: number) => {
  const w = 0.93 * upm;
  const h = 2.18 * upm;
  const seg = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2, lineWidth: 2 });
  return [seg(x, y, x + w, y), seg(x, y + h, x + w, y + h), seg(x, y, x, y + h), seg(x + w, y, x + w, y + h)];
};

/** A 10 x 8 m room at 50 units/m, with two beds in it. */
const UPM = 50;
const room = [
  ...hatchedWall("h", 0, 0, 10 * UPM, 12),
  // The bottom wall in two pieces with a 90 cm doorway between them: a flat
  // with no door at all is not a flat, and the scale lock checks door width.
  ...hatchedWall("h", 8 * UPM, 0, 4 * UPM, 12),
  ...hatchedWall("h", 8 * UPM, 4.9 * UPM, 10 * UPM, 12),
  ...hatchedWall("v", 0, 0, 8 * UPM, 12),
  ...hatchedWall("v", 10 * UPM, 0, 8 * UPM, 12),
  ...bed(UPM, 100, 100),
  ...bed(UPM, 300, 100),
];
const bounds = { x: -50, y: -50, width: 10 * UPM + 100, height: 8 * UPM + 100 };

describe("locking the sheet's scale", () => {
  it("finds the scale the drawing was made at", () => {
    // The room is 10 x 8 m, so about 80 m² inside its walls.
    const lock = lockScale(room, bounds, 82, { from: 40, to: 62 });
    expect(lock).not.toBeNull();
    expect(Math.abs(lock!.unitsPerMetre - UPM)).toBeLessThanOrEqual(3);
    expect(lock!.beds).toBeGreaterThanOrEqual(1);
  });

  it("reports the area it settled on and how far off it is", () => {
    const lock = lockScale(room, bounds, 82, { from: 40, to: 62 });
    expect(Math.abs(lock!.areaError)).toBeLessThan(0.08);
    expect(lock!.floorM2).toBeGreaterThan(60);
  });

  it("refuses rather than return a scale the area cannot support", () => {
    // Every measure this replaces hands back a confident wrong number here.
    expect(lockScale(room, bounds, 400, { from: 40, to: 62 })).toBeNull();
  });

  it("refuses a sheet with no beds to read", () => {
    const noBeds = [
      ...hatchedWall("h", 0, 0, 10 * UPM, 12),
      ...hatchedWall("h", 8 * UPM, 0, 4 * UPM, 12),
      ...hatchedWall("h", 8 * UPM, 4.9 * UPM, 10 * UPM, 12),
      ...hatchedWall("v", 0, 0, 8 * UPM, 12),
      ...hatchedWall("v", 10 * UPM, 0, 8 * UPM, 12),
    ];
    expect(lockScale(noBeds, bounds, 82, { from: 40, to: 62 })).toBeNull();
  });

  it("counts only beds standing inside the flat it is measuring", () => {
    // A neighbour's bedroom must not vote on this flat's scale.
    const withNeighbour = [...room, ...bed(UPM, 10 * UPM + 200, 100)];
    const lock = lockScale(withNeighbour, bounds, 82, { from: 40, to: 62 });
    expect(lock).not.toBeNull();
    expect(lock!.beds).toBeLessThanOrEqual(2);
  });
});

describe("the door-width check", () => {
  it("refuses a scale at which the openings are not door-sized", () => {
    // Rectangles of a bed's proportion cluster at several sizes on a real
    // sheet — 23, 51, 84 and 100 units — and beds alone cannot say which
    // cluster is the beds. At 55 units/m דירה 14's openings are 82, 86 and
    // 102 cm; at the competing 90 they would be 50, 53 and 62, which no
    // internal door is.
    const tooSmall = lockScale(room, bounds, 82, { from: 200, to: 240 });
    expect(tooSmall).toBeNull();
  });
});
