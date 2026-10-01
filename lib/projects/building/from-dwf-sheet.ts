import { insidePolygon, type Outline } from "@/lib/projects/building/assemble";
import type { ReadFloor } from "@/lib/projects/building/from-dwf-parts";
import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";
import { bandsOf, type PlanWalls } from "@/lib/projects/building/plan-walls";
import { dilate, emptyMask, erode, label, type Mask } from "@/lib/projects/building/raster";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import { readDwfFloor, type DwfFloor } from "@/lib/projects/dwf-floor";
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
export function doubleLineWalls(sheet: DwfGeometry, cols: number, rows: number, cm: number): Mask {
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
        if (q.at - p.at < 0.1 * upm) continue;
        const overlap = Math.min(p.b, q.b) - Math.max(p.a, q.a);
        if (overlap >= 0.6 * Math.min(p.b - p.a, q.b - q.a)) fill(horizontal, p, q);
      }
    }
  }
  return mask;
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

export function readFloorSheet(strip: DwfGeometry, box: { x: number; y: number; width: number; height: number }, units: number[], roof: boolean): ReadFloor | null {
  const sheet = sheetGeometry(strip, box);
  const level = sheetLevel(sheet);
  if (level == null) return null;
  const floor = readDwfFloor(sheet, { unitsPerMetre: DWF_FLOOR_UNITS_PER_METRE, units: unitMarks(sheet.texts) });
  const { cols, rows, cm } = floor;
  const drawn = emptyMask(cols, rows);
  for (let i = 0; i < drawn.data.length; i++) drawn.data[i] = floor.wall[i] === 1 ? 1 : 0;
  // A line the sheet draws across a wall — where its stone meets its render —
  // leaves a pixel or two of hatch out, and the wall a crack the room shows
  // through — and an expansion joint drawn as a slot does the same. Closing
  // by 4 px seals both, to 16 cm; the narrowest opening is 40.
  let mask = erode(dilate(drawn, 4), 4);
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
    return { sheet, floor, level, units, roof, walls, footprint };
  }
  const recess = recessRooms(floor);
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
  if (area(footprint) < 0.5 * area(walled)) return { sheet, floor, level, units, roof, walls, footprint: closedByWalls(mask, 200), walled: true };
  return { sheet, floor, level, units, roof, walls, footprint };
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
