import { elevationFrame } from "@/lib/projects/building/elevation-frame";
import { gradeFindings } from "@/lib/projects/building/house-audit";
import { verifyFaces, type FaceFacts, type PlanFacts } from "@/lib/projects/building/house-faces";
import {
  levelSymbols,
  parseLevelText,
  siteLevelsFrom,
  standsOnLand,
  verifyLevelReading,
  withLevelMarks,
  type ElevationLevels,
  type LevelMark,
  type LevelReading,
} from "@/lib/projects/building/house-levels";
import { verifyYardKind, type YardTexture } from "@/lib/projects/building/house-yard-ai";
import { DWF_FLOOR_UNITS_PER_METRE as upm } from "@/lib/projects/dwf-building";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";

type Seg = DwfGeometry["segments"][number];
const seg = (x1: number, y1: number, x2: number, y2: number): Seg => ({ x1, y1, x2, y2, lineWidth: 1 });
const sheet = (segments: Seg[]): DwfGeometry => ({ pageWidth: 800, pageHeight: 400, segments, curves: [], walls: [], texts: [], fills: [], arcs: [] });

/** A level mark's triangle as CAD draws it: a lid, and two legs falling ~29° to the tip. */
const triangle = (x: number, y: number, w = 16): Seg[] => [
  seg(x - w / 2, y - 0.28 * w, x + w / 2, y - 0.28 * w),
  seg(x - w / 2, y - 0.28 * w, x, y),
  seg(x + w / 2, y - 0.28 * w, x, y),
];

/** The soil's hatch under a point: short strokes woven both ways, or one way only. */
const soil = (x: number, y: number, both = true): Seg[] =>
  Array.from({ length: 8 }, (_, k) => {
    const cx = x - 0.4 * upm + k * 0.1 * upm;
    const cy = y + 0.3 * upm;
    const h = 0.1 * upm;
    return [seg(cx - h, cy + h, cx + h, cy - h), ...(both ? [seg(cx - h, cy - h, cx + h, cy + h)] : [])];
  }).flat();

const ZERO = 300;
const at = (rel: number) => ZERO - upm * rel;
/** Where a vision model puts a mark's text: just above its triangle. */
const read = (text: string, x: number, rel: number, kind: LevelReading["kind"] = "floor"): LevelReading => ({ text, at: { x, y: at(rel) - 3 }, kind });

describe("level marks read off a facade", () => {
  it("parses the ways a level is printed", () => {
    expect(parseLevelText("±0.00=160.70")).toEqual({ rel: 0, abs: 160.7 });
    expect(parseLevelText("+5.07")).toEqual({ rel: 5.07, abs: null });
    expect(parseLevelText("−0.70=160.00")).toEqual({ rel: -0.7, abs: 160 });
    expect(parseLevelText("158.63")).toEqual({ rel: null, abs: 158.63 });
    expect(parseLevelText("חזית")).toBeNull();
  });

  it("finds the triangles a sheet draws", () => {
    const g = sheet([...triangle(100, at(0)), ...triangle(300, at(2.1)), seg(0, 50, 40, 70)]);
    const found = levelSymbols(g).sort((a, b) => a.x - b.x);
    expect(found).toHaveLength(2);
    expect(found[0]!.x).toBeCloseTo(100, 1);
    expect(found[1]!.y).toBeCloseTo(at(2.1), 1);
  });

  it("keeps the values that stand on their triangles at 1:100 and drops the rest", () => {
    const g = sheet([...triangle(100, at(0)), ...triangle(200, at(2.1)), ...triangle(300, at(4.07)), ...triangle(400, at(6.94)), ...triangle(500, at(-1.17))]);
    const levels = verifyLevelReading(g, [
      read("±0.00=160.70", 100, 0),
      read("+2.10", 200, 2.1, "opening"),
      read("+4.07", 300, 4.07),
      read("+6.94", 400, 6.94, "roof"),
      read("159.53", 500, -1.17, "ground"),
      read("+3.00", 200, 2.1),
      read("+9.99", 700, 9.99),
    ]);
    expect(levels.ok).toBe(true);
    expect(levels.datum).toBe(160.7);
    expect(levels.marks.map((m) => m.text).sort()).toEqual(["+2.10", "+4.07", "+6.94", "159.53", "±0.00=160.70"].sort());
    expect(levels.marks.find((m) => m.text === "159.53")?.rel).toBeCloseTo(-1.17, 2);
    expect(levels.zeroY).toBeCloseTo(ZERO, 0);
    expect(levels.rejected.map((r) => r.text).sort()).toEqual(["+3.00", "+9.99"]);
  });

  it("refuses marks that climb at another scale than the sheet's", () => {
    const half = (rel: number) => ZERO - (upm / 2) * rel;
    const g = sheet([...triangle(100, half(0)), ...triangle(200, half(2.1)), ...triangle(300, half(4.07)), ...triangle(400, half(6.94))]);
    const levels = verifyLevelReading(
      g,
      [0, 2.1, 4.07, 6.94].map((rel, i) => ({ text: rel ? `+${rel.toFixed(2)}` : "±0.00", at: { x: 100 * (i + 1), y: half(rel) - 3 }, kind: "floor" as const })),
    );
    expect(levels.ok).toBe(false);
  });
});

describe("a house elevation's frame from its outline", () => {
  const levels = (rels: number[]): ElevationLevels => ({
    ok: true,
    marks: rels.map((rel, i) => ({ x: 120 + 40 * i, y: at(rel), rel, abs: null, kind: "floor", text: `+${rel.toFixed(2)}` })),
    datum: null,
    zeroY: ZERO,
    scale: upm,
    rejected: [],
  });

  it("spans the walls standing from ±0.00 to the roof, not the border, a fence or a wall below", () => {
    const g = sheet([
      seg(100, at(0), 100, at(2.4)),
      seg(100, at(2.4), 100, at(6.94)),
      seg(550, at(0), 550, at(6.94)),
      seg(550, at(-2), 550, at(0)),
      seg(5, at(-3.5), 5, at(8.3)),
      seg(780, at(-3.5), 780, at(8.3)),
      seg(620, at(-0.5), 620, at(1.2)),
      seg(300, at(0), 300, at(2.1)),
    ]);
    const frame = elevationFrame(withLevelMarks(g, levels([0, 2.1, 4.07, 6.94])), upm, { house: true });
    expect(frame?.left).toBeCloseTo(100, 1);
    expect(frame?.right).toBeCloseTo(550, 1);
    expect(frame?.bottomM).toBe(-2.5);
  });

  it("has no frame without marks to stand it on", () => {
    expect(elevationFrame(sheet([seg(100, at(0), 100, at(6.94)), seg(550, at(0), 550, at(6.94))]), upm, { house: true })).toBeNull();
  });
});

describe("the plot's levels from the facades", () => {
  const mark = (x: number, rel: number, kind: LevelMark["kind"], text: string): LevelMark => ({ x, y: at(rel), rel, abs: null, kind, text });

  it("tells cut land from a wall's section and from a mark over a car", () => {
    expect(standsOnLand(sheet(soil(200, 250)), { x: 200, y: 250 })).toBe(true);
    expect(standsOnLand(sheet(soil(200, 250, false)), { x: 200, y: 250 })).toBe(false);
    expect(standsOnLand(sheet([]), { x: 200, y: 250 })).toBe(false);
  });

  it("takes each end's outermost land, the bays' levels, and drops marks not on the land", () => {
    const marks = [
      mark(40, -1.2, "ground", "159.50"),
      mark(80, -0.4, "ground", "160.30"),
      mark(600, 1.1, "ground", "161.80"),
      mark(180, -1.7, "parking", "159.00"),
      mark(480, 0.3, "parking", "+0.30=161.00"),
      mark(300, 4.07, "floor", "+4.07"),
    ];
    const g = sheet([...soil(40, at(-1.2)), ...soil(80, at(-0.4)), ...soil(600, at(1.1)), ...soil(180, at(-1.7)), ...soil(480, at(0.3), false)]);
    const levels: ElevationLevels = { ok: true, marks, datum: 160.7, zeroY: ZERO, scale: upm, rejected: [] };
    const site = siteLevelsFrom([{ face: "south", g, levels, left: 120, right: 560, centreX: 340 }]);
    expect(site.levels).toEqual({ west: -1.2, east: 1.1, parkingWest: -1.7 });
    expect(site.dropped).toEqual(["+0.30=161.00 (parking, south)"]);
  });

  it("reads nothing from an elevation whose marks were not verified", () => {
    const levels: ElevationLevels = { ok: false, marks: [mark(40, -1.2, "ground", "159.50")], datum: null, zeroY: ZERO, scale: upm, rejected: [] };
    expect(siteLevelsFrom([{ face: "west", g: sheet(soil(40, at(-1.2))), levels, left: 100, right: 500, centreX: 300 }]).levels).toEqual({});
  });
});

describe("which face each elevation draws", () => {
  const facts: FaceFacts[] = [
    { widthM: 15.9, parkingSide: null, landLeft: -2.07, landRight: 0.3, landAll: -1.45 },
    { widthM: 14.46, parkingSide: "right", landLeft: -1.17, landRight: -2.07, landAll: -1.62 },
    { widthM: 15.9, parkingSide: null, landLeft: -0.15, landRight: 0.1, landAll: -0.54 },
  ];
  const plan: PlanFacts = { widthX: 16.86, depthZ: 14.7, front: "south" };

  it("accepts faces the drawings and the plan bear out", () => {
    const verdict = verifyFaces([{ face: "south", lowEnd: "left" }, { face: "west" }, { face: "north" }], facts, plan);
    expect(verdict.failures).toEqual([]);
    expect(verdict.ok).toBe(true);
    expect(verdict.checks.length).toBeGreaterThanOrEqual(3);
  });

  it("refuses a side named as a front, a face named twice, and a slope read the wrong way", () => {
    expect(verifyFaces([{ face: "south" }, { face: "north" }, { face: "west" }], facts, plan).ok).toBe(false);
    expect(verifyFaces([{ face: "south" }, { face: "south" }, { face: "north" }], facts, plan).ok).toBe(false);
    expect(verifyFaces([{ face: "south", lowEnd: "right" }, { face: "west" }, { face: "north" }], facts, plan).ok).toBe(false);
    expect(verifyFaces([null, { face: "west" }, { face: "north" }], facts, plan).ok).toBe(false);
  });

  it("refuses a parking end the plan's street does not explain", () => {
    const flipped = facts.map((f, i) => (i === 1 ? { ...f, parkingSide: "left" as const } : f));
    expect(verifyFaces([{ face: "south" }, { face: "west" }, { face: "north" }], flipped, plan).ok).toBe(false);
  });
});

describe("the plot's unnamed parts", () => {
  const texture = (t: Partial<YardTexture>): YardTexture => ({ areaM2: 4, dots: 0, herringbone: 0, shrubs: 0, treads: 0, thickM: 1.5, ...t });

  it("lays a garden only where the ink is a garden's", () => {
    expect(verifyYardKind("planting", texture({ dots: 4 })).laid).toBe(true);
    expect(verifyYardKind("lawn", texture({ shrubs: 2 })).laid).toBe(true);
    expect(verifyYardKind("lawn", texture({ dots: 4, herringbone: 3 })).laid).toBe(false);
    expect(verifyYardKind("planting", texture({ dots: 4, thickM: 0.5 })).laid).toBe(false);
    expect(verifyYardKind("planting", texture({})).laid).toBe(false);
    expect(verifyYardKind("paving", texture({ dots: 4 })).laid).toBe(false);
  });
});

describe("the audit's findings", () => {
  it("keeps sure, well-formed findings and marks the ones the build contradicts", () => {
    const raw = [
      { element: "window", issue: "missing", where: "north, first floor", confidence: 0.9 },
      { element: "door", issue: "missing", where: "x", confidence: 0.3 },
      { element: "parking", issue: "missing", where: "front", confidence: 0.8 },
      { element: "tree", issue: "broken", where: "x" },
      { element: "spaceship", issue: "extra", where: "roof" },
    ];
    const kept = gradeFindings("elev-south", raw, { parking: 2 });
    expect(kept.map((f) => [f.element, f.issue])).toEqual([
      ["window", "missing"],
      ["parking", "missing"],
      ["other", "extra"],
    ]);
    expect(kept[1]!.contradicted).toBeTruthy();
    expect(kept[0]!.contradicted).toBeUndefined();
    expect(gradeFindings("x", Array.from({ length: 12 }, () => raw[0]), { parking: 0 })).toHaveLength(8);
  });

  it("contradicts a missing fence or gate the build stood up, and the plot an upper floor's render leaves out", () => {
    const raw = [
      { element: "fence", issue: "missing", where: "גדר קדמית", confidence: 0.9 },
      { element: "gate", issue: "missing", where: "שער כניסה", confidence: 0.9 },
      { element: "window", issue: "missing", where: "חזית", confidence: 0.9 },
      { element: "balcony", issue: "missing", where: "חזית", confidence: 0.9 },
    ];
    const ground = gradeFindings("floor-0", raw, { parking: 4, built: { fence: 29, gate: 1 } });
    expect(ground.map((f) => Boolean(f.contradicted))).toEqual([true, true, false, false]);
    expect(gradeFindings("floor-0", raw, { parking: 4, built: { fence: 0, gate: 0 } }).some((f) => f.contradicted)).toBe(false);
    const upper = gradeFindings("floor-1", [{ element: "lawn", issue: "missing", where: "x" }, { element: "lawn", issue: "extra", where: "x" }], { parking: 4, hidden: ["lawn"] });
    expect(upper.map((f) => Boolean(f.contradicted))).toEqual([true, false]);
  });
});
