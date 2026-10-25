import { insidePolygon, slab, type Outline } from "@/lib/projects/building/assemble";
import { HOUSE_WINDOW_FRAME } from "@/lib/projects/building/house-finish";
import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";
import { dilate, drawLine, emptyMask, erode, fillPolygon, label, traceOutline, type Mask } from "@/lib/projects/building/raster";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";

/**
 * A private house's plot, as its ground-floor sheet draws it.
 *
 * The sheet draws the whole plot round the house: its boundary as the
 * longest lines on the sheet, the garden in a dotted pen, the parking bays in
 * an interlocking-paver herringbone with "חניה" written in each, and the
 * gate, the bins and the electricity pillar by name. Everything else inside
 * the boundary is paved. The levels come from the elevations, as metres from
 * ±0.00. Sides here are the plan's (compass.ts): `west` is the plot's left
 * on the sheet and `east` its right, wherever true north points.
 */
export type HouseSiteLevels = {
  /** The land at the plot's left (−x) and right (+x) side. */
  west: number;
  east: number;
  /** The bays on the plot's left and right half. */
  parkingWest?: number;
  parkingEast?: number;
  /**
   * The sidewalk along the street side, as its elevation marks it: each
   * [metres along the street from the house's middle, toward the plan's +x
   * or +z, level]. Absent: the land's fall from `west` to `east`.
   */
  street?: Array<[number, number]>;
  /** The land a side door's steps come down to, by the plan's side the door is on, where it is not the side's own. */
  sideFlights?: Partial<Record<"west" | "east" | "north" | "south", number>>;
};

/** The plot's levels the elevations' marks may each give. */
export type HouseSiteLevelKey = "west" | "east" | "parkingWest" | "parkingEast";

/** The level along a profile of [at, level] points: straight between them, flat past its ends. */
export function profileAt(profile: Array<[number, number]>, at: number): number {
  const p = [...profile].sort((a, b) => a[0] - b[0]);
  if (at <= p[0]![0]) return p[0]![1];
  for (let i = 1; i < p.length; i++) {
    const [a, b] = [p[i - 1]!, p[i]!];
    if (at <= b[0]) return a[1] + ((b[1] - a[1]) * (at - a[0])) / Math.max(1e-9, b[0] - a[0]);
  }
  return p[p.length - 1]![1];
}

export type HouseYard = {
  primitives: Primitive[];
  plot: { x0: number; z0: number; x1: number; z1: number };
  /** The ground outside the plot, metres, for the land round it. */
  heightAt: (x: number, z: number) => number;
  /** Where the land round the plot must not grow a tree: the plot and the street. */
  built: (x: number, z: number) => boolean;
  parking: number;
};

const CELL_M = 0.1;
const PARKING = /חניה/;
const GATE = /שער/;
const BINS = /אשפה/;
const PILLAR = /פילר/;
const CAR_COLOURS = [0xb8bec6, 0x2c3036, 0xf1f1ee, 0x22364f, 0x6b6f75, 0x8a1f24];
/** How deep the plot's paving is laid: below the lowest bay, so a sunk bay shows its sides. */
const DEPTH_M = 1.6;
const SIDEWALK_M = 2.2;
const STREET_WALL_M = 0.6;
const RAILING_TOP_M = 1.2;
const ROAD_M = 7;
/** The land's grid step round a house (house-finish.ts). */
const TERRAIN_CELL_M = 1.25;

type Side = "north" | "south" | "east" | "west";

function angleOff45(s: { x1: number; y1: number; x2: number; y2: number }): number {
  let a = Math.abs((Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI) % 180;
  a = Math.min(a, 180 - a);
  return Math.abs(a - 45);
}

function close(mask: Mask, r: number): Mask {
  return erode(dilate(mask, r), r);
}

function minus(a: Mask, b: Mask): Mask {
  const data = new Uint8Array(a.data.length);
  for (let k = 0; k < data.length; k++) data[k] = a.data[k] && !b.data[k] ? 1 : 0;
  return { cols: a.cols, rows: a.rows, data };
}

/** Each part of a mask at least `minPx` big, as its own mask. */
function parts(mask: Mask, minPx: number): Mask[] {
  const { ids, sizes } = label(mask, 1);
  const out: Mask[] = [];
  const index = new Map<number, Mask>();
  sizes.forEach((size, id) => {
    if (id === 0 || size < minPx) return;
    const m = emptyMask(mask.cols, mask.rows);
    index.set(id, m);
    out.push(m);
  });
  for (let k = 0; k < ids.length; k++) {
    const m = index.get(ids[k]!);
    if (m) m.data[k] = 1;
  }
  return out;
}

function bounds(mask: Mask): { x0: number; y0: number; x1: number; y1: number } {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (let k = 0; k < mask.data.length; k++) {
    if (!mask.data[k]) continue;
    const x = k % mask.cols;
    const y = (k - x) / mask.cols;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}

/** A wall from (ax, az) to (bx, bz), axis-aligned, between `y0` and `y1`. */
function wallBox(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, thick: number, material: BuildingMaterial, tag: string): Primitive | null {
  const along = Math.hypot(bx - ax, bz - az);
  if (along < 0.05 || y1 - y0 < 0.05) return null;
  const horizontal = Math.abs(bx - ax) >= Math.abs(bz - az);
  return {
    type: "box",
    centre: { x: (ax + bx) / 2, y: (y0 + y1) / 2, z: (az + bz) / 2 },
    size: horizontal ? { x: along, y: y1 - y0, z: thick } : { x: thick, y: y1 - y0, z: along },
    material,
    tag,
  };
}

/** The open stretches of [a, b] once the gaps are taken out. */
function openRuns(a: number, b: number, gaps: Array<[number, number]>): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let at = a;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g1 <= at || g0 >= b) continue;
    if (g0 > at) runs.push([at, g0]);
    at = Math.max(at, g1);
  }
  if (at < b) runs.push([at, b]);
  return runs;
}

/** A part of the plot the sheet's pens leave unnamed, which the vision model may name. */
export type YardRegion = { id: number; ring: Array<[number, number]>; areaM2: number; box: { x0: number; y0: number; x1: number; y1: number } };

/** A region the vision model named and the sheet's lines bore out: in the sheet's own units. */
export type YardHint = { ring: Array<[number, number]>; kind: "lawn" | "planting" };

/** The plot's frame and what its pens draw: the house, the garden's dots, the pavers' herringbone. The sheet must draw a plot (`plotLines`). */
function readYard(input: { sheet: DwfGeometry; shift: { x: number; y: number }; outlines: Outline[] }) {
  const { sheet, shift, outlines } = input;
  const upm = DWF_FLOOR_UNITS_PER_METRE;
  // A CAD file's plot is its plot block; else the sheet's longest lines bound it.
  const longest = sheet.segments.filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / upm >= 15);
  const pd = sheet.plotDrawn;
  const px0 = pd ? pd.x0 : Math.min(...longest.flatMap((s) => [s.x1, s.x2]));
  const px1 = pd ? pd.x1 : Math.max(...longest.flatMap((s) => [s.x1, s.x2]));
  const py0 = pd ? pd.y0 : Math.min(...longest.flatMap((s) => [s.y1, s.y2]));
  const py1 = pd ? pd.y1 : Math.max(...longest.flatMap((s) => [s.y1, s.y2]));

  const cell = upm * CELL_M;
  const cols = Math.ceil((px1 - px0) / cell) + 1;
  const rows = Math.ceil((py1 - py0) / cell) + 1;
  const toPx = (x: number, y: number): [number, number] => [(x - px0) / cell, (y - py0) / cell];
  const toM = (rx: number, ry: number): [number, number] => [px0 / upm + rx * CELL_M + shift.x, py0 / upm + ry * CELL_M + shift.y];
  const fromM = (x: number, z: number): [number, number] => toPx((x - shift.x) * upm, (z - shift.y) * upm);
  const inPlot = (x: number, y: number) => x >= px0 && x <= px1 && y >= py0 && y <= py1;

  const plot = { x0: px0 / upm + shift.x, z0: py0 / upm + shift.y, x1: px1 / upm + shift.x, z1: py1 / upm + shift.y };
  const house = emptyMask(cols, rows);
  for (const ring of outlines) fillPolygon(house, ring.map(([x, z]) => fromM(x, z)));
  const building = dilate(house, 3);
  const free = (x: number, y: number) => {
    const [rx, ry] = toPx(x, y).map(Math.round) as [number, number];
    return rx >= 0 && ry >= 0 && rx < cols && ry < rows && !building.data[ry * cols + rx];
  };

  // The garden's pen: the one that draws most of the dots outside the house.
  const dots = new Map<number, number>();
  for (const s of sheet.segments) {
    if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / upm >= 0.06) continue;
    const [mx, my] = [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2];
    if (!inPlot(mx, my) || !free(mx, my)) continue;
    const pen = s.stroke ?? -1;
    dots.set(pen, (dots.get(pen) ?? 0) + 1);
  }
  const [dotPen, dotCount] = [...dots].sort((a, b) => b[1] - a[1])[0] ?? [-1, 0];

  const lawnInk = emptyMask(cols, rows);
  const paverInk = emptyMask(cols, rows);
  for (const s of sheet.segments) {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / upm;
    const [mx, my] = [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2];
    if (!inPlot(mx, my)) continue;
    const [ax, ay] = toPx(s.x1, s.y1);
    const [bx, by] = toPx(s.x2, s.y2);
    if (len < 0.06 && dotCount > 500 && (s.stroke ?? -1) === dotPen) drawLine(lawnInk, ax, ay, bx, by);
    else if (len >= 0.1 && len <= 0.8 && (s.stroke ?? -1) !== dotPen && angleOff45(s) < 8) drawLine(paverInk, ax, ay, bx, by);
  }
  // A CAD file names its lawn and its paving itself (sheet.zones): those
  // outlines are the yard's, and its dots and strokes are not read for them.
  const zoned = (kind: "lawn" | "paving") => (sheet.zones ?? []).filter((z) => z.kind === kind);
  const fromZones = zoned("lawn").length > 0;
  if (fromZones) {
    lawnInk.data.fill(0);
    for (const z of zoned("lawn")) fillPolygon(lawnInk, z.ring.map(([x, y]) => toPx(x, y)));
  }
  if (zoned("paving").length) {
    paverInk.data.fill(0);
    for (const z of zoned("paving")) fillPolygon(paverInk, z.ring.map(([x, y]) => toPx(x, y)));
  }
  const pavers = parts(minus(zoned("paving").length ? paverInk : close(paverInk, 3), building), Math.round(4 / (CELL_M * CELL_M)));
  return { upm, px0, py0, px1, py1, cell, cols, rows, toPx, toM, fromM, inPlot, plot, building, lawnInk, paverInk, pavers, dotPen, fromZones };
}

/**
 * The parts of the plot the sheet's pens name nothing in — not the house, the
 * garden's dots or the pavers — cut apart by the lines the sheet draws round
 * them, each 1.5 to 150 m². The sheet leaves them paved.
 */
export function yardRegions(input: { sheet: DwfGeometry; shift: { x: number; y: number }; outlines: Outline[] }): YardRegion[] {
  if (!plotLines(input.sheet)) return [];
  const y = readYard(input);
  const lines = emptyMask(y.cols, y.rows);
  for (const s of input.sheet.segments) {
    if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / y.upm < 0.3) continue;
    const [ax, ay] = y.toPx(s.x1, s.y1);
    const [bx, by] = y.toPx(s.x2, s.y2);
    drawLine(lines, ax, ay, bx, by);
  }
  const named = emptyMask(y.cols, y.rows);
  for (const m of [y.building, close(y.lawnInk, 3), close(y.paverInk, 3), dilate(lines, 1)]) for (let k = 0; k < named.data.length; k++) if (m.data[k]) named.data[k] = 1;
  const open = emptyMask(y.cols, y.rows);
  open.data.fill(1);
  const out: YardRegion[] = [];
  const min = Math.round(1.5 / (CELL_M * CELL_M));
  const max = Math.round(150 / (CELL_M * CELL_M));
  for (const part of parts(minus(open, named), min)) {
    const size = part.data.reduce((n, v) => n + v, 0);
    if (size > max) continue;
    const b = bounds(part);
    const ring = traceOutline(part).map(([rx, ry]) => [y.px0 + rx * y.cell, y.py0 + ry * y.cell] as [number, number]);
    if (ring.length < 3) continue;
    out.push({
      id: out.length + 1,
      ring,
      areaM2: Math.round(size * CELL_M * CELL_M * 10) / 10,
      box: { x0: y.px0 + b.x0 * y.cell, y0: y.py0 + b.y0 * y.cell, x1: y.px0 + (b.x1 + 1) * y.cell, y1: y.py0 + (b.y1 + 1) * y.cell },
    });
  }
  return out;
}

function plotLines(sheet: DwfGeometry): boolean {
  const upm = DWF_FLOOR_UNITS_PER_METRE;
  const longest = sheet.segments.filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / upm >= 15);
  if (longest.length < 2) return false;
  const xs = longest.flatMap((s) => [s.x1, s.x2]);
  const ys = longest.flatMap((s) => [s.y1, s.y2]);
  return (Math.max(...xs) - Math.min(...xs)) / upm >= 8 && (Math.max(...ys) - Math.min(...ys)) / upm >= 8;
}

/**
 * The plot round a house, from its ground floor sheet.
 *
 * `sheet` is the floor's own sheet and `shift` the metres that land it in the
 * building's frame. Answers null when the sheet draws no plot boundary.
 * `hints` are regions the sheet leaves unnamed that the vision model named
 * and the sheet's lines bore out: a lawn or a bed is laid there in grass.
 */
export function houseYard(input: {
  sheet: DwfGeometry;
  shift: { x: number; y: number };
  ground: number;
  outlines: Outline[];
  levels?: HouseSiteLevels;
  hints?: YardHint[];
}): HouseYard | null {
  const { sheet, shift, ground } = input;
  if (!plotLines(sheet)) return null;
  const { upm, cols, rows, toPx, toM, inPlot, plot, building, lawnInk, pavers, px0, px1, py0, py1, fromZones } = readYard(input);
  const plotBox = { x0: px0, x1: px1, y0: py0, y1: py1 };
  const toMetres = (t: { x: number; y: number }) => {
    const [rx, ry] = toPx(t.x, t.y);
    return toM(rx, ry);
  };
  const named = (re: RegExp) => sheet.texts.filter((t) => re.test(t.text) && inPlot(t.x, t.y)).map(toMetres);
  // A CAD file places its bays itself: each block's middle is a bay's mark.
  const parkingLabels = sheet.parkingDrawn?.length
    ? sheet.parkingDrawn.map((p) => toMetres({ x: p.x + p.w / 2, y: p.y + p.h / 2 }))
    : named(PARKING);
  // A gate's name is written on the sidewalk in front of it, just past the boundary.
  const reach = 2 * upm;
  const gates = sheet.texts
    .filter((t) => GATE.test(t.text) && t.x >= plotBox.x0 - reach && t.x <= plotBox.x1 + reach && t.y >= plotBox.y0 - reach && t.y <= plotBox.y1 + reach)
    .map(toMetres)
    .map(([x, z]) => [Math.min(plot.x1, Math.max(plot.x0, x)), Math.min(plot.z1, Math.max(plot.z0, z))] as [number, number]);

  const levelAt = (x: number) => {
    const lv = input.levels;
    if (!lv) return 0;
    const t = Math.max(-0.4, Math.min(1.4, (x - plot.x0) / Math.max(1e-6, plot.x1 - plot.x0)));
    return lv.west + (lv.east - lv.west) * t;
  };
  const midX = (plot.x0 + plot.x1) / 2;

  const prims: Primitive[] = [];
  // Traced exactly, its steps kept square: simplified at 3 px (30 cm), a lawn's
  // step at the house's edge was drawn as one long slanted line (13/10/2026).
  const ring = (m: Mask): Outline => traceOutline(m, 0.5).map(([rx, ry]) => toM(rx, ry));
  const plotRing: Outline = [[plot.x0, plot.z0], [plot.x1, plot.z0], [plot.x1, plot.z1], [plot.x0, plot.z1]];
  const sunk: Outline[] = [];

  const parkingMask = emptyMask(cols, rows);
  const bays: Array<{ x0: number; x1: number; z0: number; z1: number; top: number; ring: Outline }> = [];
  for (const part of pavers) {
    const b = bounds(part);
    const [bx0, bz0] = toM(b.x0, b.y0);
    const [bx1, bz1] = toM(b.x1 + 1, b.y1 + 1);
    const labels = parkingLabels.filter(([x, z]) => x >= bx0 - 1.5 && x <= bx1 + 1.5 && z >= bz0 - 1.5 && z <= bz1 + 1.5);
    const outline = ring(part);
    if (outline.length < 3) continue;
    if (labels.length === 0) {
      prims.push(slab(outline, ground - 0.01, 0.6, "paving", "yard:pavers"));
      continue;
    }
    for (let k = 0; k < part.data.length; k++) if (part.data[k]) parkingMask.data[k] = 1;
    const side = (bx0 + bx1) / 2 < midX ? input.levels?.parkingWest : input.levels?.parkingEast;
    const top = ground + (side ?? 0);
    prims.push(slab(outline, top, Math.max(0.6, top - ground + DEPTH_M), "paving", "yard:parking"));
    if (top < ground - 0.02) sunk.push(outline);
    bays.push({ x0: bx0, x1: bx1, z0: bz0, z1: bz1, top, ring: outline });
  }
  // The strips the land falls to beside the house: lower terraces of the plot.
  const terraces = sideTerraces(input.outlines, plot, input.levels);
  const terraceMask = terraces.map((t) => {
    const m = emptyMask(cols, rows);
    for (let ry = 0; ry < rows; ry++) {
      for (let rx = 0; rx < cols; rx++) {
        const [x, z] = toM(rx + 0.5, ry + 0.5);
        if (x >= t.x0 && x <= t.x1 && z >= t.z0 && z <= t.z1) m.data[ry * cols + rx] = 1;
      }
    }
    return m;
  });
  const terraceRings: Outline[] = terraces.map((t) => [[t.x0, t.z0], [t.x1, t.z0], [t.x1, t.z1], [t.x0, t.z1]]);
  // The street: the side the parking and the gate face.
  const facing = [...parkingLabels, ...gates];
  const fx = facing.length ? facing.reduce((s, [x]) => s + x, 0) / facing.length : midX;
  const fz = facing.length ? facing.reduce((s, [, z]) => s + z, 0) / facing.length : plot.z1;
  const front: Side = (
    [
      ["north", fz - plot.z0],
      ["south", plot.z1 - fz],
      ["west", fx - plot.x0],
      ["east", plot.x1 - fx],
    ] as Array<[Side, number]>
  ).sort((a, b) => a[1] - b[1])[0]![0];
  const streetAlongX = front === "north" || front === "south";
  const centre = centreOf(input.outlines);
  const profile = input.levels?.street?.length ? input.levels.street : null;
  /** The land by the street at a point, the sidewalk's kerb 0.15 below it: the sidewalk's own profile where the elevation marks one. */
  // Smoothed over 6 m: joined straight, two marks 1.6 m apart and 50 cm apart in height stood a step in the road.
  // Past the elevation's first and last marks the street holds level: run on
  // at its last slope, it climbed into a hill behind the house in the views
  // from above (12/10/2026).
  const [pFirst, pLast] = profile ? [Math.min(...profile.map(([u]) => u)), Math.max(...profile.map(([u]) => u))] : [0, 0];
  const smooth = (at: number) => {
    let sum = 0;
    let n = 0;
    for (let d = -3; d <= 3; d += 0.5) {
      const w = 1 - Math.abs(d) / 3.5;
      sum += w * profileAt(profile!, Math.max(pFirst, Math.min(pLast, at + d)));
      n += w;
    }
    return sum / n;
  };
  // And no steeper than a street is built (15%), held from the house outward:
  // the elevation's last mark at the plot's corner rose 1.5 m in 3 m.
  const STEP = 0.25;
  const SPAN = 60;
  const graded: number[] = [];
  if (profile) {
    const n = Math.round(SPAN / STEP);
    for (let i = -n; i <= n; i++) graded.push(smooth(i * STEP));
    const limit = 0.15 * STEP;
    for (let i = n + 1; i < graded.length; i++) graded[i] = Math.max(graded[i - 1]! - limit, Math.min(graded[i - 1]! + limit, graded[i]!));
    for (let i = n - 1; i >= 0; i--) graded[i] = Math.max(graded[i + 1]! - limit, Math.min(graded[i + 1]! + limit, graded[i]!));
  }
  const gradedAt = (at: number) => {
    const u = Math.max(0, Math.min(graded.length - 1.001, at / STEP + Math.round(SPAN / STEP)));
    const i = Math.floor(u);
    return graded[i]! + (graded[i + 1]! - graded[i]!) * (u - i);
  };
  const streetLand = (x: number, z: number) => (profile ? gradedAt(streetAlongX ? x - centre.x : z - centre.z) + 0.15 : levelAt(x));

  // The bins' enclosures, known before the boundary: the street wall is
  // opened in front of each, and its sides run on to the wall, so the bins
  // are wheeled out to the street — closed on four sides (the street wall
  // across its open front) they could not be emptied.
  // What the sheet draws of each: its inner rectangle, its walls' thickness,
  // each bin, and the opening in its front wall the bins are wheeled out through.
  const binDrawings = named(BINS).map(([lx, lz]) => (streetAlongX ? binsDrawn(sheet, lx - shift.x, lz - shift.y, upm) : null));
  const binBoxes = named(BINS).map(([lx, lz], i) => {
    const inner = binDrawings[i]?.inner;
    if (inner) return { x0: inner.x0 + shift.x, x1: inner.x1 + shift.x, z0: inner.z0 + shift.y, z1: inner.z1 + shift.y };
    const drawn = enclosure(sheet, (lx - shift.x) * upm, (lz - shift.y) * upm, upm);
    return drawn ? { x0: drawn.x0 + shift.x, x1: drawn.x1 + shift.x, z0: drawn.z0 + shift.y, z1: drawn.z1 + shift.y } : { x0: lx - 1.2, x1: lx + 1.2, z0: lz - 0.8, z1: lz + 0.8 };
  });
  // Each sunk to the sidewalk where the plot stands above it: wheeled out
  // level onto the sidewalk, not dropped off a ledge a metre high.
  const streetEdge = front === "south" ? plot.z1 : front === "north" ? plot.z0 : front === "east" ? plot.x1 : plot.x0;
  const binPits = binBoxes.map((b) => {
    const ring = {
      x0: front === "west" ? plot.x0 : b.x0,
      x1: front === "east" ? plot.x1 : b.x1,
      z0: front === "north" ? plot.z0 : b.z0,
      z1: front === "south" ? plot.z1 : b.z1,
    };
    const [cx, cz] = [(ring.x0 + ring.x1) / 2, (ring.z0 + ring.z1) / 2];
    const floor = Math.min(ground, ground + (streetAlongX ? streetLand(cx, streetEdge) : streetLand(streetEdge, cz)) - 0.15);
    return { ...ring, floor };
  });
  const pillars = named(PILLAR).map(([lx, lz]) => [lx, lz, streetAlongX ? pillarDrawn(sheet, lx - shift.x, lz - shift.y, upm) : null] as const);
  binDrawings.forEach((d, i) => {
    if (!d) return;
    // The pit takes the walls' outer faces too: the enclosure is sunk whole.
    binPits[i]!.x0 -= d.thick;
    binPits[i]!.x1 += d.thick;
  });
  const pitRings: Outline[] = binPits.filter((b) => b.floor < ground - 0.1).map((b) => [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]]);

  const deepest = Math.min(ground, ...bays.map((b) => b.top), ...terraces.map((t) => ground + t.level), ...binPits.map((b) => b.floor));
  // A bay ramped down to the sidewalk (below) cuts the paving it falls through.
  const kerbOf = (u: number) => ground + (streetAlongX ? streetLand(u, streetEdge) : streetLand(streetEdge, u)) - 0.15;
  const ramped = bays.filter((b) => b.top >= ground - 0.02 && b.top - kerbOf(streetAlongX ? (b.x0 + b.x1) / 2 : (b.z0 + b.z1) / 2) >= 0.12).map((b) => b.ring);
  const holes = [...sunk, ...terraceRings, ...pitRings, ...ramped];
  prims.push(slab(plotRing, ground - 0.03, Math.max(DEPTH_M, ground - deepest + 0.2), "floorStone", "yard:paving", holes.length ? holes : undefined));
  terraces.forEach((t, i) => prims.push(slab(terraceRings[i]!, ground + t.level - 0.03, DEPTH_M, "floorStone", "yard:paving")));

  // The sheet dots its lawn up to the plot's fence and the house's walls,
  // and its dots stop a hand short of the line: read as drawn, the lawn stood
  // off both with a strip of paving and a rounded corner, and the bank laid
  // to the fence showed as a rectangle (Gottlieb A, 13/10/2026). A lawn within
  // 80 cm of the fence or the house runs on to it — never over paving drawn
  // as pavers, a parking bay or the house.
  // Drawn as outlines, the lawn is exact: neither closed nor run on to the fence.
  const lawnDrawn = minus(fromZones ? lawnInk : close(lawnInk, 3), dilate(parkingMask, 1));
  const lawnReach = Math.round(0.8 / CELL_M);
  const nearHouse = dilate(building, lawnReach);
  const grown = dilate(lawnDrawn, lawnReach);
  const blocked = dilate(parkingMask, 1);
  const paved = emptyMask(cols, rows);
  for (const pv of pavers) for (let k = 0; k < pv.data.length; k++) if (pv.data[k]) paved.data[k] = 1;
  // Not in the front yard, between the house and the street: its paths and
  // bays are drawn plain, and a lawn run on there hugged every one of them.
  let [bx0, bx1, by0, by1] = [cols, -1, rows, -1];
  for (let k = 0; k < building.data.length; k++) {
    if (!building.data[k]) continue;
    const [x, y] = [k % cols, Math.floor(k / cols)];
    [bx0, bx1, by0, by1] = [Math.min(bx0, x), Math.max(bx1, x), Math.min(by0, y), Math.max(by1, y)];
  }
  const frontYard = (x: number, y: number) => (front === "south" ? y > by1 : front === "north" ? y < by0 : front === "east" ? x > bx1 : x < bx0);
  const lawn = emptyMask(cols, rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const k = y * cols + x;
      if (lawnDrawn.data[k]) { lawn.data[k] = 1; continue; }
      if (fromZones || (bx1 >= 0 && frontYard(x, y))) continue;
      const edge = x < lawnReach || y < lawnReach || x >= cols - lawnReach || y >= rows - lawnReach || nearHouse.data[k];
      if (edge && grown.data[k] && !building.data[k] && !blocked.data[k] && !paved.data[k]) lawn.data[k] = 1;
    }
  }
  const pavedNear = dilate(paved, 1);
  for (let k = 0; k < lawn.data.length; k++) if (pavedNear.data[k] && !lawnDrawn.data[k]) lawn.data[k] = 0;
  for (const part of parts(lawn, Math.round(1 / (CELL_M * CELL_M)))) {
    // A lawn running onto a lower terrace is laid in two: on the plot, and down on the terrace.
    let rest = minus(part, building);
    terraces.forEach((t, i) => {
      const down = minus(rest, minus(rest, terraceMask[i]!));
      rest = minus(rest, terraceMask[i]!);
      const outline = ring(down);
      if (outline.length >= 3 && down.data.some((v) => v)) prims.push(slab(outline, ground + t.level, 0.6, "grass", "yard:lawn"));
    });
    // Run a cell over its lower part's edge: laid edge to edge, a hairline of the paving under them showed between (13/10/2026).
    const over = minus(dilate(rest, 1), minus(dilate(rest, 1), part));
    const outline = ring(over);
    if (outline.length >= 3 && rest.data.some((v) => v)) prims.push(slab(outline, ground, 0.6, "grass", "yard:lawn"));
  }
  // Each terrace held at its street end by a stone retaining wall, the
  // house's own face above it on a stone plinth; at its other end the garden
  // falls to it as a grass bank. The sheet draws the garden's soil running on
  // round the house's corner, no wall across it (12/10/2026: a stone wall
  // stood across the lawn there, the sheet has none).
  for (const t of terraces) {
    const top = ground + 0.1;
    const foot = ground + t.level - 0.3;
    const alongX = t.side === "north" || t.side === "south";
    for (const end of alongX ? [t.x0, t.x1] : [t.z0, t.z1]) {
      const street = alongX ? (front === "west" && end === t.x0) || (front === "east" && end === t.x1) : (front === "north" && end === t.z0) || (front === "south" && end === t.z1);
      if (!street) {
        const span = alongX ? t.x1 - t.x0 : t.z1 - t.z0;
        const run = Math.min(3, span * 0.3);
        const dx = 0.25;
        const inward = (alongX ? end === t.x0 : end === t.z0) ? 1 : -1;
        const [a0, a1] = inward > 0 ? [end, end + run] : [end - run, end];
        // Across, only as wide as the terrace's lawn: laid over the whole
        // terrace it covered the paving strips along the fence and the house,
        // and read from above as a rectangle of grass (Gottlieb A, 13/10/2026).
        const lawns = prims.filter((q): q is Extract<Primitive, { type: "prism" }> => q.type === "prism" && q.tag === "yard:lawn" && Math.abs(q.y1 - (ground + t.level)) < 0.05);
        const acrossOf = (q: Extract<Primitive, { type: "prism" }>) => q.ring.map(([x, z]) => (alongX ? z : x));
        const [c0, c1] = lawns.length
          ? [Math.max(alongX ? t.z0 : t.x0, Math.min(...lawns.flatMap(acrossOf))), Math.min(alongX ? t.z1 : t.x1, Math.max(...lawns.flatMap(acrossOf)))]
          : alongX ? [t.z0, t.z1] : [t.x0, t.x1];
        const [x0, z0] = alongX ? [a0, c0] : [c0, a0];
        const nx = Math.max(2, Math.round(((alongX ? a1 - a0 : c1 - c0)) / dx) + 1);
        const nz = Math.max(2, Math.round(((alongX ? c1 - c0 : a1 - a0)) / dx) + 1);
        const heights: number[] = [];
        for (let j = 0; j < nz; j++) {
          for (let i = 0; i < nx; i++) {
            const u = alongX ? x0 + i * dx : z0 + j * dx;
            const f = Math.max(0, Math.min(1, Math.abs(u - end) / run));
            // A straight, even slope, as the elevations draw the ground: a
            // rounded S read on the side's facade as a hump (12/10/2026).
            heights.push(ground + t.level * f);
          }
        }
        prims.push({ type: "terrain", x0, z0, dx, nx, nz, heights, material: "grass", tag: "yard:lawn:bank" });
        continue;
      }
      const wall = alongX ? wallBox(end, t.z0, end, t.z1, foot, top, 0.25, HOUSE_WINDOW_FRAME, "yard:retaining") : wallBox(t.x0, end, t.x1, end, foot, top, 0.25, HOUSE_WINDOW_FRAME, "yard:retaining");
      if (wall) prims.push(wall);
    }
    const face = t.side === "west" ? t.x1 : t.side === "east" ? t.x0 : t.side === "north" ? t.z1 : t.z0;
    const plinth = alongX ? wallBox(t.x0, face, t.x1, face, foot, ground, 0.3, HOUSE_WINDOW_FRAME, "yard:plinth") : wallBox(face, t.z0, face, t.z1, foot, ground, 0.3, HOUSE_WINDOW_FRAME, "yard:plinth");
    if (plinth) prims.push(plinth);
  }
  for (const hint of input.hints ?? []) {
    const outline: Outline = hint.ring.map(([x, y]) => [x / upm + shift.x, y / upm + shift.y]);
    if (outline.length >= 3) prims.push(slab(outline, ground, 0.6, "grass", hint.kind === "lawn" ? "yard:lawn" : "yard:planting"));
  }


  // A bay standing above the sidewalk falls to it as a driveway: its paving
  // a ramp from the bay's inner end down to the kerb, not a slab ending in a
  // step (Gottlieb's upper bays, 50 cm over the sidewalk).
  for (const bay of bays) {
    const alongX = streetAlongX;
    const outward = front === "south" || front === "east" ? 1 : -1;
    const kerbAt = (u: number) => ground + (alongX ? streetLand(u, front === "south" ? plot.z1 : plot.z0) : streetLand(front === "east" ? plot.x1 : plot.x0, u)) - 0.15;
    const mid = alongX ? (bay.x0 + bay.x1) / 2 : (bay.z0 + bay.z1) / 2;
    const kerb = kerbAt(mid);
    // A bay is a driveway one drives onto from the street, and its inner end meets the house at the floor, not over it: the
    // levels set by hand for Gottlieb's bays — −0.70 and +1.00, the second the top of a boundary wall's marks, not the ground —
    // stood a metre and more over the kerb, with no way on to them and the house's wall base buried beside the cars. No steeper
    // than a drive's 12%, and no higher than the floor; a lower level the sheet gives stands (17/10/2026).
    const reach = alongX ? bay.z1 - bay.z0 : bay.x1 - bay.x0;
    const drive = Math.min(bay.top, kerb + 0.12 * reach, ground);
    const reset = drive < bay.top - 0.005;
    if (reset) bay.top = drive;
    if (!reset && bay.top - kerb < 0.12) continue;
    const i = prims.findIndex((q) => q.type === "prism" && q.tag === "yard:parking" && Math.abs(Math.min(...q.ring.map(([x]) => x)) - bay.x0) < 0.2 && Math.abs(Math.min(...q.ring.map(([, z]) => z)) - bay.z0) < 0.2);
    if (i < 0) continue;
    const dx = 0.25;
    const [x0, z0] = [bay.x0, bay.z0];
    const nx = Math.max(2, Math.round((bay.x1 - bay.x0) / dx) + 1);
    const nz = Math.max(2, Math.round((bay.z1 - bay.z0) / dx) + 1);
    const depth = alongX ? bay.z1 - bay.z0 : bay.x1 - bay.x0;
    // One plane from the kerb to the inner end: a flat and a ramp do not both fit a car's length in a 5 m bay, and a ramp over
    // its last half left the car on the crest — in the air, or set on its wheels sunk in the paving (17/10/2026).
    const ramp = depth;
    const heights: number[] = [];
    for (let j = 0; j < nz; j++) {
      for (let k = 0; k < nx; k++) {
        const [x, z] = [x0 + k * dx, z0 + j * dx];
        const fromStreet = alongX ? (outward > 0 ? bay.z1 - z : z - bay.z0) : outward > 0 ? bay.x1 - x : x - bay.x0;
        const t = Math.max(0, Math.min(1, fromStreet / ramp));
        // Down to the kerb in front of it: the sidewalk falls along the street.
        const here = Math.min(bay.top, kerbAt(alongX ? x : z));
        heights.push(here + (bay.top - here) * t);
      }
    }
    const old = prims[i] as Extract<Primitive, { type: "prism" }>;
    prims.splice(i, 1, { type: "terrain", x0, z0, dx, nx, nz, heights, material: "paving", tag: "yard:parking" }, { ...old, y1: Math.min(kerb, kerbAt(alongX ? bay.x0 : bay.z0), kerbAt(alongX ? bay.x1 : bay.z1)) - 0.05, tag: "yard:parking:base" });
  }

  // A car nosed into every bay: a paved patch split along the street into as
  // many bays as it names.
  let carNo = 0;
  // Saloon half-length along its nose (render-page body ±2.3 m). Parked from
  // the bay centre, bumpers sat on the sheet's street edge and read cut
  // (16/10/2026). Leave ~1.2 m of paving past the bumper toward the kerb.
  // Saloon ~5 m long. Bay depth is often ~5.2 m — centre in the bay so neither
  // bumper crosses the house cut nor hangs off the sheet (16/10/2026: streetClear
  // shoved rears under the façade and the plan cut sliced them).
  const carHalf = 2.35;
  const sideInset = 1.2;
  const carOutward = front === "south" || front === "east" ? 1 : -1;
  for (const bay of bays) {
    // As many bays as it names, or as its width holds at 2.5 m a car: a
    // label's anchor is where its line starts — a DXF's right-aligned Hebrew
    // put one of a paved patch's two names past its edge, and one car stood
    // in a patch drawn for two (12/10/2026).
    const across = streetAlongX ? bay.x1 - bay.x0 : bay.z1 - bay.z0;
    const depth = streetAlongX ? bay.z1 - bay.z0 : bay.x1 - bay.x0;
    const named = parkingLabels.filter(([x, z]) => x >= bay.x0 - 1.5 && x <= bay.x1 + 1.5 && z >= bay.z0 - 1.5 && z <= bay.z1 + 1.5).length;
    const n = Math.max(1, named, Math.floor(across / 2.5));
    // Centre in the bay; nudge slightly toward the street when there is slack.
    const mid = streetAlongX ? (bay.z0 + bay.z1) / 2 : (bay.x0 + bay.x1) / 2;
    const slack = Math.max(0, depth / 2 - carHalf - 0.15);
    const along = mid + carOutward * slack;
    const span0 = (streetAlongX ? bay.x0 : bay.z0) + sideInset;
    const span1 = (streetAlongX ? bay.x1 : bay.z1) - sideInset;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const acrossAt = span0 + (span1 - span0) * t;
      const at = streetAlongX
        ? { x: acrossAt, y: bay.top, z: along }
        : { x: along, y: bay.top, z: acrossAt };
      prims.push({ type: "car", at, rotY: streetAlongX ? 0 : Math.PI / 2, colour: CAR_COLOURS[carNo++ % CAR_COLOURS.length]!, tag: "yard:car" });
    }
  }

  // The boundary: a stone-clad wall, holding the land where it stands higher
  // than the plot. On the street side it is lower, open at the bays and gates.
  const edges: Array<{ side: Side; a: [number, number]; b: [number, number] }> = [
    { side: "north", a: [plot.x0, plot.z0], b: [plot.x1, plot.z0] },
    { side: "south", a: [plot.x0, plot.z1], b: [plot.x1, plot.z1] },
    { side: "west", a: [plot.x0, plot.z0], b: [plot.x0, plot.z1] },
    { side: "east", a: [plot.x1, plot.z0], b: [plot.x1, plot.z1] },
  ];
  for (const edge of edges) {
    const alongX = edge.a[1] === edge.b[1];
    const [lo, hi] = alongX ? [edge.a[0], edge.b[0]] : [edge.a[1], edge.b[1]];
    const gaps: Array<[number, number]> = [];
    const street = edge.side === front;
    if (street) {
      for (const bay of bays) gaps.push(alongX ? [bay.x0, bay.x1] : [bay.z0, bay.z1]);
      // The pillar stands in the street wall's line: the wall stops at its sides.
      if (alongX) for (const [lx, , d] of pillars) gaps.push(d ? [d.x0 + shift.x, d.x1 + shift.x] : [lx - 0.6, lx + 0.6]);
      binPits.forEach((b, i) => {
        // A drawn enclosure stands its own front wall on the street line: the boundary stops at its sides.
        const t = binDrawings[i] ? 0 : 0.08;
        gaps.push(alongX ? [b.x0 + t, b.x1 - t] : [b.z0 + t, b.z1 - t]);
      });
      for (const [x, z] of gates) {
        const c = alongX ? x : z;
        gaps.push([c - 0.6, c + 0.6]);
        const gx = alongX ? c : edge.a[0];
        const gz = alongX ? edge.a[1] : c;
        const gate = wallBox(alongX ? gx - 0.55 : gx, alongX ? gz : gz - 0.55, alongX ? gx + 0.55 : gx, alongX ? gz : gz + 0.55, ground, ground + 1.2, 0.05, "metal", "yard:gate");
        if (gate) prims.push(gate);
      }
    }
    for (const [r0, r1] of openRuns(lo, hi, gaps)) {
      const pieces = Math.max(1, Math.ceil((r1 - r0) / 3));
      const run = (a: number, b: number, lo: number, hi: number, thick: number, material: BuildingMaterial, tag: string) =>
        alongX ? wallBox(a, edge.a[1], b, edge.a[1], lo, hi, thick, material, tag) : wallBox(edge.a[0], a, edge.a[0], b, lo, hi, thick, material, tag);
      const levels = (at: number) => {
        const outside = ground + (street ? streetLand(alongX ? at : edge.a[0], alongX ? edge.a[1] : at) - 0.15 : levelAt(alongX ? at : edge.a[0]));
        return { y0: Math.min(ground, outside) - 0.3, y1: Math.max(ground + (street ? STREET_WALL_M : 1.5), outside + 0.3) };
      };
      // On the street side the stone wall carries a fence of anthracite
      // aluminium slats, panel by panel between stone pillars, to 1.2 m. Its
      // iron railing — a top rail, posts and thin bars — read from the street
      // as pieces of iron in the air, and a stub of it stood on every short
      // piece of wall by a gate or a bay (12/10/2026: "replace the fences").
      // A piece too short for a panel is a pillar.
      const fenced = street && r1 - r0 >= 1;
      const pillarTop = ground + RAILING_TOP_M + 0.05;
      if (street && !fenced) {
        const { y0, y1 } = levels((r0 + r1) / 2);
        const pillar = run(r0, r1, y0, Math.max(y1, pillarTop), 0.35, HOUSE_WINDOW_FRAME, "yard:fence");
        if (pillar) prims.push(pillar);
        continue;
      }
      for (let i = 0; i < pieces; i++) {
        const s0 = r0 + ((r1 - r0) * i) / pieces;
        const s1 = r0 + ((r1 - r0) * (i + 1)) / pieces;
        const { y0, y1 } = levels((s0 + s1) / 2);
        const box = run(s0, s1, y0, y1, 0.25, HOUSE_WINDOW_FRAME, "yard:fence");
        if (box) prims.push(box);
        if (!fenced || y1 + 0.3 >= ground + RAILING_TOP_M) continue;
        const P = 0.35;
        // A stone pillar at the panel's start, and one at the run's end.
        for (const [a, b] of i === pieces - 1 ? [[s0, s0 + P], [s1 - P, s1]] : [[s0, s0 + P]]) {
          const pillar = run(a!, b!, y0, Math.max(y1, pillarTop), 0.35, HOUSE_WINDOW_FRAME, "yard:fence");
          if (pillar) prims.push(pillar);
        }
        const [p0, p1] = [s0 + P, i === pieces - 1 ? s1 - P : s1];
        if (p1 - p0 < 0.3) continue;
        const [lo, hi] = [y1 + 0.06, ground + RAILING_TOP_M];
        for (const [a, b] of [[lo, lo + 0.05], [hi - 0.05, hi]]) {
          const rail = run(p0, p1, a!, b!, 0.06, "frame", "yard:railing");
          if (rail) prims.push(rail);
        }
        // The slats, each its own box: a wall piece narrower than its own thickness is not built.
        const line = alongX ? edge.a[1] : edge.a[0];
        for (let u = p0 + 0.05; u < p1 - 0.02; u += 0.075) {
          const centre = alongX ? { x: u, y: (lo + hi) / 2, z: line } : { x: line, y: (lo + hi) / 2, z: u };
          prims.push({ type: "box", centre, size: alongX ? { x: 0.035, y: hi - lo - 0.1, z: 0.05 } : { x: 0.05, y: hi - lo - 0.1, z: 0.035 }, material: "frame", tag: "yard:railing" });
        }
      }
    }
  }

  // The wall between the pair's two plots: a long straight line the sheet
  // draws on the line of the houses' party wall, out of the house front and
  // back — a pair of semi-detached houses' gardens are each the house's own.
  {
    const xs = input.outlines.flatMap((o) => o.map(([x]) => x));
    const zs = input.outlines.flatMap((o) => o.map(([, z]) => z));
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const [hz0, hz1] = [Math.min(...zs), Math.max(...zs)];
    const inHouse = (z: number) => input.outlines.some((o) => insidePolygon(o, midX, z));
    let back = hz0;
    while (back < hz1 && !inHouse(back + 0.05)) back += 0.05;
    let fore = hz1;
    while (fore > hz0 && !inHouse(fore - 0.05)) fore -= 0.05;
    const runs: Array<[number, number]> = [];
    for (const sg of sheet.segments) {
      if (Math.abs(sg.x2 - sg.x1) > 0.01 * upm) continue;
      const x = sg.x1 / upm + shift.x;
      if (Math.abs(x - midX) > 0.25) continue;
      const [z0, z1] = [Math.min(sg.y1, sg.y2) / upm + shift.y, Math.max(sg.y1, sg.y2) / upm + shift.y];
      if (z1 - z0 < 1.5) continue;
      // Out of the house: the part in front of or behind it, within the plot —
      // to the house's own face on the party line, into a notch between the
      // two homes as far as it goes (12/10/2026: it stopped at the corners).
      for (const [a0, a1] of [[Math.max(z0, plot.z0), Math.min(z1, back)], [Math.max(z0, fore), Math.min(z1, plot.z1)]] as const) {
        if (a1 - a0 >= 1.2) runs.push([a0, a1]);
      }
    }
    runs.sort((p, q) => p[0] - q[0]);
    const merged: Array<[number, number]> = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1] + 0.3) last[1] = Math.max(last[1], r[1]);
      else merged.push([r[0], r[1]]);
    }
    for (const [z0, z1] of merged) {
      const front = z0 >= fore - 0.01;
      const wall = wallBox(midX, z0, midX, z1, ground - 0.3, ground + (front ? STREET_WALL_M : 1.5), 0.2, HOUSE_WINDOW_FRAME, "yard:fence");
      if (wall) prims.push(wall);
    }
  }

  // The bins' enclosure as the sheet draws it: stone walls of the drawn
  // thickness on three sides, a front wall on the street line with the drawn
  // opening, and each bin where it is drawn (Gottlieb: three) — 11/10/2026,
  // "the sheet has 3 bins and a wall with an opening to empty them".
  binPits.forEach((pit, i) => {
    const d = binDrawings[i];
    if (!d) return;
    const { x0, x1, z0, z1, floor } = pit;
    // Concrete pit floor — paver stone here read as invent jerusalem stone (§7ג׳).
    if (floor < ground - 0.1) prims.push(slab([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], floor, Math.max(0.6, ground - floor + 0.3), "concrete", "yard:bins:floor"));
    const top = Math.max(ground, floor) + 1.3;
    const t = d.thick;
    const sx = shift.x;
    const walls: Array<[number, number, number, number]> = [
      [x0, z0 - t / 2, x1, z0 - t / 2],
      [x0 + t / 2, z0 - t, x0 + t / 2, z1],
      [x1 - t / 2, z0 - t, x1 - t / 2, z1],
    ];
    const fz = front === "south" ? z1 - t / 2 : z0 + t / 2;
    const [o0, o1] = d.opening ? [d.opening[0] + sx, d.opening[1] + sx] : [x0 + t, x1 - t];
    if (o0 > x0 + t + 0.05) walls.push([x0 + t, fz, o0, fz]);
    if (o1 < x1 - t - 0.05) walls.push([o1, fz, x1 - t, fz]);
    for (const [ax, az, bx, bz] of walls) {
      const w = wallBox(ax, az, bx, bz, floor, top, t, HOUSE_WINDOW_FRAME, "yard:bins");
      if (w) prims.push(w);
    }
    for (const b of d.bins) {
      prims.push({ type: "box", centre: { x: (b.x0 + b.x1) / 2 + sx, y: floor + 0.55, z: (b.z0 + b.z1) / 2 + shift.y }, size: { x: (b.x1 - b.x0) - 0.06, y: 1.1, z: (b.z1 - b.z0) - 0.06 }, material: "metal", tag: "yard:bins" });
    }
  });
  // An enclosure the sheet does not draw in detail: the rectangle round the word, open to the street.
  for (const [i, pit] of binPits.entries()) {
    if (binDrawings[i]) continue;
    // Its sides run on to the street's edge: the enclosure opens onto the sidewalk.
    const { x0, x1, z0, z1, floor } = pit;
    if (floor < ground - 0.1) prims.push(slab([[x0, z0], [x1, z0], [x1, z1], [x0, z1]], floor, Math.max(0.6, ground - floor + 0.3), "concrete", "yard:bins:floor"));
    const sides: Array<[Side, [number, number, number, number]]> = [
      ["north", [x0, z0, x1, z0]],
      ["south", [x0, z1, x1, z1]],
      ["west", [x0, z0, x0, z1]],
      ["east", [x1, z0, x1, z1]],
    ];
    for (const [side, [ax, az, bx, bz]] of sides) {
      if (side === front) continue;
      const w = wallBox(ax, az, bx, bz, floor, Math.max(ground, floor) + 1.3, 0.15, HOUSE_WINDOW_FRAME, "yard:bins");
      if (w) prims.push(w);
    }
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    for (const dx of [-0.4, 0.4]) prims.push({ type: "box", centre: { x: cx + dx, y: floor + 0.55, z: cz }, size: { x: 0.65, y: 1.1, z: 0.7 }, material: "metal", tag: "yard:bins" });
  }
  // The utility pillar (electricity, gas, the water meter): the box the
  // sheet draws beside its word, its face on the street line and its foot on
  // the sidewalk, read from the street — set as a block 70 cm back in the
  // garden it stood there unexplained (12/10/2026: "what is this wall?").
  // Stone, with a grey metal cabinet door on its street face.
  for (const [lx, , drawn] of pillars) {
    const [x0, x1] = drawn ? [drawn.x0 + shift.x, drawn.x1 + shift.x] : [lx - 0.6, lx + 0.6];
    const edge = front === "south" ? plot.z1 : plot.z0;
    const back = drawn ? (front === "south" ? drawn.z0 + shift.y : drawn.z1 + shift.y) : edge - (front === "south" ? 0.45 : -0.45);
    const [z0, z1] = [Math.min(back, edge), Math.max(back, edge)];
    const foot = Math.min(ground, ground + (streetAlongX ? streetLand((x0 + x1) / 2, edge) : streetLand(edge, (z0 + z1) / 2)) - 0.15);
    // Up to the street fence's pillars on the garden side: standing at the
    // sidewalk's level only, its top fell below the garden and left the
    // fence open there (12/10/2026: "a breach in the fence").
    const top = Math.max(foot + 1.5, ground + RAILING_TOP_M + 0.05);
    prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: (foot - 0.3 + top) / 2, z: (z0 + z1) / 2 }, size: { x: x1 - x0, y: top - foot + 0.3, z: z1 - z0 }, material: HOUSE_WINDOW_FRAME, tag: "yard:pillar" });
    const out = front === "south" ? 1 : -1;
    prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: foot + 0.8, z: edge + out * 0.01 }, size: { x: x1 - x0 - 0.2, y: 1.0, z: 0.02 }, material: "metal", tag: "yard:pillar:door" });
  }

  // The sidewalk and the road beyond the street side, falling with the land.
  // A terrain grid is square, `dx` a cell both ways.
  const strip = (from: number, to: number, drop: number, material: BuildingMaterial, tag: string) => {
    const alongX = front === "north" || front === "south";
    const out = front === "south" || front === "east" ? 1 : -1;
    const base = alongX ? (front === "south" ? plot.z1 : plot.z0) : front === "east" ? plot.x1 : plot.x0;
    const [a0, a1] = alongX ? [plot.x0 - 12, plot.x1 + 12] : [plot.z0 - 12, plot.z1 + 12];
    const near = Math.min(base + out * from, base + out * to);
    const dx = 0.5;
    const along = Math.ceil((a1 - a0) / dx) + 1;
    const across = Math.max(2, Math.round((to - from) / dx) + 1);
    const heights: number[] = [];
    if (alongX) {
      for (let j = 0; j < across; j++) for (let i = 0; i < along; i++) heights.push(ground + streetLand(a0 + i * dx, near + j * dx) - drop);
      prims.push({ type: "terrain", x0: a0, z0: near, dx, nx: along, nz: across, heights, material, tag });
    } else {
      for (let j = 0; j < along; j++) for (let i = 0; i < across; i++) heights.push(ground + streetLand(near + i * dx, a0 + j * dx) - drop);
      prims.push({ type: "terrain", x0: near, z0: a0, dx, nx: across, nz: along, heights, material, tag });
    }
  };
  strip(0, SIDEWALK_M, 0.15, "paving", "site:sidewalk");
  strip(SIDEWALK_M, SIDEWALK_M + ROAD_M, 0.3, "asphalt", "site:road");

  const outFromPlot = (x: number, z: number) => (front === "south" ? z - plot.z1 : front === "north" ? plot.z0 - z : front === "east" ? x - plot.x1 : plot.x0 - x);
  const streetBand = (x: number, z: number) => {
    const d = outFromPlot(x, z);
    return d >= -0.2 && d <= SIDEWALK_M + ROAD_M + 0.5;
  };
  // The land's grid is coarser than the road: a cell spanning the road's far
  // edge rose from under it to the land beyond and cut through it, a green
  // diagonal across every elevation's ground band. The land a cell past the
  // road stays under the road's surface.
  const pastRoad = (x: number, z: number) => {
    const d = outFromPlot(x, z) - (SIDEWALK_M + ROAD_M + 0.5);
    return d > 0 && d <= TERRAIN_CELL_M + 0.25;
  };
  const beyondRoad = (x: number, z: number) => outFromPlot(x, z) > SIDEWALK_M + ROAD_M + 0.5;
  const insidePlot = (x: number, z: number) => x >= plot.x0 - 0.2 && x <= plot.x1 + 0.2 && z >= plot.z0 - 0.2 && z <= plot.z1 + 0.2;
  return {
    primitives: prims,
    plot,
    heightAt: (x, z) =>
      insidePlot(x, z)
        ? Math.min(
            ground + Math.min(0, ...terraces.filter((t) => x >= t.x0 - 0.3 && x <= t.x1 + 0.3 && z >= t.z0 - 0.3 && z <= t.z1 + 0.3).map((t) => t.level)) - DEPTH_M - 0.1,
            // Under a sunk bay or bin pit the land lies below its paving, not over its cars.
            ...[...bays.map((b) => ({ ...b, floor: b.top })), ...binPits].filter((b) => x >= b.x0 - 0.3 && x <= b.x1 + 0.3 && z >= b.z0 - 0.3 && z <= b.z1 + 0.3).map((b) => b.floor - DEPTH_M - 0.1),
          )
        : streetBand(x, z)
          ? ground + streetLand(x, z) - 0.8
          : pastRoad(x, z)
            ? Math.min(ground + levelAt(x), ground + streetLand(x, z) - 0.5)
            : beyondRoad(x, z)
              ? // Across the road the land goes on at the street's own height,
                // easing to the site's over 20 m: lifted at once to the site's,
                // it stood a 2 m bank past the road — a hill behind the house
                // in the views from above (12/10/2026).
                ground + streetLand(x, z) - 0.3 + (levelAt(x) - (streetLand(x, z) - 0.3)) * Math.min(1, Math.max(0, (outFromPlot(x, z) - (SIDEWALK_M + ROAD_M + 2)) / 20))
              : ground + levelAt(x),
    built: (x, z) => insidePlot(x, z) || streetBand(x, z),
    parking: bays.length,
  };
}

/**
 * The strips of the plot beside the house that the land falls to: where the
 * elevations mark a side door's flight down to land below the floor
 * (`levels.sideFlights`), the plot between the house and its boundary on that
 * side is a lower terrace at that level, as long as the house — not a flat
 * plot the flight dives into. The Gottlieb models' side flights went down
 * 1.37 m into lawn laid at ±0.00, their treads buried and their railing
 * standing on the grass.
 */
export function sideTerraces(
  outlines: Outline[],
  plot: { x0: number; z0: number; x1: number; z1: number },
  levels?: HouseSiteLevels,
): Array<{ side: Side; level: number; x0: number; x1: number; z0: number; z1: number }> {
  const lowest = outlines[0];
  if (!lowest?.length || !levels?.sideFlights) return [];
  const xs = lowest.map(([x]) => x);
  const zs = lowest.map(([, z]) => z);
  const [hx0, hx1, hz0, hz1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const inset = 0.13;
  const out: Array<{ side: Side; level: number; x0: number; x1: number; z0: number; z1: number }> = [];
  for (const [side, level] of Object.entries(levels.sideFlights) as Array<[Side, number | undefined]>) {
    if (level == null || level > -0.15) continue;
    const box =
      side === "west"
        ? { x0: plot.x0 + inset, x1: hx0, z0: hz0, z1: hz1 }
        : side === "east"
          ? { x0: hx1, x1: plot.x1 - inset, z0: hz0, z1: hz1 }
          : side === "north"
            ? { x0: hx0, x1: hx1, z0: plot.z0 + inset, z1: hz0 }
            : { x0: hx0, x1: hx1, z0: hz1, z1: plot.z1 - inset };
    if (box.x1 - box.x0 < 0.8 || box.z1 - box.z0 < 0.8) continue;
    out.push({ side, level, ...box });
  }
  return out;
}

/** The middle of the box round a house's storeys — where a street profile's offsets count from. */
export function centreOf(outlines: Outline[]): { x: number; z: number } {
  const pts = outlines.flat();
  if (pts.length === 0) return { x: 0, z: 0 };
  const xs = pts.map(([x]) => x);
  const zs = pts.map(([, z]) => z);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
}

/** The smallest rectangle of drawn lines round a point, metres in the sheet's frame — or null. */
function enclosure(sheet: DwfGeometry, x: number, y: number, upm: number): { x0: number; x1: number; z0: number; z1: number } | null {
  const reach = 3 * upm;
  let [top, bottom, left, right] = [-Infinity, Infinity, -Infinity, Infinity];
  for (const s of sheet.segments) {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / upm;
    if (len < 1 || len > 6) continue;
    if (Math.abs(s.y1 - s.y2) < 0.5 && Math.min(s.x1, s.x2) <= x && Math.max(s.x1, s.x2) >= x && Math.abs(s.y1 - y) < reach) {
      if (s.y1 < y) top = Math.max(top, s.y1);
      else bottom = Math.min(bottom, s.y1);
    }
    if (Math.abs(s.x1 - s.x2) < 0.5 && Math.min(s.y1, s.y2) <= y && Math.max(s.y1, s.y2) >= y && Math.abs(s.x1 - x) < reach) {
      if (s.x1 < x) left = Math.max(left, s.x1);
      else right = Math.min(right, s.x1);
    }
  }
  if (![top, bottom, left, right].every(Number.isFinite)) return null;
  const w = (right - left) / upm;
  const h = (bottom - top) / upm;
  if (w < 1 || h < 1 || w > 6 || h > 6) return null;
  return { x0: left / upm, x1: right / upm, z0: top / upm, z1: bottom / upm };
}

/**
 * The utility pillar's box beside its word (sheet metres): the longest line
 * along the street, 0.8–1.6 m, within 1.5 m of the word — its back — run to
 * the street line in front.
 */
export function pillarDrawn(sheet: DwfGeometry, lx: number, lz: number, upm: number): { x0: number; x1: number; z0: number; z1: number } | null {
  const lines = sheet.segments
    .map((s) => ({ x1: Math.min(s.x1, s.x2) / upm, x2: Math.max(s.x1, s.x2) / upm, y: (s.y1 + s.y2) / 2 / upm, dy: Math.abs(s.y2 - s.y1) / upm }))
    .filter((s) => s.dy < 0.05 && s.x2 - s.x1 >= 0.8 && s.x2 - s.x1 <= 1.6 && Math.abs(s.y - lz) < 1.5 && s.x1 < lx + 1.5 && s.x2 > lx - 1.5)
    .sort((a, b) => b.x2 - b.x1 - (a.x2 - a.x1) || a.y - b.y);
  const l = lines[0];
  return l ? { x0: l.x1, x1: l.x2, z0: l.y, z1: l.y } : null;
}

/**
 * A bins enclosure as the sheet draws it, read inside its inner rectangle
 * (`inner`, in the sheet's metres; its far side on the street line): the
 * thickness of its walls — the line drawn outside its side, 5–40 cm out —
 * each bin, a rectangle 35–100 cm a side inside it, and the opening in its
 * front wall: the widest stretch of the front wall's inner line undrawn.
 */
export function binsDrawn(sheet: DwfGeometry, lx: number, lz: number, upm: number): { inner: { x0: number; x1: number; z0: number; z1: number }; thick: number; bins: Array<{ x0: number; x1: number; z0: number; z1: number }>; opening: [number, number] | null } | null {
  // Lines drawn a few centimetres off square (Gottlieb's enclosure top falls 3 cm) are still square.
  const segs = sheet.segments
    .map((s) => ({ x1: Math.min(s.x1, s.x2) / upm, x2: Math.max(s.x1, s.x2) / upm, y1: Math.min(s.y1, s.y2) / upm, y2: Math.max(s.y1, s.y2) / upm }))
    .filter((s) => s.x2 - s.x1 >= 0.15 || s.y2 - s.y1 >= 0.15);
  const vertical = segs.filter((s) => s.x2 - s.x1 < 0.05 && s.y2 - s.y1 >= 0.15);
  const horizontal = segs.filter((s) => s.y2 - s.y1 < 0.05 && s.x2 - s.x1 >= 0.15);
  // The inner rectangle round the word: the nearest long line on each side, the street line below.
  const nearest = (cands: number[], from: number, dir: 1 | -1) => cands.filter((v) => (v - from) * dir > 0.3 && Math.abs(v - from) < 3).sort((a, b) => Math.abs(a - from) - Math.abs(b - from))[0];
  const x0 = nearest(vertical.filter((s) => s.y2 - s.y1 >= 1 && s.y1 <= lz && s.y2 >= lz).map((s) => s.x1), lx, -1);
  const x1 = nearest(vertical.filter((s) => s.y2 - s.y1 >= 1 && s.y1 <= lz && s.y2 >= lz).map((s) => s.x1), lx, 1);
  const z0 = nearest(horizontal.filter((s) => s.x2 - s.x1 >= 1 && s.x1 <= lx && s.x2 >= lx).map((s) => (s.y1 + s.y2) / 2), lz, -1);
  const z1 = nearest(horizontal.filter((s) => s.x2 - s.x1 >= 1 && s.x1 <= lx && s.x2 >= lx).map((s) => (s.y1 + s.y2) / 2), lz, 1);
  if (x0 == null || x1 == null || z0 == null || z1 == null || x1 - x0 < 1 || x1 - x0 > 6) return null;
  const inner = { x0, x1, z0, z1 };
  const depth = inner.z1 - inner.z0;
  const outer = vertical.filter((s) => s.x1 < inner.x0 - 0.05 && s.x1 > inner.x0 - 0.4 && Math.min(s.y2, inner.z1) - Math.max(s.y1, inner.z0) > 0.5 * depth).map((s) => s.x1);
  const thick = outer.length ? Math.min(0.35, Math.max(0.1, inner.x0 - Math.max(...outer))) : 0.2;
  // The bins: pairs of short verticals over the same span, 35–100 cm apart.
  const sides = vertical
    .filter((s) => s.x1 > inner.x0 + 0.05 && s.x1 < inner.x1 - 0.05 && s.y1 >= inner.z0 - 0.02 && s.y2 <= inner.z1 && s.y2 - s.y1 >= 0.35 && s.y2 - s.y1 <= 1)
    .sort((a, b) => a.x1 - b.x1);
  const bins: Array<{ x0: number; x1: number; z0: number; z1: number }> = [];
  const used = new Set<number>();
  for (let i = 0; i < sides.length; i++) {
    if (used.has(i)) continue;
    const a = sides[i]!;
    const j = sides.findIndex((b, k) => k > i && !used.has(k) && b.x1 - a.x1 >= 0.35 && b.x1 - a.x1 <= 1 && Math.abs(b.y1 - a.y1) < 0.1 && Math.abs(b.y2 - a.y2) < 0.1);
    if (j < 0) continue;
    used.add(i).add(j);
    bins.push({ x0: a.x1, x1: sides[j]!.x1, z0: Math.min(a.y1, sides[j]!.y1), z1: Math.max(a.y2, sides[j]!.y2) });
  }
  if (!bins.length) return null;
  // The front wall's inner line: drawn stubs from each side, the opening between them.
  const face = inner.z1 - thick;
  const stubs = horizontal
    .filter((s) => Math.abs(s.y1 - face) < 0.1 && s.x2 > inner.x0 - 0.05 && s.x1 < inner.x1 + 0.05 && s.x2 - s.x1 < 0.8 * (inner.x1 - inner.x0))
    .map((s) => [Math.max(inner.x0, s.x1), Math.min(inner.x1, s.x2)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  let opening: [number, number] | null = null;
  let at = inner.x0;
  for (const [a, b] of [...stubs, [inner.x1, inner.x1] as [number, number]]) {
    if (a - at >= 0.5 && (!opening || a - at > opening[1] - opening[0])) opening = [at, a];
    at = Math.max(at, b);
  }
  return { inner, thick, bins, opening };
}

/**
 * The yard's paving with its holes cut as rectangles rather than as a
 * triangulated slab with holes. A sunk bay runs to the plot's edge, and a
 * hole touching its ring broke the triangulation: the paving closed over the
 * bay, and the cars in it, sunk 2.07 m by the facades' marks, were buried
 * (Gottlieb A, pilot of 10/10/2026). Each hole is taken by its box.
 */
export function pavingAround(p: Extract<Primitive, { type: "prism" }>): Primitive[] {
  if (!p.holes?.length) return [p];
  const box = (r: Outline) => {
    const xs = r.map(([x]) => x);
    const zs = r.map(([, z]) => z);
    return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  };
  const outer = box(p.ring);
  const holes = p.holes.map(box);
  const cuts = (lo: number, hi: number, a: number[]) => [...new Set([lo, hi, ...a.filter((v) => v > lo && v < hi)])].sort((u, v) => u - v);
  const xs = cuts(outer.x0, outer.x1, holes.flatMap((h) => [h.x0, h.x1]));
  const zs = cuts(outer.z0, outer.z1, holes.flatMap((h) => [h.z0, h.z1]));
  const out: Primitive[] = [];
  for (let j = 0; j + 1 < zs.length; j++) {
    // A row's cells kept, run together where they touch.
    let start: number | null = null;
    const flush = (end: number) => {
      if (start != null && end - start > 0.01) out.push({ ...p, holes: undefined, ring: [[start, zs[j]!], [end, zs[j]!], [end, zs[j + 1]!], [start, zs[j + 1]!]] });
      start = null;
    };
    for (let i = 0; i + 1 < xs.length; i++) {
      const [mx, mz] = [(xs[i]! + xs[i + 1]!) / 2, (zs[j]! + zs[j + 1]!) / 2];
      const cut = holes.some((h) => mx > h.x0 && mx < h.x1 && mz > h.z0 && mz < h.z1);
      if (cut) flush(xs[i]!);
      else start ??= xs[i]!;
    }
    flush(xs[xs.length - 1]!);
  }
  return out;
}

/**
 * Every fence panel ends in a stone pillar at both ends — symmetric, never a
 * slat panel running out bare on one side. A path cut through the street wall
 * after it was built took the pillar at its edge with it, and the panel there
 * ran out into the air (12/10/2026: "the fences need ends on both sides").
 * Where an end has none, the panel is shortened and a pillar stood there;
 * a panel left too short to hold is taken away. Run after every cut.
 */
export function closeFenceEnds(prims: Primitive[]): Primitive[] {
  type Box = Extract<Primitive, { type: "box" }>;
  const isBox = (p: Primitive): p is Box => p.type === "box";
  const P = 0.35;
  const out = [...prims];
  // A pillar stands on its wall: one left reaching out over an opening a path
  // was later cut through is cut back to the wall's end.
  for (let i = 0; i < out.length; i++) {
    const p = out[i]!;
    if (!isBox(p) || p.tag !== "yard:fence" || p.rotY) continue;
    const alongX = p.size.x >= p.size.z;
    const k = alongX ? "x" : "z";
    if ((alongX ? p.size.x : p.size.z) > 0.6) continue;
    const line = alongX ? p.centre.z : p.centre.x;
    const [u0, u1] = [p.centre[k] - p.size[k] / 2, p.centre[k] + p.size[k] / 2];
    const walls = out.filter((q): q is Box => isBox(q) && q !== p && q.tag === "yard:fence" && (q.size.x >= q.size.z) === alongX && Math.abs((alongX ? q.centre.z : q.centre.x) - line) < 0.2 && q.centre.y + q.size.y / 2 < p.centre.y + p.size.y / 2 - 0.1);
    const under = walls.map((q) => [q.centre[k] - q.size[k] / 2, q.centre[k] + q.size[k] / 2] as const).filter(([w0, w1]) => w1 > u0 && w0 < u1);
    if (!under.length) continue;
    const [w0, w1] = [Math.min(...under.map(([w]) => w)), Math.max(...under.map(([, w]) => w))];
    // ...and a pillar a hand short of its wall's end runs on to it: no sliver of wall past the last pillar.
    const [v0, v1] = [u0 - w0 < 0.2 ? w0 : Math.max(u0, w0), w1 - u1 < 0.2 ? w1 : Math.min(u1, w1)];
    if (v1 - v0 >= 0.05 && (Math.abs(v0 - u0) > 0.01 || Math.abs(v1 - u1) > 0.01)) out[i] = { ...p, centre: { ...p.centre, [k]: (v0 + v1) / 2 }, size: { ...p.size, [k]: v1 - v0 } };
  }
  // A stub of rail a cut left, shorter than a slat's spacing twice over, is no panel.
  for (let i = out.length - 1; i >= 0; i--) {
    const p = out[i]!;
    if (isBox(p) && p.tag === "yard:railing" && p.material === "frame" && p.size.y <= 0.06 && Math.max(p.size.x, p.size.z) < 0.15) out.splice(i, 1);
  }
  const rails = out.filter((p): p is Box => isBox(p) && p.tag === "yard:railing" && p.material === "frame" && p.size.y <= 0.06);
  const tops = rails.filter((r) => !rails.some((q) => q !== r && q.centre.y > r.centre.y && Math.abs(q.centre.x - r.centre.x) < 0.01 && Math.abs(q.centre.z - r.centre.z) < 0.01));
  for (const top of tops) {
    const alongX = top.size.x >= top.size.z;
    const k = alongX ? "x" : "z";
    const line = alongX ? top.centre.z : top.centre.x;
    const onLine = (p: Box) => Math.abs((alongX ? p.centre.z : p.centre.x) - line) < 0.2;
    const span = (p: Box) => [p.centre[k] - p.size[k] / 2, p.centre[k] + p.size[k] / 2] as [number, number];
    let [a, b] = span(top);
    const railTop = top.centre.y + top.size.y / 2;
    const fences = out.filter((p): p is Box => isBox(p) && p.tag === "yard:fence" && onLine(p));
    // A pillar at an end: stone standing to the rail's top, touching the end.
    const pillarAt = (u: number) => fences.some((f) => f.centre.y + f.size.y / 2 >= railTop - 0.01 && span(f)[0] <= u + 0.05 && span(f)[1] >= u - 0.05);
    const wallUnder = (u: number) => fences.find((f) => span(f)[0] <= u + 0.01 && span(f)[1] >= u - 0.01);
    const stand = (u0: number, u1: number) => {
      const wall = wallUnder((u0 + u1) / 2);
      // On its wall, never out over the opening a path was cut through.
      if (wall) [u0, u1] = [Math.max(u0, span(wall)[0]), Math.min(u1, span(wall)[1])];
      if (u1 - u0 < 0.05) return;
      const y0 = wall ? wall.centre.y - wall.size.y / 2 : railTop - 1.5;
      const y1 = railTop + 0.05;
      out.push({ type: "box", centre: { ...top.centre, [k]: (u0 + u1) / 2, y: (y0 + y1) / 2 }, size: alongX ? { x: u1 - u0, y: y1 - y0, z: 0.35 } : { x: 0.35, y: y1 - y0, z: u1 - u0 }, material: HOUSE_WINDOW_FRAME, tag: "yard:fence" });
    };
    const [a0, b0] = span(top);
    const [needA, needB] = [!pillarAt(a), !pillarAt(b)];
    if (!needA && !needB) continue;
    if (needA) a += P;
    if (needB) b -= P;
    // Too short a panel between its pillars is no panel: the stretch is one stone pillar.
    if (b - a < 0.6) {
      stand(a0, b0);
      a = b;
    } else {
      if (needA) stand(a0, a0 + P);
      if (needB) stand(b0 - P, b0);
    }
    // The panel's rails and slats cut back to the pillars, or taken away.
    for (let i = out.length - 1; i >= 0; i--) {
      const p = out[i]!;
      if (!isBox(p) || p.tag !== "yard:railing" || !onLine(p)) continue;
      const [u0, u1] = span(p);
      if (u1 <= a0 - 0.01 || u0 >= b0 + 0.01) continue;
      const [v0, v1] = [Math.max(u0, a), Math.min(u1, b)];
      if (b - a < 0.02 || v1 - v0 < 0.02) {
        out.splice(i, 1);
        continue;
      }
      if (v0 !== u0 || v1 !== u1) out[i] = { ...p, centre: { ...p.centre, [k]: (v0 + v1) / 2 }, size: { ...p.size, [k]: v1 - v0 } };
    }
  }
  // A slat with no rail over it any more stands alone: it goes.
  const kept = out.filter((p): p is Box => isBox(p) && p.tag === "yard:railing" && p.material === "frame" && p.size.y <= 0.06);
  return out.filter((p) => {
    if (!isBox(p) || p.tag !== "yard:railing" || p.material !== "frame" || p.size.y <= 0.06) return true;
    return kept.some((r) => {
      const alongX = r.size.x >= r.size.z;
      const k = alongX ? "x" : "z";
      return Math.abs((alongX ? r.centre.z - p.centre.z : r.centre.x - p.centre.x)) < 0.1 && Math.abs(r.centre[k] - p.centre[k]) <= r.size[k] / 2 + 0.01;
    });
  });
}

/**
 * Drop stone fence pieces whose centre sits inside a bin enclosure — CAD draws
 * the bins as yard:bins; invent pillars/walls there (incl. mirrored utility
 * stone) are not on the sheet (Gottlieb §7ג׳ / geometry gate, 16/10/2026).
 */
export function stripInventStoneAtBins(prims: Primitive[]): Primitive[] {
  type Box = Extract<Primitive, { type: "box" }>;
  const bins = prims.filter((p): p is Box => p.type === "box" && typeof p.tag === "string" && p.tag.startsWith("yard:bins"));
  if (!bins.length) return prims;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of bins) {
    x0 = Math.min(x0, p.centre.x - p.size.x / 2);
    x1 = Math.max(x1, p.centre.x + p.size.x / 2);
    z0 = Math.min(z0, p.centre.z - p.size.z / 2);
    z1 = Math.max(z1, p.centre.z + p.size.z / 2);
  }
  // Generous pad: fence-end pillars often sit on the enclosure lip (14.63 vs 14.63 float).
  const grow = 0.55;
  const zx0 = x0 - grow;
  const zx1 = x1 + grow;
  const zz0 = z0 - grow;
  const zz1 = z1 + grow;
  return prims.filter((p) => {
    if (p.type !== "box") return true;
    // Fence stone and its coping — both read as invent stone in the plan.
    if (p.tag !== "yard:fence" && p.tag !== "yard:fence:coping") return true;
    if (p.material !== "jerusalemStone" && p.material !== "renderBrown") return true;
    const inside = p.centre.x >= zx0 && p.centre.x <= zx1 && p.centre.z >= zz0 && p.centre.z <= zz1;
    if (!inside) return true;
    // Keep long party / street walls; drop pillars and short stubs only (§7ג׳ invent lip).
    const span = Math.max(p.size.x, p.size.z);
    const thick = Math.min(p.size.x, p.size.z);
    if (span >= 1.2 && thick <= 0.3) return true;
    return false;
  });
}
