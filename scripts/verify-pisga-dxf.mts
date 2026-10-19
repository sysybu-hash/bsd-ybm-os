#!/usr/bin/env npx tsx
/**
 * מרכז פסג"ה — the DXF-built model checked against the DXF, pixel by pixel.
 *
 *   npx tsx --conditions=react-server scripts/verify-pisga-dxf.mts "<drawing.dxf>" <out dir>
 *
 * Free: nothing here calls an image model. Walls are compared as 2 cm
 * rasters in the plan frame (the model's wall boxes cut 1.2 m over the
 * floor against the drawing's wall ink); windows, doors, furniture, rooms'
 * printed areas, the level marks and the roof's edge are compared item by
 * item. Writes report.md and, per floor, the render with the drawing laid
 * over it.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config } from "dotenv";
config({ path: ".env.local" });

const { readDxfDrawing, flattenDxf, entitiesWithin } = await import("@/lib/projects/dxf-drawing");
const { buildPisga, readPisgaDxfFloor, WINDOW_DXF, LEVEL, OUTLINE_MINUS1, OUTLINE_MINUS2, LABELS_MINUS1, LABELS_MINUS2, mergeLabels } = await import("@/lib/projects/building/pisga");
const { dxfPlanPage, dxfRoomLabels, dxfSymbols, dxfLevelMarks, dxfRoof, PISGA_DXF } = await import("@/lib/projects/building/pisga-dxf");
const { readPlanWalls } = await import("@/lib/projects/building/plan-walls");
const { findOpenings, footprintOf } = await import("@/lib/projects/building/plan-openings");
const { readPlanRooms } = await import("@/lib/projects/building/plan-rooms");
const { readPlanFurniture } = await import("@/lib/projects/building/plan-furniture");
const { dilate, drawLine, emptyMask, fillPolygon, label } = await import("@/lib/projects/building/raster");
const { inRoom } = await import("@/lib/projects/building/furnish");
const { renderBuildingFrames } = await import("@/lib/projects/building/renderer");
type Mask = import("@/lib/projects/building/raster").Mask;
type FloorId = "floor-2" | "floor-1";
type Box = { x0: number; x1: number; z0: number; z1: number };

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) throw new Error("usage: <drawing.dxf> <out dir>");
fs.mkdirSync(outDir, { recursive: true });
const dxf = readDxfDrawing(fs.readFileSync(file));
if (!dxf) throw new Error("unreadable DXF");
const model = await buildPisga(null, { dxf });

/** The raster's frame: metres, 2 cm a pixel. */
const F = { x0: -20, x1: 75, z0: -22, z1: 37, ppm: 50 };
const COLS = (F.x1 - F.x0) * F.ppm;
const ROWS = (F.z1 - F.z0) * F.ppm;
const px = (x: number) => (x - F.x0) * F.ppm;
const pz = (z: number) => (z - F.z0) * F.ppm;
const mx = (p: number) => p / F.ppm + F.x0;
const mz = (p: number) => p / F.ppm + F.z0;

const lines: string[] = [];
const say = (s = "") => {
  lines.push(s);
  console.log(s);
};
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(1) + "%" : "–");
const fmtBox = (c: Box) => `x ${c.x0.toFixed(1)}..${c.x1.toFixed(1)}, z ${c.z0.toFixed(1)}..${c.z1.toFixed(1)}`;
const count = (m: Mask) => m.data.reduce((s, v) => s + v, 0);
const and = (a: Mask, b: Mask, notB = false) => {
  const o = emptyMask(a.cols, a.rows);
  for (let i = 0; i < a.data.length; i++) o.data[i] = a.data[i] && (notB ? !b.data[i] : b.data[i]) ? 1 : 0;
  return o;
};

/** Connected parts of a mask: their area in m² and their box in metres, largest first. */
function components(mask: Mask, minM2: number): Array<Box & { m2: number }> {
  const { ids, sizes } = label(mask, 1);
  const boxes = new Map<number, { x0: number; x1: number; y0: number; y1: number }>();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    if (!id || !mask.data[i]) continue;
    const x = i % mask.cols;
    const y = (i - x) / mask.cols;
    const b = boxes.get(id) ?? { x0: x, x1: x, y0: y, y1: y };
    b.x0 = Math.min(b.x0, x);
    b.x1 = Math.max(b.x1, x);
    b.y0 = Math.min(b.y0, y);
    b.y1 = Math.max(b.y1, y);
    boxes.set(id, b);
  }
  return [...boxes]
    .map(([id, b]) => ({ m2: (sizes[id] ?? 0) / (F.ppm * F.ppm), x0: mx(b.x0), x1: mx(b.x1 + 1), z0: mz(b.y0), z1: mz(b.y1 + 1) }))
    .filter((c) => c.m2 >= minM2)
    .sort((a, b) => b.m2 - a.m2);
}

/** The model's walls on a floor: its wall boxes cut by a plane 1.2 m over the level, in the raster. */
function modelWallMask(id: FloorId, level: number): Mask {
  const m = emptyMask(COLS, ROWS);
  const cut = level + 1.2;
  for (const p of model.primitives) {
    if (p.type !== "box" || (p.tag !== id && p.tag !== `${id}:fin`)) continue;
    if (p.centre.y - p.size.y / 2 > cut || p.centre.y + p.size.y / 2 < cut) continue;
    const a = p.rotY ?? 0;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const ring = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([u, v]): [number, number] => {
      const dx = (u * p.size.x) / 2;
      const dz = (v * p.size.z) / 2;
      return [px(p.centre.x + dx * c + dz * s), pz(p.centre.z - dx * s + dz * c)];
    });
    fillPolygon(m, ring);
  }
  return m;
}

/** The drawing's wall ink: its wall layers' strokes and fills, in the same raster. */
function dxfWallInk(id: FloorId): Mask {
  const page = dxfPlanPage(dxf!, PISGA_DXF.sheets[id]);
  const m = emptyMask(COLS, ROWS);
  for (const p of page.paths) {
    if (p.stroke !== 0xff0000 && p.fill !== 0xff0000) continue;
    for (const ring of p.rings) {
      const pts = ring.map(([x, y]): [number, number] => [px((x - 500) / 100), pz((y - 1030) / 100)]);
      if (p.filled) fillPolygon(m, pts);
      for (let i = 1; i < pts.length; i++) drawLine(m, pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1]);
    }
  }
  return m;
}

const sheets: Array<{ id: FloorId; level: number; outline: typeof OUTLINE_MINUS1; labels: typeof LABELS_MINUS1 }> = [
  { id: "floor-2", level: LEVEL.floorMinus2, outline: OUTLINE_MINUS2, labels: LABELS_MINUS2 },
  { id: "floor-1", level: LEVEL.floorMinus1, outline: OUTLINE_MINUS1, labels: LABELS_MINUS1 },
];

say(`# מרכז פסג"ה — אימות המודל מול ה-DXF`);
say();
say(`המודל: ${model.primitives.length} גופים. הרסטר: ${F.x1 - F.x0}×${F.z1 - F.z0} מ', 2 ס"מ לפיקסל.`);
const summary: Array<[string, string]> = [];
const near = (a: Box, b: Box, r: number) => a.x0 - r <= b.x1 && b.x0 - r <= a.x1 && a.z0 - r <= b.z1 && b.z0 - r <= a.z1;

for (const { id, level, outline, labels } of sheets) {
  say();
  say(`## ${id} (מפלס ${level})`);
  const { page, walls, openings, rooms, items, windows } = readPisgaDxfFloor(dxf, id, labels, outline);
  const printed = dxfRoomLabels(dxf, id);

  // 1. Walls.
  const built = modelWallMask(id, level);
  const ink = dxfWallInk(id);
  const covered = and(ink, dilate(built, 3));
  const unsupported = and(built, dilate(ink, 12), true);
  const recall = count(covered) / Math.max(1, count(ink));
  const support = 1 - count(unsupported) / Math.max(1, count(built));
  say(`**קירות** — דיו הקירות של ה-DXF שמכוסה בקירות המודל (±6 ס"מ): ${pct(count(covered), count(ink))}; קירות מודל שיש מאחוריהם דיו (±24 ס"מ): ${(support * 100).toFixed(1)}%`);
  const uncovered = components(and(ink, dilate(built, 3), true), 0.02);
  if (uncovered.length) {
    say(`דיו קיר שהמודל לא בנה — ${uncovered.length} רכיבים, הגדולים:`);
    for (const c of uncovered.slice(0, 8)) say(`- ${fmtBox(c)} (${c.m2.toFixed(2)} מ"ר)`);
  }
  const invented = components(unsupported, 0.05);
  if (invented.length) {
    say(`קיר מודל בלי קיר ב-DXF — ${invented.length} רכיבים, הגדולים:`);
    for (const c of invented.slice(0, 8)) say(`- ${fmtBox(c)} (${c.m2.toFixed(2)} מ"ר)`);
  }
  summary.push([`${id} קירות: כיסוי / תמיכה`, `${(recall * 100).toFixed(1)}% / ${(support * 100).toFixed(1)}%`]);

  // 2. Windows.
  const sym = dxfSymbols(dxf, id);
  void windows;
  const modelOpen: Box[] = openings.filter((o) => o.exterior).map((o) => ({ x0: o.x, x1: o.x + o.w, z0: o.y, z1: o.y + o.h }));
  const winMissing = sym.windows.filter((w) => !modelOpen.some((m) => near(w, m, 0.3)));
  const winExtra = modelOpen.filter((m) => !sym.windows.some((w) => near(w, m, 0.3)));
  say(`**חלונות** — ב-DXF ${sym.windows.length} סמלי חלון; המודל מצא ${modelOpen.length} פתחים בקירות החוץ. חלון DXF בלי פתח במודל: ${winMissing.length}; פתח מודל בלי חלון ב-DXF: ${winExtra.length}.`);
  for (const w of winMissing.slice(0, 8)) say(`- חסר במודל: ${fmtBox(w)}`);
  for (const w of winExtra.slice(0, 8)) say(`- פתח מודל ללא חלון ב-DXF: ${fmtBox(w)}`);
  summary.push([`${id} חלונות DXF שנמצאו במודל`, `${sym.windows.length - winMissing.length}/${sym.windows.length}`]);

  // 3. Doors: hung on a wall of the model, the opening's middle clear of it.
  const wallAt = (x: number, z: number, r: number) => {
    const cx = Math.round(px(x));
    const cy = Math.round(pz(z));
    const rp = Math.round(r * F.ppm);
    for (let dy = -rp; dy <= rp; dy++) for (let dx = -rp; dx <= rp; dx++) if (built.data[(cy + dy) * COLS + cx + dx]) return true;
    return false;
  };
  let doorsOk = 0;
  const doorBad: string[] = [];
  // Doors beyond the new floors' outline (the kindergarten's imported plan, the street) are not this model's; an entrance in the lobby's glass front hangs on no wall, and counts when the model has its door leaf there.
  const outer = (b: Box) => b.x1 < 0 || b.x0 > 54.5;
  const doorPrims = model.primitives.filter((p) => /door/i.test(p.tag ?? "") && "centre" in p);
  const inGlass = (b: Box) => doorPrims.some((p) => "centre" in p && p.centre.y > level - 0.1 && p.centre.y < level + 3 && Math.abs(p.centre.x - (b.x0 + b.x1) / 2) < 1.5 && Math.abs(p.centre.z - (b.z0 + b.z1) / 2) < 1.5);
  const doors = sym.doors.filter((d) => !outer(d));
  say(`(דלתות מחוץ לקונטור הקומות החדשות: ${sym.doors.length - doors.length}, לא נספרות)`);
  for (const d of doors) {
    const a = d.arcs[0]!;
    const hung = wallAt(a.hinge[0], a.hinge[1], 0.35);
    const clear = a.ends.some((e) => !wallAt((a.hinge[0] + e[0]) / 2, (a.hinge[1] + e[1]) / 2, 0.12));
    if ((hung && clear) || (!hung && inGlass(d))) doorsOk++;
    else doorBad.push(`${fmtBox(d)} — ${!hung ? "אין קיר ליד הציר" : "הפתח סגור בקיר"}`);
  }
  say(`**דלתות** — ${doors.length} דלתות ב-DXF; ${doorsOk} תלויות על קיר של המודל עם פתח פנוי.`);
  for (const b of doorBad.slice(0, 10)) say(`- ${b}`);
  summary.push([`${id} דלתות תקינות`, `${doorsOk}/${doors.length}`]);

  // 4. Furniture: each item the drawing draws has a piece of the model within 0.6 m.
  const pieces = model.primitives
    .filter((p) => (p.tag ?? "").startsWith(`${id}:inside`) && !/:(finish|ceiling|light|plant|glazing)$/.test(p.tag ?? "") && (p.type === "box" || p.type === "cylinder") && p.centre.y > level && p.centre.y < level + 2.2)
    .map((p) => (p as { centre: { x: number; z: number } }).centre);
  // A stair, a lift and a double-height void are built as such, not as furniture; a long table is built of parts, so any part of it counts.
  const structural = (it: (typeof items)[number]) => rooms.some((r) => ["stair", "lift", "void"].includes(r.kind) && inRoom(r, it.x, it.y));
  const lost = items.filter((it) => !structural(it) && !pieces.some((c) => Math.hypot(c.x - it.x, c.z - it.y) < Math.max(0.6, it.length / 2)));
  say(`**ריהוט** — ${items.length} פריטים שה-DXF מצייר; ל-${items.length - lost.length} מהם יש חלק של המודל במרחק ≤0.6 מ'. בלי חלק: ${lost.length}.`);
  for (const it of lost.slice(0, 8)) say(`- (${it.x.toFixed(1)}, ${it.y.toFixed(1)}) ${it.length.toFixed(2)}×${it.width.toFixed(2)} מ'`);
  summary.push([`${id} ריהוט עם חלק במודל`, `${items.length - lost.length}/${items.length}`]);

  // 5. Rooms: the printed area against the room the model found.
  say(`**חדרים** — השטח המודפס מול השטח שהמודל מצא:`);
  let roomsOk = 0;
  let roomsN = 0;
  for (const l of printed) {
    const m = /(\d+)\s*מ"ר/.exec(l.name);
    if (!m) continue;
    const printedM2 = Number(m[1]);
    const dist = (r: (typeof rooms)[number]) => Math.hypot(r.bounds.x + r.bounds.w / 2 - l.x, r.bounds.y + r.bounds.h / 2 - l.y);
    const room = rooms.filter((r) => r.name === l.name).sort((a, b) => dist(a) - dist(b))[0];
    roomsN++;
    if (!room) {
      say(`- ${l.name}: לא נמצא חדר`);
      continue;
    }
    const err = (room.areaM2 - printedM2) / printedM2;
    if (Math.abs(err) <= 0.1) roomsOk++;
    say(`- ${l.name}: מודל ${room.areaM2.toFixed(1)} מ"ר, מודפס ${printedM2} (${err >= 0 ? "+" : ""}${(err * 100).toFixed(0)}%)`);
  }
  summary.push([`${id} חדרים בטווח ±10% מהשטח המודפס`, `${roomsOk}/${roomsN}`]);

  // 6. The levels the sheet prints.
  const known = [LEVEL.floorMinus2, LEVEL.floorMinus1, LEVEL.roof, LEVEL.parapet, LEVEL.bulkhead, 11.57, 12.3, 11.86, 12.73, 15.01];
  const marks = dxfLevelMarks(dxf, id);
  const distinct = new Map<number, number>();
  for (const k of marks) distinct.set(k.value, (distinct.get(k.value) ?? 0) + 1);
  say(`**מפלסים** — ${marks.length} סימנים בגיליון: ${[...distinct].sort((a, b) => a[0] - b[0]).map(([v, n]) => `${v}${known.some((k) => Math.abs(k - v) < 0.006) ? "" : "?"}×${n}`).join(" ")} (? = לא במודל)`);
}

// 7. The roof's edge, against the overhead line the floor sheet draws round the building.
{
  const roof = dxfRoof(dxf);
  const left = PISGA_DXF.sheets["floor-1"];
  const pieces = flattenDxf(dxf, entitiesWithin(dxf, { centre: { x: left + PISGA_DXF.width / 2, y: PISGA_DXF.frameY + PISGA_DXF.height / 2 }, width: PISGA_DXF.width, height: PISGA_DXF.height }));
  const pts = pieces.filter((p) => /^קו נס[תט]ר עליון/.test(p.layer) && p.pts).flatMap((p) => p.pts!);
  say();
  say(`## גג`);
  if (roof && pts.length) {
    const X = (x: number) => (x - left - PISGA_DXF.corner.x) / 100 + 0.88;
    const Z = (y: number) => (PISGA_DXF.frameY + PISGA_DXF.corner.y - y) / 100 + 1.02;
    const xs = pts.map((q) => X(q.x)).filter((x) => x > 0 && x < 60);
    // Past z 19.5 the dashed line follows the entrance stair and the drive down to the street (the roof sheet's stair at z 16.6..21.8), not the roof.
    const zs = pts.map((q) => Z(q.y)).filter((z) => z > -3 && z < 19.5);
    say(`קצה הגג במודל: x ${Math.min(...roof.outline.map((q) => q[0])).toFixed(2)}..${Math.max(...roof.outline.map((q) => q[0])).toFixed(2)}, z ${Math.min(...roof.outline.map((q) => q[1])).toFixed(2)}..${Math.max(...roof.outline.map((q) => q[1])).toFixed(2)}; קו הקירוי העליון בגיליון הקומה: x ${Math.min(...xs).toFixed(2)}..${Math.max(...xs).toFixed(2)}, z ${Math.min(...zs).toFixed(2)}..${Math.max(...zs).toFixed(2)}`);
  } else say("אין קו קירוי להשוואה.");
}

// 7b. The north elevation: its windows (stone surround and frame) against the model's, by floor.
{
  say();
  say(`## חזית צפונית`);
  const pieces = flattenDxf(dxf, entitiesWithin(dxf, { centre: { x: 156400, y: 645700 }, width: 5800, height: 2200 }));
  // The sheet's level marks give the vertical scale: +8.29, +12.77 and +17.25 at 100 units a metre.
  const marks = pieces.flatMap((p) => {
    const m = /^\+?(\d{1,2}\.\d\d)$/.exec((p.text ?? p.attribs?.[0]?.text ?? "").replace(/^%%\s*/, "").trim());
    return m && p.at && p.layer !== "0" && p.at.x < 156000 ? [{ v: Number(m[1]), y: p.at.y }] : [];
  });
  const base = marks.filter((k) => [8.29, 12.77, 17.25].includes(k.v)).map((k) => k.y - (k.v - 8.29) * 100);
  const y0 = base.reduce((a, b) => a + b, 0) / Math.max(1, base.length);
  say(`סימני מפלס בשרטוט: ${marks.length}; ציר המפלסים נקבע מ-${base.length} סימנים (פיזור ${base.length ? (Math.max(...base) - Math.min(...base)).toFixed(0) : "–"} יח').`);
  type B = { x0: number; x1: number; y0: number; y1: number };
  const parts: B[] = [];
  for (const p of pieces) {
    if (!/^חלון/.test(p.layer)) continue;
    const pts = [...(p.pts ?? []), ...(p.arc ? [p.arc.c] : [])];
    if (pts.length) parts.push({ x0: Math.min(...pts.map((q) => q.x)), x1: Math.max(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), y1: Math.max(...pts.map((q) => q.y)) });
  }
  const parent = parts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = parts[i]!;
    const b = parts[j]!;
    if (a.x0 - 25 <= b.x1 && b.x0 - 25 <= a.x1 && a.y0 - 25 <= b.y1 && b.y0 - 25 <= a.y1) parent[find(i)] = find(j);
  }
  const groups = new Map<number, B>();
  parts.forEach((p, i) => {
    const c = groups.get(find(i));
    if (!c) groups.set(find(i), { ...p });
    else { c.x0 = Math.min(c.x0, p.x0); c.x1 = Math.max(c.x1, p.x1); c.y0 = Math.min(c.y0, p.y0); c.y1 = Math.max(c.y1, p.y1); }
  });
  const drawn = [...groups.values()].filter((w) => w.x1 - w.x0 > 200 && w.y1 - w.y0 > 200);
  const northCal: { y0: number; shift: number | null } = { y0, shift: null };
  for (const { id, level } of sheets) {
    const { openings } = readPisgaDxfFloor(dxf, id, id === "floor-2" ? LABELS_MINUS2 : LABELS_MINUS1, id === "floor-2" ? OUTLINE_MINUS2 : OUTLINE_MINUS1);
    const north = openings.filter((o) => o.exterior && o.y < 3 && o.orientation === "h");
    const here = drawn.filter((w) => Math.abs((w.y0 - y0) / 100 + 8.29 - (level + 0.85)) < 0.6);
    // Drawn from the north, east is on the left: the plan's x is A less the drawing's. A is the value that lines most of the drawing's windows up with the plan's.
    const wx = here.map((w) => (w.x0 + w.x1) / 200);
    const candidates = wx.flatMap((c) => north.map((o) => o.x + o.w / 2 + c));
    const matches = (a: number) => wx.filter((c) => north.some((o) => Math.abs(o.x + o.w / 2 - (a - c)) < 0.25)).length;
    const shift = candidates.sort((a, b) => matches(b) - matches(a))[0] ?? 0;
    northCal.shift = shift;
    const resid = wx.map((c) => Math.min(...north.map((o) => Math.abs(o.x + o.w / 2 - (shift - c)))));
    const sill = here.map((w) => (w.y0 - y0) / 100 + 8.29 - level);
    const head = here.map((w) => (w.y1 - y0) / 100 + 8.29 - level);
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    say(`${id}: בשרטוט ${here.length} חלונות, במודל ${north.length} פתחים בקיר הצפוני; סטייה אופקית מרבית כש-x התוכנית = ${shift.toFixed(2)} פחות x השרטוט: ${resid.length ? Math.max(...resid).toFixed(2) : "–"} מ'.`);
    say(`  גובה המסגרת-עם-האבן בשרטוט: ${avg(sill).toFixed(2)}..${avg(head).toFixed(2)} מעל הרצפה; במודל: ${(WINDOW_DXF.sill - WINDOW_DXF.surround).toFixed(2)}..${(WINDOW_DXF.head + WINDOW_DXF.surround).toFixed(2)}; רוחב בשרטוט ${(avg(here.map((w) => (w.x1 - w.x0) / 100))).toFixed(2)} מ'.`);
    summary.push([`${id} חזית צפונית: חלונות שרטוט/מודל`, `${here.length}/${north.length}`]);
  }
  // The render from the north in the drawing's own frame, the drawing laid over it.
  {
    const E = { x0: -2.5, x1: 55.5, l0: 6.5, l1: 21.5 };
    const EW = 2400;
    const EH = Math.round((EW * (E.l1 - E.l0)) / (E.x1 - E.x0));
    const ek = EW / (E.x1 - E.x0);
    const [shot] = await renderBuildingFrames(
      [{ model, camera: { position: { x: (E.x0 + E.x1) / 2, y: (E.l0 + E.l1) / 2, z: -300 }, target: { x: (E.x0 + E.x1) / 2, y: (E.l0 + E.l1) / 2, z: 0 }, fovDeg: 30, orthoHalfWidth: (E.x1 - E.x0) / 2, hideTags: ["tree", "car"] }, width: EW, height: EH, sun: { azimuthDeg: 300, elevationDeg: 30 }, exposure: 0.66, ao: true }],
      { outputWidthPx: 99999 },
    );
    const shift = northCal.shift ?? 0;
    const pts = flattenDxf(dxf, entitiesWithin(dxf, { centre: { x: 156400, y: 645700 }, width: 5800, height: 2200 }));
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${EW}" height="${EH}">`;
    // The render and the drawing both look from the north, so both put east on the left: the plan's x is the shift less the drawing's.
    const X = (x: number) => ((E.x1 - (shift - x / 100)) * ek).toFixed(1);
    const Yp = (y: number) => ((E.l1 - ((y - northCal.y0) / 100 + 8.29)) * ek).toFixed(1);
    for (const p of pts) {
      if (!p.pts || p.pts.length < 2 || /^(מידה|טקסט|0$)/.test(p.layer)) continue;
      const colour = /^חלון/.test(p.layer) ? "#0050ff" : /^קיר/.test(p.layer) ? "#e00000" : "#777777";
      svg += `<polyline fill="none" stroke="${colour}" stroke-width="1.2" points="${p.pts.map((q) => `${X(q.x)},${Yp(q.y)}`).join(" ")}"/>`;
    }
    svg += "</svg>";
    const outE = path.join(outDir, "overlay-north.jpg");
    await sharp(shot!).resize(EW, EH).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 88 }).toFile(outE);
    say(`overlay: ${outE}`);
  }
}

// 8. The render of each floor from above, the drawing laid over it.
const W = 2400;
const H = Math.round((W * (F.z1 - F.z0)) / (F.x1 - F.x0));
const k = W / (F.x1 - F.x0);
for (const { id, level } of sheets) {
  const cx = (F.x0 + F.x1) / 2;
  const cz = (F.z0 + F.z1) / 2;
  const [frame] = await renderBuildingFrames(
    [
      {
        model,
        camera: { position: { x: cx, y: 400, z: cz }, target: { x: cx, y: 0, z: cz }, up: { x: 0, y: 0, z: -1 }, fovDeg: 30, orthoHalfWidth: (F.x1 - F.x0) / 2, cutAboveM: level + 1.5, interior: true, hideTags: id === "floor-1" ? ["roof", "facade"] : ["roof", "facade", "floor-1"] },
        width: W,
        height: H,
        sun: { azimuthDeg: 160, elevationDeg: 72 },
        exposure: 0.64,
        ao: true,
      },
    ],
    { outputWidthPx: 99999 },
  );
  const page = dxfPlanPage(dxf, PISGA_DXF.sheets[id]);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  for (const p of page.paths) {
    if (p.stroke !== 0xff0000 && p.fill !== 0xff0000) continue;
    for (const ring of p.rings) svg += `<polyline fill="none" stroke="#e00000" stroke-width="1.4" points="${ring.map(([x, y]) => `${(((x - 500) / 100 - F.x0) * k).toFixed(1)},${(((y - 1030) / 100 - F.z0) * k).toFixed(1)}`).join(" ")}"/>`;
  }
  const sym = dxfSymbols(dxf, id);
  const rect = (b: Box, colour: string) => `<rect x="${((b.x0 - F.x0) * k).toFixed(1)}" y="${((b.z0 - F.z0) * k).toFixed(1)}" width="${((b.x1 - b.x0) * k).toFixed(1)}" height="${((b.z1 - b.z0) * k).toFixed(1)}" fill="none" stroke="${colour}" stroke-width="1.6"/>`;
  for (const w of sym.windows) svg += rect(w, "#0050ff");
  for (const d of sym.doors) svg += rect(d, "#00a000");
  svg += "</svg>";
  const out = path.join(outDir, `overlay-${id}.jpg`);
  const crop = { left: Math.round((-3 - F.x0) * k), top: Math.round((-3 - F.z0) * k), width: Math.round(66 * k), height: Math.round(26 * k) };
  const composed = await sharp(frame!).resize(W, H).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).png().toBuffer();
  await sharp(composed).extract(crop).jpeg({ quality: 88 }).toFile(out);
  say(`overlay: ${out}`);
}

say();
say(`## סיכום`);
for (const [key, value] of summary) say(`- ${key}: ${value}`);
fs.writeFileSync(path.join(outDir, "report.md"), lines.join("\n"));
process.exit(0);
