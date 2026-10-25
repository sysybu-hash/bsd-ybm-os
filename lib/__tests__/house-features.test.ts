import {
  elevationOutline,
  flightPrimitives,
  flightRise,
  houseBalconies,
  houseFlights,
  roofScreens,
  slattedBoxes,
  treadRuns,
} from "@/lib/projects/building/house-features";
import { DWF_FLOOR_UNITS_PER_METRE as upm } from "@/lib/projects/dwf-building";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";

type Seg = DwfGeometry["segments"][number];
/** A line given in metres, in `stroke`'s pen. */
const line = (x1: number, y1: number, x2: number, y2: number, stroke = 0): Seg => ({ x1: x1 * upm, y1: y1 * upm, x2: x2 * upm, y2: y2 * upm, lineWidth: 1, stroke });
const sheet = (segments: Seg[], widthM = 30, heightM = 20): DwfGeometry => ({ pageWidth: widthM * upm, pageHeight: heightM * upm, segments, curves: [], walls: [], texts: [], fills: [], arcs: [] });

/** Lines at 45° every `gap` metres across a rectangle, in `pen`: a floor's finish hatch. */
function hatch(x0: number, z0: number, x1: number, z1: number, pen: number, gap = 0.1): Seg[] {
  const out: Seg[] = [];
  for (let c = z0 - x1; c <= z1 - x0; c += gap) {
    // z = x + c, clipped to the rectangle.
    const xa = Math.max(x0, z0 - c);
    const xb = Math.min(x1, z1 - c);
    if (xb - xa > 0.05) out.push(line(xa, xa + c, xb, xb + c, pen));
  }
  return out;
}

const box = (x0: number, z0: number, x1: number, z1: number) => (x: number, z: number) => x >= x0 && x <= x1 && z >= z0 && z <= z1;

describe("a flight's treads on a plan", () => {
  const treads = (at: number[], a = 5, b = 6.5) => at.map((z) => line(a, z, b, z));

  it("reads equal lines 30 cm apart as a run", () => {
    const runs = treadRuns(sheet(treads([10, 10.3, 10.6, 10.9])));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.along).toBe("x");
    expect(runs[0]!.ats.map((v) => Math.round(v * 10) / 10)).toEqual([10, 10.3, 10.6, 10.9]);
  });

  it("leaves out a tiling's grid, crossed by lines its own way", () => {
    const grid = [5.3, 5.6, 5.9, 6.2].map((x) => line(x, 9.8, x, 11.1));
    expect(treadRuns(sheet([...treads([10, 10.3, 10.6, 10.9]), ...grid]))).toEqual([]);
  });

  it("does not take two lines, or uneven ones, for a flight", () => {
    expect(treadRuns(sheet(treads([10, 10.3])))).toEqual([]);
    expect(treadRuns(sheet(treads([10, 10.3, 10.75, 10.9])))).toEqual([]);
  });

  it("runs from the house outwards, and only off the house", () => {
    const house = box(2, 2, 12, 9.5);
    const [f] = houseFlights(sheet(treads([10, 10.3, 10.6, 10.9])), house, { x: 1, y: -2 });
    expect(f!.out).toBe(1);
    expect(f!.lines[0]).toBeCloseTo(8, 5);
    expect(f!.a).toBeCloseTo(6, 5);
    expect(houseFlights(sheet(treads([8, 8.3, 8.6, 8.9])), house, { x: 0, y: 0 })).toEqual([]);
  });

  it("stands as many treads as drawn, and sinks its path below the floor", () => {
    const f = { along: "x" as const, a: 5, b: 6.5, lines: [10, 10.3, 10.6], out: 1 as const };
    const { primitives, sunk } = flightPrimitives(f, 0, -0.45, 12, "yard:stairs");
    expect(primitives.filter((p) => p.type === "box" && /^stairStone[0-3]$/.test(p.material))).toHaveLength(3);
    // The stone's tone by height: each step lower than the last is as dark or darker, and a soft shade lies where one meets the next.
    const tones = primitives.filter((p) => p.type === "box" && /^stairStone[0-3]$/.test(p.material)).map((p) => Number((p as { material: string }).material.slice(-1)));
    expect(tones).toEqual([...tones].sort((x, y) => x - y));
    expect(tones[tones.length - 1]).toBeGreaterThan(tones[0]!);
    expect(primitives.filter((p) => p.type === "box" && p.material === "stairShade")).toHaveLength(6);
    expect(primitives.some((p) => p.type === "box" && p.material === "paving")).toBe(true);
    expect(sunk).not.toBeNull();
    expect(flightPrimitives(f, 0, 0, 12, "yard:stairs").sunk).toBeNull();
  });

  it("climbs the land's drop at a riser a person can take", () => {
    expect(flightRise(4, 0, -0.6)).toBeCloseTo(-0.6);
    expect(flightRise(4, 0, null)).toBeCloseTo(-0.6);
    expect(flightRise(4, 0, -2)).toBeCloseTo(-0.76);
    expect(flightRise(4, 0, 0.8)).toBeCloseTo(0.76);
  });
});

describe("an upper floor's balconies", () => {
  const FINISH = 7;
  const house = box(2, 2, 12, 8);
  // The floor's rooms hatched, the plot's boundary the longest line, in pen 0.
  const base = [...hatch(2, 2, 12, 8, FINISH), line(0, 18, 29, 18)];
  const railing = [line(4, 9.5, 10, 9.5), line(4, 8, 4, 9.5), line(10, 8, 10, 9.5)];

  it("finds the floor's hatch carried out past its wall, and its railing", () => {
    const found = houseBalconies(sheet([...base, ...hatch(4, 8, 10, 9.5, FINISH), ...railing]), house, { x: 0, y: 0 });
    expect(found).toHaveLength(1);
    const xs = found[0]!.ring.map(([x]) => x);
    const zs = found[0]!.ring.map(([, z]) => z);
    expect(Math.min(...xs)).toBeCloseTo(4, 0);
    expect(Math.max(...xs)).toBeCloseTo(10, 0);
    expect(Math.max(...zs)).toBeCloseTo(9.5, 1);
    expect(Math.min(...zs)).toBeLessThanOrEqual(8.1);
    expect(found[0]!.railed).toBeGreaterThan(0.9);
  });

  it("takes the slab to a parapet's outer face where its front edge is drawn double", () => {
    const found = houseBalconies(sheet([...base, ...hatch(4, 8, 10, 9.5, FINISH), ...railing, line(4, 9.75, 10, 9.75)]), house, { x: 0, y: 0 });
    expect(found).toHaveLength(1);
    const zs = found[0]!.ring.map(([, z]) => z);
    expect(Math.max(...zs)).toBeCloseTo(9.75, 1);
  });

  it("finds a mirrored home's balcony, its hatch at the other slope", () => {
    const mirrored = hatch(4, 8, 10, 9.5, FINISH).map((s) => ({ ...s, x1: 14 * upm - s.x1, x2: 14 * upm - s.x2 }));
    expect(houseBalconies(sheet([...base, ...mirrored, ...railing]), house, { x: 0, y: 0 })).toHaveLength(1);
  });

  it("does not stand one where nothing is drawn along its open edge", () => {
    expect(houseBalconies(sheet([...base, ...hatch(4, 8, 10, 9.5, FINISH)]), house, { x: 0, y: 0 })).toEqual([]);
  });

  it("takes a hatched part walled round in outline for a room, not a balcony", () => {
    const walls = [...railing, line(4, 9.7, 10, 9.7), line(3.8, 8, 3.8, 9.7), line(10.2, 8, 10.2, 9.7)];
    expect(houseBalconies(sheet([...base, ...hatch(4, 8, 10, 9.5, FINISH), ...walls]), house, { x: 0, y: 0 })).toEqual([]);
  });

  it("takes a hatch that is not the rooms' own for the ground below, not a balcony", () => {
    expect(houseBalconies(sheet([...base, ...hatch(4, 8, 10, 9.5, 9), ...railing]), house, { x: 0, y: 0 })).toEqual([]);
  });
});

describe("the solar heaters' screens on the roof", () => {
  // An elevation in page units: the building's sides 400 apart, standing from 100 down to 400.
  const elevation = (extra: Seg[]): DwfGeometry => ({
    pageWidth: 800,
    pageHeight: 600,
    segments: [{ x1: 100, y1: 100, x2: 100, y2: 400, lineWidth: 1 }, { x1: 500, y1: 120, x2: 500, y2: 380, lineWidth: 1 }, ...extra],
    curves: [],
    walls: [],
    texts: [],
    fills: [],
    arcs: [],
  });
  const slats = (x0: number, x1: number, n = 6): Seg[] => Array.from({ length: n }, (_, k) => ({ x1: x0, y1: 95 - 5 * k, x2: x1, y2: 95 - 5 * k, lineWidth: 1 }));

  it("reads the building's sides, top and ±0.00 off an elevation", () => {
    const e = elevationOutline(elevation([]))!;
    expect([e.left, e.right, e.top, e.zero]).toEqual([100, 500, 100, 400]);
  });

  it("finds a box of slats standing over the top, across the building", () => {
    const [b] = slattedBoxes(elevationOutline(elevation(slats(200, 230)))!);
    expect(b!.x0).toBeCloseTo(0.25);
    expect(b!.x1).toBeCloseTo(0.325);
    expect(b!.overTop).toBeCloseTo(30 / upm);
  });

  it("does not take four lines, or lines far over the top, for a screen", () => {
    expect(slattedBoxes(elevationOutline(elevation(slats(200, 230, 4)))!)).toEqual([]);
    const high = slats(200, 230).map((s) => ({ ...s, y1: s.y1 - 80, y2: s.y2 - 80 }));
    expect(slattedBoxes(elevationOutline(elevation(high))!)).toEqual([]);
  });

  it("places a screen across from the south face and in depth from the west", () => {
    const roof: Array<[number, number]> = [[0, 0], [10, 0], [10, 8], [0, 8]];
    const south = [{ x0: 0.25, x1: 0.325, overTop: 0.8 }];
    const north = [{ x0: 0.675, x1: 0.75, overTop: 0.8 }];
    const west = [{ x0: 0.4, x1: 0.5, overTop: 0.8 }];
    const [s, ...rest] = roofScreens({ south, north, west }, roof);
    expect(rest).toEqual([]);
    expect([s!.x0, s!.x1, s!.z0, s!.z1].map((v) => Math.round(v * 100) / 100)).toEqual([2.5, 3.25, 3.2, 4]);
    expect(s!.seenOn).toEqual(["south", "north", "west"]);
  });

  it("does not place one a single face draws", () => {
    expect(roofScreens({ south: [{ x0: 0.25, x1: 0.325, overTop: 0.8 }] }, [[0, 0], [10, 0], [10, 8], [0, 8]])).toEqual([]);
  });
});
