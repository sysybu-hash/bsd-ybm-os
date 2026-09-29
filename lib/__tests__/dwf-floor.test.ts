import type { DwfArc, DwfGeometry, PlacedText } from "@/lib/projects/floorplan-dwf";
import { readDwfFloor } from "@/lib/projects/dwf-floor";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

/** 1:100 in points: a metre is 28.35 units. */
const UPM = (72 / 25.4) * 10;
const m = (v: number) => v * UPM;

/** A wall band from (x0,y0) to (x1,y1) in metres, filled with 45° hatch 3 cm apart, as a permit plan draws it. */
function hatchedWall(x0: number, y0: number, x1: number, y1: number): VectorSegment[] {
  const out: VectorSegment[] = [];
  const w = x1 - x0;
  const h = y1 - y0;
  for (let t = -h; t < w; t += 0.03) {
    const a = Math.max(0, t);
    const b = Math.min(w, t + h);
    if (b - a <= 0.01) continue;
    out.push({ x1: m(x0 + a), y1: m(y0 + (a - t)), x2: m(x0 + b), y2: m(y0 + (b - t)), lineWidth: 0.5 });
  }
  return out;
}

const text = (x: number, y: number, t: string, height = 8): PlacedText => ({ x: m(x), y: m(y), text: t, height });

/**
 * A flat of two rooms, 4 × 3 m each, side by side inside 20 cm walls; a
 * doorway with its swing in the wall between them; a window in the outer wall.
 */
function sheet(): DwfGeometry {
  const segments = [
    ...hatchedWall(1, 1, 9.2, 1.2), // north
    ...hatchedWall(1, 4.2, 9.2, 4.4), // south
    ...hatchedWall(1, 1, 1.2, 4.4), // west
    ...hatchedWall(9, 1, 9.2, 4.4), // east
    // The party wall, with a 0.9 m doorway from 2.2 to 3.1 m.
    ...hatchedWall(5, 1, 5.2, 2.2),
    ...hatchedWall(5, 3.1, 5.2, 4.4),
  ];
  // A window in the north wall: a 1.2 m gap.
  const north = segments.filter((s) => !(s.y1 < m(1.25) && s.x1 > m(2.5) && s.x2 < m(3.7)));
  const arcs: DwfArc[] = [{ cx: m(5.1), cy: m(2.2), r: m(0.9), start: 0, end: Math.PI / 2 }];
  return {
    pageWidth: m(10.5),
    pageHeight: m(5.5),
    segments: north,
    curves: [],
    walls: [],
    fills: [],
    arcs,
    texts: [text(3, 2.8, "סלון"), text(7, 2.8, "שינה"), text(3, 3.4, "7", 13)],
  };
}

describe("a permit plan's floor, read from its hatch", () => {
  const floor = readDwfFloor(sheet(), { unitsPerMetre: UPM, units: [{ unit: 7, x: m(3), y: m(3.4) }] });

  it("finds the two rooms, the window closed and the doorway shut", () => {
    const named = floor.rooms.filter((r) => r.kind != null);
    expect(named.map((r) => r.kind).sort()).toEqual(["bedroom", "living"]);
    for (const r of named) expect(r.areaM2).toBeGreaterThan(10);
  });

  it("puts both rooms in the flat numbered in its living room", () => {
    expect(floor.apartments).toHaveLength(1);
    expect(floor.apartments[0]!.unit).toBe(7);
    expect(floor.apartments[0]!.rooms).toHaveLength(2);
  });
});

describe("what does not join two rooms into one flat", () => {
  /** The same two rooms; the party wall's opening only 30 cm — a shaft let into it — and no door drawn. */
  function shafted(): DwfGeometry {
    const segments = [
      ...hatchedWall(1, 1, 9.2, 1.2),
      ...hatchedWall(1, 4.2, 9.2, 4.4),
      ...hatchedWall(1, 1, 1.2, 4.4),
      ...hatchedWall(9, 1, 9.2, 4.4),
      ...hatchedWall(5, 1, 5.2, 2.2),
      ...hatchedWall(5, 2.5, 5.2, 4.4),
    ];
    return {
      pageWidth: m(10.5),
      pageHeight: m(5.5),
      segments,
      curves: [],
      walls: [],
      fills: [],
      arcs: [],
      // The bedroom's name set over its wall, as a name over a fitting can be.
      texts: [text(3, 2.8, "סלון"), text(7, 1.32, "שינה"), text(3, 3.4, "7", 13)],
    };
  }
  const floor = readDwfFloor(shafted(), { unitsPerMetre: UPM, units: [{ unit: 7, x: m(3), y: m(3.4) }] });

  it("a gap narrower than a door is no doorway", () => {
    expect(floor.apartments[0]!.rooms).toHaveLength(1);
  });

  it("a name set over a wall names the room beside it", () => {
    expect(floor.rooms.filter((r) => r.kind != null).map((r) => r.kind).sort()).toEqual(["bedroom", "living"]);
  });
});
