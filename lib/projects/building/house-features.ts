import { insidePolygon, parapet, slab, type Outline } from "@/lib/projects/building/assemble";
import { doubleLineWalls } from "@/lib/projects/building/from-dwf-sheet";
import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";
import { HOUSE_PLASTER_WING } from "@/lib/projects/building/house-finish";
import { dilate, drawLine, emptyMask, erode, label, traceOutline, type Mask } from "@/lib/projects/building/raster";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";

/**
 * What a private house's sheets draw round its rooms that the floor reader
 * does not stand up: the steps from the street to its doors, the balconies
 * of its upper floor, and the screened solar heaters on its roof.
 *
 * Each is found in the sheet's lines and kept only where the lines bear it
 * out. A flight is its treads — three or more equal lines, 24 to 36 cm
 * apart, outside the house — and it climbs from the land at its far end to
 * the floor at the end nearest the house. A balcony is the floor's own
 * finish hatch carried out past its walls, and the line drawn round it where
 * it is open is its railing. A solar heater's screen is a box of slats the
 * elevations draw standing over the parapet: across from the south or north
 * elevation, in depth from the west or east one; one face alone does not
 * place it.
 */
export const HOUSE_FEATURE_STANDARDS = {
  /** A step's rise where the land the flight comes down to does not give one. */
  riser: 0.15,
  minRiser: 0.12,
  maxRiser: 0.19,
} as const;

const upmOf = () => DWF_FLOOR_UNITS_PER_METRE;

/** A run of treads on a plan, in its sheet's metres: each tread a line along `along`, from `a` to `b`, at `ats` across. */
export type TreadRun = { along: "x" | "z"; a: number; b: number; ats: number[] };

/**
 * Every run of three or more equal axis-aligned lines, evenly spaced 24 to
 * 36 cm apart and 0.7 to 3 m long. A tiling's grid repeats the same way but
 * in both directions: a run crossed by lines its own way is a grid and left out.
 */
export function treadRuns(g: DwfGeometry, upm = upmOf(), inside = false): TreadRun[] {
  type L = { a: number; b: number; at: number };
  const lines: Record<"x" | "z", L[]> = { x: [], z: [] };
  // A CAD file's stairs inside the house are its stairs layer: no other line is read as a tread.
  // Its garden steps are drawn as plain lines, and read as before.
  for (const s of inside ? g.stairLines ?? g.segments : g.segments) {
    const [ax, ay, bx, by] = [s.x1 / upm, s.y1 / upm, s.x2 / upm, s.y2 / upm];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 0.3 || len > 3) continue;
    if (Math.abs(by - ay) < 0.02) lines.x.push({ a: Math.min(ax, bx), b: Math.max(ax, bx), at: (ay + by) / 2 });
    else if (Math.abs(bx - ax) < 0.02) lines.z.push({ a: Math.min(ay, by), b: Math.max(ay, by), at: (ax + bx) / 2 });
  }
  const out: TreadRun[] = [];
  for (const along of ["x", "z"] as const) {
    const own = lines[along].filter((l) => l.b - l.a >= 0.7);
    const across = lines[along === "x" ? "z" : "x"];
    const used = new Set<L>();
    for (const s of [...own].sort((p, q) => p.a - q.a || p.at - q.at)) {
      if (used.has(s)) continue;
      const same = own.filter((t) => Math.abs(t.a - s.a) < 0.08 && Math.abs(t.b - s.b) < 0.08).sort((p, q) => p.at - q.at);
      const ats: number[] = [];
      for (const t of same) if (!ats.length || t.at - ats[ats.length - 1]! > 0.05) ats.push(t.at);
      let best: number[] = [];
      for (let i = 0; i < ats.length; i++) {
        const run = [ats[i]!];
        for (let j = i + 1; j < ats.length; j++) {
          const gap = ats[j]! - run[run.length - 1]!;
          const first = run.length > 1 ? run[1]! - run[0]! : gap;
          if (gap < 0.24 || gap > 0.36 || Math.abs(gap - first) > 0.03) break;
          run.push(ats[j]!);
        }
        if (run.length > best.length) best = run;
      }
      for (const t of same) used.add(t);
      if (best.length < 3) continue;
      const [lo, hi] = [best[0]!, best[best.length - 1]!];
      const crossing = across.filter((t) => t.at > s.a + 0.1 && t.at < s.b - 0.1 && t.a <= lo + 0.02 && t.b >= hi - 0.02).length;
      if (crossing >= 2) continue;
      out.push({ along, a: s.a, b: s.b, ats: best });
    }
  }
  return out;
}

/** A flight from a house's floor to its land: in the building's frame, its treads' lines from the house outwards. */
export type HouseFlight = {
  along: "x" | "z";
  a: number;
  b: number;
  /** The tread lines, nearest the house first. */
  lines: number[];
  /** +1 where the lines run away from the house in +z (or +x). */
  out: 1 | -1;
};

/**
 * The flights a ground floor sheet draws outside its house: tread runs lying
 * wholly off the building, at least 30 cm from it, with the house off their
 * near end. `building(x, z)` answers in the sheet's metres.
 */
export function houseFlights(g: DwfGeometry, building: (x: number, z: number) => boolean, shift: { x: number; y: number }, upm = upmOf()): HouseFlight[] {
  const out: HouseFlight[] = [];
  for (const run of treadRuns(g, upm)) {
    const [lo, hi] = [run.ats[0]!, run.ats[run.ats.length - 1]!];
    const at = (u: number, v: number) => (run.along === "x" ? building(u, v) : building(v, u));
    let clear = true;
    for (let u = run.a - 0.3; u <= run.b + 0.3 && clear; u += 0.1) for (let v = lo - 0.3; v <= hi + 0.3 && clear; v += 0.1) if (at(u, v)) clear = false;
    if (!clear) continue;
    // The house: the nearer of the two ends' sides, looking along the flight's middle up to 6 m.
    const mid = (run.a + run.b) / 2;
    const reach = (dir: 1 | -1) => {
      for (let d = 0.3; d <= 6; d += 0.1) if (at(mid, dir > 0 ? hi + d : lo - d)) return d;
      return Infinity;
    };
    const [before, after] = [reach(-1), reach(1)];
    if (!Number.isFinite(Math.min(before, after))) continue;
    const dir: 1 | -1 = before <= after ? 1 : -1;
    const [da, db] = run.along === "x" ? [shift.x, shift.y] : [shift.y, shift.x];
    const lines = (dir > 0 ? run.ats : [...run.ats].reverse()).map((v) => v + db);
    out.push({ along: run.along, a: run.a + da, b: run.b + da, lines, out: dir });
  }
  return out;
}

/**
 * A flight stood up: treads from `top` at the house down (or up) to `bottom`,
 * and the path on to `end`, where the land meets it — level, or sloped on
 * down to `land` where the treads the plan draws do not take the whole drop.
 */
export function flightPrimitives(f: HouseFlight, top: number, bottom: number, end: number, tag: string, land = bottom): { primitives: Primitive[]; sunk: Outline | null } {
  const n = f.lines.length;
  const rise = (bottom - top) / n;
  const prims: Primitive[] = [];
  const box = (u0: number, u1: number, v0: number, v1: number, y0: number, y1: number, material: BuildingMaterial): Primitive => {
    const [x0, x1, z0, z1] = f.along === "x" ? [u0, u1, Math.min(v0, v1), Math.max(v0, v1)] : [Math.min(v0, v1), Math.max(v0, v1), u0, u1];
    return { type: "box", centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }, size: { x: x1 - x0, y: y1 - y0, z: z1 - z0 }, material, tag };
  };
  const base = Math.min(top, bottom, land) - 0.2;
  const step = n > 1 ? Math.abs(f.lines[1]! - f.lines[0]!) : 0.3;
  for (let k = 1; k <= n; k++) {
    const v0 = f.lines[k - 1]!;
    const v1 = k < n ? f.lines[k]! : v0 + f.out * step;
    const y = top + rise * k;
    // The stone's tone by the step's height over the flight's foot: the lowest the darkest, as on the stair indoors.
    const span = Math.max(0.01, Math.abs(top - Math.min(bottom, land)));
    const tone = Math.max(0, Math.min(3, Math.floor((1 - Math.max(0, Math.min(1, (y - Math.min(top, bottom, land)) / span))) * 4)));
    prims.push(box(f.a, f.b, v0, v1, base, y, `stairStone${tone}` as BuildingMaterial));
    // Where the step above meets this one, a soft shade, two films: the wide one faint, the narrow one deeper.
    if (f.b - f.a > 0.6) {
      const near = Math.sign(v1 - v0 || 1);
      for (const [d, z] of [[0.1, 0.005], [0.045, 0.006]] as const) prims.push(box(f.a + 0.08, f.b - 0.08, v0, v0 + near * Math.min(d, Math.abs(v1 - v0)), y + z - 0.001, y + z, "stairShade"));
    }
    // Its nosing: from above, with no shadow cast, a flight of pale treads read
    // as the path it runs into (13/10/2026) — so a hairline of dark stone marks
    // where each step ends. A thick bar read as the rungs of a ladder (17/10/2026).
    const edge = Math.min(v0, v1) === v0 ? v0 : v1;
    const way = Math.sign(v1 - v0 || 1);
    prims.push(box(f.a, f.b, edge, edge + 0.018 * way, y, y + 0.005, "stoneDark"));
    // A cheek of Jerusalem stone down each side, level with the step: the flight's own edge.
    if (f.b - f.a > 0.6) {
      prims.push(box(f.a, f.a + 0.08, v0, v1, base, y + 0.004, "jerusalemStone"));
      prims.push(box(f.b - 0.08, f.b, v0, v1, base, y + 0.004, "jerusalemStone"));
    }
  }
  const last = f.lines[n - 1]! + f.out * step;
  if (Math.abs(end - last) > 0.05 && Math.sign(end - last) === f.out) {
    if (Math.abs(land - bottom) < 0.01) prims.push(box(f.a, f.b, last, end, base, bottom, "paving"));
    else {
      // The slope laid in 10 cm slices: the model's boxes do not tilt.
      const k = Math.max(1, Math.ceil(Math.abs(end - last) / 0.1));
      for (let j = 0; j < k; j++) {
        const [v0, v1] = [last + ((end - last) * j) / k, last + ((end - last) * (j + 1)) / k];
        prims.push(box(f.a, f.b, v0, v1, base, bottom + ((land - bottom) * (j + 0.5)) / k, "paving"));
      }
    }
  }
  const v0 = f.lines[0]!;
  const ring: Outline = f.along === "x" ? [[f.a, v0], [f.b, v0], [f.b, end], [f.a, end]] : [[v0, f.a], [v0, f.b], [end, f.b], [end, f.a]];
  return { primitives: prims, sunk: Math.min(bottom, land) < top - 0.02 ? ring : null };
}

/** The rise a flight takes: the land at its far end, kept to a step a person can climb. */
export function flightRise(treads: number, top: number, land: number | null): number {
  const s = HOUSE_FEATURE_STANDARDS;
  const drop = land == null ? 0 : land - top;
  const per = Math.abs(drop) / treads;
  if (per < 0.1) return -s.riser * treads;
  return Math.sign(drop) * Math.min(s.maxRiser, Math.max(s.minRiser, per)) * treads;
}

/** A balcony found on a floor sheet: its floor in the building's frame. */
/** `dividers`: the walls the sheet draws across it, from the house to its edge — two homes' party wall run on through their shared balcony. */
export type HouseBalcony = { ring: Outline; areaM2: number; depthM: number; railed: number; dividers?: BalconyDivider[] };
export type BalconyDivider = { a: [number, number]; b: [number, number]; thick: number };

const CELL = 0.1;
/** A privacy wall between two homes' balconies. */
const BALCONY_DIVIDER_M = 1.9;

/**
 * The balconies an upper floor sheet draws: where the floor's own finish
 * hatch — the pen and slope that hatch most of its rooms, or that slope
 * mirrored — runs on past its walls into a part at least 2 m² and 80 cm deep
 * against the house, with a line drawn along at least 60% of its open edges
 * and no wall drawn round them — unless it hangs out past the storey below
 * (`below`), where no room stands: there the double line round it is its
 * slab's edge and its railing. `footprint(x, z)` and `below(x, z)` answer in
 * the sheet's metres.
 */
export function houseBalconies(
  g: DwfGeometry,
  footprint: (x: number, z: number) => boolean,
  shift: { x: number; y: number },
  upm = upmOf(),
  below?: (x: number, z: number) => boolean,
): HouseBalcony[] {
  const cols = Math.ceil(g.pageWidth / upm / CELL) + 1;
  const rows = Math.ceil(g.pageHeight / upm / CELL) + 1;
  const building = emptyMask(cols, rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (footprint((c + 0.5) * CELL, (r + 0.5) * CELL)) building.data[r * cols + c] = 1;
  const inside = building.data.reduce((n, v) => n + v, 0);
  if (inside === 0) return [];

  const slope = (s: { x1: number; y1: number; x2: number; y2: number }) => {
    const a = ((Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI + 180) % 180;
    return Math.round(a / 5) * 5;
  };
  const tally = new Map<string, number>();
  for (const s of g.segments) {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / upm;
    const a = slope(s);
    if (len < 0.3 || a % 90 < 20 || a % 90 > 70) continue;
    if (!footprint((s.x1 + s.x2) / 2 / upm, (s.y1 + s.y2) / 2 / upm)) continue;
    const key = `${s.stroke ?? -1}/${a}`;
    tally.set(key, (tally.get(key) ?? 0) + len);
  }
  const [top, length] = [...tally].sort((p, q) => q[1] - p[1])[0] ?? ["", 0];
  // A finish hatch lays metres of line on every square metre it covers.
  if (length < 5 * inside * CELL * CELL) return [];
  // A pair of mirrored homes mirrors its hatch too: the same pen at the other slope.
  const [pen, angle] = top.split("/");
  const mirror = `${pen}/${(180 - Number(angle)) % 180}`;
  const finish = new Set([top, mirror]);

  const hatch = emptyMask(cols, rows);
  // Not closed: a hatch lies closer than a cell, and the 20 cm a parapet is drawn across parts two.
  for (const s of g.segments) if (finish.has(`${s.stroke ?? -1}/${slope(s)}`)) drawLine(hatch, s.x1 / upm / CELL, s.y1 / upm / CELL, s.x2 / upm / CELL, s.y2 / upm / CELL);
  // The long lines drawn where the hatch stops — a railing's edge, a
  // boundary — part what it runs on to beyond them: the ground the sheet
  // shows below. Drawn in the pen of the plot's boundary, the sheet's longest
  // line: a tiling's grid, in its own pen, does not part a tiled balcony, nor
  // does a line the hatch's own lines run on across.
  const strokes = g.segments.filter((s) => finish.has(`${s.stroke ?? -1}/${slope(s)}`));
  const barrier = emptyMask(cols, rows);
  const outlinePen = g.segments.reduce((p, s) => (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) > Math.hypot(p.x2 - p.x1, p.y2 - p.y1) ? s : p), g.segments[0]!).stroke;
  for (const s of g.segments) {
    const [ax, ay, bx, by] = [s.x1 / upm, s.y1 / upm, s.x2 / upm, s.y2 / upm];
    const len = Math.hypot(bx - ax, by - ay);
    const alongX = Math.abs(by - ay) < 0.01;
    if (s.stroke !== outlinePen || len < 1.5 || (!alongX && Math.abs(bx - ax) >= 0.01)) continue;
    const [at, lo, hi] = alongX ? [(ay + by) / 2, Math.min(ax, bx), Math.max(ax, bx)] : [(ax + bx) / 2, Math.min(ay, by), Math.max(ay, by)];
    let crossed = 0;
    for (const h of strokes) {
      const [u1, v1, u2, v2] = alongX ? [h.x1 / upm, h.y1 / upm, h.x2 / upm, h.y2 / upm] : [h.y1 / upm, h.x1 / upm, h.y2 / upm, h.x2 / upm];
      if (Math.min(v1, v2) > at - 0.05 || Math.max(v1, v2) < at + 0.05) continue;
      const u = u1 + ((u2 - u1) * (at - v1)) / (v2 - v1);
      if (u >= lo && u <= hi) crossed++;
    }
    if (crossed < len) drawLine(barrier, ax / CELL, ay / CELL, bx / CELL, by / CELL);
  }
  const walls = dilate(building, 3);
  const loose = emptyMask(cols, rows);
  for (let k = 0; k < loose.data.length; k++) loose.data[k] = hatch.data[k] && !walls.data[k] && !barrier.data[k] ? 1 : 0;
  // Under 50 cm across is no balcony: a neck there joins two that are not one.
  const parts = label(dilate(erode(loose, 2), 2), 1);
  const against = dilate(building, 6);
  const extent = (ids: Int32Array, id: number) => {
    let touches = false;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let k = 0; k < ids.length; k++) {
      if (ids[k] !== id) continue;
      if (against.data[k]) touches = true;
      const x = k % cols;
      const y = (k - x) / cols;
      [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
    }
    return { touches, depth: Math.min(x1 - x0 + 1, y1 - y0 + 1) * CELL };
  };
  const kept = emptyMask(cols, rows);
  for (let id = 1; id < parts.sizes.length; id++) {
    const m2 = parts.sizes[id]! * CELL * CELL;
    if (m2 < 2 || m2 > 60) continue;
    const { touches, depth } = extent(parts.ids, id);
    if (!touches || depth < 0.8) continue;
    for (let k = 0; k < parts.ids.length; k++) if (parts.ids[k] === id) kept.data[k] = 1;
  }
  // Two homes' balconies side by side, the line between them drawn across
  // the hatch, are one slab: joined across up to 60 cm, where both are.
  const { ids, sizes } = label(erode(dilate(kept, 3), 3), 1);
  const near = dilate(building, 8);
  const lined = doubleLineWalls(g, cols, rows, CELL * 100);
  const out: HouseBalcony[] = [];
  for (let id = 1; id < sizes.length; id++) {
    const part = emptyMask(cols, rows);
    for (let k = 0; k < ids.length; k++) if (ids[k] === id) part.data[k] = 1;
    const { depth } = extent(ids, id);
    // Back to the face of the house, straight across the band the walls were
    // cut out by and the notches a label or a piece of furniture left in the hatch.
    const fill: number[] = [];
    for (let k = 0; k < part.data.length; k++) {
      if (part.data[k] || !near.data[k] || building.data[k]) continue;
      const x = k % cols;
      const y = (k - x) / cols;
      const hits = (dx: number, dy: number, m: Mask) => {
        for (let d = 1; d <= 8; d++) {
          const [px, py] = [x + dx * d, y + dy * d];
          if (px >= 0 && py >= 0 && px < cols && py < rows && m.data[py * cols + px]) return true;
        }
        return false;
      };
      if (([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dy]) => hits(dx, dy, part) && hits(-dx, -dy, building))) fill.push(k);
    }
    for (const k of fill) part.data[k] = 1;
    // A sofa or a planter set against the railing leaves its own outline in
    // the hatch: the floor runs on under it, across each row from end to end.
    for (let r = 0; r < rows; r++) {
      let [c0, c1] = [-1, -1];
      for (let c = 0; c < cols; c++) if (part.data[r * cols + c]) [c0, c1] = [c0 < 0 ? c : c0, c];
      for (let c = c0 + 1; c0 >= 0 && c < c1; c++) if (!building.data[r * cols + c]) part.data[r * cols + c] = 1;
    }
    const traced = traceOutline(erode(dilate(part, 1), 1), 1).map(([x, y]) => [x * CELL, y * CELL] as [number, number]);
    if (traced.length < 3) continue;
    const { ring, open, drawn } = railedEdges(g, traced, footprint, upm);
    if (open === 0 || drawn / open < 0.6) continue;
    // Walled round in outline — two lines a wall's thickness apart along
    // nearly all its open edges — it is a room the walls were not read round.
    if (walledShare(ring, footprint, lined) >= 0.8 && !(below && overhangs(part, below))) continue;
    const dividers = balconyDividers(g, ring, upm).map((d) => ({ ...d, a: [d.a[0] + shift.x, d.a[1] + shift.y] as [number, number], b: [d.b[0] + shift.x, d.b[1] + shift.y] as [number, number] }));
    out.push({ ...(dividers.length ? { dividers } : {}), ring: ring.map(([x, z]) => [x + shift.x, z + shift.y]), areaM2: Math.round(sizes[id]! * CELL * CELL * 10) / 10, depthM: Math.round(depth * 100) / 100, railed: Math.round((drawn / open) * 100) / 100 });
  }
  return out;
}

/**
 * The walls drawn across a balcony from the house to its edge: lines across
 * its depth spanning at least 70% of it, away from its ends — a wall's two
 * faces, 5–35 cm apart, one wall. Gottlieb's pair share one balcony slab and
 * the plan draws their party wall on through it; built without it the two
 * homes stood on one open balcony in every view of the front.
 */
export function balconyDividers(g: DwfGeometry, ring: Outline, upm = upmOf()): BalconyDivider[] {
  const xs = ring.map(([x]) => x);
  const zs = ring.map(([, z]) => z);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  // Across its depth: the balcony's shorter side.
  const acrossZ = x1 - x0 >= z1 - z0;
  const [lo, hi, depth] = acrossZ ? [x0, x1, z1 - z0] : [z0, z1, x1 - x0];
  const [d0, d1] = acrossZ ? [z0, z1] : [x0, x1];
  // A line drawn in pieces on one axis counts as one: Gottlieb C's party wall
  // runs through its recessed balcony and on through the part outside in two.
  const spans = new Map<number, Array<[number, number]>>();
  for (const s of g.segments) {
    const [ax, ay, bx, by] = [s.x1 / upm, s.y1 / upm, s.x2 / upm, s.y2 / upm];
    const straight = acrossZ ? Math.abs(bx - ax) < 0.01 : Math.abs(by - ay) < 0.01;
    if (!straight) continue;
    const u = acrossZ ? (ax + bx) / 2 : (ay + by) / 2;
    if (u < lo + 0.5 || u > hi - 0.5) continue;
    const [v0, v1] = acrossZ ? [Math.min(ay, by), Math.max(ay, by)] : [Math.min(ax, bx), Math.max(ax, bx)];
    const lo1 = Math.max(v0, d0);
    const hi1 = Math.min(v1, d1);
    if (hi1 <= lo1) continue;
    const key = Math.round(u * 100) / 100;
    spans.set(key, [...(spans.get(key) ?? []), [lo1, hi1]]);
  }
  const at: number[] = [];
  for (const [u, list] of spans) {
    list.sort((p, q) => p[0] - q[0]);
    let covered = 0;
    let reach = -Infinity;
    for (const [a, b] of list) {
      if (b <= reach) continue;
      covered += b - Math.max(a, reach);
      reach = b;
    }
    if (covered >= 0.7 * depth) at.push(u);
  }
  at.sort((p, q) => p - q);
  const out: BalconyDivider[] = [];
  for (let i = 0; i < at.length; i++) {
    const j = at.findIndex((u, k) => k > i && u - at[i]! >= 0.05 && u - at[i]! <= 0.35);
    if (j < 0) continue;
    const u = (at[i]! + at[j]!) / 2;
    if (out.some((d) => Math.abs((acrossZ ? d.a[0] : d.a[1]) - u) < 0.4)) continue;
    const thick = at[j]! - at[i]!;
    out.push(acrossZ ? { a: [u, d0], b: [u, d1], thick } : { a: [d0, u], b: [d1, u], thick });
    i = j;
  }
  return out;
}

/** Whether a good part of a part (on a grid of CELL metres) lies off the storey below: nothing under it but the land. */
function overhangs(part: Mask, below: (x: number, z: number) => boolean): boolean {
  let n = 0;
  let off = 0;
  for (let k = 0; k < part.data.length; k++) {
    if (!part.data[k]) continue;
    const x = k % part.cols;
    n++;
    if (!below((x + 0.5) * CELL, ((k - x) / part.cols + 0.5) * CELL)) off++;
  }
  return n > 0 && off >= 0.4 * n;
}

/** The share of a ring's open edges with a wall drawn in outline (`lined`, on a grid of CELL metres) within 30 cm. */
function walledShare(ring: Outline, footprint: (x: number, z: number) => boolean, lined: Mask): number {
  const at = (x: number, z: number) => {
    const [c, r] = [Math.round(x / CELL), Math.round(z / CELL)];
    return c >= 0 && r >= 0 && c < lined.cols && r < lined.rows && lined.data[r * lined.cols + c] === 1;
  };
  let open = 0;
  let walled = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.3) continue;
    const [nx, nz] = [(bz - az) / len, -(bx - ax) / len];
    for (let t = 0.1; t < len; t += 0.1) {
      const [x, z] = [ax + ((bx - ax) * t) / len, az + ((bz - az) * t) / len];
      if (footprint(x, z) || footprint(x + nx * 0.3, z + nz * 0.3) || footprint(x - nx * 0.3, z - nz * 0.3)) continue;
      open += 1;
      for (let d = -0.3; d <= 0.3; d += 0.05) {
        if (!at(x + nx * d, z + nz * d)) continue;
        walled += 1;
        break;
      }
    }
  }
  return open === 0 ? 0 : walled / open;
}

/**
 * Of a traced ring's open edges (not against the house), how many metres
 * there are and how many have a line drawn along them within 25 cm — and the
 * ring with each such edge moved onto its line, the edge the sheet draws.
 */
export function railedEdges(g: DwfGeometry, traced: Outline, footprint: (x: number, z: number) => boolean, upm = upmOf()): { ring: Outline; open: number; drawn: number } {
  const lines = g.segments
    .filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / upm >= 0.3 && (Math.abs(s.x2 - s.x1) < 0.01 * upm || Math.abs(s.y2 - s.y1) < 0.01 * upm))
    .map((s) => ({ x1: Math.min(s.x1, s.x2) / upm, x2: Math.max(s.x1, s.x2) / upm, y1: Math.min(s.y1, s.y2) / upm, y2: Math.max(s.y1, s.y2) / upm }));
  const ring: Outline = traced.map(([x, z]) => [x, z]);
  let open = 0;
  let drawn = 0;
  for (let i = 0; i < traced.length; i++) {
    const [ax, ay] = traced[i]!;
    const [bx, by] = traced[(i + 1) % traced.length]!;
    const len = Math.hypot(bx - ax, by - ay);
    // Square to an axis within a cell's step over the edge: the trace's
    // corner at the house leans the edge from it (Gottlieb A's west end, 6.8 → 6.7).
    const horizontal = Math.abs(by - ay) <= Math.min(0.15, len * 0.1);
    if (!horizontal && Math.abs(bx - ax) > Math.min(0.15, len * 0.1)) continue;
    const offsets: number[] = [];
    const outer: number[] = [];
    for (let t = 0.1; t < len; t += 0.2) {
      const x = ax + ((bx - ax) * t) / len;
      const y = ay + ((by - ay) * t) / len;
      const off = [0.35, -0.35].map((d) => (horizontal ? footprint(x, y + d) : footprint(x + d, y)));
      if (off.some(Boolean)) continue;
      open += 0.2;
      const across: number[] = [];
      for (const l of lines) {
        const d = horizontal ? (l.y2 - l.y1 < 0.01 && l.x1 <= x && l.x2 >= x ? l.y1 - y : null) : l.x2 - l.x1 < 0.01 && l.y1 <= y && l.y2 >= y ? l.x1 - x : null;
        if (d != null) across.push(d);
      }
      let best: number | null = null;
      for (const d of across) if (Math.abs(d) <= 0.25 && (best == null || Math.abs(d) < Math.abs(best))) best = d;
      if (best == null) continue;
      drawn += 0.2;
      offsets.push((horizontal ? y : x) + best);
      // The edge drawn double — a parapet's two faces, 10–35 cm apart, the
      // hatch stopping at the inner — is the slab's edge at the outer: the
      // balcony as deep as the sheet dimensions it (Gottlieb A, 2.00 m, not the hatch's 1.76).
      const outward = (d: number) => !insidePolygon(traced, horizontal ? x : x + Math.sign(d) * 0.05, horizontal ? y + Math.sign(d) * 0.05 : y);
      const near = best;
      // The parapet's outer face: the first line beyond, not a garden wall's further out.
      const far = across.filter((d) => Math.abs(d - near) >= 0.1 && Math.abs(d - near) <= 0.35 && Math.abs(d) > Math.abs(near) && outward(d));
      if (far.length) outer.push((horizontal ? y : x) + far.reduce((p, q) => (Math.abs(q - near) < Math.abs(p - near) ? q : p)));
    }
    if (offsets.length * 0.2 < 0.6 * len) continue;
    const doubled = outer.length * 0.2 >= 0.6 * len;
    const at = [...(doubled ? outer : offsets)].sort((p, q) => p - q)[(doubled ? outer : offsets).length >> 1]!;
    const j = (i + 1) % traced.length;
    if (horizontal) [ring[i]![1], ring[j]![1]] = [at, at];
    else [ring[i]![0], ring[j]![0]] = [at, at];
  }
  return { ring, open, drawn };
}

/**
 * A balcony stood up: its floor in grey tile, and a railing on its edges that
 * are not against the house — glass panes in a slim black frame, as the
 * facades draw it (hatched panels between posts, "שחור"). The bars those
 * facades draw are the side stairs'; built as bars, the balcony disagreed
 * with every elevation, and from above its deck read as the paving below
 * with no edge at all (Gottlieb A, 15/10/2026).
 */
export function balconyPrimitives(b: HouseBalcony, level: number, railingTop: number, outline: Outline, tag: string): Primitive[] {
  const prims: Primitive[] = [slab(b.ring, level - 0.02, 0.3, "balconyTile", `${tag}:balcony`)];
  for (const rail of parapet(b.ring, level - 0.02, level + railingTop, 0.04, "glass", `${tag}:balcony:railing`)) {
    if (rail.type !== "box") continue;
    // Railed only where the edge is off the house, point by point: an edge
    // run on past the house's face stood its railing in the kitchen beside
    // it, and a trace's step at a wall's corner stood a black L there
    // (Gottlieb C, 15/10/2026). Under 40 cm of it is no railing.
    const along = rail.size.x > rail.size.z;
    const len = along ? rail.size.x : rail.size.z;
    const against = (t: number) => {
      const [x, z] = along ? [rail.centre.x + t, rail.centre.z] : [rail.centre.x, rail.centre.z + t];
      return [0.4, -0.4].some((d) => (along ? insidePolygon(outline, x, z + d) && !insidePolygon(b.ring, x, z + d) : insidePolygon(outline, x + d, z) && !insidePolygon(b.ring, x + d, z)));
    };
    const STEP = 0.05;
    let from: number | null = null;
    for (let t = -len / 2; t <= len / 2 + 1e-9; t += STEP) {
      const end = t + STEP > len / 2 + 1e-9;
      const off = !against(Math.min(t, len / 2));
      if (off && from == null) from = t;
      if ((!off || end) && from != null) {
        const to = off ? len / 2 : t;
        if (to - from >= 0.4) {
          const mid = (from + to) / 2;
          const centre = along ? { ...rail.centre, x: rail.centre.x + mid } : { ...rail.centre, z: rail.centre.z + mid };
          const size = along ? { ...rail.size, x: to - from } : { ...rail.size, z: to - from };
          prims.push(...framedGlass({ centre, size }, `${tag}:balcony:railing`));
        }
        from = null;
      }
    }
  }
  // The party wall through it: plastered, a privacy wall's height (the sheets give none).
  for (const d of b.dividers ?? []) {
    const alongZ = Math.abs(d.b[0] - d.a[0]) < 1e-6;
    const len = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
    const thick = Math.max(0.15, d.thick);
    prims.push({
      type: "box",
      centre: { x: (d.a[0] + d.b[0]) / 2, y: level + BALCONY_DIVIDER_M / 2, z: (d.a[1] + d.b[1]) / 2 },
      size: alongZ ? { x: thick, y: BALCONY_DIVIDER_M, z: len } : { x: len, y: BALCONY_DIVIDER_M, z: thick },
      material: HOUSE_PLASTER_WING,
      tag: `${tag}:balcony:divider`,
    });
  }
  return prims;
}

/** Glass panes along a box's long side, about a metre each, between black posts under a black top rail. */
function framedGlass(edge: { centre: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } }, tag: string, slim = false): Primitive[] {
  const [rail, post] = slim ? [0.04, 0.035] : [0.07, 0.05];
  const alongX = edge.size.x >= edge.size.z;
  const len = alongX ? edge.size.x : edge.size.z;
  const bottom = edge.centre.y - edge.size.y / 2;
  const top = edge.centre.y + edge.size.y / 2;
  const out: Primitive[] = [{ type: "box", centre: { ...edge.centre, y: (bottom + top - 0.06) / 2 }, size: { ...edge.size, y: top - bottom - 0.06 }, material: "glass", tag }];
  out.push({ type: "box", centre: { ...edge.centre, y: top - 0.03 }, size: alongX ? { x: len, y: 0.06, z: rail } : { x: rail, y: 0.06, z: len }, material: "frame", tag });
  const n = Math.max(1, Math.round(len / 1.0));
  for (let i = 0; i <= n; i++) {
    const t = -len / 2 + (len * i) / n;
    const at = alongX ? { x: edge.centre.x + t, z: edge.centre.z } : { x: edge.centre.x, z: edge.centre.z + t };
    out.push({ type: "box", centre: { x: at.x, y: (bottom + top) / 2, z: at.z }, size: { x: post, y: top - bottom, z: post }, material: "frame", tag });
  }
  return out;
}

/** An elevation drawing read without its level marks: the building's sides across the page, its top and its ±0.00. */
export type ElevationOutline = { g: DwfGeometry; left: number; right: number; top: number; zero: number };

/**
 * The building on an elevation: the two outermost verticals at least 4 m
 * tall that are not the sheet's border, the top their highest end, ±0.00
 * the lower end of the longer — a house's sides stand on its ground floor.
 */
export function elevationOutline(g: DwfGeometry, upm = upmOf()): ElevationOutline | null {
  const sides = g.segments
    .filter((s) => Math.abs(s.x2 - s.x1) < 0.01 * upm && Math.abs(s.y2 - s.y1) > 4 * upm)
    .map((s) => ({ x: (s.x1 + s.x2) / 2, y0: Math.min(s.y1, s.y2), y1: Math.max(s.y1, s.y2) }))
    .filter((v) => v.y1 - v.y0 < 0.85 * g.pageHeight && v.x > 0.02 * g.pageWidth && v.x < 0.98 * g.pageWidth);
  if (sides.length < 2) return null;
  const left = sides.reduce((p, q) => (q.x < p.x ? q : p));
  const right = sides.reduce((p, q) => (q.x > p.x ? q : p));
  if ((right.x - left.x) / upm < 4) return null;
  const top = Math.min(left.y0, right.y0);
  const zero = (left.y1 - left.y0 >= right.y1 - right.y0 ? left : right).y1;
  return { g, left: left.x, right: right.x, top, zero };
}

/** A slatted box an elevation draws over the roof: across the page, and how far over the building's top. */
export type SlattedBox = { x0: number; x1: number; overTop: number };

/**
 * The slatted boxes an elevation draws standing over the building's top:
 * five or more equal horizontal lines 50 cm to 2.5 m long, under 20 cm
 * apart, between the building's sides and within 2 m over its top.
 */
export function slattedBoxes(e: ElevationOutline, upm = upmOf()): SlattedBox[] {
  const lines = e.g.segments
    .filter((s) => Math.abs(s.y2 - s.y1) < 0.01 * upm)
    .map((s) => ({ a: Math.min(s.x1, s.x2), b: Math.max(s.x1, s.x2), y: (s.y1 + s.y2) / 2 }))
    .filter((l) => l.b - l.a >= 0.5 * upm && l.b - l.a <= 2.5 * upm && l.y < e.top - 0.02 * upm && l.y > e.top - 2 * upm && l.a >= e.left - 0.05 * upm && l.b <= e.right + 0.05 * upm);
  const out: SlattedBox[] = [];
  const used = new Set<(typeof lines)[number]>();
  for (const l of lines) {
    if (used.has(l)) continue;
    const same = lines.filter((t) => Math.abs(t.a - l.a) < 0.03 * upm && Math.abs(t.b - l.b) < 0.03 * upm).sort((p, q) => p.y - q.y);
    for (const t of same) used.add(t);
    const ys = [...new Set(same.map((t) => Math.round(t.y * 100) / 100))];
    if (ys.length < 5) continue;
    const gaps = ys.slice(1).map((y, i) => y - ys[i]!);
    if (Math.max(...gaps) > 0.2 * upm) continue;
    out.push({ x0: (l.a - e.left) / (e.right - e.left), x1: (l.b - e.left) / (e.right - e.left), overTop: (e.top - ys[0]!) / upm });
  }
  return out;
}

export type ElevationFace = "south" | "north" | "west" | "east";

/** A solar heater's screen on the roof, in the building's frame. */
export type RoofScreen = { x0: number; x1: number; z0: number; z1: number; overTop: number; seenOn: ElevationFace[] };

/**
 * The roof's screens from the elevations' slatted boxes: across x from the
 * south and north faces — the two agreeing within 75 cm are averaged — and
 * in depth from the west and east; laid proportionally over the roof's
 * extent, as an elevation may be drawn a little narrower than the plan. A box
 * kept stands on the roof's outline.
 */
export function roofScreens(faces: Partial<Record<ElevationFace, SlattedBox[]>>, roof: Outline): RoofScreen[] {
  const xs = roof.map(([x]) => x);
  const zs = roof.map(([, z]) => z);
  const [mx0, mx1, mz0, mz1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  // Page left is west on the south face, east on the north; north on the west face, south on the east.
  const across = (face: ElevationFace, b: SlattedBox): [number, number] => {
    const [t0, t1] = face === "south" || face === "west" ? [b.x0, b.x1] : [1 - b.x1, 1 - b.x0];
    return face === "south" || face === "north" ? [mx0 + t0 * (mx1 - mx0), mx0 + t1 * (mx1 - mx0)] : [mz0 + t0 * (mz1 - mz0), mz0 + t1 * (mz1 - mz0)];
  };
  const alongX: Array<{ a: number; b: number; over: number; seen: ElevationFace[] }> = [];
  for (const face of ["south", "north"] as const) {
    for (const box of faces[face] ?? []) {
      const [a, b] = across(face, box);
      const same = alongX.find((s) => Math.abs((s.a + s.b) / 2 - (a + b) / 2) < 0.75 && !s.seen.includes(face));
      if (same) {
        [same.a, same.b, same.over] = [(same.a + a) / 2, (same.b + b) / 2, (same.over + box.overTop) / 2];
        same.seen.push(face);
      } else alongX.push({ a, b, over: box.overTop, seen: [face] });
    }
  }
  const alongZ = (["west", "east"] as const).flatMap((face) => (faces[face] ?? []).map((box) => ({ range: across(face, box), face })));
  if (alongZ.length === 0) return [];
  const out: RoofScreen[] = [];
  for (const s of alongX) {
    for (const { range: [z0, z1], face } of alongZ) {
      const [cx, cz] = [(s.a + s.b) / 2, (z0 + z1) / 2];
      if (!insidePolygon(roof, cx, cz)) continue;
      out.push({ x0: s.a, x1: s.b, z0, z1, overTop: s.over, seenOn: [...s.seen, face] });
    }
  }
  // Two side faces drawing the same box in depth give it twice: once is enough.
  return out.filter((r, i) => out.findIndex((q) => Math.abs(q.x0 - r.x0) < 0.3 && Math.abs((q.z0 + q.z1) / 2 - (r.z0 + r.z1) / 2) < 0.75) === i);
}

/**
 * A screen stood on the roof slab, up to its height over the parapet, in
 * aluminium slats as the elevations draw it: a dark core — the heater behind —
 * and horizontal slats every 12 cm standing proud of it on all four faces,
 * with corner posts. One plain box read as a grey block on every view.
 */
export function roofScreenPrimitives(s: RoofScreen, roofLevel: number, parapetTop: number): Primitive[] {
  const y0 = roofLevel;
  const y1 = parapetTop + s.overTop;
  const [w, d] = [s.x1 - s.x0, s.z1 - s.z0];
  const [cx, cz] = [(s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2];
  const tag = "roof:solar-screen";
  const out: Primitive[] = [
    { type: "box", centre: { x: cx, y: (y0 + y1) / 2, z: cz }, size: { x: w - 0.08, y: y1 - y0, z: d - 0.08 }, material: "frame", tag },
  ];
  const slat = 0.06;
  for (let y = y0 + 0.1; y < y1 - 0.04; y += 0.12) {
    out.push({ type: "box", centre: { x: cx, y: y + slat / 2, z: cz }, size: { x: w, y: slat, z: d }, material: "louvre", tag });
  }
  for (const [px, pz] of [[s.x0, s.z0], [s.x1, s.z0], [s.x0, s.z1], [s.x1, s.z1]] as const) {
    out.push({ type: "box", centre: { x: px + (px === s.x0 ? 0.025 : -0.025), y: (y0 + y1) / 2, z: pz + (pz === s.z0 ? 0.025 : -0.025) }, size: { x: 0.05, y: y1 - y0, z: 0.05 }, material: "louvre", tag });
  }
  out.push({ type: "box", centre: { x: cx, y: y1 - 0.02, z: cz }, size: { x: w + 0.02, y: 0.04, z: d + 0.02 }, material: "louvre", tag });
  return out;
}

/** Whether a mask pixel is set, at sheet metres (x, z), on a grid of `cm` a pixel. */
export function maskAt(mask: Mask, cm: number): (x: number, z: number) => boolean {
  return (x, z) => {
    const px = Math.round((x * 100) / cm);
    const py = Math.round((z * 100) / cm);
    return px >= 0 && py >= 0 && px < mask.cols && py < mask.rows && mask.data[py * mask.cols + px] === 1;
  };
}

/**
 * A house's own stair, as its storey's sheet draws it: every tread run lying
 * within the house, stood up from the floor a riser a tread, the runs one
 * after another — a stair hall left bare showed the plan's stair room as an
 * empty box (Gottlieb pilot, 10/10/2026). `inside(x, z)` answers in the
 * building's frame; the runs are moved there by `shift`.
 */
export function interiorStairs(
  g: DwfGeometry,
  inside: (x: number, z: number) => boolean,
  shift: { x: number; y: number },
  level: number,
  storey: number,
  tag: string,
  /** "up": the flight rises from this floor. "treads": the floor the flight arrives at — its treads, as the sheet draws them, seen from above. */
  mode: "up" | "treads" = "up",
  upm = upmOf(),
): Primitive[] {
  const runs = treadRuns(g, upm, true)
    .map((r) => {
      const [da, db] = r.along === "x" ? [shift.x, shift.y] : [shift.y, shift.x];
      return { along: r.along, a: r.a + da, b: r.b + da, ats: r.ats.map((v) => v + db) };
    })
    .filter((r) => {
      // Within the house: most of the run — its last tread may lie on the stair hall's wall line.
      let n = 0;
      let hit = 0;
      for (let u = r.a + 0.05; u <= r.b - 0.05; u += 0.2) {
        for (const v of r.ats) {
          n++;
          if (r.along === "x" ? inside(u, v) : inside(v, u)) hit++;
        }
      }
      return r.ats.length >= 4 && hit >= 0.8 * n;
    });
  if (!runs.length) return [];
  const toBuilding = (s: { x1: number; y1: number; x2: number; y2: number }): Seg => ({ x1: s.x1 / upm + shift.x, z1: s.y1 / upm + shift.y, x2: s.x2 / upm + shift.x, z2: s.y2 / upm + shift.y });
  const walks = (g.walkLines ?? []).map(toBuilding);
  const drawn = (g.stairLines ?? []).map(toBuilding);
  // One stair a house: runs within a stair hall's width of each other are its
  // flights; a pair of houses draws two stairs.
  type Run = (typeof runs)[number];
  const boxOf = (r: Run) => (r.along === "x" ? { x0: r.a, x1: r.b, z0: r.ats[0]!, z1: r.ats[r.ats.length - 1]! } : { x0: r.ats[0]!, x1: r.ats[r.ats.length - 1]!, z0: r.a, z1: r.b });
  const near = (p: Run, q: Run) => {
    const [u, v] = [boxOf(p), boxOf(q)];
    return Math.max(u.x0 - v.x1, v.x0 - u.x1, 0) < 1.2 && Math.max(u.z0 - v.z1, v.z0 - u.z1, 0) < 1.2;
  };
  const groups: Run[][] = [];
  for (const r of runs) {
    const grp = groups.find((q) => q.some((p) => near(p, r)));
    if (grp) grp.push(r);
    else groups.push([r]);
  }
  const out: Primitive[] = [];
  for (const group of groups) {
    const box = group.map(boxOf).reduce((p, q) => ({ x0: Math.min(p.x0, q.x0), x1: Math.max(p.x1, q.x1), z0: Math.min(p.z0, q.z0), z1: Math.max(p.z1, q.z1) }));
    const within = (s: Seg) => [[s.x1, s.z1], [s.x2, s.z2]].every(([x, z]) => x! >= box.x0 - 1.4 && x! <= box.x1 + 1.4 && z! >= box.z0 - 1.4 && z! <= box.z1 + 1.4);
    const plan = stairPlan(group, walks.filter(within), drawn.filter(within));
    out.push(...(mode === "up" ? stairRising(plan, level, storey, tag) : stairArriving(plan, level, tag)));
  }
  return out;
}

/** A line in the building's frame, metres. */
type Seg = { x1: number; z1: number; x2: number; z2: number };

/** A leg of a walk line: along `axis`, at `at` across it, walked from `from` to `to`. */
export type WalkLeg = { axis: "x" | "z"; at: number; from: number; to: number };

/**
 * A stair's walk line, as a plan draws it over the treads: its straight legs
 * in the order they are climbed, ending at the arrow's tip at the top, and the
 * slanted break line where the plan's cut crosses a flight. Null where no
 * arrow tip ends a leg: the climb is then not drawn.
 */
export function stairWalk(segs: Seg[]): { legs: WalkLeg[]; cut: Seg | null } | null {
  const len = (s: Seg) => Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
  const straight = (s: Seg) => Math.abs(s.x2 - s.x1) < 0.02 || Math.abs(s.z2 - s.z1) < 0.02;
  // The arrow's head: two short slanted strokes meeting at its tip.
  const strokes = segs.filter((s) => !straight(s) && len(s) < 0.8);
  const ends = strokes.flatMap((s) => [[s.x1, s.z1], [s.x2, s.z2]] as Array<[number, number]>);
  const tips = ends.filter(([x, z], i) => ends.some(([u, v], j) => j !== i && Math.hypot(u - x, v - z) < 0.03));
  const cut = segs.filter((s) => !straight(s) && len(s) >= 0.6 && len(s) <= 2.5).sort((p, q) => len(q) - len(p))[0] ?? null;
  // The legs: the straight lines, collinear pieces joined.
  type Leg = { axis: "x" | "z"; at: number; lo: number; hi: number };
  let legs: Leg[] = segs
    .filter((s) => straight(s) && len(s) >= 0.2)
    .map((s) => {
      const axis = Math.abs(s.z2 - s.z1) < 0.02 ? ("x" as const) : ("z" as const);
      return axis === "x"
        ? { axis, at: (s.z1 + s.z2) / 2, lo: Math.min(s.x1, s.x2), hi: Math.max(s.x1, s.x2) }
        : { axis, at: (s.x1 + s.x2) / 2, lo: Math.min(s.z1, s.z2), hi: Math.max(s.z1, s.z2) };
    });
  for (let merged = true; merged; ) {
    merged = false;
    const next: Leg[] = [];
    for (const l of legs) {
      const same = next.find((m) => m.axis === l.axis && Math.abs(m.at - l.at) < 0.03 && l.lo <= m.hi + 0.03 && l.hi >= m.lo - 0.03);
      if (same) {
        [same.lo, same.hi] = [Math.min(same.lo, l.lo), Math.max(same.hi, l.hi)];
        merged = true;
      } else next.push({ ...l });
    }
    legs = next;
  }
  const point = (l: Leg, u: number): [number, number] => (l.axis === "x" ? [u, l.at] : [l.at, u]);
  const close = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.06;
  // The leg the arrow ends: its tip at the leg's end, or on its line a hand short of it — where the
  // walk line stops at the plan's cut, Gottlieb C's arrow is drawn 13 cm back from its end.
  const ending = (tip: [number, number]): { leg: Leg; to: number } | null => {
    for (const l of legs) for (const u of [l.lo, l.hi]) if (close(point(l, u), tip)) return { leg: l, to: u };
    for (const l of legs) {
      const [along, across] = l.axis === "x" ? [tip[0], tip[1]] : [tip[1], tip[0]];
      if (Math.abs(across - l.at) > 0.03) continue;
      for (const u of [l.lo, l.hi]) if (Math.abs(along - u) <= 0.2) return { leg: l, to: u };
    }
    return null;
  };
  let best: WalkLeg[] = [];
  for (const tip of tips) {
    const end = ending(tip);
    if (!end) continue;
    const path: WalkLeg[] = [];
    const used = new Set<Leg>();
    let leg: Leg | undefined = end.leg;
    let to = end.to;
    while (leg && !used.has(leg)) {
      used.add(leg);
      const from = to === leg.hi ? leg.lo : leg.hi;
      path.unshift({ axis: leg.axis, at: leg.at, from, to });
      const start = point(leg, from);
      leg = legs.find((l) => !used.has(l) && (close(point(l, l.lo), start) || close(point(l, l.hi), start)));
      if (leg) to = close(point(leg, leg.hi), start) ? leg.hi : leg.lo;
    }
    if (path.length > best.length) best = path;
  }
  return best.length ? { legs: best, cut } : null;
}

/** A flight of a house's stair: its treads' lines across `along`, from its bottom riser to its top, the climb `dir` along the other axis. */
type StairFlight = { along: "x" | "z"; a: number; b: number; lines: number[]; dir: 1 | -1; walkAt: number };
/** A house's stair: its first flight, and where it turns, its landing and the flight back above it. */
export type StairPlan = {
  first: StairFlight;
  landing: { lo: number; hi: number; from: number; to: number } | null;
  second: StairFlight | null;
  /** On the floor it rises from: how many of the second flight's treads the plan draws below its cut. */
  shown: number;
  cut: Seg | null;
};

/**
 * A stair read off its plan: the flights the walk line climbs, each the way
 * it climbs, and the landing it turns on — Gottlieb's are U stairs, the first
 * flight up the page to a landing and the second back down it to the upper
 * floor (15/10/2026: drawn both one way, the pair read as no stair at all).
 * The ground floor draws the second flight only to its cut: the flight is
 * made up from the first's width and treads there. With no walk line, a
 * second run beside the first is taken to climb back the other way.
 */
export function stairPlan(group: TreadRun[], walks: Seg[], drawn: Seg[]): StairPlan {
  const runs = [...group].sort((p, q) => q.ats.length - p.ats.length);
  const r1 = runs[0]!;
  const climb = r1.along === "x" ? "z" : "x";
  const walk = stairWalk(walks);
  const climbs = walk?.legs.filter((l) => l.axis === climb) ?? [];
  const holds = (r: TreadRun, at: number) => at > r.a && at < r.b;
  // The first flight is the one the walk line climbs first, whichever run is longer.
  const leg1 = climbs.find((l) => runs.some((r) => r.along === r1.along && holds(r, l.at)));
  const run1 = (leg1 && runs.find((r) => r.along === r1.along && holds(r, leg1.at))) ?? r1;
  const dir1: 1 | -1 = leg1 ? (leg1.to > leg1.from ? 1 : -1) : 1;
  const ordered = (ats: number[], dir: 1 | -1) => [...ats].sort((p, q) => dir * (p - q));
  const first: StairFlight = { along: run1.along, a: run1.a, b: run1.b, lines: ordered(run1.ats, dir1), dir: dir1, walkAt: leg1?.at ?? (run1.a + run1.b) / 2 };
  const width = run1.b - run1.a;
  const top = first.lines[first.lines.length - 1]!;
  const step = first.lines.length > 1 ? Math.abs(first.lines[1]! - first.lines[0]!) : 0.28;
  // The flight back: the last climbing leg away from the first's, or a second run beside it.
  const leg2 = climbs.length >= 2 && Math.abs(climbs[climbs.length - 1]!.at - first.walkAt) > 0.3 ? climbs[climbs.length - 1]! : null;
  const beside = runs.find((r) => r !== run1 && r.along === run1.along && (r.b <= run1.a + 0.05 || r.a >= run1.b - 0.05));
  if (!leg2 && !(walk == null && beside)) return { first, landing: null, second: null, shown: 0, cut: walk?.cut ?? null };
  const at2 = leg2?.at ?? (beside!.a + beside!.b) / 2;
  const dir2: 1 | -1 = leg2 ? (leg2.to > leg2.from ? 1 : -1) : (-dir1 as 1 | -1);
  const run2 = runs.find((r) => r !== run1 && r.along === run1.along && holds(r, at2));
  // Its width as its first tread is drawn across it on the ground floor, else the first's.
  const across = drawn.filter((s) => (run1.along === "x" ? Math.abs(s.z2 - s.z1) < 0.02 : Math.abs(s.x2 - s.x1) < 0.02));
  const span = (s: Seg) => (run1.along === "x" ? [Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)] : [Math.min(s.z1, s.z2), Math.max(s.z1, s.z2)]) as [number, number];
  const pos = (s: Seg) => (run1.along === "x" ? (s.z1 + s.z2) / 2 : (s.x1 + s.x2) / 2);
  const tread = across.map(span).find(([a, b]) => a < at2 && b > at2 && Math.abs(b - a - width) < 0.15);
  const [a2, b2] = run2 ? [run2.a, run2.b] : (tread ?? [at2 - width / 2, at2 + width / 2]);
  const lines2 = run2 ? ordered(run2.ats, dir2) : first.lines.map((_, i) => top + dir2 * step * i);
  const second: StairFlight = { along: run1.along, a: a2, b: b2, lines: lines2, dir: dir2, walkAt: at2 };
  // The landing: from the first flight's top on, as deep as the walk line turns
  // across it is from that edge twice over, else as deep as the flight is wide.
  const turn = walk?.legs.find((l) => l.axis === run1.along);
  const depth = Math.min(2, Math.max(0.6, turn ? 2 * Math.abs(turn.at - top) : width));
  const landing = { lo: Math.min(run1.a, a2), hi: Math.max(run1.b, b2), from: top, to: top + dir1 * depth };
  // The second flight's treads drawn below the cut: up to the break line, else as many as the sheet draws across it.
  let shown = run2 ? lines2.length - 1 : 0;
  if (!run2) {
    const cut = walk?.cut;
    if (cut) {
      const c = climb === "z" ? (cut.z1 + cut.z2) / 2 : (cut.x1 + cut.x2) / 2;
      shown = lines2.slice(1).filter((v) => (v - c) * dir2 <= 0.05).length;
    } else {
      for (let j = 1; j < lines2.length; j++) {
        if (!across.some((s) => Math.abs(pos(s) - lines2[j]!) < 0.03 && span(s)[0] < at2 && span(s)[1] > at2)) break;
        shown = j;
      }
    }
    shown = Math.max(1, shown);
  }
  return { first, landing, second, shown, cut: walk?.cut ?? null };
}

/** A box over a flight's span `a`..`b` and from `v0` to `v1` along its climb. */
function stairBox(along: "x" | "z", a: number, b: number, v0: number, v1: number, y0: number, y1: number, material: BuildingMaterial, tag: string): Primitive {
  const [x0, x1, z0, z1] = along === "x" ? [a, b, Math.min(v0, v1), Math.max(v0, v1)] : [Math.min(v0, v1), Math.max(v0, v1), a, b];
  return { type: "box", centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }, size: { x: x1 - x0, y: y1 - y0, z: z1 - z0 }, material, tag };
}

/** A straight dark line on the stair from (x1, z1) to (x2, z2), at `y`: the walk line, its arrow, the break line. */
function stairLine(x1: number, z1: number, x2: number, z2: number, y: number, tag: string, width = 0.03): Primitive {
  const len = Math.hypot(x2 - x1, z2 - z1);
  // Skip hairline gaps: a zero-length piece left a hole where the walk turned on the landing.
  if (len < 0.005) return { type: "box", centre: { x: x1, y: y + 0.004, z: z1 }, size: { x: width, y: 0.008, z: width }, material: "screen", tag };
  return { type: "box", centre: { x: (x1 + x2) / 2, y: y + 0.004, z: (z1 + z2) / 2 }, size: { x: len, y: 0.008, z: width }, rotY: Math.atan2(-(z2 - z1), x2 - x1), material: "screen", tag };
}

type WalkPt = { x: number; z: number; y: number };

/** A continuous walk line through `points` in order — one piece a span, shared ends, no gaps at the landing turn. */
function walkPoly(points: WalkPt[], tag: string): Primitive[] {
  const out: Primitive[] = [];
  for (let i = 1; i < points.length; i++) {
    const [a, b] = [points[i - 1]!, points[i]!];
    out.push(stairLine(a.x, a.z, b.x, b.z, (a.y + b.y) / 2, tag));
  }
  return out;
}

/** A point on a flight's walk line at climb position `v`, height `y`. */
function walkPt(f: StairFlight, v: number, y: number): WalkPt {
  return f.along === "x" ? { x: f.walkAt, z: v, y } : { x: v, z: f.walkAt, y };
}

/**
 * The walk line along a flight as ONE flat span at the flight's highest tread —
 * a piece a tread at stepped heights read as a broken line from above (Gottlieb, 16/10/2026).
 */
function walkAlong(f: StairFlight, treads: Array<{ v0: number; v1: number; top: number }>, tag: string): Primitive[] {
  if (!treads.length) return [];
  const y = Math.max(...treads.map((t) => t.top)) + 0.006;
  return walkPoly([walkPt(f, treads[0]!.v0, y), walkPt(f, treads[treads.length - 1]!.v1, y)], tag);
}

/** The arrow's head at `tip`, pointing `dir` along the flight's climb — joined to the walk's end. */
function arrowHead(f: StairFlight, tip: number, dir: 1 | -1, y: number, tag: string): Primitive[] {
  const [l, s] = [0.2, 0.11];
  return [-1, 1].map((side) =>
    f.along === "x" ? stairLine(f.walkAt, tip, f.walkAt + side * s, tip - dir * l, y, tag) : stairLine(tip, f.walkAt, tip - dir * l, f.walkAt + side * s, y, tag),
  );
}

/** A stair's fixed dimensions, metres: the oak plate, the pale nosing laid on its front edge, the plaster cheek down each open side. */
const STAIR_PART = { plate: 0.045, nosing: 0.03, cheek: 0.05, gap: 0.012 } as const;

/**
 * A tread built as a real step: a plaster body from `base` up under an oak
 * plate, a pale nosing on its front edge with a hairline shadow gap behind
 * it, and a plaster cheek along each side. Each step stands solid on the one
 * below — the plates alone, floating at stepped heights with the floor
 * showing between, read as a ladder (Gottlieb, 17/10/2026) — and the gap and
 * the cheeks give from above the lines a stair has in a model: where each
 * step ends and where the flight's own edge is.
 */
function treadPrims(f: StairFlight, v0: number, v1: number, top: number, tag: string, plate: number = STAIR_PART.plate, base?: number, height = 0.5): Primitive[] {
  const { nosing, cheek, gap } = STAIR_PART;
  const out: Primitive[] = [];
  if (base != null && top - plate - base > 0.01) out.push(stairBox(f.along, f.a, f.b, v0, v1, base, top - plate, "plaster", tag));
  // The oak's tone by the step's height over the flight's foot: the lowest, deepest in the well, the darkest.
  const tone = Math.max(0, Math.min(3, Math.floor((1 - Math.max(0, Math.min(1, (top - (base ?? top)) / height))) * 4)));
  out.push(stairBox(f.along, f.a, f.b, v0, v1, top - plate, top, `stairOak${tone}` as BuildingMaterial, tag));
  // The step's front edge: a pale nosing, and just behind it the shadow the step above casts, a hairline of dark.
  out.push(stairBox(f.along, f.a, f.b, v0, v0 + f.dir * nosing, top, top + 0.004, "metal", tag));
  out.push(stairBox(f.along, f.a + cheek, f.b - cheek, v0 + f.dir * nosing, v0 + f.dir * (nosing + gap), top, top + 0.003, "darkSteel", tag));
  // Under the riser of the step above, at the tread's far edge: a soft shade, two films, the wide one faint and the narrow one deeper.
  const w = f.b - f.a - 2 * cheek;
  if (base != null && w > 0.2) {
    for (const [d, z] of [[0.1, 0.005], [0.045, 0.006]] as const) out.push(stairBox(f.along, f.a + cheek, f.b - cheek, v1 - f.dir * d, v1, top + z - 0.001, top + z, "stairShade", tag));
  }
  // The cheeks, level with the plate's top.
  if (base != null && f.b - f.a > 4 * cheek) {
    out.push(stairBox(f.along, f.a, f.a + cheek, v0, v1, base, top + 0.002, "plaster", tag));
    out.push(stairBox(f.along, f.b - cheek, f.b, v0, v1, base, top + 0.002, "plaster", tag));
  }
  return out;
}

/** `seg` cut to the interval `lo`..`hi` along `axis` ("x" or "z"), or null where it lies wholly outside: the plan's break line, kept to the flight it crosses. */
export function clipSegTo(seg: Seg, axis: "x" | "z", lo: number, hi: number): Seg | null {
  const [a, b] = axis === "x" ? [seg.x1, seg.x2] : [seg.z1, seg.z2];
  if (Math.abs(b - a) < 1e-9) return a >= lo && a <= hi ? seg : null;
  const t0 = Math.max(0, Math.min(1, (lo - a) / (b - a)));
  const t1 = Math.max(0, Math.min(1, (hi - a) / (b - a)));
  const [u, v] = t0 <= t1 ? [t0, t1] : [t1, t0];
  if (v - u < 1e-6) return null;
  const at = (t: number) => ({ x: seg.x1 + (seg.x2 - seg.x1) * t, z: seg.z1 + (seg.z2 - seg.z1) * t });
  const [p, q] = [at(u), at(v)];
  return { x1: p.x, z1: p.z, x2: q.x, z2: q.z };
}

/**
 * The stair on the floor it rises from, as a ground-floor plan draws one: the
 * first flight whole, the landing in pale stone, the second flight's treads
 * up to the cut and the break line across it, one continuous walk line and
 * its arrow. Heights held under the plan's cut (~1.2 m); each tread a thin
 * plate — a solid slab from the floor read as one repeated wood block.
 */
export function stairRising(p: StairPlan, level: number, storey: number, tag: string): Primitive[] {
  const { first, landing, second } = p;
  const n1 = first.lines.length;
  const risers = second ? n1 + second.lines.length : n1 + 1;
  const riser = Math.min(HOUSE_FEATURE_STANDARDS.maxRiser, storey / risers);
  const highest = second ? n1 + p.shown : n1 - 1;
  const r = Math.min(riser, 1.2 / Math.max(1, highest));
  const out: Primitive[] = [];
  const walk1: Array<{ v0: number; v1: number; top: number }> = [];
  for (let k = 1; k < n1; k++) {
    const [v0, v1, top] = [first.lines[k - 1]!, first.lines[k]!, level + k * r];
    out.push(...treadPrims(first, v0, v1, top, tag, STAIR_PART.plate, level, 1.2));
    walk1.push({ v0: k === 1 ? v0 + first.dir * 0.08 : v0, v1, top });
  }
  if (!second || !landing) {
    out.push(...walkAlong(first, walk1, tag));
    const last = walk1[walk1.length - 1];
    if (last) out.push(...arrowHead(first, last.v1, first.dir, last.top, tag));
    return out;
  }
  // The landing: a plaster body from the floor under a plate of pale stone, not wood.
  const lTop = level + n1 * r;
  const lPlate = 0.05;
  out.push(stairBox(first.along, landing.lo, landing.hi, landing.from, landing.to, level, lTop - lPlate, "plaster", tag));
  out.push(stairBox(first.along, landing.lo, landing.hi, landing.from, landing.to, lTop - lPlate, lTop, "floorStone", tag));
  out.push(stairBox(first.along, landing.lo, landing.hi, landing.from, landing.from + first.dir * 0.015, lTop, lTop + 0.004, "stoneDark", tag));
  const walk2: Array<{ v0: number; v1: number; top: number }> = [];
  for (let j = 1; j <= p.shown && j < second.lines.length; j++) {
    const [v0, v1, top] = [second.lines[j - 1]!, second.lines[j]!, lTop + j * r];
    out.push(...treadPrims(second, v0, v1, top, tag, STAIR_PART.plate, level, 1.2));
    walk2.push({ v0, v1, top });
  }
  // One polyline: first flight → landing U-turn → second flight → arrow tip (no gaps at the corners).
  out.push(...stairWalkPath(first, walk1, second, walk2, landing, lTop, tag));
  const last = walk2[walk2.length - 1];
  if (last) {
    out.push(...arrowHead(second, last.v1 - second.dir * 0.03, second.dir, last.top, tag));
    const drawnCut = p.cut ? clipSegTo(p.cut, second.along, second.a, second.b) : null;
    const cut = drawnCut ?? (second.along === "x" ? { x1: second.a, z1: last.v1, x2: second.b, z2: last.v1 + second.dir * 0.3 } : { x1: last.v1, z1: second.a, x2: last.v1 + second.dir * 0.3, z2: second.b });
    out.push(stairLine(cut.x1, cut.z1, cut.x2, cut.z2, last.top + 0.004, tag, 0.03));
  }
  return out;
}

/**
 * The walk across the landing as three points of one polyline: arrive on the
 * first flight's line, turn at the landing's mid, leave on the second's —
 * shared with both flights so the arrow's climb has no gap at the corner.
 */
function landingPts(first: StairFlight, second: StairFlight, landing: NonNullable<StairPlan["landing"]>, top: number): WalkPt[] {
  const mid = (landing.from + landing.to) / 2;
  const pt = (at: number, v: number): WalkPt => (first.along === "x" ? { x: at, z: v, y: top } : { x: v, z: at, y: top });
  return [pt(first.walkAt, landing.from), pt(first.walkAt, mid), pt(second.walkAt, mid), pt(second.walkAt, landing.from)];
}

/**
 * First flight + landing U-turn + second flight as one continuous walk line.
 * Each flight is a single flat span (not stepped per tread); the landing turn
 * shares exact corners with both, so the arrow's climb has no gap.
 */
function stairWalkPath(
  first: StairFlight,
  walk1: Array<{ v0: number; v1: number; top: number }>,
  second: StairFlight,
  walk2: Array<{ v0: number; v1: number; top: number }>,
  landing: NonNullable<StairPlan["landing"]>,
  lTop: number,
  tag: string,
): Primitive[] {
  const y1 = walk1.length ? Math.max(...walk1.map((t) => t.top), lTop) + 0.006 : lTop + 0.006;
  const y2 = walk2.length ? Math.max(...walk2.map((t) => t.top), lTop) + 0.006 : lTop + 0.006;
  const yL = Math.max(y1, y2, lTop + 0.006);
  const pts: WalkPt[] = [];
  if (walk1.length) {
    pts.push(walkPt(first, walk1[0]!.v0, yL));
    pts.push(walkPt(first, walk1[walk1.length - 1]!.v1, yL));
  }
  const turn = landingPts(first, second, landing, yL);
  if (pts.length) {
    // Last flight point is at landing.from; continue with the turn's mid and second side.
    pts.push(...turn.slice(1));
  } else pts.push(...turn);
  if (walk2.length) {
    pts.push(walkPt(second, walk2[walk2.length - 1]!.v1, yL));
  }
  return walkPoly(pts, tag);
}

/**
 * The stair on the floor it arrives at, as an upper-floor plan draws one: the
 * flight that arrives, each tread a thin plate a step lower than the one above,
 * the landing in pale stone, the first flight below behind a glass railing,
 * and one continuous walk line with its arrow at the top.
 */
export function stairArriving(p: StairPlan, level: number, tag: string): Primitive[] {
  const { first, landing, second } = p;
  const arriving = second ?? first;
  const n1 = first.lines.length;
  const n2 = second ? second.lines.length : 0;
  const r = 0.42 / Math.max(1, n1 + n2);
  const plate = 0.045;
  const deck = level + 0.48;
  const out: Primitive[] = [];
  const treadWalk = (f: StairFlight, below: (k: number) => number, footInset: boolean) => {
    const walk: Array<{ v0: number; v1: number; top: number }> = [];
    for (let k = 1; k < f.lines.length; k++) {
      const [v0, v1, top] = [f.lines[k - 1]!, f.lines[k]!, deck - below(k)];
      out.push(...treadPrims(f, v0, v1, top, tag, plate, level + 0.02, 0.46));
      walk.push({ v0: footInset && k === 1 ? v0 + f.dir * 0.08 : v0, v1, top });
    }
    return walk;
  };
  if (second && landing) {
    const walk1 = treadWalk(first, (k) => (n2 + n1 - k) * r, true);
    const lTop = deck - n2 * r;
    out.push(stairBox(first.along, landing.lo, landing.hi, landing.from, landing.to, level + 0.02, lTop - plate, "plaster", tag));
    out.push(stairBox(first.along, landing.lo, landing.hi, landing.from, landing.to, lTop - plate, lTop, "floorStone", tag));
    out.push(stairBox(first.along, landing.lo, landing.hi, landing.from, landing.from + first.dir * 0.015, lTop, lTop + 0.004, "stoneDark", tag));
    const walk2 = treadWalk(second, (k) => (n2 - k) * r, false);
    out.push(...stairWalkPath(first, walk1, second, walk2, landing, lTop, tag));
    const last = walk2[walk2.length - 1];
    if (last) out.push(...arrowHead(second, last.v1 - second.dir * 0.03, second.dir, last.top, tag));
    const foot = first.lines[0]!;
    const gap = first.b <= second.a + 0.05 ? (first.b + second.a) / 2 : (second.b + first.a) / 2;
    const [top, bottom] = [level + 0.9, level];
    const rail = (x0: number, x1: number, z0: number, z1: number) =>
      framedGlass({ centre: { x: (x0 + x1) / 2, y: (top + bottom) / 2, z: (z0 + z1) / 2 }, size: { x: Math.max(0.03, x1 - x0), y: top - bottom, z: Math.max(0.03, z1 - z0) } }, tag, true);
    const inset = foot - first.dir * 0.03;
    if (first.along === "x") {
      out.push(...rail(first.a, first.b, inset - 0.015, inset + 0.015));
      out.push(...rail(gap - 0.015, gap + 0.015, Math.min(foot, landing.from), Math.max(foot, landing.from)));
    } else {
      out.push(...rail(inset - 0.015, inset + 0.015, first.a, first.b));
      out.push(...rail(Math.min(foot, landing.from), Math.max(foot, landing.from), gap - 0.015, gap + 0.015));
    }
    return out;
  }
  const walk = treadWalk(arriving, (k) => (arriving.lines.length - k) * r, true);
  out.push(...walkAlong(arriving, walk, tag));
  const last = walk[walk.length - 1];
  if (last) out.push(...arrowHead(arriving, last.v1 - arriving.dir * 0.03, arriving.dir, last.top, tag));
  return out;
}
