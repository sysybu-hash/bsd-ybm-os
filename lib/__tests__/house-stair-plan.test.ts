import { clipSegTo, stairArriving, stairPlan, stairRising, stairWalk, type TreadRun } from "@/lib/projects/building/house-features";
import type { Primitive } from "@/lib/projects/building/model";

type Seg = { x1: number; z1: number; x2: number; z2: number };
const seg = (x1: number, z1: number, x2: number, z2: number): Seg => ({ x1, z1, x2, z2 });

// Gottlieb B's ground floor, right home (DXF, metres): the first flight up the
// page (−z) in the east column, the landing beyond it, the second flight back
// down the page in the west column, drawn only to its first tread and the cut.
const LOWER: TreadRun = { along: "x", a: 7.41, b: 8.31, ats: [0.95, 0.68, 0.41, 0.14, -0.13, -0.4, -0.67, -0.94] };
const WALK: Seg[] = [
  seg(7.86, 0.95, 7.86, -1.39),
  seg(7.86, -1.39, 6.7, -1.39),
  seg(6.7, -1.39, 6.7, 0.95),
  // The arrow's head at the top of the second flight, pointing down the page (+z).
  seg(6.7, 0.95, 6.57, 0.73),
  seg(6.7, 0.95, 6.83, 0.73),
  // The plan's cut across the second flight.
  seg(6.15, -0.42, 7.3, -0.65),
];
const FIRST_TREAD_OF_SECOND = [seg(6.24, -0.67, 7.14, -0.67)];

const boxes = (prims: Primitive[], material: string) => prims.filter((p): p is Extract<Primitive, { type: "box" }> => p.type === "box" && p.material === material);
const top = (p: Extract<Primitive, { type: "box" }>) => p.centre.y + p.size.y / 2;
/** A stair's treads: its oak plates, in whichever of the four tones their height gives. */
const treadBoxes = (prims: Primitive[]) => prims.filter((p): p is Extract<Primitive, { type: "box" }> => p.type === "box" && /^stairOak[0-3]$/.test(p.material));

describe("a house's U stair read off its plan", () => {
  it("follows the walk line from its foot to the arrow, and finds the cut", () => {
    const walk = stairWalk(WALK)!;
    expect(walk.legs.map((l) => [l.axis, Math.round(l.at * 100) / 100, l.from, l.to])).toEqual([
      ["z", 7.86, 0.95, -1.39],
      ["x", -1.39, 7.86, 6.7],
      ["z", 6.7, -1.39, 0.95],
    ]);
    expect(walk.cut).toEqual(seg(6.15, -0.42, 7.3, -0.65));
  });

  it("finds an arrow drawn a hand short of its leg's end, where the walk stops at the cut", () => {
    const tip = [seg(6.7, 0.82, 6.57, 0.6), seg(6.7, 0.82, 6.83, 0.6)];
    expect(stairWalk([...WALK.slice(0, 3), ...tip])?.legs).toHaveLength(3);
  });

  it("climbs its two flights in opposite directions, joined by the landing the walk turns on", () => {
    const plan = stairPlan([LOWER], WALK, FIRST_TREAD_OF_SECOND);
    expect(plan.first.dir).toBe(-1);
    expect(plan.second!.dir).toBe(1);
    expect(plan.first.lines[0]).toBeCloseTo(0.95);
    expect(plan.second!.a).toBeCloseTo(6.24);
    expect(plan.second!.b).toBeCloseTo(7.14);
    // From the first flight's top on, twice as deep as the walk turns from it: the DXF's landing, −0.94 to −1.84.
    expect(plan.landing!.from).toBeCloseTo(-0.94);
    expect(plan.landing!.to).toBeCloseTo(-1.84);
    expect([plan.landing!.lo, plan.landing!.hi]).toEqual([6.24, 8.31]);
    // The second flight reaches back to the first's foot: sixteen risers in all.
    expect(plan.second!.lines).toHaveLength(8);
    expect(plan.second!.lines[7]).toBeCloseTo(0.95);
    expect(plan.shown).toBe(1);
  });

  it("without a walk line, takes a run beside the first to climb back", () => {
    const beside: TreadRun = { ...LOWER, a: 6.24, b: 7.14 };
    const plan = stairPlan([LOWER, beside], [], []);
    expect(plan.second).not.toBeNull();
    expect(plan.second!.dir).toBe(-plan.first.dir as 1 | -1);
  });
});

describe("the stair built for the plan", () => {
  const plan = stairPlan([LOWER], WALK, FIRST_TREAD_OF_SECOND);

  it("on the floor it rises from: thin wood plates, a stone landing, continuous walk through the turn, all under the plan's cut", () => {
    const prims = stairRising(plan, 0, 2.97, "floor-0:stairs");
    const treads = treadBoxes(prims);
    expect(treads).toHaveLength(7 + 1);
    expect(boxes(prims, "floorStone")).toHaveLength(1);
    expect(Math.max(...treads.map(top))).toBeLessThanOrEqual(1.2 + 1e-9);
    // Thin plates (~4 cm), not solid slabs from the floor.
    for (const t of treads) expect(t.size.y).toBeLessThanOrEqual(0.05);
    const firstTops = treads.slice(0, 7).map(top);
    expect(firstTops).toEqual([...firstTops].sort((a, b) => a - b));
    // One span per flight + landing U-turn (3) + arrow (2) + break (1) — not a piece a tread.
    expect(boxes(prims, "screen").length).toBeGreaterThanOrEqual(1 + 3 + 1 + 2 + 1);
    expect(boxes(prims, "screen").length).toBeLessThan(14);
  });

  it("joins the walk line through the landing with no XZ gap at the turn", () => {
    const prims = stairRising(plan, 0, 2.97, "floor-0:stairs");
    const lines = boxes(prims, "screen").filter((b) => b.size.x >= 0.08);
    const ends = (b: (typeof lines)[0]): Array<[number, number]> => {
      const half = b.size.x / 2;
      const c = Math.cos(b.rotY ?? 0);
      const s = Math.sin(-(b.rotY ?? 0));
      return [
        [b.centre.x - half * c, b.centre.z - half * s],
        [b.centre.x + half * c, b.centre.z + half * s],
      ];
    };
    const close = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.05;
    const walk = lines.filter((b) => {
      const a = Math.abs(b.rotY ?? 0) % (Math.PI / 2);
      return a < 0.15 || a > Math.PI / 2 - 0.15;
    });
    // Flat spans: first flight, 3 landing, second flight — about 5 axis-aligned pieces.
    expect(walk.length).toBeGreaterThanOrEqual(4);
    expect(walk.length).toBeLessThanOrEqual(8);
    const orphans = walk.filter((b) => {
      const [p, q] = ends(b);
      const hit = (pt: [number, number]) => walk.some((o) => o !== b && ends(o).some((e) => close(e, pt)));
      return !hit(p!) || !hit(q!);
    });
    expect(orphans.length).toBeLessThanOrEqual(2);
  });

  it("on the floor it arrives at: both flights over the floor's finish, the arriving one above the first, behind a railing", () => {
    const level = 2.97;
    const prims = stairArriving(plan, level, "floor-1:stairs");
    const treads = treadBoxes(prims);
    expect(treads).toHaveLength(14);
    const [lower, upper] = [treads.slice(0, 7).map(top), treads.slice(7).map(top)];
    expect(Math.max(...lower)).toBeLessThan(Math.min(...upper));
    expect(Math.max(...upper)).toBeLessThanOrEqual(level + 0.48);
    // Every plate clear of the floor's finish (its top 2 cm over the level), under the plan's cut.
    expect(Math.min(...treads.map((t) => t.centre.y - t.size.y / 2))).toBeGreaterThan(level + 0.02);
    const landing = boxes(prims, "floorStone")[0]!;
    expect(top(landing)).toBeGreaterThan(Math.max(...lower));
    expect(top(landing)).toBeLessThan(Math.min(...upper));
    expect(boxes(prims, "glass").length).toBeGreaterThan(0);
  });

  it("stands every step solid on the floor, with a pale nosing, a hairline shadow gap and a cheek down each side", () => {
    const prims = stairRising(plan, 0, 2.97, "floor-0:stairs");
    const treads = treadBoxes(prims);
    const bodies = boxes(prims, "plaster").filter((b) => b.centre.y - b.size.y / 2 <= 1e-9 && b.size.x > 0.3 && b.size.z > 0.1);
    // A body under every plate, and one under the landing — from the floor, no air under a tread.
    expect(bodies.length).toBeGreaterThanOrEqual(treads.length);
    for (const t of treads) {
      const under = bodies.find((b) => Math.abs(top(b) - (t.centre.y - t.size.y / 2)) < 1e-6 && Math.abs(b.centre.x - t.centre.x) < 1e-6 && Math.abs(b.centre.z - t.centre.z) < 1e-6);
      expect(under).toBeDefined();
    }
    expect(boxes(prims, "metal").length).toBeGreaterThanOrEqual(treads.length);
    expect(boxes(prims, "darkSteel").length).toBeGreaterThanOrEqual(treads.length);
    // The gap is a hairline, not a bar.
    for (const g of boxes(prims, "darkSteel")) expect(Math.min(g.size.x, g.size.z)).toBeLessThanOrEqual(0.015);
    // Cheeks: two narrow plaster strips a tread, level with the plate.
    const cheeks = boxes(prims, "plaster").filter((b) => Math.min(b.size.x, b.size.z) <= 0.051 && b.size.y > 0.1);
    expect(cheeks.length).toBeGreaterThanOrEqual(2 * treads.length);
  });

  it("tones each tread by its height, the lowest the darkest, and lays a soft shade at each tread's far edge", () => {
    const prims = stairRising(plan, 0, 2.97, "floor-0:stairs");
    const treads = treadBoxes(prims);
    const toneOf = (t: (typeof treads)[0]) => Number(t.material.slice(-1));
    const first = treads.slice(0, 7);
    expect(first.map(toneOf)).toEqual([...first.map(toneOf)].sort((a, b) => b - a));
    expect(toneOf(first[0]!)).toBeGreaterThan(toneOf(first[6]!));
    expect(new Set(treads.map(toneOf)).size).toBeGreaterThanOrEqual(3);
    const shades = boxes(prims, "stairShade");
    expect(shades.length).toBe(2 * treads.length);
    for (const sh of shades) expect(Math.min(sh.size.x, sh.size.z)).toBeLessThanOrEqual(0.101);
  });

  it("keeps the plan's break line to the flight it crosses, not across the room beside it", () => {
    const prims = stairRising(plan, 0, 2.97, "floor-0:stairs");
    const second = plan.second!;
    const slants = boxes(prims, "screen").filter((b) => Math.abs(Math.sin(2 * (b.rotY ?? 0))) > 0.1 && b.size.x > 0.3);
    expect(slants.length).toBe(1);
    const c = slants[0]!;
    const half = (c.size.x / 2) * Math.abs(Math.cos(c.rotY ?? 0));
    expect(c.centre.x - half).toBeGreaterThanOrEqual(second.a - 0.01);
    expect(c.centre.x + half).toBeLessThanOrEqual(second.b + 0.01);
  });
});

describe("clipSegTo", () => {
  it("cuts a slanted line to an interval along an axis", () => {
    const cut = clipSegTo(seg(6.15, -0.42, 7.3, -0.65), "x", 6.24, 7.14)!;
    expect(cut.x1).toBeCloseTo(6.24);
    expect(cut.x2).toBeCloseTo(7.14);
    expect(cut.z1).toBeCloseTo(-0.42 + (-0.23 * (6.24 - 6.15)) / 1.15, 3);
    expect(clipSegTo(seg(1, 0, 2, 0), "x", 3, 4)).toBeNull();
    expect(clipSegTo(seg(1, 0, 2, 1), "x", 0, 5)).toEqual(seg(1, 0, 2, 1));
  });
});
