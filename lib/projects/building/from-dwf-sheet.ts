import { insidePolygon, type Outline } from "@/lib/projects/building/assemble";
import type { ReadFloor } from "@/lib/projects/building/from-dwf-parts";
import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";
import { bandsOf, type PlanWalls } from "@/lib/projects/building/plan-walls";
import { dilate, emptyMask, erode, fillPolygon, label, type Mask } from "@/lib/projects/building/raster";
import { adoptOrphanRooms, DWF_FLOOR_UNITS_PER_METRE, houseUnitMarks } from "@/lib/projects/dwf-building";
import { readDwfFloor, type DwfFloor, type DwfRoom } from "@/lib/projects/dwf-floor";
import { levelMarks } from "@/lib/projects/floor-split";
import { sheetGeometry, type DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { unitMarks } from "@/lib/projects/sheet-split";

/**
 * One floor sheet of a permit strip read for the building: its level, its
 * walls (hatched, or in outline on a roof plan), and the building on it —
 * its rooms and walls, a recess let out, an open ground floor closed by its
 * walls. And the one rule the assembly applies after: a face that looks out
 * is clad.
 */
export function sheetLevel(sheet: DwfGeometry): number | null {
  const counts = new Map<number, number>();
  for (const mark of levelMarks(sheet.texts)) {
    // Absolute heights (the survey's 923.20) are not a floor's.
    if (Math.abs(mark.value) > 200) continue;
    const v = Math.round(mark.value * 100) / 100;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const best = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return best ? best[0] : null;
}

/**
 * Whatever plaster a floor's assembly left facing out — a lining on the wrong
 * face of a wall the outline turns round, a reveal's side — is clad: a face
 * that looks out past the outline is facade, whichever rule laid it.
 */
export function faceTheWeather(prims: Primitive[], outline: Outline, facade: BuildingMaterial): Primitive[] {
  return prims.map((p) => {
    if (p.type !== "box" || p.material !== "plaster") return p;
    // Its two faces and its two ends: a partition meeting the facade shows its end.
    const hx = p.size.x / 2 + 0.08;
    const hz = p.size.z / 2 + 0.08;
    const probes: Array<[number, number]> = [
      [p.centre.x, p.centre.z - hz],
      [p.centre.x, p.centre.z + hz],
      [p.centre.x - hx, p.centre.z],
      [p.centre.x + hx, p.centre.z],
    ];
    return probes.some(([x, z]) => !insidePolygon(outline, x, z)) ? { ...p, material: facade } : p;
  });
}

/**
 * A parapet stands on the walls of the storey under it, and only there: a
 * run of an outline's edge with no wall under it — a spur or a slit a
 * misread line gave the outline — stood a parapet out in the air, read in
 * the paintings as concrete beams cantilevered off the roof. Each parapet is
 * kept over the lengths where one of `walls` meets its width; where a wall
 * runs beside it instead, within its width — a party wall run out to the
 * facade between two terraces, the outline round it a pen's width wider —
 * it caps that wall.
 */
export function parapetOnWalls(parapets: Primitive[], walls: Primitive[], step = 0.1): Primitive[] {
  type Box = Extract<Primitive, { type: "box" }>;
  const under = walls.filter((w): w is Box => w.type === "box");
  const out = parapets.flatMap((p): Primitive[] => {
    if (p.type !== "box") return [p];
    const alongX = p.size.x >= p.size.z;
    const [a0, a1] = alongX ? [p.centre.x - p.size.x / 2, p.centre.x + p.size.x / 2] : [p.centre.z - p.size.z / 2, p.centre.z + p.size.z / 2];
    const [c0, c1] = alongX ? [p.centre.z - p.size.z / 2, p.centre.z + p.size.z / 2] : [p.centre.x - p.size.x / 2, p.centre.x + p.size.x / 2];
    const width = c1 - c0;
    /** What the parapet stands on at `t` along it — its own width over a wall, a wall beside it, or nothing — and that wall's run along it. */
    const seat = (t: number): { on: [number, number]; run: [number, number] } | null => {
      let beside: { on: [number, number]; run: [number, number] } | null = null;
      for (const w of under) {
        const [u0, u1] = alongX ? [w.centre.x - w.size.x / 2, w.centre.x + w.size.x / 2] : [w.centre.z - w.size.z / 2, w.centre.z + w.size.z / 2];
        if (t < u0 - 0.01 || t > u1 + 0.01) continue;
        const [v0, v1] = alongX ? [w.centre.z - w.size.z / 2, w.centre.z + w.size.z / 2] : [w.centre.x - w.size.x / 2, w.centre.x + w.size.x / 2];
        if (Math.min(v1, c1) - Math.max(v0, c0) > 0.005) return { on: [c0, c1], run: [u0, u1] };
        if (!beside && v1 - v0 <= width + 0.01 && Math.max(v0 - c1, c0 - v1) <= width) beside = { on: [v0, v1], run: [u0, u1] };
      }
      return beside;
    };
    const n = Math.max(1, Math.round((a1 - a0) / step));
    const runs: Array<{ s: number; e: number; on: [number, number]; lo: number; hi: number }> = [];
    for (let k = 0; k < n; k++) {
      const [s, e] = [a0 + ((a1 - a0) * k) / n, a0 + ((a1 - a0) * (k + 1)) / n];
      const here = seat((s + e) / 2);
      if (!here) continue;
      const { on, run } = here;
      const last = runs[runs.length - 1];
      if (last && Math.abs(last.e - s) < 1e-9 && last.on[0] === on[0] && last.on[1] === on[1]) {
        last.e = e;
        last.hi = Math.max(last.hi, run[1]);
      } else runs.push({ s, e, on, lo: run[0], hi: run[1] });
    }
    // A run stops where the walls under it do, not at the next sample.
    for (const r of runs) [r.s, r.e] = [Math.max(r.s, r.lo), Math.min(r.e, r.hi)];
    if (runs.length === 1 && Math.abs(runs[0]!.s - a0) < 1e-6 && Math.abs(runs[0]!.e - a1) < 1e-6 && runs[0]!.on[0] === c0) return [p];
    return runs
      .filter(({ s, e }) => e - s >= 0.15)
      .map(({ s, e, on: [v0, v1] }): Box => ({
        ...p,
        centre: alongX ? { ...p.centre, x: (s + e) / 2, z: (v0 + v1) / 2 } : { ...p.centre, x: (v0 + v1) / 2, z: (s + e) / 2 },
        size: alongX ? { ...p.size, x: e - s, z: v1 - v0 } : { ...p.size, x: v1 - v0, z: e - s },
      }));
  });
  // Both sides of a spur cap the one wall in it: once.
  const key = (p: Primitive) => (p.type === "box" ? [p.centre.x, p.centre.y, p.centre.z, p.size.x, p.size.y, p.size.z].map((v) => v.toFixed(3)).join() : "");
  return out.filter((p, i) => p.type !== "box" || out.findIndex((q) => key(q) === key(p)) === i);
}

/**
 * A facade is one plane: the floor's clad wall pieces that stand within 5 cm
 * of an edge of its outline — a pen's width at 1:100 — have their outer face
 * on that edge, and a gap under 5 cm between two of them along it is closed
 * by the taller. Left as the sheet's lines put them, a pier 2 cm proud, a
 * window bay 2 cm back or a 2 cm slot beside a pier drew a dark seam down
 * the facade, and a painting read each seam as a recess with a frame or
 * beams over it.
 */
export function flushFacade(prims: Primitive[], outline: Outline, facade: BuildingMaterial, tag: string, tolerance = 0.05): Primitive[] {
  type Box = Extract<Primitive, { type: "box" }>;
  const out = prims.map((p) => (p.type === "box" ? { ...p, centre: { ...p.centre }, size: { ...p.size } } : p));
  const clad = out.filter((p): p is Box => p.type === "box" && p.tag === tag && p.material === facade && !p.rotY);
  const n = outline.length;
  for (let i = 0; i < n; i++) {
    const [ax, az] = outline[i]!;
    const [bx, bz] = outline[(i + 1) % n]!;
    const alongX = Math.abs(bz - az) < tolerance && Math.abs(bx - ax) > 0.5;
    const alongZ = Math.abs(bx - ax) < tolerance && Math.abs(bz - az) > 0.5;
    if (!alongX && !alongZ) continue;
    // The edge's line, its span and the way out.
    const line = alongX ? (az + bz) / 2 : (ax + bx) / 2;
    const [lo, hi] = alongX ? [Math.min(ax, bx), Math.max(ax, bx)] : [Math.min(az, bz), Math.max(az, bz)];
    const mid = (lo + hi) / 2;
    const s = (alongX ? insidePolygon(outline, mid, line + 0.2) : insidePolygon(outline, line + 0.2, mid)) ? -1 : 1;
    const across = (p: Box): [number, number] => (alongX ? [p.centre.z - p.size.z / 2, p.centre.z + p.size.z / 2] : [p.centre.x - p.size.x / 2, p.centre.x + p.size.x / 2]);
    const along = (p: Box): [number, number] => (alongX ? [p.centre.x - p.size.x / 2, p.centre.x + p.size.x / 2] : [p.centre.z - p.size.z / 2, p.centre.z + p.size.z / 2]);
    const setAcross = (p: Box, a: number, b: number) => {
      if (alongX) [p.centre.z, p.size.z] = [(a + b) / 2, b - a];
      else [p.centre.x, p.size.x] = [(a + b) / 2, b - a];
    };
    const setAlong = (p: Box, a: number, b: number) => {
      if (alongX) [p.centre.x, p.size.x] = [(a + b) / 2, b - a];
      else [p.centre.z, p.size.z] = [(a + b) / 2, b - a];
    };
    const against: Box[] = [];
    for (const p of clad) {
      const [u, v] = along(p);
      if (Math.min(v, hi) - Math.max(u, lo) < 0.01) continue;
      const [a, b] = across(p);
      const [face, back] = s > 0 ? [b, a] : [a, b];
      if (Math.abs(face - line) > tolerance || s * (line - back) < 0.005) continue;
      if (s > 0) setAcross(p, a, line);
      else setAcross(p, line, b);
      against.push(p);
    }
    const y = (p: Box): [number, number] => [p.centre.y - p.size.y / 2, p.centre.y + p.size.y / 2];
    const sorted = [...against].sort((p, q) => along(p)[0] - along(q)[0]);
    for (const p of sorted) {
      const [, end] = along(p);
      const [y0, y1] = y(p);
      const rises = (q: Box) => Math.min(y1, y(q)[1]) - Math.max(y0, y(q)[0]) > 0.01;
      // Already met there by another piece at its height: no gap.
      if (sorted.some((q) => q !== p && rises(q) && along(q)[0] <= end + 1e-4 && along(q)[1] > end + 1e-4)) continue;
      const next = sorted.filter((q) => q !== p && rises(q) && along(q)[0] > end + 1e-4 && along(q)[0] - end < tolerance).sort((q, r) => along(q)[0] - along(r)[0])[0];
      if (!next) continue;
      const start = along(next)[0];
      if (y1 - y0 >= y(next)[1] - y(next)[0]) setAlong(p, along(p)[0], start);
      else setAlong(next, end, along(next)[1]);
    }
  }
  return out;
}

export function recessRooms(floor: DwfFloor): Set<number> {
  const owned = new Set(floor.apartments.flatMap((a) => a.rooms));
  const candidates = new Set(floor.rooms.filter((r) => !owned.has(r.id) && r.names.length === 0 && r.kind == null && r.areaM2 < 15).map((r) => r.id));
  const out = new Set<number>();
  const { cols, rows, wall, room, outside } = floor;
  for (let i = 0; i < wall.length; i++) {
    if (wall[i]! < 2) continue;
    const x = i % cols;
    const y = (i - x) / cols;
    // Across the closed gap, a few pixels each way: the world on one side, the room on the other.
    let world = false;
    const near: number[] = [];
    for (let d = 1; d <= 6; d++) {
      for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]] as const) {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || py < 0 || px >= cols || py >= rows) continue;
        const r = room[py * cols + px]!;
        if (r === outside) world = true;
        else if (candidates.has(r)) near.push(r);
      }
    }
    if (world) for (const r of near) out.add(r);
  }
  return out;
}

export function besideRecess(floor: DwfFloor, i: number, recess: Set<number>): boolean {
  if (recess.size === 0) return false;
  const { cols, rows, room } = floor;
  const x = i % cols;
  const y = (i - x) / cols;
  for (let d = 1; d <= 6; d++) {
    for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]] as const) {
      const px = x + dx;
      const py = y + dy;
      if (px >= 0 && py >= 0 && px < cols && py < rows && recess.has(room[py * cols + px]!)) return true;
    }
  }
  return false;
}

/**
 * Walls drawn in outline: pairs of straight lines, along x or along y, 10 to
 * 45 cm apart and running side by side for most of their length, each pair
 * filled between its lines.
 */
export function doubleLineWalls(sheet: { segments: Array<{ x1: number; y1: number; x2: number; y2: number }> }, cols: number, rows: number, cm: number, minM = 0.1): Mask {
  const upm = DWF_FLOOR_UNITS_PER_METRE;
  const k = 100 / upm / cm;
  const mask = emptyMask(cols, rows);
  type L = { at: number; a: number; b: number };
  const fill = (horizontal: boolean, p: L, q: L) => {
    const a = Math.max(p.a, q.a);
    const b = Math.min(p.b, q.b);
    const lo = Math.min(p.at, q.at);
    const hi = Math.max(p.at, q.at);
    for (let u = Math.floor(a * k); u <= Math.ceil(b * k); u++) {
      for (let v = Math.floor(lo * k); v <= Math.ceil(hi * k); v++) {
        const x = horizontal ? u : v;
        const y = horizontal ? v : u;
        if (x >= 0 && y >= 0 && x < cols && y < rows) mask.data[y * cols + x] = 1;
      }
    }
  };
  for (const horizontal of [true, false]) {
    const lines: L[] = sheet.segments
      .filter((s) => (horizontal ? Math.abs(s.y2 - s.y1) : Math.abs(s.x2 - s.x1)) < 0.01 * upm)
      .map((s) => (horizontal ? { at: (s.y1 + s.y2) / 2, a: Math.min(s.x1, s.x2), b: Math.max(s.x1, s.x2) } : { at: (s.x1 + s.x2) / 2, a: Math.min(s.y1, s.y2), b: Math.max(s.y1, s.y2) }))
      .filter((l) => l.b - l.a >= 0.5 * upm)
      .sort((p, q) => p.at - q.at);
    for (let i = 0; i < lines.length; i++) {
      const p = lines[i]!;
      for (let j = i + 1; j < lines.length && lines[j]!.at - p.at <= 0.45 * upm; j++) {
        const q = lines[j]!;
        if (q.at - p.at < minM * upm) continue;
        const overlap = Math.min(p.b, q.b) - Math.max(p.a, q.a);
        if (overlap >= 0.6 * Math.min(p.b - p.a, q.b - q.a)) fill(horizontal, p, q);
      }
    }
  }
  return mask;
}

/**
 * A corner room the hatch reader found open to the world, because the sheet
 * draws its corner walls in outline only — two lines a wall's thickness
 * apart, no hatch between — is a room, not a recess: a recess has nothing
 * drawn across its mouth. It is taken out of `recess`, and its open faces
 * are walled into `mask`, 25 cm in from the world: thinner than the closure
 * the reader laid across a window, which stays open. Answers whether any was.
 */
export function keepOutlinedCorners(sheet: DwfGeometry, floor: DwfFloor, mask: Mask, recess: Set<number>): boolean {
  if (recess.size === 0) return false;
  const { cols, rows, cm, room, outside, wall } = floor;
  const world = emptyMask(cols, rows);
  for (let i = 0; i < world.data.length; i++) world.data[i] = room[i] === outside ? 1 : 0;
  const near = dilate(world, Math.round(50 / cm));
  const lined = doubleLineWalls(sheet, cols, rows, cm);
  const found = new Map<number, number>();
  for (let i = 0; i < lined.data.length; i++) {
    if (lined.data[i] && near.data[i] && recess.has(room[i]!)) found.set(room[i]!, (found.get(room[i]!) ?? 0) + 1);
  }
  const minPx = 0.15 / ((cm / 100) * (cm / 100));
  const kept = new Set([...found].filter(([, n]) => n >= minPx).map(([r]) => r));
  if (kept.size === 0) return false;
  const of = emptyMask(cols, rows);
  for (let i = 0; i < of.data.length; i++) of.data[i] = kept.has(room[i]!) ? 1 : 0;
  // The strip between a wall's two lines floods as a sliver room of its own: it is that wall too.
  const beside = dilate(of, Math.round(50 / cm));
  const face = dilate(world, Math.round(25 / cm));
  for (let i = 0; i < mask.data.length; i++) {
    if (face.data[i] && beside.data[i] && wall[i] === 0 && room[i] !== outside) mask.data[i] = 1;
  }
  for (const r of kept) recess.delete(r);
  return true;
}

export function closedByWalls(mask: Mask, reach = 38): Mask {
  const closed = erode(dilate(mask, reach), reach);
  const outsideParts = label(closed, 0);
  const shut = emptyMask(mask.cols, mask.rows);
  for (let i = 0; i < shut.data.length; i++) shut.data[i] = closed.data[i] || !outsideParts.touchesEdge[outsideParts.ids[i]!] ? 1 : 0;
  const parts = label(shut, 1);
  let biggest = 0;
  for (let id = 1; id < parts.sizes.length; id++) if (parts.sizes[id]! > parts.sizes[biggest]!) biggest = id;
  const footprint = emptyMask(mask.cols, mask.rows);
  for (let i = 0; i < footprint.data.length; i++) footprint.data[i] = parts.ids[i] === biggest ? 1 : 0;
  return footprint;
}

export function readFloorSheet(
  strip: DwfGeometry,
  box: { x: number; y: number; width: number; height: number },
  units: number[],
  roof: boolean,
  /** Used when the sheet marks no level of its own: a house floor laid in order. */
  fallbackLevel?: number,
  /**
   * A private house's plan prints no apartment numbers: its houses are marked
   * as the flat renders mark them (houseUnitMarks), so the whole storey is
   * furnished in the building's own plan as each house is in its own.
   */
  house?: boolean,
): ReadFloor | null {
  const sheet = sheetGeometry(strip, box);
  const level = sheetLevel(sheet) ?? fallbackLevel ?? null;
  if (level == null) return null;
  // A house prints no apartment numbers: a number there is a dimension — the
  // DXF's bays' "270" was taken for two flats, and the storey went unfurnished.
  const printed = unitMarks(sheet.texts).filter((u) => !house || u.unit < 100);
  const floor = readDwfFloor(sheet, { unitsPerMetre: DWF_FLOOR_UNITS_PER_METRE, units: printed });
  const houseMarks = house && !printed.length && !roof ? houseUnitMarks(sheet) : [];
  const furnishFloor = houseMarks.length ? readDwfFloor(sheet, { unitsPerMetre: DWF_FLOOR_UNITS_PER_METRE, units: houseMarks }) : null;
  if (furnishFloor) adoptOrphanRooms(furnishFloor, houseMarks);
  // A pair of homes drawn mirrored, its furniture named by the file: each
  // room belongs to the home on its side of the furniture's mirror line, as
  // the furniture does. Grown from its mark, one home took nearly every room
  // of model B's ground floor, and the other's bedrooms stood bare (13/10/2026).
  if (furnishFloor && sheet.furniture?.length && houseMarks.length === 2) {
    const axis = sheet.furniture.reduce((t, p) => t + p.x + p.w / 2, 0) / sheet.furniture.length;
    const px = 100 / DWF_FLOOR_UNITS_PER_METRE / furnishFloor.cm;
    const sideOf = (x: number) => Math.sign(x - axis * px);
    const [a, b] = houseMarks;
    const sideA = sideOf(a!.x * px);
    if (sideA !== 0 && sideOf(b!.x * px) === -sideA) {
      const sums = new Map<number, { x: number; n: number }>();
      for (let i = 0; i < furnishFloor.room.length; i++) {
        const r = furnishFloor.room[i]!;
        if (!r || r === furnishFloor.outside) continue;
        const e = sums.get(r) ?? { x: 0, n: 0 };
        e.x += i % furnishFloor.cols;
        e.n++;
        sums.set(r, e);
      }
      const all = new Set(furnishFloor.apartments.flatMap((ap) => ap.rooms));
      for (const ap of furnishFloor.apartments) {
        const mine = ap.unit === a!.unit ? sideA : ap.unit === b!.unit ? -sideA : 0;
        if (!mine) continue;
        ap.rooms = [...all].filter((r) => { const e = sums.get(r); return e && sideOf(e.x / e.n) === mine; });
      }
    }
  }
  const furnish = furnishFloor ? { floor: furnishFloor, units: houseMarks.map((m) => m.unit) } : undefined;
  const { cols, rows, cm } = floor;
  const drawn = emptyMask(cols, rows);
  // A CAD file names its walls (sheet.wallPen): they are its wall fills as
  // drawn, not the floor reader's — whose closing, stub, stair and room-
  // shaping rules deleted Gottlieb A's ממ"ד wall, opened its corners and
  // stood its room labels up as pillars (13/10/2026).
  const cad = sheet.wallPen != null && sheet.fillPens?.length === sheet.fills.length;
  if (cad) {
    const px = 100 / DWF_FLOOR_UNITS_PER_METRE / cm;
    sheet.fills.forEach((tri, k) => {
      if (sheet.fillPens![k] === sheet.wallPen) fillPolygon(drawn, tri.map(([x, y]) => [x * px, y * px] as [number, number]));
    });
  } else for (let i = 0; i < drawn.data.length; i++) drawn.data[i] = floor.wall[i] === 1 ? 1 : 0;
  // A line the sheet draws across a wall — where its stone meets its render —
  // leaves a pixel or two of hatch out, and the wall a crack the room shows
  // through — and an expansion joint drawn as a slot does the same. Closing
  // by 4 px seals both, to 16 cm; the narrowest opening is 40. A CAD file's
  // fills meet exactly: closed by a pixel, its triangles' seams.
  // And its partitions drawn as two lines on the walls' layer, within the house the fills draw.
  if (cad && sheet.wallLines?.length) {
    let [x0, x1, y0, y1] = [cols, -1, rows, -1];
    for (let i = 0; i < drawn.data.length; i++) if (drawn.data[i]) { const x = i % cols, y = (i - x) / cols; [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)]; }
    const lined = doubleLineWalls({ ...sheet, segments: sheet.wallLines }, cols, rows, cm, 0.05);
    // A partition drawn as a single line on the inner walls' layer — behind a
    // built-in wardrobe, between two wet rooms — is a 10 cm wall along it.
    const px = 100 / DWF_FLOOR_UNITS_PER_METRE / cm;
    const half = Math.max(1, Math.round(5 / cm));
    for (const l of sheet.wallLines) {
      if (!l.inner) continue;
      const [ax, ay, bx, by] = [l.x1 * px, l.y1 * px, l.x2 * px, l.y2 * px];
      const len = Math.hypot(bx - ax, by - ay);
      if (len * cm < 40) continue;
      const axisAligned = Math.abs(ax - bx) < 1 || Math.abs(ay - by) < 1;
      if (!axisAligned) continue;
      for (let t = 0; t <= len; t++) {
        const x = Math.round(ax + ((bx - ax) * t) / len), y = Math.round(ay + ((by - ay) * t) / len);
        for (let d = -half; d <= half; d++) {
          const [qx, qy] = Math.abs(ax - bx) < 1 ? [x + d, y] : [x, y + d];
          if (qx >= 0 && qy >= 0 && qx < cols && qy < rows) lined.data[qy * cols + qx] = 1;
        }
      }
    }
    for (let i = 0; i < drawn.data.length; i++) {
      const x = i % cols, y = (i - x) / cols;
      if (lined.data[i] && x >= x0 - 2 && x <= x1 + 2 && y >= y0 - 2 && y <= y1 + 2) drawn.data[i] = 1;
    }
  }
  let mask = cad ? erode(dilate(drawn, 1), 1) : erode(dilate(drawn, 4), 4);
  // The rooms as the file's walls and doors bound them: a room the floor
  // reader ran on through a door it did not close — Gottlieb C's upper
  // bedroom into the hall beside it — is cut there, and the cut-off part is
  // a room of its own, named by what is written in it (13/10/2026).
  if (cad) for (const f of [floor, furnishFloor]) if (f) splitRoomsByWalls(f, mask, sheet);
  // A roof plan's stair head and attic are often drawn in outline — a wall
  // as two lines 10 to 45 cm apart, no hatch between — and the hatch reader
  // sees nothing there. Read them as the lines draw them.
  const outlined = roof && mask.data.reduce((n, v) => n + v, 0) < 2000;
  if (outlined) mask = doubleLineWalls(sheet, cols, rows, cm);
  const walls: PlanWalls = { box: { x: 0, y: 0, width: sheet.pageWidth, height: sheet.pageHeight }, unitsPerMetre: DWF_FLOOR_UNITS_PER_METRE, cm, mask, bands: bandsOf(mask, cm) };
  // The building: every pixel of a room or a wall the reader closed — but for
  // a recess. A slot between two wings has its mouth closed by the reader as
  // it closes a window, and comes out a room: no name, no flat's, small, and
  // reaching the world across that closed mouth. It is outside, and the
  // walls round it are facade; taken in, they were plastered and stood up
  // the face as a white strip.
  if (outlined) {
    // No rooms were read: the building is what its walls close, gaps to 1.5 m bridged.
    const footprint = closedByWalls(mask);
    // Only the walls of that part: the solar panels and the tanks beside it are not the building.
    for (let i = 0; i < mask.data.length; i++) if (!footprint.data[i]) mask.data[i] = 0;
    walls.bands = bandsOf(mask, cm);
    return { sheet, floor, level, units, roof, walls, footprint, furnish };
  }
  const recess = recessRooms(floor);
  if (keepOutlinedCorners(sheet, floor, mask, recess)) walls.bands = bandsOf(mask, cm);
  const inside = emptyMask(cols, rows);
  for (let i = 0; i < inside.data.length; i++) {
    const r = floor.room[i]!;
    inside.data[i] = floor.wall[i] === 1 || (r !== 0 && r !== floor.outside && !recess.has(r)) || (floor.wall[i]! > 1 && !besideRecess(floor, i, recess)) ? 1 : 0;
  }
  const parts = label(inside, 1);
  let biggest = 0;
  for (let id = 1; id < parts.sizes.length; id++) if (parts.sizes[id]! > parts.sizes[biggest]!) biggest = id;
  const footprint = emptyMask(cols, rows);
  for (let i = 0; i < footprint.data.length; i++) footprint.data[i] = parts.ids[i] === biggest ? 1 : 0;
  // Holes: a courtyard or a light well stays open only if it reaches the edge.
  const holes = label(footprint, 0);
  for (let i = 0; i < footprint.data.length; i++) if (!footprint.data[i] && !holes.touchesEdge[holes.ids[i]!]) footprint.data[i] = 1;
  // A ground floor drawn on the site plan — an open lobby, its facade broken
  // by entrances — reads as a few small rooms, and the building would be one
  // of them. Where the rooms cover under half of what the walls close, the
  // walls are the better outline.
  const walled = closedByWalls(mask);
  const area = (m: Mask) => m.data.reduce((n, v) => n + v, 0);
  // Its entrances and lobby fronts are wider than a window: gaps bridged to 8 m.
  if (area(footprint) < 0.5 * area(walled)) return { sheet, floor, level, units, roof, walls, footprint: closedByWalls(mask, 200), walled: true, furnish };
  return { sheet, floor, level, units, roof, walls, footprint, furnish };
}

/** `f`'s footprint, kept where the floor above stands within `reachM` of it. */
export function clipUnder(f: ReadFloor, shift: { x: number; y: number }, above: ReadFloor, shiftAbove: { x: number; y: number }, reachM: number): Mask {
  const r = Math.round((reachM * 100) / above.floor.cm);
  const over = dilate(above.footprint, r);
  const m = f.floor.cm / 100;
  const ma = above.floor.cm / 100;
  const out = emptyMask(f.footprint.cols, f.footprint.rows);
  for (let i = 0; i < out.data.length; i++) {
    if (!f.footprint.data[i]) continue;
    const x = i % out.cols;
    const y = (i - x) / out.cols;
    const ax = Math.round((x * m + shift.x - shiftAbove.x) / ma);
    const ay = Math.round((y * m + shift.y - shiftAbove.y) / ma);
    if (ax >= 0 && ay >= 0 && ax < over.cols && ay < over.rows && over.data[ay * over.cols + ax]) out.data[i] = 1;
  }
  return out;
}

/** `f`'s rooms cut where `walls` (the file's) and the file's doors bound them; each cut-off part a room of its own. */
function splitRoomsByWalls(f: DwfFloor, walls: Mask, sheet: DwfGeometry): void {
  const { cols, rows } = f;
  const n = cols * rows;
  const blocked = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (walls.data[k] || f.wall[k]) blocked[k] = 1;
  // The file's walls are walls in the floor's reading too: where the floor
  // reader closed a gap (2) or found none, no rule after this reaches across.
  for (let k = 0; k < n; k++) if (walls.data[k] && f.wall[k] !== 1) { f.wall[k] = 1; if (f.room[k] !== f.outside) f.room[k] = 0; }
  const px = 100 / DWF_FLOOR_UNITS_PER_METRE / f.cm;
  for (const d of sheet.doorsDrawn ?? []) {
    const [ax, ay, bx, by] = [d.x1 * px, d.y1 * px, d.x2 * px, d.y2 * px];
    const len = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let t = 0; t <= len; t++) {
      const x = Math.round(ax + ((bx - ax) * t) / len), y = Math.round(ay + ((by - ay) * t) / len);
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const xx = x + ox, yy = y + oy;
        if (xx >= 0 && yy >= 0 && xx < cols && yy < rows) blocked[yy * cols + xx] = 1;
      }
    }
  }
  // The free floor's parts, each with the room most of it was.
  const comp = new Int32Array(n);
  let next = 0;
  const parts: Array<{ pixels: number[]; votes: Map<number, number> }> = [];
  for (let s0 = 0; s0 < n; s0++) {
    const r0 = f.room[s0]!;
    if (blocked[s0] || comp[s0] || !r0 || r0 === f.outside) continue;
    next++;
    const pixels: number[] = [];
    const votes = new Map<number, number>();
    const stack = [s0];
    comp[s0] = next;
    while (stack.length) {
      const k = stack.pop()!;
      pixels.push(k);
      const r = f.room[k]!;
      votes.set(r, (votes.get(r) ?? 0) + 1);
      const x = k % cols;
      for (const nk of [x > 0 ? k - 1 : -1, x < cols - 1 ? k + 1 : -1, k - cols, k + cols]) {
        if (nk < 0 || nk >= n || comp[nk] || blocked[nk]) continue;
        const r2 = f.room[nk]!;
        if (!r2 || r2 === f.outside) continue;
        comp[nk] = next;
        stack.push(nk);
      }
    }
    parts.push({ pixels, votes });
  }
  const minPx = Math.round(1.5 / ((f.cm / 100) ** 2));
  const byRoom = new Map<number, Array<{ pixels: number[] }>>();
  for (const p of parts) {
    if (p.pixels.length < minPx) continue;
    const owner = [...p.votes].sort((a, b) => b[1] - a[1])[0]![0];
    byRoom.set(owner, [...(byRoom.get(owner) ?? []), p]);
  }
  let maxId = Math.max(0, f.outside, ...f.rooms.map((r) => r.id));
  const labels = sheet.texts.filter((t) => /[֐-׿]/.test(t.text));
  for (const [owner, list] of byRoom) {
    if (list.length < 2) continue;
    list.sort((a, b) => b.pixels.length - a.pixels.length);
    const base = f.rooms.find((r) => r.id === owner);
    if (!base) continue;
    for (const part of list.slice(1)) {
      const id = ++maxId;
      const inPart = new Set(part.pixels);
      for (const k of part.pixels) f.room[k] = id;
      // Its own name, where one is written in it; the name it was read with goes with the larger part.
      const names = labels.filter((t) => inPart.has(Math.round(t.y * px) * cols + Math.round(t.x * px))).map((t) => t.text);
      const areaM2 = (part.pixels.length * f.cm * f.cm) / 10_000;
      const room: DwfRoom = { ...base, id, areaM2, names, kind: names.length ? base.kind : null };
      f.rooms.push(room);
      base.areaM2 -= areaM2;
      for (const ap of f.apartments) if (ap.rooms.includes(owner)) ap.rooms.push(id);
    }
  }
}
