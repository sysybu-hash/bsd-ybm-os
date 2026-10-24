import { floorPrimitives, type FloorSpec } from "@/lib/projects/building/assemble";
import { facadeTitle, PLAN_NORTH, sideOfTitle, trueSide, type North } from "@/lib/projects/building/compass";
import { aerialTitle } from "@/lib/projects/building/dwf-views";
import { houseEntranceFlights, houseSideFlights, type HouseDoor } from "@/lib/projects/building/house-additions";
import { houseBalconies } from "@/lib/projects/building/house-features";
import { countsFromModel } from "@/lib/projects/building/house-truth";
import { cutFramedWindows, fitDrawnDoors, houseOpenings, markDoors, markSliding, type PlanOpening } from "@/lib/projects/building/plan-openings";
import type { PlanWalls } from "@/lib/projects/building/plan-walls";
import { emptyMask } from "@/lib/projects/building/raster";
import { DWF_FLOOR_UNITS_PER_METRE as upm } from "@/lib/projects/dwf-building";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";

type Seg = DwfGeometry["segments"][number];
const line = (x1: number, y1: number, x2: number, y2: number, stroke = 0): Seg => ({ x1: x1 * upm, y1: y1 * upm, x2: x2 * upm, y2: y2 * upm, lineWidth: 1, stroke });
const sheet = (segments: Seg[], widthM = 30, heightM = 20): DwfGeometry => ({ pageWidth: widthM * upm, pageHeight: heightM * upm, segments, curves: [], walls: [], texts: [], fills: [], arcs: [] });
const box = (x0: number, z0: number, x1: number, z1: number) => (x: number, z: number) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
const walls = (bands: PlanWalls["bands"]): PlanWalls => ({ box: { x: 0, y: 0, width: 10, height: 10 }, unitsPerMetre: 1, cm: 2, mask: emptyMask(1, 1), bands });

/** Lines at 45° every `gap` metres across a rectangle, in `pen`: a floor's finish hatch. */
function hatch(x0: number, z0: number, x1: number, z1: number, pen: number, gap = 0.1): Seg[] {
  const out: Seg[] = [];
  for (let c = z0 - x1; c <= z1 - x0; c += gap) {
    const xa = Math.max(x0, z0 - c);
    const xb = Math.min(x1, z1 - c);
    if (xb - xa > 0.05) out.push(line(xa, xa + c, xb, xb + c, pen));
  }
  return out;
}

describe("an outside door, not a window", () => {
  // A 90 cm gap in a 25 cm outside wall along y = 0, the house to the south.
  const opening: PlanOpening = { orientation: "h", x: 2, y: 0, w: 0.9, h: 0.25, exterior: true, kind: "window", outward: -1 };

  it("is a door where the plan draws a leaf's swing hinged at its jamb", () => {
    const [o] = markDoors([opening], [{ cx: 2, cy: 0.25, r: 0.85, sweep: Math.PI / 2 }]);
    expect(o!.door).toBe(true);
  });

  it("stays a window with no swing, a swing too small, or one hinged elsewhere", () => {
    expect(markDoors([opening], [])[0]!.door).toBeUndefined();
    expect(markDoors([opening], [{ cx: 2, cy: 0.25, r: 0.3, sweep: Math.PI / 2 }])[0]!.door).toBeUndefined();
    expect(markDoors([opening], [{ cx: 5, cy: 0.25, r: 0.85, sweep: Math.PI / 2 }])[0]!.door).toBeUndefined();
  });

  it("does not take a window wider than a door for one, nor touch an inside doorway", () => {
    const wide = { ...opening, w: 1.8 };
    expect(markDoors([wide], [{ cx: 2, cy: 0.25, r: 1.3, sweep: Math.PI / 2 }])[0]!.door).toBeUndefined();
    const inside: PlanOpening = { ...opening, exterior: false, kind: "doorway" };
    expect(markDoors([inside], [{ cx: 2, cy: 0.25, r: 0.85, sweep: Math.PI / 2 }])[0]).toEqual(inside);
  });

  it("is built to the floor in a frame, a timber leaf in it — no sill wall, no glass", () => {
    const spec: FloorSpec = {
      id: "f",
      level: 10,
      height: 3,
      outline: [[0, 0], [5, 0], [5, 5], [0, 5]],
      window: { sill: 1.1, head: 2.1, surround: 0.16 },
      facade: "renderBrown",
      interior: "plaster",
      surroundMaterial: "jerusalemStone",
    };
    const w = walls([
      { orientation: "h", x: 0, y: 0, w: 2, h: 0.25 },
      { orientation: "h", x: 2.9, y: 0, w: 2.1, h: 0.25 },
    ]);
    const prims = floorPrimitives(w, [{ ...opening, door: true, head: 2.1 }], spec);
    const inGap = prims.filter((p) => p.type === "box" && p.centre.x > 2.05 && p.centre.x < 2.85 && p.centre.z < 0.4);
    expect(inGap.some((p) => p.type === "box" && p.material === "timber" && p.size.y > 1.8)).toBe(true);
    expect(inGap.some((p) => p.type === "box" && p.material === "glass")).toBe(false);
    // Nothing of the wall under 2 m in the doorway: the leaf stands on the floor.
    expect(inGap.some((p) => p.type === "box" && (p.tag === "f" || p.tag === "f:fin") && p.centre.y - p.size.y / 2 < 11.9)).toBe(false);
    const glazed = floorPrimitives(w, [{ ...opening, door: true, full: true, head: 2.1 }], spec);
    const glass = glazed.filter((p) => p.type === "box" && p.material === "glass");
    expect(Math.min(...glass.map((p) => (p.type === "box" ? p.centre.y - p.size.y / 2 : Infinity)))).toBeCloseTo(10, 1);
  });
});

describe("a window the hatch runs solid through", () => {
  const wall = walls([{ orientation: "h", x: 0, y: 0, w: 6, h: 0.25 }]);
  const frame = [0.05, 0.125, 0.2].map((y) => ({ x1: 2, y1: y, x2: 3.2, y2: y }));
  const caps = [2, 3.2].map((x) => ({ x1: x, y1: 0, x2: x, y2: 0.25 }));

  it("is cut out of the wall where three frame lines run capped at both ends", () => {
    const { bands } = cutFramedWindows(wall, [...frame, ...caps]);
    expect(bands.map((b) => [b.x, b.x + b.w].map((v) => Math.round(v * 100) / 100))).toEqual([
      [0, 2],
      [3.2, 6],
    ]);
  });

  it("leaves the wall whole for two lines, or lines not capped", () => {
    expect(cutFramedWindows(wall, [...frame.slice(0, 2), ...caps]).bands).toHaveLength(1);
    expect(cutFramedWindows(wall, frame).bands).toHaveLength(1);
  });
});

describe("a sliding door to the garden", () => {
  // A 2.9 m gap in a 32 cm outside wall along y = 0, two panels drawn on tracks of their own.
  const gap: PlanOpening = { orientation: "h", x: 8.2, y: 0, w: 2.9, h: 0.32, exterior: true, kind: "window", outward: -1 };
  const panels = [
    ...[0.12, 0.14, 0.16].map((y) => ({ x1: 8.2, y1: y, x2: 9.4, y2: y })),
    ...[0.17, 0.19, 0.21].map((y) => ({ x1: 9.48, y1: y, x2: 11.1, y2: y })),
  ];

  it("is a door glazed to the floor, not a window", () => {
    const [o] = markSliding([gap], panels);
    expect(o).toMatchObject({ door: true, sliding: true, full: true, kind: "window" });
  });

  it("leaves a window's frame — lines of one length, the opening's — a window", () => {
    const frame = [0.05, 0.12, 0.2].map((y) => ({ x1: 8.2, y1: y, x2: 11.1, y2: y }));
    expect(markSliding([gap], frame)[0]).toEqual(gap);
    const sash = [0.1, 0.2].map((y) => ({ x1: 8.25, y1: y, x2: 11.05, y2: y }));
    expect(markSliding([gap], sash)[0]).toEqual(gap);
  });

  it("leaves narrow windows and inside doorways alone", () => {
    expect(markSliding([{ ...gap, w: 1.2 }], panels)[0]!.sliding).toBeUndefined();
    const inside: PlanOpening = { ...gap, exterior: false, kind: "doorway" };
    expect(markSliding([inside], panels)[0]).toEqual(inside);
  });

  it("is counted neither a door nor a window, and stands as glass in two panes", () => {
    const [o] = markSliding([gap], panels);
    expect(countsFromModel({ openings: [o!], rooms: null })).toMatchObject({ doors: 0, windows: 0 });
    const spec: FloorSpec = { id: "f", level: 0, height: 3, outline: [[0, 0], [20, 0], [20, 5], [0, 5]], window: { sill: 1.1, head: 2.1, surround: 0.16 }, facade: "renderBrown", interior: "plaster" };
    const prims = floorPrimitives(walls([{ orientation: "h", x: 0, y: 0, w: 8.2, h: 0.32 }, { orientation: "h", x: 11.1, y: 0, w: 8.9, h: 0.32 }]), [{ ...o!, head: 2.1 }], spec);
    const glass = prims.filter((p) => p.type === "box" && p.material === "glass");
    expect(Math.min(...glass.map((p) => (p.type === "box" ? p.centre.y - p.size.y / 2 : Infinity)))).toBeCloseTo(0, 1);
    // Its jambs and the meeting rail between the panes: three upright bars.
    const bars = prims.filter((p) => p.type === "box" && p.material === "frame" && p.size.x < 0.07 && p.size.y > 1.5);
    expect(bars.length).toBeGreaterThanOrEqual(3);
    expect(prims.some((p) => p.type === "box" && p.material === "timber")).toBe(false);
  });
});

describe("a door the walls are drawn solid through", () => {
  // A 6 m outside wall, 25 cm thick, along y = 0; the house south of it; a 85 cm leaf hinged on its inner face at x 2, open into the house.
  const wall: PlanWalls = { ...walls([{ orientation: "h", x: 0, y: 0, w: 6, h: 0.25 }]), cm: 2 };
  const mask = emptyMask(300, 200);
  for (let j = 13; j < 200; j++) for (let i = 0; i < 300; i++) mask.data[j * 300 + i] = 1;
  const leaf = { cx: 2, cy: 0.25, r: 0.85, sweep: Math.PI / 2, start: 0, end: Math.PI / 2 };
  const drawn = [{ x1: 2, y1: 0.25, x2: 2, y2: 1.1 }];

  it("is carved where its leaf swings, and marked a door in the outside wall", () => {
    const { walls: carved, openings } = houseOpenings(wall, { mask, cm: 2 }, [leaf], drawn);
    const doors = openings.filter((o) => o.door);
    expect(doors).toHaveLength(1);
    expect(doors[0]).toMatchObject({ exterior: true, kind: "window" });
    expect(carved.bands.length).toBeGreaterThanOrEqual(2);
    const hole = carved.bands.map((b) => [b.x, b.x + b.w]).sort((p, q) => p[0]! - q[0]!);
    expect(hole[0]![1]).toBeCloseTo(2, 1);
    expect(hole[1]![0]).toBeCloseTo(2.85, 1);
  });

  it("is not carved for an arc no leaf line hangs from", () => {
    const { openings } = houseOpenings(wall, { mask, cm: 2 }, [leaf], []);
    expect(openings.filter((o) => o.door)).toEqual([]);
  });
});

describe("a balcony past the storey below", () => {
  const FINISH = 7;
  const house = box(2, 2, 12, 8);
  const base = [...hatch(2, 2, 12, 8, FINISH), line(0, 18, 29, 18)];
  // The slab's 25 cm fascia drawn double round it: read alone, a room's walls.
  const fascia = [line(4, 9.5, 10, 9.5), line(4, 8, 4, 9.5), line(10, 8, 10, 9.5), line(4, 9.7, 10, 9.7), line(3.8, 8, 3.8, 9.7), line(10.2, 8, 10.2, 9.7)];
  const drawn = sheet([...base, ...hatch(4, 8, 10, 9.5, FINISH), ...fascia]);

  it("stands where it hangs out past the floor below, its double edge the slab's", () => {
    const found = houseBalconies(drawn, house, { x: 0, y: 0 }, undefined, box(2, 2, 12, 8));
    expect(found).toHaveLength(1);
    expect(found[0]!.areaM2).toBeGreaterThan(6);
  });

  it("is a room where the floor below runs on under it", () => {
    expect(houseBalconies(drawn, house, { x: 0, y: 0 }, undefined, box(2, 2, 12, 10))).toEqual([]);
    expect(houseBalconies(drawn, house, { x: 0, y: 0 })).toEqual([]);
  });
});

describe("a house's steps", () => {
  const plot = { x0: -2, z0: 0, x1: 14, z1: 20 };

  it("comes down from a side door to the land beside it, railed both sides", () => {
    const door: HouseDoor = { orientation: "v", x: 2, y: 10, w: 0.25, h: 0.9, outward: -1 };
    const { flights, primitives } = houseSideFlights({ doors: [door], ground: 0, front: "south", levels: { west: 0, east: 0, sideFlights: { west: -1.37 } }, taken: [], plot });
    expect(flights).toHaveLength(1);
    expect(flights[0]!.skipped).toBeUndefined();
    expect(flights[0]!.risers).toBe(9);
    expect(flights[0]!.riser).toBeLessThanOrEqual(0.19);
    expect(flights[0]!.to).toBeCloseTo(-1.37, 5);
    // Posts at the rail's ends and every third tread (0, 3, 6, 8), both sides; the rail one run falling with the flight.
    const posts = primitives.filter((p) => p.type === "box" && p.tag === "yard:stairs:railing" && p.size.y > 0.5);
    expect(posts).toHaveLength(8);
    const rail = primitives.filter((p): p is Extract<typeof p, { type: "box" }> => p.type === "box" && p.tag === "yard:stairs:railing" && p.size.y < 0.1);
    const heights = rail.filter((p) => p.centre.z < 10.5).sort((p, q) => q.centre.x - p.centre.x).map((p) => p.centre.y);
    expect(heights.every((y, i) => i === 0 || y < heights[i - 1]!)).toBe(true);
    // Down and out to the plot's left, away from the door.
    expect(primitives.filter((p) => p.type === "box" && p.material === "floorStone").every((p) => p.type === "box" && p.centre.x < 2)).toBe(true);
  });

  it("stands none on the street's side, nor where the land is not below the floor", () => {
    const front: HouseDoor = { orientation: "h", x: 5, y: 9.5, w: 0.9, h: 0.25, outward: 1 };
    expect(houseSideFlights({ doors: [front], ground: 0, front: "south", levels: { west: 0, east: 0, sideFlights: { south: -1 } }, taken: [], plot }).flights).toEqual([]);
    const level: HouseDoor = { orientation: "v", x: 2, y: 10, w: 0.25, h: 0.9, outward: -1 };
    const { flights } = houseSideFlights({ doors: [level], ground: 0, front: "south", levels: { west: 0, east: 0, sideFlights: { west: -0.1 } }, taken: [], plot });
    expect(flights[0]!.skipped).toBeDefined();
  });

  it("brings each entrance flight down to the sidewalk where its own path meets it", () => {
    const outline: Array<[number, number]> = [[2, 2], [12, 2], [12, 9.5], [2, 9.5]];
    const treads = (a: number, b: number) => [10, 10.3, 10.6, 10.9].map((z) => line(a, z, b, z));
    const street: Array<[number, number]> = [[-10, -1.7], [10, -0.7]];
    const { flights } = houseEntranceFlights({
      sheet: sheet([...treads(3, 4.5), ...treads(9.5, 11)]),
      shift: { x: 0, y: 0 },
      outlines: [outline],
      ground: 0,
      plot,
      levels: { west: 0, east: 0, street },
      front: "south",
      prims: [],
    });
    expect(flights).toHaveLength(2);
    const [left, right] = [...flights].sort((p, q) => p.flight.a - q.flight.a);
    // The house's middle is x 7: the left path meets the street 3.25 m before it, the right 3.25 m past.
    expect(left!.to).toBeCloseTo(-1.2 - 0.05 * 3.25, 5);
    expect(right!.to).toBeCloseTo(-1.2 + 0.05 * 3.25, 5);
    // As many steps as each drop takes at the standard riser — the plan draws the same flight at both doors, the land falls
    // more at one, and it has more steps (the street facade: eleven at the west door, five at the east).
    expect(left!.risers).toBe(9);
    expect(right!.risers).toBe(7);
    for (const f of flights) expect(f.riser).toBeLessThanOrEqual(0.19);
  });
});

describe("the compass the house is drawn to", () => {
  // North to the plans' right: the street, at their bottom, is the east.
  const NORTH: North = { x: 1, z: 0 };

  it("names each plan side by its true side", () => {
    expect(trueSide("south", NORTH)).toBe("east");
    expect(trueSide("west", NORTH)).toBe("south");
    expect(trueSide("north", NORTH)).toBe("west");
    expect(trueSide("east", NORTH)).toBe("north");
    expect(trueSide("south", PLAN_NORTH)).toBe("south");
  });

  it("titles the facade sheet's drawings east (the entrance), south, west", () => {
    expect((["south", "west", "north"] as const).map((s) => facadeTitle(s, NORTH))).toEqual(["חזית מזרחית", "חזית דרומית", "חזית מערבית"]);
  });

  it("finds the plan side a title names, so each elevation is matched to its drawing", () => {
    expect(sideOfTitle("חזית מזרחית", NORTH)).toBe("south");
    expect(sideOfTitle("חזית דרומית", NORTH)).toBe("west");
    expect(sideOfTitle("חזית מערבית", NORTH)).toBe("north");
    expect(sideOfTitle("חזית צפונית", NORTH)).toBe("east");
    expect(sideOfTitle("תכנית קומה", NORTH)).toBeNull();
  });

  it("titles an aerial by the true corner it looks from", () => {
    expect(aerialTitle(1, 1, NORTH)).toBe("מבט על — צפון מזרח");
    expect(aerialTitle(-1, -1, NORTH)).toBe("מבט על — דרום מערב");
    expect(aerialTitle(1, 1)).toBe("מבט על — דרום מזרח");
  });
});

describe("doors where the CAD file places them", () => {
  // A 5 × 5 m house at the corner, on a 10 cm grid: its outside wall along y = 0, an inside wall at x = 2.5.
  const mask = emptyMask(100, 100);
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) mask.data[y * 100 + x] = 1;
  const footprint = { mask, cm: 10 };
  const inner = { orientation: "v" as const, x: 2.5, y: 0.25, w: 0.1, h: 4.75 };
  const window: PlanOpening = { orientation: "h", x: 2, y: 0, w: 0.9, h: 0.25, exterior: true, kind: "window", outward: -1 };
  const doors = (o: PlanOpening[]) => o.filter((p) => p.door);

  it("cuts the wall for a door the swings missed, and stands it there", () => {
    const { walls: w, openings } = fitDrawnDoors(walls([inner]), [], [{ x1: 2.55, y1: 1, x2: 2.55, y2: 1.8 }], footprint);
    expect(doors(openings)).toEqual([expect.objectContaining({ orientation: "v", x: 2.5, y: 1, h: expect.closeTo(0.8, 5), exterior: false, kind: "doorway" })]);
    expect(w.bands.map((b) => [b.y, +(b.y + b.h).toFixed(2)])).toEqual([[0.25, 1], [1.8, 5]]);
  });

  it("makes a door of the opening read there as a window — drawn along its wall, or with its leaf swung square to it", () => {
    const along = fitDrawnDoors(walls([]), [window], [{ x1: 2, y1: 0.12, x2: 2.9, y2: 0.12 }], footprint);
    expect(along.openings).toEqual([{ ...window, door: true }]);
    const swung = fitDrawnDoors(walls([]), [window], [{ x1: 2, y1: 0.25, x2: 2, y2: 1.15 }], footprint);
    expect(swung.openings).toEqual([{ ...window, door: true }]);
  });

  it("adds none where a door already stands", () => {
    const door: PlanOpening = { ...window, door: true };
    expect(fitDrawnDoors(walls([]), [door], [{ x1: 2, y1: 0.12, x2: 2.9, y2: 0.12 }], footprint).openings).toEqual([door]);
  });

  it("closes the wall again for a swing hung beside a placed door, where no block stands", () => {
    const placed: PlanOpening = { orientation: "v", x: 2.5, y: 1, w: 0.1, h: 0.8, exterior: false, kind: "doorway", door: true };
    const stray: PlanOpening = { ...placed, y: 1.9 };
    const read = walls([{ ...inner, h: 0.75 }, { ...inner, y: 2.7, h: 2.3 }]);
    const { walls: w, openings } = fitDrawnDoors(read, [placed, stray], [{ x1: 2.55, y1: 1, x2: 2.55, y2: 1.8 }], footprint, walls([inner]));
    expect(openings).toEqual([placed]);
    expect(w.bands).toContainEqual({ orientation: "v", x: 2.5, y: 1.9, w: 0.1, h: 0.8 });
  });

  it("leaves a stray swing in a gap the plan leaves open as a doorway with no door", () => {
    const placed: PlanOpening = { orientation: "v", x: 2.5, y: 1, w: 0.1, h: 0.8, exterior: false, kind: "doorway", door: true };
    const stray: PlanOpening = { ...placed, y: 1.9 };
    const { openings } = fitDrawnDoors(walls([]), [placed, stray], [{ x1: 2.55, y1: 1, x2: 2.55, y2: 1.8 }], footprint, walls([]));
    expect(openings).toEqual([placed, { ...stray, door: false }]);
  });
});
