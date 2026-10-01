import { floorPrimitives, type FloorSpec } from "@/lib/projects/building/assemble";
import { elevationFrame } from "@/lib/projects/building/elevation-frame";
import type { PlanWalls } from "@/lib/projects/building/plan-walls";
import { emptyMask } from "@/lib/projects/building/raster";
import type { DwfGeometry, PlacedText } from "@/lib/projects/floorplan-dwf";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

const UPM = (72 / 25.4) * 10;
const m = (v: number) => v * UPM;
const ZERO = m(40);
const line = (x1: number, y1: number, x2: number, y2: number): VectorSegment => ({ x1: m(x1), y1: m(y1), x2: m(x2), y2: m(y2), lineWidth: 0.5 });

/**
 * An elevation 60 m wide: a 20 m facade from x 20 to 40 drawn in courses every
 * 30 cm from ±0.00 to +12, level marks at each 3 m floor, and a grid bubble's
 * line well off to the side.
 */
function elevation(): DwfGeometry {
  const segments: VectorSegment[] = [];
  for (let h = 0.15; h < 12; h += 0.3) segments.push(line(20, 40 - h, 40, 40 - h));
  segments.push(line(52, 40 - 1, 53, 40 - 1), line(52, 40 - 6, 53, 40 - 6));
  const texts: PlacedText[] = [0, 3, 6, 9, 12].map((v) => ({ x: m(18), y: ZERO - m(v), text: `+ ${v.toFixed(2)}`, height: m(0.25) }));
  return { pageWidth: m(60), pageHeight: m(45), segments, curves: [], walls: [], texts, fills: [], arcs: [] };
}

describe("an elevation's frame, read off the sheet", () => {
  it("finds ±0.00 from the level marks and the building from its courses", () => {
    const f = elevationFrame(elevation())!;
    // The marks are read at their lettering, which stands on the level: within 20 cm.
    expect(Math.abs(f.zeroY - ZERO)).toBeLessThan(m(0.2));
    // The facade is 20 m; the frame an eighth wider either side.
    expect(f.widthM).toBeCloseTo(25, 0);
    expect(f.centreX / UPM).toBeCloseTo(30, 0);
    expect(f.topM).toBeCloseTo(13.5, 3);
  });

  it("is unknown on a sheet with no level marks", () => {
    expect(elevationFrame({ ...elevation(), texts: [] })).toBeNull();
  });
});

describe("a party wall carried out past the facade", () => {
  // A 4 × 4 m floor; a wall across it from y 1 that runs on 1.5 m outside, to y 5.5.
  const walls: PlanWalls = {
    box: { x: 0, y: 0, width: 10, height: 10 },
    unitsPerMetre: 1,
    cm: 2,
    mask: emptyMask(1, 1),
    bands: [{ orientation: "v", x: 2, y: 1, w: 0.2, h: 4.5 }],
  };
  const spec: FloorSpec = {
    id: "f",
    level: 0,
    height: 3,
    outline: [[0, 0], [4, 0], [4, 4], [0, 4]],
    window: { sill: 0.9, head: 2.2, surround: 0 },
    facade: "stone",
    interior: "plaster",
  };

  it("is plastered within the building and clad without", () => {
    const boxes = floorPrimitives(walls, [], spec).filter((p) => p.type === "box");
    const inside = boxes.filter((p) => p.type === "box" && p.material === "plaster");
    const outside = boxes.filter((p) => p.type === "box" && p.material === "stone");
    expect(inside).toHaveLength(1);
    expect(outside).toHaveLength(1);
    const end = (p: (typeof boxes)[number]) => (p.type === "box" ? p.centre.z + p.size.z / 2 : 0);
    expect(end(inside[0]!)).toBeCloseTo(4, 1);
    expect(end(outside[0]!)).toBeCloseTo(5.5, 5);
  });
});

describe("a laundry screen, as an elevation draws it", () => {
  // The east face of a 20 × 12 m block, its elevation 30 m across: courses
  // every 30 cm, and from 10 to 13.6 m across a screen of slats every 10 cm
  // from +1 to +11, named.
  const sheet = (named: boolean): import("@/lib/projects/building/facade-materials").Sheet => {
    const hor: Array<[number, number, number]> = [];
    for (let h = 0.15; h < 12; h += 0.3) hor.push([ZERO - m(h), m(5), m(25)]);
    for (let h = 1; h < 11; h += 0.1) hor.push([ZERO - m(h), m(10), m(13.6)]);
    const texts: PlacedText[] = named ? [{ x: m(11.8), y: ZERO - m(6), text: "מסתור כביסה", height: m(0.25) }] : [];
    const g: DwfGeometry = { pageWidth: m(30), pageHeight: m(20), segments: [], curves: [], walls: [], texts, fills: [], arcs: [] };
    return { g, zeroY: ZERO, centreX: m(15), left: m(5), right: m(25), hor, ver: [] };
  };
  const east = { title: "חזית מזרחית", normal: { x: 1, z: 0 }, sign: -1 as const, alongX: false };
  const floors = [0, 3, 6, 9].map((level) => ({ level, height: 3, roof: false, outline: [[0, 0], [12, 0], [12, 20], [0, 20]] as Array<[number, number]> }));

  it("stands slats in front of the face, where the elevation draws them", async () => {
    const { laundryScreens } = await import("@/lib/projects/building/laundry-screens");
    const prims = laundryScreens(new Map([["east", { face: east, sheet: sheet(true) }]]), floors, { x: 6, z: 10 });
    const slats = prims.filter((p) => p.type === "box" && p.size.y < 0.1);
    expect(slats.length).toBeGreaterThan(80);
    const p = slats[0]!;
    if (p.type !== "box") throw new Error("box");
    // Just proud of the east face, x = 12, and across the 3.6 m the drawing gives it.
    expect(p.centre.x).toBeGreaterThan(12);
    expect(p.centre.x).toBeLessThan(12.2);
    expect(p.size.z).toBeGreaterThan(3.2);
    expect(p.size.z).toBeLessThan(4.2);
  });

  it("stands nothing where nothing names a screen", async () => {
    const { laundryScreens } = await import("@/lib/projects/building/laundry-screens");
    expect(laundryScreens(new Map([["east", { face: east, sheet: sheet(false) }]]), floors, { x: 6, z: 10 })).toEqual([]);
  });
});
