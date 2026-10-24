#!/usr/bin/env npx tsx
/**
 * בי"ס וולף בני ברק — a free model from the architect's DXF floors, checked
 * against the drawing, the elevations and the printed room areas.
 *
 *   npx tsx --conditions=react-server scripts/wolf-model.mts "<folder with the DXFs>" <out dir> [--no-render]
 *
 * Existing: ground (0.00) and floor 1 (+3.36). Additions: floor 2 (+6.72),
 * floor 3 (+10.08), technical roof (+13.44). Nothing here calls a paid model.
 *
 * Each floor file's WALL layer is handed to the plan readers as a painted
 * page (a unit is a centimetre, y flipped so the page runs north-up). A
 * floor's outline is its walls closed across the windows the WIN layer draws
 * and across doorways up to 1.5 m, opened by 0.6 m so the 1 m concrete
 * shading frames the addition floors draw round their wings are not floor.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config } from "dotenv";
config({ path: ".env.local" });

const { readDxfDrawing, flattenDxf, arcPoints, apply } = await import("@/lib/projects/dxf-drawing");
const { readPlanWalls } = await import("@/lib/projects/building/plan-walls");
const { findOpenings, footprintOf, fitDrawnWindows } = await import("@/lib/projects/building/plan-openings");
const { floorPrimitives, slab, parapet, insidePolygon } = await import("@/lib/projects/building/assemble");
const { label, traceOutline, emptyMask, dilate, erode } = await import("@/lib/projects/building/raster");
const { readPlanRooms, roomRects } = await import("@/lib/projects/building/plan-rooms");
const { furnishRoom, furnPrimitives } = await import("./wolf-content.mts");
const { furnishFloor, inRoom } = await import("@/lib/projects/building/furnish");
const { renderBuildingFrames } = await import("@/lib/projects/building/renderer");
type Pt = import("@/lib/projects/dxf-drawing").Pt;
type DxfPiece = import("@/lib/projects/dxf-drawing").DxfPiece;
type PdfPage = import("@/lib/projects/building/pdf-paths").PdfPage;
type Primitive = import("@/lib/projects/building/model").Primitive;
type RoomLabel = import("@/lib/projects/building/plan-rooms").RoomLabel;
type RoomKind = import("@/lib/projects/building/plan-rooms").RoomKind;
type PlanItem = import("@/lib/projects/building/plan-furniture").PlanItem;
type Outline = Array<[number, number]>;

const [dir, outDir, flag] = process.argv.slice(2);
if (!dir || !outDir) throw new Error("usage: <folder> <out dir> [--no-render]");
fs.mkdirSync(outDir, { recursive: true });

/** The building's frame: cm, the north-west corner of the window all five plan files share. */
const FRAME = { x0: 18472900, y1: 66537700, width: 6500, height: 7400 };
/** The body the ground floor and the elevations print (38.30 × 48.35 m), cm: concrete shading frames lie 1 m outside it. */
const BODY = { x0: 18474240, x1: 18478070, y0: 66531558, y1: 66536393 };
const H = 3.36;
const FLOORS = [
  { id: "floor-0", file: "tochnit karka_kayam_seminar volf.dxf", level: 0, he: "קרקע (קיים)", added: false },
  { id: "floor-1", file: "tochnit 1_kayam_seminar volf.dxf", level: H, he: "קומה א' (קיים)", added: false },
  { id: "floor-2", file: "tochnit 2_tosefet_seminar volf.dxf", level: 2 * H, he: "קומה ב' (תוספת)", added: true },
  { id: "floor-3", file: "tochnit 3_tosefet_seminar volf.dxf", level: 3 * H, he: "קומה ג' (תוספת)", added: true },
] as const;
const ROOF = { file: "tochnit gag_tosefet_seminar volf.dxf", level: 4 * H, parapetTop: 13.94, tower: 15.84, towerTop: 17.31, towerMiddle: 18.5 };
const WINDOW = { sill: 0.9, head: 2.5, surround: 0.1 };

const lines: string[] = [];
const say = (s = "") => {
  lines.push(s);
  console.log(s);
};

const toM = (q: Pt): [number, number] => [(q.x - FRAME.x0) / 100, (FRAME.y1 - q.y) / 100];
const inFrame = (q: Pt) => q.x >= FRAME.x0 && q.x <= FRAME.x0 + FRAME.width && q.y <= FRAME.y1 && q.y >= FRAME.y1 - FRAME.height;
const ringOf = (p: DxfPiece): Pt[] | null => {
  if (p.pts && p.pts.length >= 2) return p.closed ? [...p.pts, p.pts[0]!] : p.pts;
  if (p.arc) return arcPoints(p.arc.c, p.arc.r, p.arc.start, p.arc.end);
  if (p.circle) return arcPoints(p.circle.c, p.circle.r, 0, Math.PI * 2);
  return null;
};

/** One floor file: WALL ink as a page, WALL+WIN ink as a second page (for the footprint), raw wall segments (m), and its text. */
function readFile(file: string) {
  const d = readDxfDrawing(fs.readFileSync(path.join(dir!, file)));
  if (!d) throw new Error(`unreadable: ${file}`);
  const wall: PdfPage["paths"] = [];
  const both: PdfPage["paths"] = [];
  const segs: Array<[number, number, number, number]> = [];
  const texts: Array<{ x: number; y: number; text: string; layer: string }> = [];
  const seenText = new Set<string>();
  const frames: Array<[number, number, number, number]> = [];
  const canopies: Array<{ x0: number; z0: number; x1: number; z1: number }> = [];
  const leaves: Array<[number, number, number, number]> = [];
  const stairLines: Array<[number, number, number, number]> = [];
  const winSegs: Array<[number, number, number, number]> = [];
  const diagWalls: Array<[number, number, number, number]> = [];
  const items: PlanItem[] = [];
  const blockBox = new Map<string, { x0: number; x1: number; y0: number; y1: number } | null>();
  const boxOf = (name: string) => {
    if (blockBox.has(name)) return blockBox.get(name)!;
    const blk = d.blocks.get(name);
    let r: { x0: number; x1: number; y0: number; y1: number } | null = null;
    if (blk) for (const q of flattenDxf(d, blk.entities)) for (const pt of q.pts ?? []) r = r ? { x0: Math.min(r.x0, pt.x), x1: Math.max(r.x1, pt.x), y0: Math.min(r.y0, pt.y), y1: Math.max(r.y1, pt.y) } : { x0: pt.x, x1: pt.x, y0: pt.y, y1: pt.y };
    blockBox.set(name, r);
    return r;
  };
  for (const p of flattenDxf(d)) {
    if (p.insert && p.m && /^(chair|cise-bar|kise|table|computer)/i.test(p.insert)) {
      const bb = boxOf(p.insert);
      if (bb && bb.x1 > bb.x0 && bb.y1 > bb.y0) {
        const cs = [[bb.x0, bb.y0], [bb.x1, bb.y0], [bb.x1, bb.y1], [bb.x0, bb.y1]].map(([x, y]) => apply(p.m!, { x: x!, y: y! }));
        const w1 = Math.hypot(cs[1]!.x - cs[0]!.x, cs[1]!.y - cs[0]!.y) / 100, h1 = Math.hypot(cs[2]!.x - cs[1]!.x, cs[2]!.y - cs[1]!.y) / 100;
        const c = { x: (cs[0]!.x + cs[2]!.x) / 2, y: (cs[0]!.y + cs[2]!.y) / 2 };
        if (inFrame(c) && Math.max(w1, h1) < 4.5) {
          const a0 = Math.atan2(cs[1]!.y - cs[0]!.y, cs[1]!.x - cs[0]!.x);
          const [mx, my] = toM(c);
          items.push({ x: mx, y: my, length: Math.max(w1, h1), width: Math.min(w1, h1), angle: -(w1 >= h1 ? a0 : a0 + Math.PI / 2), roundness: 0, strokes: 4 });
        }
      }
    }
    if (p.text && p.at && inFrame(p.at) && !p.dimension && /[֐-׿]|\d/.test(p.text)) {
      const [x, y] = toM(p.at);
      const key = p.text.trim() + "@" + Math.round(x * 5) + "," + Math.round(y * 5);
      if (seenText.has(key)) continue;
      seenText.add(key);
      texts.push({ x, y, text: p.text.trim(), layer: p.layer });
    }
    // A door's leaf: the hidden line of its block (D90, D105, door 110 ...), 0.5–1.3 m long.
    if (p.layer === "HID" && p.pts && p.pts.length === 2 && p.path.length >= 1 && /^(d\d+|door)/i.test(p.path[p.path.length - 1]!) && inFrame(p.pts[0]!)) {
      const a = toM(p.pts[0]!), b = toM(p.pts[1]!);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len >= 0.5 && len <= 1.3) leaves.push([a[0], a[1], b[0], b[1]]);
    }
    if (p.layer === "00-madregot" && p.pts && p.pts.length >= 2 && inFrame(p.pts[0]!)) for (let i = 1; i < p.pts.length; i++) stairLines.push([...toM(p.pts[i - 1]!), ...toM(p.pts[i]!)] as [number, number, number, number]);
    // Walls at an angle (the lobby's curved and slanted partitions): the readers keep straight runs only, so each segment off the axes is kept as it is drawn, except the facade's own arc (r 17.8–19.6 round the circle at 55.9, 43.1), which is built apart.
    if (p.layer === "WALL" && !p.text && (p.pts || p.arc)) {
      const ring0 = ringOf(p);
      if (ring0 && ring0.length >= 2 && ring0.every(inFrame)) {
        for (let i = 1; i < ring0.length; i++) {
          const a = toM(ring0[i - 1]!), c = toM(ring0[i]!);
          const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
          if (len < 0.25 || Math.abs(dx) < 0.04 || Math.abs(dz) < 0.04) continue;
          const mr = Math.hypot((a[0] + c[0]) / 2 - 55.9, (a[1] + c[1]) / 2 - 43.1);
          if (mr > 17.6 && mr < 19.7) continue;
          diagWalls.push([a[0], a[1], c[0], c[1]]);
        }
      }
    }
    if (p.text || (p.layer !== "WALL" && p.layer !== "WIN")) continue;
    const ring = ringOf(p);
    if (!ring || !ring.some(inFrame)) continue;
    if (p.layer === "WIN") for (let i = 1; i < ring.length; i++) winSegs.push([...toM(ring[i - 1]!), ...toM(ring[i]!)] as [number, number, number, number]);
    const outside = ring.some((q) => q.x < BODY.x0 - 50 || q.x > BODY.x1 + 50 || q.y < BODY.y0 - 50 || q.y > BODY.y1 + 50);
    if (outside && p.layer === "WALL" && p.type === "LWPOLYLINE" && Math.max(...ring.map((q) => q.x)) - Math.min(...ring.map((q) => q.x)) + Math.max(...ring.map((q) => q.y)) - Math.min(...ring.map((q) => q.y)) > 300) {
      for (let i = 1; i < ring.length; i++) frames.push([...toM(ring[i - 1]!), ...toM(ring[i]!)] as [number, number, number, number]);
      { const ms = ring.map(toM); canopies.push({ x0: Math.min(...ms.map((q) => q[0])), x1: Math.max(...ms.map((q) => q[0])), z0: Math.min(...ms.map((q) => q[1])), z1: Math.max(...ms.map((q) => q[1])) }); }
      continue;
    }
    const r = ring.map((q): [number, number] => [q.x - FRAME.x0, FRAME.y1 - q.y]);
    const path1 = { rings: [r], filled: false, stroked: true, fill: null, stroke: 0xff0000, lineWidth: 1 };
    both.push(path1);
    if (p.layer === "WALL") {
      wall.push(path1);
      for (let i = 1; i < r.length; i++) segs.push([r[i - 1]![0] / 100, r[i - 1]![1] / 100, r[i]![0] / 100, r[i]![1] / 100]);
    }
  }
  // The stair shaft's walls are drawn on the stair layer (00-madregot: the outline 37.6–41.3 × 35.32–41.92), not on the wall layer: the reader never saw them, the footprint left the shaft out and its flights stood open. They join the wall ink here.
  if (!/gag/.test(file)) {
    for (const [x0, z0, x1, z1] of [[37.6, 35.32, 37.8, 41.92], [41.1, 35.32, 41.3, 40.92], [37.6, 35.32, 41.3, 35.52]] as const) {
      const ring: Array<[number, number]> = [[x0 * 100, z0 * 100], [x1 * 100, z0 * 100], [x1 * 100, z1 * 100], [x0 * 100, z1 * 100], [x0 * 100, z0 * 100]];
      const path1 = { rings: [ring], filled: false, stroked: true, fill: null, stroke: 0xff0000, lineWidth: 1 };
      wall.push(path1);
      both.push(path1);
      segs.push(...ring.slice(1).map((q, i) => [ring[i]![0] / 100, ring[i]![1] / 100, q[0] / 100, q[1] / 100] as [number, number, number, number]));
    }
  }
  const page = (paths: PdfPage["paths"]): PdfPage => ({ width: FRAME.width, height: FRAME.height, paths });
  return { wallPage: page(wall), bothPage: page(both), segs, texts, frames, canopies, leaves, stairLines, winSegs, diagWalls, items };
}

const REACH = Number(process.env.REACH ?? 4);
const REACH_EXT = Number(process.env.REACH_EXT ?? 1.5);
const OPEN = Number(process.env.OPEN ?? 0.6);
const region = { x: 0, y: 0, width: FRAME.width, height: FRAME.height };
const readOpts = { unitsPerMetre: 100, pens: { colours: [0xff0000] }, closePx: 8 };

function readFloor(file: string) {
  const f = readFile(file);
  const walls = readPlanWalls(f.wallPage, region, readOpts);
  // The reader fills what a few lines enclose as a wall's core: between the curved glass wall and the hall's chord that came out a solid 8.9 × 5.3 m block. No wall is that thick: such a fill is dropped, from the bands and from the mask.
  {
    const cmM = walls.cm / 100;
    const fills = walls.bands.filter((q) => Math.min(q.w, q.h) > 1.8 && q.w * q.h > 12);
    for (const q of fills) {
      for (let y = Math.floor(q.y / cmM); y <= Math.floor((q.y + q.h) / cmM); y++) for (let x = Math.floor(q.x / cmM); x <= Math.floor((q.x + q.w) / cmM); x++) if (x >= 0 && y >= 0 && x < walls.mask.cols && y < walls.mask.rows) walls.mask.data[y * walls.mask.cols + x] = 0;
    }
    if (fills.length) { walls.bands = walls.bands.filter((q) => !fills.includes(q)); say("  מילוי מלא שהוסר: " + fills.map((q) => q.w.toFixed(1) + "×" + q.h.toFixed(1)).join(", ")); }
  }
  const closedInk = readPlanWalls(f.bothPage, region, readOpts);
  // Closed across windows and doorways, then opened: thin frames are not floor.
  const closed = footprintOf(closedInk, REACH);
  const r = Math.round(OPEN / (closed.cm / 100));
  const opened = dilate(erode(closed.mask, r), r);
  const footprint = { mask: opened, cm: closed.cm };
  // Which openings face outside is decided on a tighter closing: a gallery or a stair well open to the courtyard is outside, though the slab runs under it.
  const footprintExt = footprintOf(closedInk, REACH_EXT);
  const openings = findOpenings(walls, footprintExt).map((o) => {
    if (o.kind !== "doorway" || o.door || !o.exterior) return o;
    // A gap the sheet draws a window line across is a window: only a gap with none is a way through.
    const pad = 0.3;
    const glazed = f.winSegs.some(([ax, ay, bx2, by]) => Math.min(ax, bx2) >= o.x - pad && Math.max(ax, bx2) <= o.x + o.w + pad && Math.min(ay, by) >= o.y - pad && Math.max(ay, by) <= o.y + o.h + pad);
    if (glazed) return { ...o, kind: "window" as const };
    // A way through narrower than 2.5 m in an outside wall is a door the sheet leaves unswung: glazed to the floor.
    const width = Math.max(o.w, o.h);
    return width < 2.5 ? { ...o, kind: "window" as const, full: true, sill: 0, head: 2.1 } : o;
  });
  return { ...f, walls, footprint, footprintExt, openings, bandsOrig: walls.bands };
}

/** The connected blocks of a footprint: traced outline (m), area, and a point-in-block test. */
function blocks(fp: { mask: ReturnType<typeof emptyMask>; cm: number }, minM2 = 25) {
  const lab = label(fp.mask, 1);
  const px = fp.cm / 100;
  const counts = new Map<number, number>();
  for (let i = 0; i < lab.ids.length; i++) if (fp.mask.data[i]) counts.set(lab.ids[i]!, (counts.get(lab.ids[i]!) ?? 0) + 1);
  const out: Array<{ outline: Outline; areaM2: number; has: (x: number, y: number) => boolean; hasWide: (x: number, y: number) => boolean }> = [];
  for (const [id, n] of counts) {
    const areaM2 = n * px * px;
    if (areaM2 < minM2) continue;
    const m = emptyMask(fp.mask.cols, fp.mask.rows);
    for (let i = 0; i < lab.ids.length; i++) if (lab.ids[i] === id) m.data[i] = 1;
    const outline = traceOutline(m, 2).map(([x, y]) => [x * px, y * px] as [number, number]);
    const wide = dilate(m, Math.round(0.7 / px));
    out.push({ outline, areaM2, hasWide: (x, y) => { const cx = Math.floor(x / px), cy = Math.floor(y / px); return cx >= 0 && cy >= 0 && cx < wide.cols && cy < wide.rows && wide.data[cy * wide.cols + cx] === 1; }, has: (x, y) => { const cx = Math.floor(x / px), cy = Math.floor(y / px); return cx >= 0 && cy >= 0 && cx < m.cols && cy < m.rows && m.data[cy * m.cols + cx] === 1; } });
  }
  return out.sort((a, b) => b.areaM2 - a.areaM2);
}

/** What a room's name says it is. */
const KINDS: Array<[RegExp, RoomKind]> = [
  [/אולם/, "hall"],
  [/מחשב|טכנולוגיה/, "computers"],
  [/מטבח/, "kitchen"],
  [/ממ"|מ\.מ\.מ/, "mmd"],
  [/מדרגות/, "stair"],
  [/מעלית/, "lift"],
  [/שירותים|שירותי/, "wc"],
  [/מחסן|שרת/, "store"],
  [/מזכירות|מנהל|מורים|יועץ|פסיכולוג|צוות|עזר|ספריה|טיפול|רווחה|הקבצה|תקשורת|פינת/, "office"],
  [/כיתה|כתה|חדר/, "classroom"],
];
const kindOf = (name: string): RoomKind | null => KINDS.find(([re]) => re.test(name))?.[1] ?? null;
const heb = (s: string) => /[֐-׿]/.test(s);

/**
 * Room labels of a block: each room-kind name takes the printed "NN מ"ר" written in the same walled room (openings shut), nearest first.
 * The drawing's SHX lettering is in visual order, so a number's digits are reversed ("63" is 36, "761" is 167).
 */
const unreverse = (n: string) => [...n].reverse().join("");
function regionMapOf(walls: ReturnType<typeof readFloor>["walls"], openings: ReturnType<typeof readFloor>["openings"], outline: Outline) {
  const { cols, rows } = walls.mask;
  const m = walls.cm / 100;
  const blocked = { cols, rows, data: new Uint8Array(walls.mask.data) };
  for (const o of openings) for (let y = Math.floor(o.y / m); y <= Math.ceil((o.y + o.h) / m); y++) for (let x = Math.floor(o.x / m); x <= Math.ceil((o.x + o.w) / m); x++) if (x >= 0 && y >= 0 && x < cols && y < rows) blocked.data[y * cols + x] = 1;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!insidePolygon(outline, x * m, y * m)) blocked.data[y * cols + x] = 1;
  const regions = label(blocked, 0);
  return (x: number, y: number): number => {
    const cx = Math.round(x / m), cy = Math.round(y / m);
    for (let r = 0; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const xx = cx + dx, yy = cy + dy;
      if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) continue;
      const id = regions.ids[yy * cols + xx]!;
      if (id && !blocked.data[yy * cols + xx]) return id;
    }
    return 0;
  };
}
function roomLabels(texts: Array<{ x: number; y: number; text: string }>, regionAt: (x: number, y: number) => number): Array<RoomLabel & { printed?: number }> {
  const areas = texts.map((t) => ({ ...t, n: /^(\d{1,3})\s*מ"ר$/.exec(t.text)?.[1], r: 0 })).filter((t) => t.n);
  for (const a of areas) a.r = regionAt(a.x, a.y);
  const names = texts.filter((t) => heb(t.text) && !/מ"ר$/.test(t.text) && !/קיר|מחיצ|ארון|דלת|ח\.ה\.מ|תקן|גבס|פלדה|קרמיקה|הכנה|מערכת|מיכל|ברז|וילון|אסלות|מתקן|לוח|מעקה|יחידת|הצללה|גגון|גג|קו|גבול|חצר|כניסה|מבואת|חנות|פס|סרגל|נגרר|מודעות|נכים|ת"י|כפי/.test(t.text) && kindOf(t.text)).map((t) => ({ ...t, r: regionAt(t.x, t.y) }));
  const pairs: Array<{ i: number; j: number; d: number }> = [];
  names.forEach((t, i) => areas.forEach((a, j) => { const d = Math.hypot(a.x - t.x, a.y - t.y); if (t.r && t.r === a.r && d < 8) pairs.push({ i, j, d }); }));
  pairs.sort((p, q) => p.d - q.d);
  const takenN = new Set<number>(), takenA = new Set<number>(), printed = new Map<number, number>();
  for (const p of pairs) if (!takenN.has(p.i) && !takenA.has(p.j)) { takenN.add(p.i); takenA.add(p.j); printed.set(p.i, Number(unreverse(areas[p.j]!.n!))); }
  // A name with no area of its own beside the same name that has one, in the same room, is that name written twice.
  const keep = names.map((t, i) => !(printed.has(i) === false && names.some((u, j) => j !== i && printed.has(j) && u.text === t.text && u.r === t.r)));
  return names.flatMap((t, i) => (keep[i] ? [{ x: t.x, y: t.y, name: t.text + "#" + i, kind: kindOf(t.text)!, ...(printed.has(i) ? { printed: printed.get(i)! } : {}) }] : []));
}

// ---- Windows from the elevations: every window block the elevation drawing places, mapped onto the outer wall of the plan it stands in.
const chaz = readDxfDrawing(fs.readFileSync(path.join(dir!, "chazitot_seminar volf.dxf")))!;
const chazAll = flattenDxf(chaz);
const chazPieces = chazAll.filter((p) => p.pts && p.pts.length >= 2 && !/DIM|AXES|TEXT|00-text|MIFLAS/.test(p.layer));
const GROUND_Y = 66543038;
const FACADES = [
  { id: "south", he: "דרומית", x: [18473500, 18479000], axis: "x" as const, sign: 1, cam: { dx: 0, dz: 1 } },
  { id: "north", he: "צפונית", x: [18499500, 18504500], axis: "x" as const, sign: -1, cam: { dx: 0, dz: -1 } },
  { id: "east", he: "מזרחית", x: [18461500, 18469000], axis: "z" as const, sign: -1, cam: { dx: 1, dz: 0 } },
  { id: "west", he: "מערבית", x: [18486500, 18495000], axis: "z" as const, sign: 1, cam: { dx: -1, dz: 0 } },
];
/** The body's plan box in metres, from the printed body (cm). */
const BODY_M = { x0: (BODY.x0 - FRAME.x0) / 100, x1: (BODY.x1 - FRAME.x0) / 100, z0: (FRAME.y1 - BODY.y1) / 100, z1: (FRAME.y1 - BODY.y0) / 100 };
function facadeBase(fc: (typeof FACADES)[number]) {
  const [a, b] = fc.x as [number, number];
  let bx0 = 1e18, bx1 = -1e18;
  for (const p of chazPieces) for (let i = 1; i < p.pts!.length; i++) {
    const A = p.pts![i - 1]!, B = p.pts![i]!;
    if (Math.abs(A.y - B.y) < 1 && Math.abs(A.y - (GROUND_Y + 1394)) < 20 && Math.abs(A.x - B.x) > 3000 && A.x > a && B.x < b) { bx0 = Math.min(bx0, A.x, B.x); bx1 = Math.max(bx1, A.x, B.x); }
  }
  const lo = fc.axis === "x" ? BODY_M.x0 : BODY_M.z0, hi = fc.axis === "x" ? BODY_M.x1 : BODY_M.z1;
  return { bx0, bx1, lo, hi, plan: (x: number) => (fc.sign > 0 ? lo + (x - bx0) / 100 : hi - (x - bx0) / 100) };
}
type ElevWindow = { facade: (typeof FACADES)[number]["id"]; axis: "x" | "z"; s0: number; s1: number; v0: number; v1: number };
function elevationWindows(): ElevWindow[] {
  const cache = new Map<string, { x0: number; x1: number; y0: number; y1: number } | null>();
  const local = (name: string) => {
    if (cache.has(name)) return cache.get(name)!;
    const blk = chaz.blocks.get(name);
    let r: { x0: number; x1: number; y0: number; y1: number } | null = null;
    if (blk) {
      for (const q of flattenDxf(chaz, blk.entities)) for (const pt of q.pts ?? []) {
        r = r ? { x0: Math.min(r.x0, pt.x), x1: Math.max(r.x1, pt.x), y0: Math.min(r.y0, pt.y), y1: Math.max(r.y1, pt.y) } : { x0: pt.x, x1: pt.x, y0: pt.y, y1: pt.y };
      }
    }
    cache.set(name, r);
    return r;
  };
  const raw: Array<{ fc: (typeof FACADES)[number]; x0: number; x1: number; y0: number; y1: number }> = [];
  for (const p of chazAll) {
    if (!p.insert || !p.m || !/^(window|door_roshi|door_chazit)/i.test(p.insert)) continue;
    const bb = local(p.insert);
    if (!bb) continue;
    // The insert matrix carries the block's base shift already: the block's own geometry is in block coordinates, base included.
    const base = chaz.blocks.get(p.insert)!.base;
    const corners = [[bb.x0, bb.y0], [bb.x1, bb.y0], [bb.x1, bb.y1], [bb.x0, bb.y1]].map(([x, y]) => apply(p.m!, { x: x!, y: y! }));
    void base;
    const x0 = Math.min(...corners.map((c) => c.x)), x1 = Math.max(...corners.map((c) => c.x));
    const y0 = Math.min(...corners.map((c) => c.y)), y1 = Math.max(...corners.map((c) => c.y));
    const fc = FACADES.find((f) => x0 >= f.x[0]! && x1 <= f.x[1]!);
    if (!fc || y0 < GROUND_Y - 50 || y1 > GROUND_Y + 1400) continue;
    if (x1 - x0 < 30 || y1 - y0 < 30) continue;
    raw.push({ fc, x0, x1, y0, y1 });
  }
  // Panes of one window are separate blocks: merge those that touch along x within a row.
  const out: ElevWindow[] = [];
  for (const fc of FACADES) {
    const base = facadeBase(fc);
    const mine = raw.filter((r) => r.fc === fc).sort((p, q) => p.y0 - q.y0 || p.x0 - q.x0);
    const merged: typeof mine = [];
    for (const r of mine) {
      const t = merged.find((m) => Math.abs(m.y0 - r.y0) < 20 && Math.abs(m.y1 - r.y1) < 20 && r.x0 <= m.x1 + 10 && r.x1 >= m.x0 - 10);
      if (t) { t.x0 = Math.min(t.x0, r.x0); t.x1 = Math.max(t.x1, r.x1); } else merged.push({ ...r });
    }
    for (const m of merged) {
      const u = [base.plan(m.x0), base.plan(m.x1)].sort((p, q) => p - q) as [number, number];
      out.push({ facade: fc.id, axis: fc.axis, s0: u[0], s1: u[1], v0: (m.y0 - GROUND_Y) / 100, v1: (m.y1 - GROUND_Y) / 100 });
    }
  }
  return out;
}
const ELEV = elevationWindows();
fs.writeFileSync(path.join(outDir, "elev-windows.json"), JSON.stringify(ELEV));
/** Elevation linework (mb layer) inside a cell: how much is drawn there. */
function linesInCell(fc: (typeof FACADES)[number], s0: number, s1: number, v0: number, v1: number): number {
  const base = facadeBase(fc);
  const e = [fc.sign > 0 ? base.bx0 + (s0 - base.lo) * 100 : base.bx0 + (base.hi - s1) * 100, fc.sign > 0 ? base.bx0 + (s1 - base.lo) * 100 : base.bx0 + (base.hi - s0) * 100];
  let n = 0;
  for (const p of chazPieces) {
    if (p.layer !== "mb" || !p.pts!.every((q) => q.x >= e[0]! && q.x <= e[1]! && q.y >= GROUND_Y + v0 * 100 && q.y <= GROUND_Y + v1 * 100)) continue;
    n++;
  }
  return n;
}
{
  let added = 0;
  for (const fc of FACADES) {
    const mine = ELEV.filter((w) => w.facade === fc.id);
    for (const w of mine) {
      const floorOf = Math.min(3, Math.floor((w.v0 + 0.01) / H));
      const rel = { sill: w.v0 - floorOf * H, head: Math.min(w.v1, (floorOf + 1) * H) - floorOf * H };
      for (let k = 0; k < 4; k++) {
        if (ELEV.some((q) => q.facade === fc.id && Math.min(q.s1, w.s1) - Math.max(q.s0, w.s0) > 0.5 * (w.s1 - w.s0) && q.v1 > k * H + 0.3 && q.v0 < (k + 1) * H - 0.3)) continue;
        if (linesInCell(fc, w.s0, w.s1, k * H + 0.1, (k + 1) * H - 0.1) < 12) continue;
        ELEV.push({ facade: fc.id, axis: fc.axis, s0: w.s0, s1: w.s1, v0: k * H + rel.sill, v1: k * H + rel.head });
        added++;
      }
    }
  }
  say("  חלונות שהשרטוט מראה בקומות שבהן לא נקראו (אותה רשת חלון): " + added);
}
say("חלונות שנקראו מקובץ החזיתות: " + ELEV.length + " (" + FACADES.map((f) => f.he + " " + ELEV.filter((w) => w.facade === f.id).length).join(", ") + ")");

/** The coordinate of the outline's edge on a window's facade: the south-most (or north-most, east-most, west-most) edge that runs under it. */
function facadeLine(ring: Outline, w: ElevWindow): number | null {
  const horizontal = w.axis === "x";
  let line: number | null = null;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!, [bx2, by] = ring[(i + 1) % ring.length]!;
    if (horizontal ? Math.abs(by - ay) > 0.15 : Math.abs(bx2 - ax) > 0.15) continue;
    const a0 = horizontal ? Math.min(ax, bx2) : Math.min(ay, by), a1 = horizontal ? Math.max(ax, bx2) : Math.max(ay, by);
    if (Math.min(a1, w.s1) - Math.max(a0, w.s0) < 0.4 * (w.s1 - w.s0)) continue;
    const at = horizontal ? (ay + by) / 2 : (ax + bx2) / 2;
    if (line === null || (w.facade === "south" || w.facade === "east" ? at > line : at < line)) line = at;
  }
  return line;
}

/** Cut the elevation's windows into a floor's outer walls: each in the outermost wall of its facade that overlaps it. */
function applyElevationWindows(level: number, r: ReturnType<typeof readFloor>, ring: Outline) {
  let walls = r.walls, openings = r.openings;
  let placed = 0, missed = 0;
  const unwalled: Array<{ w: ElevWindow; sill: number; head: number }> = [];
  for (const w of ELEV) {
    const sill = Math.max(w.v0, level) - level, head = Math.min(w.v1, level + H) - level;
    if (head - sill < 0.3) continue;
    const horizontal = w.axis === "x";
    const orientation = horizontal ? "h" : "v";
    const cands = walls.bands.filter((b) => b.orientation === orientation && Math.min(horizontal ? b.x + b.w : b.y + b.h, w.s1) - Math.max(horizontal ? b.x : b.y, w.s0) >= Math.min(0.3, (w.s1 - w.s0) / 2));
    if (!cands.length) { missed++; unwalled.push({ w, sill, head }); continue; }
    type B = (typeof cands)[number];
    const far = w.facade === "south" ? (b: B) => b.y + b.h : w.facade === "north" ? (b: B) => -b.y : w.facade === "east" ? (b: B) => b.x + b.w : (b: B) => -b.x;
    const band = cands.reduce((best, b) => (far(b) > far(best) ? b : best));
    // The wall must be the facade's own: a band more than 1.2 m inside the outline is some inner wall, and the facade there is open (a passage).
    const fl = facadeLine(ring, w);
    const outer = w.facade === "south" ? band.y + band.h : w.facade === "north" ? band.y : w.facade === "east" ? band.x + band.w : band.x;
    if (fl !== null && Math.abs(outer - fl) > 1.2) { missed++; unwalled.push({ w, sill, head }); continue; }
    const drawn = horizontal ? { x: w.s0, y: band.y, w: w.s1 - w.s0, h: band.h, runs: "x" as const } : { x: band.x, y: w.s0, w: band.w, h: w.s1 - w.s0, runs: "y" as const };
    const fit = fitDrawnWindows(walls, openings, [drawn], r.footprintExt);
    walls = fit.walls;
    openings = fit.openings;
    const last = openings[openings.length - 1];
    if (last && last.kind === "window") { last.sill = sill; last.head = head; if (sill < 0.2) last.full = true; placed++; } else missed++;
  }
  return { walls, openings, placed, missed, unwalled };
}

// ---- The curved facade at the south-east corner. The drawing builds it on one circle (centre 55.9, 43.1): on the ground and first floors a glazed wall on r 18.2 (a stone part from (40.5, 52.6) to (42.7, 55.6), glass on to (49.8, 60.4));
// on the second and third floors the slab edge is the "mabat" arc r 19.2 from (41.7, 56.1) to (49.8, 61.3), with two windows 42.9–45.6 and 47.0–49.8 on the second floor (the south elevation) and glazing on the third.
const CIRC = { x: 55.9, z: 43.1 };
const angOf = (x: number, z: number) => Math.atan2(z - CIRC.z, x - CIRC.x);
const arcPt = (r: number, a: number): [number, number] => [CIRC.x + r * Math.cos(a), CIRC.z + r * Math.sin(a)];
const arcRing = (r: number, from: [number, number], to: [number, number], per = 1.0): Array<[number, number]> => {
  const a0 = angOf(from[0], from[1]), a1 = angOf(to[0], to[1]);
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / per));
  return Array.from({ length: n + 1 }, (_, i) => arcPt(r, a0 + ((a1 - a0) * i) / n));
};
type Piece = { t0: number; t1: number; y0: number; y1: number; material: "stone" | "glass" | "frame" | "plaster" | "screen"; thick: number };
/** A straight facet from P to Q, wall pieces along it (t is the share of its length). */
function facetPieces(P: [number, number], Q: [number, number], level: number, pieces: Piece[], tag: string): Primitive[] {
  const out: Primitive[] = [];
  const len = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
  const ang = Math.atan2(Q[1] - P[1], Q[0] - P[0]);
  for (const pc of pieces) {
    const l = (pc.t1 - pc.t0) * len;
    if (l < 0.01 || pc.y1 - pc.y0 < 0.005) continue;
    const tm = (pc.t0 + pc.t1) / 2;
    out.push({ type: "box", centre: { x: P[0] + (Q[0] - P[0]) * tm, y: level + (pc.y0 + pc.y1) / 2, z: P[1] + (Q[1] - P[1]) * tm }, size: { x: l, y: pc.y1 - pc.y0, z: pc.thick }, rotY: -ang, material: pc.material, tag });
  }
  return out;
}
/** The curved wall along `ring`: solid, or with window openings given by plan x (sill, head above the floor), or glazed between a base and a header. */
function curvedWall(ring: Array<[number, number]>, level: number, tag: string, mode: "stone" | "windows" | "glass", windows: Array<[number, number]> = [], opts: { sill?: number; head?: number; bars?: boolean; lintel?: [number, number]; spandrel?: number } = {}): Primitive[] {
  const out: Primitive[] = [];
  for (let i = 1; i < ring.length; i++) {
    const P = ring[i - 1]!, Q = ring[i]!;
    const tOfX = (x: number) => (Math.abs(Q[0] - P[0]) < 1e-6 ? 0 : (x - P[0]) / (Q[0] - P[0]));
    let pieces: Piece[] = [];
    if (mode === "stone") pieces = [{ t0: 0, t1: 1, y0: 0, y1: H, material: "stone", thick: 0.3 }];
    else if (mode === "glass") {
      pieces = [
        { t0: 0, t1: 1, y0: 0, y1: 0.7, material: "stone", thick: 0.3 },
        { t0: 0, t1: 1, y0: H - 0.35, y1: H, material: "stone", thick: 0.3 },
        { t0: 0, t1: 1, y0: 0.7, y1: H - 0.35, material: "glass", thick: 0.05 },
        { t0: 0, t1: 1, y0: 0.7, y1: 0.76, material: "frame", thick: 0.09 },
        { t0: 0, t1: 1, y0: H - 0.41, y1: H - 0.35, material: "frame", thick: 0.09 },
      ];
    } else {
      const SILL = opts.sill ?? 1.0, HEAD = opts.head ?? 2.6;
      const facetLen = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
      const ops = windows.map(([xa, xb]) => [Math.max(0, Math.min(tOfX(xa), tOfX(xb))), Math.min(1, Math.max(tOfX(xa), tOfX(xb)))] as const).filter(([a, b]) => b - a > 0.02).sort((a, b) => a[0] - b[0]);
      let t = 0;
      for (const [a, b] of ops) {
        if (a > t) pieces.push({ t0: t, t1: a, y0: 0, y1: H, material: "stone", thick: 0.3 });
        pieces.push({ t0: a, t1: b, y0: 0, y1: SILL, material: "stone", thick: 0.3 });
        pieces.push({ t0: a, t1: b, y0: HEAD, y1: H, material: "stone", thick: 0.3 });
        pieces.push({ t0: a, t1: b, y0: SILL, y1: HEAD, material: "glass", thick: 0.05 });
        pieces.push({ t0: a, t1: b, y0: SILL, y1: SILL + 0.06, material: "frame", thick: 0.1 });
        pieces.push({ t0: a, t1: b, y0: HEAD - 0.06, y1: HEAD, material: "frame", thick: 0.1 });
        pieces.push({ t0: a, t1: a + 0.02, y0: SILL, y1: HEAD, material: "frame", thick: 0.1 });
        pieces.push({ t0: b - 0.02, t1: b, y0: SILL, y1: HEAD, material: "frame", thick: 0.1 });
        // The vertical green security bars the site photos show on the ribbon windows: every 14 cm, in front of the glass.
        if (opts.bars) for (let u = a * facetLen + 0.1; u < b * facetLen - 0.05; u += 0.14) pieces.push({ t0: u / facetLen, t1: (u + 0.025) / facetLen, y0: SILL, y1: HEAD, material: "frame", thick: 0.07 });
        t = Math.max(t, b);
      }
      if (t < 1) pieces.push({ t0: t, t1: 1, y0: 0, y1: H, material: "stone", thick: 0.3 });
      // The elevation's lintel band over a ribbon window: 10 cm high, 0.3 m longer than the window at each end (plan x), proud of the wall.
      if (opts.lintel) {
        const la = Math.max(0, Math.min(tOfX(opts.lintel[0]), tOfX(opts.lintel[1]))), lb = Math.min(1, Math.max(tOfX(opts.lintel[0]), tOfX(opts.lintel[1])));
        if (lb - la > 0.01) pieces.push({ t0: la, t1: lb, y0: HEAD, y1: HEAD + 0.1, material: "stone", thick: 0.4 });
      }
    }
    out.push(...facetPieces(P, Q, level, pieces, tag));
    // A post at every joint of a glazed wall, as tall as its glass (not down over the stone base or up over the header).
    if (mode === "glass") out.push({ type: "box", centre: { x: Q[0], y: level + (0.7 + H - 0.35) / 2, z: Q[1] }, size: { x: 0.08, y: H - 1.05, z: 0.08 }, material: "frame", tag });
  }
  return out;
}
const CURVE_LOWER: Array<[number, number]> = arcRing(18.2, [40.5, 52.6], [49.8, 60.4], 0.8);
const CURVE_SOLID: Array<[number, number]> = arcRing(18.2, [40.5, 52.6], [42.7, 55.6], 0.8);
const CURVE_GLASS: Array<[number, number]> = arcRing(18.2, [42.7, 55.6], [49.8, 60.4], 0.9);
// The upper arc starts where its circle meets the straight facade (z 53.94): from (39.56, 53.18) it began behind the facade and its first facet stood out of the wall as a step.
const CURVE_UPPER: Array<[number, number]> = arcRing(19.2, [40.05, 53.94], [49.8, 61.3], 0.9);
// From where the arcs end the facade runs straight east to the east wall (x 51.6): the entrance bay.
const BAY_LO: Array<[number, number]> = [[49.8, 60.4], [51.6, 60.88]];
const BAY_LO0: Array<[number, number]> = [[49.8, 60.4], [51.6, 59.75]];
const BAY_UP: Array<[number, number]> = [[49.8, 61.3], [51.6, 61.42]];
// The upper floors' arc WALL, as the sheets draw it: the double wall line of floors 2 and 3 lies at r 18.05–18.3 (measured on the DXF segments, like the lower floors'), from (40.45, 52.58) to the bay. The r 19.2 arc is the floor slab's projecting edge (a 1 m canopy, like the shading frames on the wings), not the wall.
const WING_RETURN: Array<[number, number]> = [[40.45, 52.58], [40.1, 53.0], [39.8, 53.5], [39.5, 53.92]];
const CURVE_WALL: Array<[number, number]> = arcRing(18.25, [40.45, 52.58], [49.8, 60.4], 0.8);
// The slab edge ("mabat" layer) runs from (41.7, 56.1) to (49.8, 61.3) on r 19.2: the floor slab fills to the wall (r 18.25) up to that angle, then steps out to the projecting edge.
const LEDGE_A0 = angOf(41.7, 56.1);
const CURVE_LEDGE = arcRing(19.2, [41.7, 56.1], [49.8, 61.3], 0.9);
const CURVE_UPPER_INNER: Array<[number, number]> = arcRing(15.0, [39.56, 53.18], [49.8, 61.3], 0.9);
const SLAB_BAND: Array<[number, number]> = [...CURVE_WALL.filter((q) => angOf(q[0], q[1]) >= LEDGE_A0 - 1e-6), ...CURVE_LEDGE, ...[...CURVE_UPPER_INNER].reverse()];
/**
 * The roof fence as the confirmed Gemini view draws it (gemini-v4/ext-3): dark horizontal rails between limestone piers, a lantern on every pier.
 * Piers every corner and in equal bays of 5–7 m. The pier and its cap sit wholly inside the roof edge — a 40 cm cap on a 17 cm inset stuck out past the facade.
 * `inside` says which side of an edge is the roof.
 */
function slatScreen(edges: Array<[[number, number], [number, number]]>, y0: number, y1: number, tag: string, inside: (x: number, z: number) => boolean): Primitive[] {
  const SET = 0.24;
  type Pier = { x: number; z: number; ox: number; oz: number; corner: boolean };
  const piers: Pier[] = [];
  const slats: Primitive[] = [];
  // Runs: consecutive edges with no corner (a turn of 20° or more) and no gap between them.
  const runs: Array<Array<[[number, number], [number, number]]>> = [];
  let prev: [[number, number], [number, number]] | null = null;
  for (const e of edges) {
    if (Math.hypot(e[1][0] - e[0][0], e[1][1] - e[0][1]) < 0.05) continue;
    const joined = prev !== null && Math.hypot(e[0][0] - prev[1][0], e[0][1] - prev[1][1]) < 0.05;
    const turn = prev === null ? Infinity : Math.abs(Math.atan2(Math.sin(Math.atan2(e[1][1] - e[0][1], e[1][0] - e[0][0]) - Math.atan2(prev[1][1] - prev[0][1], prev[1][0] - prev[0][0])), Math.cos(Math.atan2(e[1][1] - e[0][1], e[1][0] - e[0][0]) - Math.atan2(prev[1][1] - prev[0][1], prev[1][0] - prev[0][0]))));
    if (!joined || turn > 0.35) runs.push([]);
    runs[runs.length - 1]!.push(e);
    prev = e;
  }
  // A closed ring's first and last runs are one run when no corner lies between them.
  const normalOf = (P: [number, number], Q: [number, number]): [number, number] => {
    const len = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
    let nx = (Q[1] - P[1]) / len, nz = -(Q[0] - P[0]) / len;
    const mx = (P[0] + Q[0]) / 2, mz = (P[1] + Q[1]) / 2;
    if (!inside(mx + nx * 0.5, mz + nz * 0.5)) { nx = -nx; nz = -nz; }
    return [nx, nz];
  };
  for (const run of runs) {
    const lens = run.map(([P, Q]) => Math.hypot(Q[0] - P[0], Q[1] - P[1]));
    const total = lens.reduce((a, b) => a + b, 0);
    // Bays of 5–7 m, equal: as few as keep each under 7 m, and not under 5 m unless the run itself is shorter.
    let n = Math.max(1, Math.ceil(total / 7));
    if (n > 1 && total / n < 5) n -= 1;
    const at = (d: number) => {
      let acc = 0;
      for (let i = 0; i < run.length; i++) {
        if (d <= acc + lens[i]! + 1e-9 || i === run.length - 1) {
          const t = Math.max(0, Math.min(1, (d - acc) / lens[i]!));
          const [P, Q] = run[i]!;
          const [nx, nz] = normalOf(P, Q);
          return { x: P[0] + (Q[0] - P[0]) * t, z: P[1] + (Q[1] - P[1]) * t, nx, nz };
        }
        acc += lens[i]!;
      }
      throw new Error("unreachable");
    };
    for (let k = 0; k <= n; k++) {
      const q = at((total * k) / n);
      piers.push({ x: q.x, z: q.z, ox: q.nx * SET, oz: q.nz * SET, corner: k === 0 || k === n });
    }
    // Horizontal rails in each bay, inset with the piers, stopped short of them so a rail does not run through a pier.
    const barH = 0.04;
    const pitch = 0.11;
    for (let k = 0; k < n; k++) {
      const d0 = (total * k) / n;
      const d1 = (total * (k + 1)) / n;
      let acc = 0;
      for (let i = 0; i < run.length; i++) {
        const len = lens[i]!;
        const seg0 = acc;
        acc += len;
        const a = Math.max(d0, seg0);
        const b = Math.min(d1, acc);
        if (b - a < 0.35) continue;
        const [P, Q] = run[i]!;
        const [nx, nz] = normalOf(P, Q);
        const point = (d: number): [number, number] => {
          const t = (d - seg0) / len;
          return [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t];
        };
        const A = point(a + 0.18);
        const B = point(b - 0.18);
        const span = Math.hypot(B[0] - A[0], B[1] - A[1]);
        if (span < 0.25) continue;
        const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
        for (let y = y0 + 0.08; y <= y1 - 0.08 - barH; y += pitch) {
          slats.push({
            type: "box",
            centre: { x: (A[0] + B[0]) / 2 + nx * SET, y: y + barH / 2, z: (A[1] + B[1]) / 2 + nz * SET },
            size: { x: span, y: barH, z: 0.045 },
            rotY: -ang,
            material: "screen",
            tag,
          });
        }
      }
    }
  }
  // A corner's two runs meet in one pier: the offsets add (it moves in along both walls); a pier within 2 m of a kept one is dropped.
  const kept: Pier[] = [];
  for (const q of piers) {
    const same = kept.find((k) => Math.hypot(k.x - q.x, k.z - q.z) < 0.3);
    if (same) { same.ox += q.ox; same.oz += q.oz; same.corner = same.corner || q.corner; continue; }
    kept.push({ ...q });
  }
  // Corners are the measure: a pier within 2 m of a corner (or a later corner within 2 m of an earlier one) is dropped.
  const final = kept.filter((q, i) => !kept.some((k, j) => j !== i && k.corner && Math.hypot(k.x - q.x, k.z - q.z) < 2.0 && (!q.corner || j < i)));
  const out: Primitive[] = slats.filter((q) => q.type === "box" && !final.some((pp) => Math.abs(q.centre.x - (pp.x + pp.ox)) < 0.22 && Math.abs(q.centre.z - (pp.z + pp.oz)) < 0.22));
  for (const pp of final) {
    const x = pp.x + pp.ox, z = pp.z + pp.oz;
    out.push({ type: "box", centre: { x, y: (y0 + y1) / 2 + 0.02, z }, size: { x: 0.3, y: y1 - y0 + 0.04, z: 0.3 }, material: "stone", tag });
    out.push({ type: "box", centre: { x, y: y1 + 0.05, z }, size: { x: 0.3, y: 0.06, z: 0.3 }, material: "stone", tag });
    out.push({ type: "box", centre: { x, y: y1 + 0.08 + 0.11, z }, size: { x: 0.16, y: 0.22, z: 0.16 }, material: "lightPanel", tag: "roof:lamp:lens" });
    out.push({ type: "box", centre: { x, y: y1 + 0.08 + 0.24, z }, size: { x: 0.22, y: 0.05, z: 0.22 }, material: "darkSteel", tag: "roof:lamp" });
  }
  return out;
}

// ---- The main stair (the only one the sheets draw, 00-madregot layer): a U stair, flight A x 37.8–39.4 and flight B x 39.5–41.1, tread lines every 0.29 m from z 39.82 north to 36.92, a landing z 35.3–36.9.
const STAIR = { xa: [37.8, 39.4] as [number, number], xb: [39.5, 41.1] as [number, number], zBottom: 39.82, zTop: 36.92, zLand: [35.35, 36.92] as [number, number], steps: 10 };
const STAIR_HOLE: Array<[number, number]> = [[37.8, 35.35], [41.1, 35.35], [41.1, 39.8], [37.8, 39.8]];
function stairPrims(level: number, tag: string): Primitive[] {
  const out: Primitive[] = [];
  const R = (H / 2) / (STAIR.steps + 1);
  const depth = (STAIR.zBottom - STAIR.zTop) / STAIR.steps;
  const box = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, material: "concrete" | "metal" | "glass") => {
    if (y1 - y0 < 0.01) return;
    out.push({ type: "box", centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 }, size: { x: x1 - x0, y: y1 - y0, z: z1 - z0 }, material, tag });
  };
  // Flight A rises north from z 39.82; the landing; flight B comes back south to the next floor.
  for (let k = 1; k <= STAIR.steps; k++) {
    const zFar = STAIR.zBottom - (k - 1) * depth, zNear = STAIR.zBottom - k * depth;
    box(STAIR.xa[0], STAIR.xa[1], zNear, zFar, level + 0.0, level + k * R, "concrete");
  }
  box(STAIR.xa[0], STAIR.xb[1], STAIR.zLand[0], STAIR.zLand[1] + 0.0, level + 1.0, level + (STAIR.steps + 1) * R, "concrete");
  for (let k = 1; k <= STAIR.steps; k++) {
    const zNear = STAIR.zTop + (k - 1) * depth, zFar = STAIR.zTop + k * depth;
    box(STAIR.xb[0], STAIR.xb[1], zNear, zFar, level + (STAIR.steps + 1) * R + (k - 1) * R + 0.0, level + (STAIR.steps + 1) * R + k * R, "concrete");
  }
  // Handrail on the open side of each flight (the stairwell's middle), a glass balustrade over a metal rail.
  for (const [zA, zB, base] of [[STAIR.zTop, STAIR.zBottom, level], [STAIR.zTop, STAIR.zBottom, level + H / 2]] as const) {
    out.push({ type: "box", centre: { x: 39.45, y: base + 1.05 + 0.5, z: (zA + zB) / 2 }, size: { x: 0.04, y: 0.04, z: zB - zA }, material: "metal", tag });
    out.push({ type: "box", centre: { x: 39.45, y: base + 0.9 + 0.5, z: (zA + zB) / 2 }, size: { x: 0.02, y: 0.9, z: zB - zA }, material: "glass", tag });
  }
  return out;
}

const prims: Primitive[] = [];
const read: Record<string, ReturnType<typeof readFloor>> = {};
const blockList: Record<string, ReturnType<typeof blocks>> = {};
const roomRows: string[] = [];
type PlanOut = { diag?: Array<[number, number, number, number]>; polys?: Array<Array<[number, number]>>; level: number; outlines: Array<Array<[number, number]>>; rooms: Array<Record<string, unknown>>; walls: Array<Record<string, unknown>>; openings: Array<Record<string, unknown>>; items: Array<Record<string, unknown>> };
const plansOut: Record<string, PlanOut> = {};
const roomsOut: Array<{ floor: string; level: number; name: string; kind: string; printed: number | null; areaM2: number; x: number; y: number; bounds: { x: number; y: number; w: number; h: number } }> = [];
say("# וולף — מודל מה-DXF\n");
for (const f of FLOORS) {
  const r = (read[f.id] = readFloor(f.file));
  if (process.env.PROBE && (f.id === "floor-0" || f.id === "floor-2")) for (const q of r.walls.bands) if (q.orientation === "v" && q.x < 40 && ((q.y + q.h > 18 && q.y < 28) || (q.y + q.h > 46 && q.y < 56))) say("  PROBE " + f.id + " v-band x " + q.x.toFixed(2) + ".." + (q.x + q.w).toFixed(2) + " z " + q.y.toFixed(2) + ".." + (q.y + q.h).toFixed(2));
  const fitted = applyElevationWindows(f.level, r, blocks(r.footprint)[0]!.outline);
  r.walls = fitted.walls;
  r.openings = fitted.openings;
  const bl = (blockList[f.id] = blocks(r.footprint));
  // A window or door the elevation draws where the plan has no wall (the open passage through the ground floor): glazed in the line of the facade there.
  for (const u of fitted.unwalled) {
    const ring = bl[0]!.outline;
    const horizontal = u.w.axis === "x";
    // Only the ground-floor doors of the south and north faces: the east and west glazing is built from its own window lines.
    if (!horizontal || u.sill > 0.6) continue;
    const line = facadeLine(ring, u.w);
    if (line === null) continue;
    const len = u.w.s1 - u.w.s0, mid = (u.w.s0 + u.w.s1) / 2, h = u.head - u.sill, yc = f.level + u.sill + h / 2;
    const box = (cu: number, lu: number, y: number, hh: number, depth: number, material: "glass" | "frame") => prims.push({ type: "box", centre: horizontal ? { x: cu, y, z: line! } : { x: line!, y, z: cu }, size: horizontal ? { x: lu, y: hh, z: depth } : { x: depth, y: hh, z: lu }, material, tag: `${f.id}:glazing` });
    box(mid, len, yc, h, 0.05, "glass");
    box(mid, len + 0.1, f.level + u.head, 0.08, 0.1, "frame");
    box(mid, len + 0.1, f.level + u.sill, 0.08, 0.1, "frame");
    const n = Math.max(1, Math.round(len / 1.1));
    for (let i = 0; i <= n; i++) box(u.w.s0 + (len * i) / n, 0.07, yc, h, 0.1, "frame");
    say(`  זיגוג ללא קיר בתוכנית: ${u.w.facade} ${u.w.s0.toFixed(1)}–${u.w.s1.toFixed(1)} מ', גובה ${u.sill.toFixed(1)}–${u.head.toFixed(1)}`);
  }
  if (process.env.DBG2 && f.id === "floor-0") {
    for (const [ax, ay, bx2, by] of r.winSegs) if (Math.min(ax, bx2) > 17 && Math.max(ax, bx2) < 22 && Math.min(ay, by) > 19 && Math.max(ay, by) < 26) say("  WINSEG " + [ax, ay, bx2, by].map((v) => v.toFixed(2)).join(" "));
    for (const o of r.openings) if (o.x < 22 && o.x + o.w > 17 && o.y < 26 && o.y + o.h > 19) say("  OPEN " + o.kind + " ext " + o.exterior + " door " + !!o.door + " " + [o.x, o.y, o.w, o.h].map((v) => v.toFixed(2)).join(" "));
    for (const q of r.walls.bands) if (q.x < 22 && q.x + q.w > 17 && q.y < 26 && q.y + q.h > 19) say("  BAND " + q.orientation + " " + [q.x, q.y, q.w, q.h].map((v) => v.toFixed(2)).join(" "));
  }
  if (process.env.DBG && f.id === "floor-0") for (const o of r.openings.filter((q) => q.kind === "doorway" && q.exterior)) say("  DOORWAY " + o.orientation + " x " + o.x.toFixed(2) + " y " + o.y.toFixed(2) + " w " + o.w.toFixed(2) + " h " + o.h.toFixed(2) + " door " + !!o.door);
  say("  חלונות מהחזיתות: " + fitted.placed + " נחתכו, " + fitted.missed + " בלי קיר");
  say(`${f.id} ${f.he}: ${r.walls.bands.length} פסי קיר, ${r.openings.length} פתחים (${r.openings.filter((o) => o.exterior).length} חיצוניים), ${bl.length} גושים: ${bl.map((b) => b.areaM2.toFixed(0) + ' מ"ר').join(", ")}`);
  let shade = 0;
  for (const b of bl) {
    const spec = { id: f.id, level: f.level, height: H, outline: b.outline, window: WINDOW, facade: "stone" as const, interior: "plaster" as const };
    // The two arcs of the curved wall's stone start are read as one solid 2 × 2.5 m block jutting out of it: dropped, the curved wall is built from the arcs.
    const w = { ...r.walls, bands: r.walls.bands.filter((q) => b.hasWide(q.x + q.w / 2, q.y + q.h / 2) && !(q.x + q.w / 2 > 40.3 && q.x + q.w / 2 < 43.0 && q.y + q.h / 2 > 52.8 && q.y + q.h / 2 < 56.0 && q.w > 1.2 && q.h > 1.2)) };
    const o = r.openings.filter((op) => b.hasWide(op.x + op.w / 2, op.y + op.h / 2));
    prims.push(...floorPrimitives(w, o, spec));
    // Where the wing's south face meets the lobby's arc the sheets draw the wall flaring out from the arc's start (40.45, 52.58) to the wing's face end (39.5, 53.9): a stone return on every floor, so no white lining or gap shows between the wing and the arc.
    prims.push(...curvedWall(WING_RETURN, f.level, `${f.id}:curved`, "stone"));
    if (f.id === "floor-0" || f.id === "floor-1") {
      // As the architect's elevation draws it and the site photos show it: a smooth stone wall with one ribbon window under the slab (the elevation DXF: plan x 42.6–49.8, sill 1.6, head 2.6 above each floor, a lintel band over it 42.3–50.1), vertical green bars over the glass.
      prims.push(...curvedWall(CURVE_LOWER, f.level, `${f.id}:curved`, "windows", [[42.6, 49.8]], { sill: 1.6, head: 2.6, bars: true, lintel: [42.3, 50.1] }));
      // The "mabat" layer of the ground and first-floor sheets draws the r 19.2 arc too (the slab edge of the floor above, projecting 1 m past the wall): the first floor's slab (+3.36) projects like the second's and third's.
      if (f.id === "floor-1") {
        prims.push(slab(SLAB_BAND, f.level + 0 - 0.02 - 0.0, 0.3, "stone", `${f.id}:slab`));
      }
      if (f.id === "floor-0") {
        // The ground floor's sheet draws no wall between the arc's end (49.8, 60.4) and the east glazing's end (51.6, 59.75), and its floor stops at z ~59.8: the sheet draws no wall there and the elevation no window: it is closed in stone on the straight line between the two drawn ends, with the floor out to it (floor 1's own line, further out, is an overhang's).
        prims.push(...curvedWall(BAY_LO0, f.level, `${f.id}:curved`, "stone"));
        const entry: Array<[number, number]> = [[49.5, 59.9], [51.7, 59.7], [51.7, 59.76], [51.6, 59.75], [49.8, 60.4], [49.5, 60.4]];
        prims.push(slab(entry, f.level - 0.02, 0.3, "stone", `${f.id}:slab`));
        prims.push(slab(entry, f.level, 0.02, "floorStone", `${f.id}:floor`));
      } else prims.push(...curvedWall(BAY_LO, f.level, `${f.id}:curved`, "stone"));
      (((plansOut[f.id] ??= { level: f.level, outlines: [], rooms: [], walls: [], openings: [], items: [] }).polys ??= [])).push([...CURVE_GLASS, ...BAY_LO.slice(1)]);
    } else if (f.id === "floor-2" || f.id === "floor-3") {
      // The slab runs out to the arc, and the curved wall stands on its edge.
      const band = SLAB_BAND;
      prims.push(slab(band, f.level - 0.02, 0.3, "stone", `${f.id}:slab`));
      prims.push(slab(band, f.level, 0.02, "floorStone", `${f.id}:floor`));
      prims.push(...curvedWall(CURVE_WALL, f.level, `${f.id}:curved`, "windows", f.id === "floor-2" ? [[42.9, 45.65], [47.05, 49.8]] : [[42.6, 49.8]], f.id === "floor-2" ? { sill: 1.0, head: 2.6, lintel: [42.3, 50.1] } : { sill: 1.6, head: 2.6, lintel: [42.3, 50.1] }));
      // The sheets draw a WALL (a double line) between the arc's end and the east wall on floors 1–3, and the elevation draws no window there: stone.
      prims.push(...curvedWall(BAY_LO, f.level, `${f.id}:curved`, "stone"));
      // The east wall the plan reads stops at z 60.98 and the bay wall starts at 61.2: a 0.25 m slot to the inside at the corner. A stone corner post closes it.
      prims.push({ type: "box", centre: { x: 51.55, y: f.level + H / 2, z: 60.95 }, size: { x: 0.36, y: H, z: 0.5 }, material: "stone", tag: `${f.id}:curved` });
      (((plansOut[f.id] ??= { level: f.level, outlines: [], rooms: [], walls: [], openings: [], items: [] }).polys ??= [])).push([...CURVE_WALL, ...BAY_LO.slice(1)]);
    }
    const holes = f.id === "floor-0" ? undefined : [STAIR_HOLE];
    // The slanted and curved partitions, one thin wall to each drawn face, the full height.
    {
      const mine = r.diagWalls.filter(([ax, az, bx2, bz]) => b.hasWide((ax + bx2) / 2, (az + bz) / 2));
      for (const [ax, az, bx2, bz] of mine) {
        const len = Math.hypot(bx2 - ax, bz - az), ang = Math.atan2(bz - az, bx2 - ax);
        prims.push({ type: "box", centre: { x: (ax + bx2) / 2, y: f.level + H / 2, z: (az + bz) / 2 }, size: { x: len + 0.05, y: H, z: 0.12 }, rotY: -ang, material: "plaster", tag: `${f.id}:diagwall` });
      }
      ((plansOut[f.id] ??= { level: f.level, outlines: [], rooms: [], walls: [], openings: [], items: [] }).diag ??= []).push(...mine.map(([a1, a2, a3, a4]) => [Number(a1.toFixed(2)), Number(a2.toFixed(2)), Number(a3.toFixed(2)), Number(a4.toFixed(2))] as [number, number, number, number]));
      if (mine.length) say(`  קירות באלכסון או מעוגלים (פנים): ${mine.length} קטעים`);
    }
    prims.push(slab(b.outline, f.level - 0.02, 0.3, "stone", `${f.id}:slab`, holes));
    prims.push(slab(b.outline, f.level, 0.02, "floorStone", `${f.id}:floor`, holes));
    // The stair from this floor up to the next (three flights: ground → 1 → 2 → 3), and the one from the top floor to the roof.
    prims.push(...stairPrims(f.level, `${f.id}:stair`));
    ((plansOut[f.id] ??= { level: f.level, outlines: [], rooms: [], walls: [], openings: [], items: [] }).items).push({ kind: "stairs", x: 39.45, y: 38.6, lu: 3.3, lv: 4.5, angle: 0 });
    const mine = roomLabels(r.texts.filter((t) => b.has(t.x, t.y)), regionMapOf(w, o, b.outline));
    if (mine.length) {
      const rooms = readPlanRooms(w, o, b.outline, mine);
      const snapOf = (v: number) => Math.round(v / 0.02) * 0.02;
      // Chairs the sheet draws in the hall stand along its glass wall with no facing: each is turned to face into the hall, away from the nearest wall.
      const hallRooms = rooms.filter((room) => room.kind === "hall");
      const freeRun = (room: (typeof rooms)[number], x: number, y: number, dx: number, dz: number) => { let t = 0; while (t < 12 && inRoom(room, snapOf(x + dx * (t + 0.1)), snapOf(y + dz * (t + 0.1)))) t += 0.1; return t; };
      const turned = r.items.map((it) => {
        const room = hallRooms.find((hr) => inRoom(hr, snapOf(it.x), snapOf(it.y)));
        if (!room || Math.max(it.length, it.width) > 0.9) return it;
        const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const best = dirs.map(([dx, dz]) => ({ dx, dz, score: freeRun(room, it.x, it.y, dx, dz) - freeRun(room, it.x, it.y, -dx, -dz) })).sort((a, b) => b.score - a.score)[0]!;
        // furnish.ts builds a chair with its back on the piece's +v side, so it faces (sin a, -cos a).
        return { ...it, angle: Math.atan2(best.dx, -best.dz) };
      });
      const given = new Map<(typeof rooms)[number], ReturnType<typeof furnishRoom>>();
      for (const room of rooms) {
        const placed = furnishRoom(room, room.name.replace(/#\d+$/, ""), o);
        if (placed.length >= 2) given.set(room, placed);
      }
      const ownRooms = rooms.filter((room) => !given.has(room));
      prims.push(...furnishFloor(rooms, turned.filter((it) => b.has(it.x, it.y) && !(rooms.some((room) => given.has(room) && inRoom(room, snapOf(it.x), snapOf(it.y))))), { level: f.level, tag: `${f.id}:inside`, ceilingM: 3.0, ownFloor: [] }));
      void ownRooms;
      // What each room holds: the plan's own pieces where it draws them, ours where the sheet leaves the room bare.
      const plan = (plansOut[f.id] ??= { level: f.level, outlines: [], rooms: [], walls: [], openings: [], items: [] });
      plan.outlines.push(b.outline.map(([x, y]) => [Number(x.toFixed(2)), Number(y.toFixed(2))] as [number, number]));
      plan.walls.push(...w.bands.map((q) => ({ o: q.orientation, x: Number(q.x.toFixed(2)), y: Number(q.y.toFixed(2)), w: Number(q.w.toFixed(2)), h: Number(q.h.toFixed(2)) })));
      plan.openings.push(...o.map((q) => ({ o: q.orientation, x: Number(q.x.toFixed(2)), y: Number(q.y.toFixed(2)), w: Number(q.w.toFixed(2)), h: Number(q.h.toFixed(2)), kind: q.kind, exterior: q.exterior, door: !!q.door, full: !!q.full })));
      const realHere = r.items.filter((it) => b.has(it.x, it.y));
      for (const room of rooms) {
        const rname = room.name.replace(/#\d+$/, "");
        const lab = mine.find((l) => l.name === room.name)!;
        const real = realHere.filter((it) => inRoom(room, Math.round(it.x / 0.02) * 0.02, Math.round(it.y / 0.02) * 0.02));
        plan.rooms.push({ name: rname, kind: room.kind, printed: lab.printed ?? null, areaM2: Number(room.areaM2.toFixed(1)), x: Number(lab.x.toFixed(2)), y: Number(lab.y.toFixed(2)), rects: roomRects(room, 0.1).map((q) => ({ x: Number(q.x.toFixed(2)), y: Number(q.y.toFixed(2)), w: Number(q.w.toFixed(2)), h: Number(q.h.toFixed(2)) })), real: real.length });
        const placed = given.get(room);
        if (!placed) {
          for (const it of real) plan.items.push({ kind: "real", x: Number(it.x.toFixed(2)), y: Number(it.y.toFixed(2)), lu: Number(it.length.toFixed(2)), lv: Number(it.width.toFixed(2)), angle: Number(it.angle.toFixed(3)) });
          continue;
        }
        for (const fu of placed) {
          prims.push(...furnPrimitives(fu, f.level, `${f.id}:inside:furniture`));
          plan.items.push({ kind: fu.kind, x: Number(fu.x.toFixed(2)), y: Number(fu.y.toFixed(2)), lu: Number(fu.lu.toFixed(2)), lv: Number(fu.lv.toFixed(2)), angle: Number(fu.angle.toFixed(3)) });
        }
      }
      for (const room of rooms) {
        const lab = mine.find((l) => l.name === room.name)!;
        roomsOut.push({ floor: f.id, level: f.level, name: room.name.replace(/#\d+$/, ""), kind: room.kind, printed: lab.printed ?? null, areaM2: Number(room.areaM2.toFixed(1)), x: lab.x, y: lab.y, bounds: room.bounds });
        if (process.env.DIAG && lab.printed && Math.abs(room.areaM2 - lab.printed) / lab.printed > 0.15) say("  DIAG " + f.id + " " + room.name.replace(/#\d+$/, "") + " printed " + lab.printed + " have " + room.areaM2.toFixed(1) + " region " + room.region + " sameRegionNames " + rooms.filter((q) => q.region === room.region).map((q) => q.name.replace(/#\d+$/, "") + ":" + q.areaM2.toFixed(0)).join("|") + " at " + lab.x.toFixed(1) + "," + lab.y.toFixed(1));
        roomRows.push(`| ${f.id} | ${room.name.replace(/#\d+$/, "")} | ${room.kind} | ${lab.printed ?? "–"} | ${room.areaM2.toFixed(1)} |`);
      }
    }
  }
  // Glazing the sheet draws with no wall under it (a glass link between wings): a WIN line with no wall band within 0.35 m, merged with its parallels.
  {
    const near = (x: number, y: number) => r.walls.bands.some((q) => x >= q.x - 0.35 && x <= q.x + q.w + 0.35 && y >= q.y - 0.35 && y <= q.y + q.h + 0.35);
    const lines2: Array<{ horizontal: boolean; at: number; a0: number; a1: number }> = [];
    for (const [ax, ay, bx2, by] of r.winSegs) {
      const len = Math.hypot(bx2 - ax, by - ay);
      if (len < 1.0) continue;
      const horizontal = Math.abs(by - ay) < 0.05 && Math.abs(bx2 - ax) > 0.5, vertical = Math.abs(bx2 - ax) < 0.05 && Math.abs(by - ay) > 0.5;
      if (!horizontal && !vertical) continue;
      const mx = (ax + bx2) / 2, my = (ay + by) / 2;
      if (r.openings.some((o) => mx >= o.x - 0.4 && mx <= o.x + o.w + 0.4 && my >= o.y - 0.4 && my <= o.y + o.h + 0.4)) continue;
      let free = 0, n = 0;
      for (let t = 0.1; t < 1; t += 0.2) { n++; if (!near(ax + (bx2 - ax) * t, ay + (by - ay) * t)) free++; }
      if (free < 3) continue;
      lines2.push({ horizontal, at: horizontal ? (ay + by) / 2 : (ax + bx2) / 2, a0: horizontal ? Math.min(ax, bx2) : Math.min(ay, by), a1: horizontal ? Math.max(ax, bx2) : Math.max(ay, by) });
    }
    const merged: typeof lines2 = [];
    for (const l of lines2.sort((p1, p2) => Number(p1.horizontal) - Number(p2.horizontal) || p1.at - p2.at || p1.a0 - p2.a0)) {
      const t = merged.find((m) => m.horizontal === l.horizontal && Math.abs(m.at - l.at) < 0.4 && l.a0 <= m.a1 + 2.4 && l.a1 >= m.a0 - 2.4);
      if (t) { t.a0 = Math.min(t.a0, l.a0); t.a1 = Math.max(t.a1, l.a1); } else merged.push({ ...l });
    }
    let glazed = 0;
    for (const m of merged) {
      if (m.a1 - m.a0 < 0.9) continue;
      glazed++;
      if (process.env.DBG) say("  GLASS " + f.id + (m.horizontal ? " h z=" : " v x=") + m.at.toFixed(2) + " span " + m.a0.toFixed(2) + ".." + m.a1.toFixed(2));
      const mid = (m.a0 + m.a1) / 2, len = m.a1 - m.a0;
      const sizeFor = (thick: number) => (m.horizontal ? { x: len, z: thick } : { x: thick, z: len });
      const c = (m.horizontal ? { x: mid, z: m.at } : { x: m.at, z: mid });
      prims.push({ type: "box", centre: { x: c.x, y: f.level + (H - 0.3) / 2 + 0.05, z: c.z }, size: { ...sizeFor(0.04), y: H - 0.3 }, material: "glass", tag: `${f.id}:glazing` });
      prims.push({ type: "box", centre: { x: c.x, y: f.level + H - 0.32, z: c.z }, size: { ...sizeFor(0.08), y: 0.06 }, material: "frame", tag: `${f.id}:glazing` });
      prims.push({ type: "box", centre: { x: c.x, y: f.level + 0.08, z: c.z }, size: { ...sizeFor(0.08), y: 0.06 }, material: "frame", tag: `${f.id}:glazing` });
      const posts = Math.max(1, Math.round(len / 1.5));
      for (let i = 0; i <= posts; i++) {
        const u = m.a0 + (len * i) / posts;
        prims.push({ type: "box", centre: { x: m.horizontal ? u : c.x, y: f.level + (H - 0.3) / 2 + 0.05, z: m.horizontal ? c.z : u }, size: { x: 0.06, y: H - 0.3, z: 0.06 }, material: "frame", tag: `${f.id}:glazing` });
      }
    }
    if (glazed) say("  זיגוג ללא קיר מתחתיו (קווי WIN): " + glazed);
  }
  // The concrete shading canopies of the added floors: the rectangles the sheet draws round the wings (23.5 × 1.9 m, 1 m of it outside the face), as horizontal slabs under the floor above.
  if (f.id !== "floor-0") {
    for (const c of r.canopies) {
      const w = c.x1 - c.x0, d = c.z1 - c.z0;
      if (w * d < 2.5 || Math.min(w, d) < 0.4) continue;
      shade++;
      prims.push({ type: "box", centre: { x: (c.x0 + c.x1) / 2, y: f.level + H - 0.34, z: (c.z0 + c.z1) / 2 }, size: { x: w, y: 0.28, z: d }, material: "concrete", tag: `${f.id}:shade` });
    }
    if (shade) say("  מסגרות הצללה אופקיות (קירוי בטון): " + shade);
  }
  // Door leaves: the leaf of every door block the sheet draws, 2.1 m of timber, 4 cm thick, shut in the doorway.
  {
    let n = 0;
    for (const [ax, ay, bx2, by] of r.leaves) {
      const len = Math.hypot(bx2 - ax, by - ay);
      const ang = Math.atan2(by - ay, bx2 - ax);
      prims.push({ type: "box", centre: { x: (ax + bx2) / 2, y: f.level + 1.05, z: (ay + by) / 2 }, size: { x: len, y: 2.1, z: 0.04 }, rotY: -ang, material: "timber", tag: `${f.id}:door` });
      n++;
    }
    if (n) say("  דלתות (כנפיים מבלוקי הדלת): " + n);
  }
  // The boundary wall on the ground: a long wall the footprint does not take in.
  if (f.id === "floor-0") {
    for (const q of r.walls.bands) {
      if (bl.some((b) => b.has(q.x + q.w / 2, q.y + q.h / 2))) continue;
      if (Math.max(q.w, q.h) > 6) prims.push({ type: "box", centre: { x: q.x + q.w / 2, y: 1.0, z: q.y + q.h / 2 }, size: { x: q.w, y: 2.0, z: q.h }, material: "concrete", tag: "site:boundary-wall" });
    }
  }
}

// Perimeter check: walk each floor's outline and list every stretch (1.5 m and over) with no wall, window or glazing within 0.35 m — an open side.
say("");
say("## בדיקת היקף: קטעי היקף בלי קיר, חלון או זיגוג");
say("");
for (const f of FLOORS) {
  const r = read[f.id]!;
  const ring = blockList[f.id]![0]!.outline;
  const bands = r.walls.bands, ops = r.openings, glass = r.winSegs;
  const covered = (x: number, y: number) =>
    bands.some((q) => x >= q.x - 0.4 && x <= q.x + q.w + 0.4 && y >= q.y - 0.4 && y <= q.y + q.h + 0.4) ||
    ops.some((q) => x >= q.x - 0.4 && x <= q.x + q.w + 0.4 && y >= q.y - 0.4 && y <= q.y + q.h + 0.4) ||
    glass.some(([ax, ay, bx2, by]) => { const dx = bx2 - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)); return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) < 0.4; }) ||
    r.segs.some(([ax, ay, bx2, by]) => { const dx = bx2 - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)); return Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) < 0.4; });
  const gaps: string[] = [];
  let total = 0, open = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!, [bx2, by] = ring[(i + 1) % ring.length]!;
    const len = Math.hypot(bx2 - ax, by - ay);
    total += len;
    let run = 0, startAt: [number, number] | null = null;
    const n = Math.max(1, Math.ceil(len / 0.25));
    for (let j = 0; j <= n; j++) {
      const x = ax + ((bx2 - ax) * j) / n, y = ay + ((by - ay) * j) / n;
      if (!covered(x, y)) { if (run === 0) startAt = [x, y]; run += len / n; } else {
        if (run >= 1.5 && startAt) { gaps.push(`(${startAt[0].toFixed(1)}, ${startAt[1].toFixed(1)}) אורך ${run.toFixed(1)} מ'`); open += run; }
        run = 0; startAt = null;
      }
    }
    if (run >= 1.5 && startAt) { gaps.push(`(${startAt[0].toFixed(1)}, ${startAt[1].toFixed(1)}) אורך ${run.toFixed(1)} מ'`); open += run; }
  }
  say(`${f.id}: היקף ${total.toFixed(0)} מ'; פתוח ${open.toFixed(1)} מ' (${((100 * open) / total).toFixed(1)}%)` + (gaps.length ? ` — ${gaps.slice(0, 8).join("; ")}` : ""));
}

// Roof: slab and parapet on the roof sheet's outline; the towers its sheet draws inside, to +15.84 (the elevations' mark), capped.
{
  const r = readFloor(ROOF.file);
  const bl = blocks(r.footprint, 4);
  say(`roof: ${r.walls.bands.length} פסי קיר, ${bl.length} גושים: ${bl.map((b) => b.areaM2.toFixed(0)).join(", ")} מ"ר`);
  const main = bl[0]!;
  prims.push(slab(main.outline, ROOF.level, 0.35, "slab", "roof:slab"));
  // The roof deck: pale paving of a play yard (light, as asked), under the stone parapets.
  prims.push(slab(main.outline.map(([x, z]) => [x, z] as [number, number]), ROOF.level + 0.35, 0.03, "slab", "roof:membrane"));
  // The roof sheet closes the lobby corner with a diagonal chord; the arc and the bay below run out past it. The chord is no edge: it carries no parapet and no screen, the arc's do.
  const mainEdges = main.outline.map((q, i) => [q, main.outline[(i + 1) % main.outline.length]!] as [[number, number], [number, number]]);
  const isChord = ([P, Q]: [[number, number], [number, number]]) => {
    const mx = (P[0] + Q[0]) / 2, mz = (P[1] + Q[1]) / 2;
    const diagonal = Math.abs(Q[0] - P[0]) > 0.3 && Math.abs(Q[1] - P[1]) > 0.3 && mx > 38 && mz > 50;
    // A short edge that lies within the arc's roof band is no edge either: the band's own parapet closes it.
    const inBand = Math.hypot(Q[0] - P[0], Q[1] - P[1]) < 4 && Math.hypot(mx - CIRC.x, mz - CIRC.z) < 19.3 && mz > 57 && mx > 41;
    return diagonal || inBand;
  };
  const chords = mainEdges.filter(isChord).map(([P, Q]) => ({ x: (P[0] + Q[0]) / 2, z: (P[1] + Q[1]) / 2, r: Math.hypot(Q[0] - P[0], Q[1] - P[1]) / 2 + 0.3 }));
  const notChord = (ps: Primitive[]) => ps.filter((q) => !(q.type === "box" && chords.some((c) => Math.hypot(q.centre.x - c.x, q.centre.z - c.z) < c.r)));
  say(`  קטעי גג אלכסוניים שנגרעו מהמעקה: ${chords.length}`);
  prims.push(...notChord(parapet(main.outline, ROOF.level, ROOF.parapetTop, 0.2, "stone", "roof:parapet")));
  const roofEdgeAll: Array<[[number, number], [number, number]]> = [];
  // The curved facade below runs out past the roof sheet's chord: the roof, its parapet and the louvred screen follow the arc, on along the straight bay to the east wall.
  {
    const band = [...CURVE_UPPER, ...[...CURVE_UPPER_INNER].reverse()];
    prims.push(slab(band, ROOF.level, 0.35, "slab", "roof:slab"));
    // The bay's roof: from the sheet's own south edge (z ~60.4) out to the bay wall, so no slot shows the rooms.
    const bayRoof: Array<[number, number]> = [[49.5, 60.2], [51.7, 60.2], [51.7, 61.42], [49.8, 61.3], [49.5, 61.28]];
    prims.push(slab(bayRoof, ROOF.level, 0.35, "slab", "roof:slab"));
    prims.push(slab(bayRoof, ROOF.level + 0.35, 0.03, "slab", "roof:membrane"));
    prims.push(slab(band, ROOF.level + 0.35, 0.03, "slab", "roof:membrane"));
    const roofEdge: Array<[[number, number], [number, number]]> = [
      ...CURVE_UPPER.slice(1).map((q, i) => [CURVE_UPPER[i]!, q] as [[number, number], [number, number]]),
      [BAY_UP[0]!, BAY_UP[1]!],
      [[51.6, 61.42], [51.6, 60.45]],
    ];
    roofEdgeAll.push(...roofEdge);
    for (const [P, Q] of roofEdge) {
      prims.push(...facetPieces(P, Q, ROOF.level, [
        { t0: 0, t1: 1, y0: 0, y1: ROOF.parapetTop - ROOF.level, material: "stone", thick: 0.25 },
        { t0: 0, t1: 1, y0: ROOF.parapetTop - ROOF.level, y1: ROOF.parapetTop - ROOF.level + 0.06, material: "screen", thick: 0.08 },
        { t0: 0, t1: 1, y0: ROOF.tower - ROOF.level - 0.06, y1: ROOF.tower - ROOF.level, material: "screen", thick: 0.08 },
      ], "roof:parapet"));
    }
  }
  // Dark horizontal screen, the confirmed ext-3 fence: a foot rail and a head rail, the bars between them drawn in slatScreen.
  prims.push(...notChord(parapet(main.outline, ROOF.parapetTop, ROOF.parapetTop + 0.06, 0.08, "screen", "roof:screen")));
  prims.push(...notChord(parapet(main.outline, ROOF.tower - 0.06, ROOF.tower, 0.08, "screen", "roof:screen")));
  prims.push(...slatScreen([...roofEdgeAll, ...mainEdges.filter((e) => !isChord(e))], ROOF.parapetTop, ROOF.tower, "roof:screen", (x, z) => insidePolygon(main.outline, x, z) || (z >= 53.9 && x < 49.8 ? Math.hypot(x - CIRC.x, z - CIRC.z) < 19.2 : x < 51.6 && z < 61.3 && x > 38)));
  // Free space enclosed by the walls and under 60 m²: a tower cell.
  const lab = label(r.walls.mask, 0);
  const px = r.walls.cm / 100;
  const areas = new Map<number, number>();
  for (let i = 0; i < lab.ids.length; i++) if (!r.walls.mask.data[i]) areas.set(lab.ids[i]!, (areas.get(lab.ids[i]!) ?? 0) + 1);
  let towers = 0;
  const towerTops: Array<{ ring: Outline; top: number }> = [];
  for (const [id, n] of areas) {
    const a = n * px * px;
    if (a < 3 || a > 60 || lab.touchesEdge[id]) continue;
    const m = emptyMask(r.walls.mask.cols, r.walls.mask.rows);
    for (let i = 0; i < lab.ids.length; i++) if (lab.ids[i] === id) m.data[i] = 1;
    const cell = dilate(m, Math.round(0.12 / px));
    const ring = traceOutline(cell, 2).map(([x, y]) => [x * px, y * px] as [number, number]);
    const zc = ring.reduce((t, q) => t + q[1], 0) / ring.length;
    // The small box beside the lift is the tallest (+18.50); the stair towers stand at +17.31.
    const area = Math.abs(ring.reduce((a, q, i) => { const n = ring[(i + 1) % ring.length]!; return a + (q[0] * n[1] - n[0] * q[1]); }, 0)) / 2;
    void zc;
    const top = area < 20 ? ROOF.towerMiddle : ROOF.towerTop;
    towerTops.push({ ring, top });
    prims.push(slab(ring, top - 0.15, 0.25, "slab", "roof:tower-cap"));
    towers++;
  }
  for (const q of r.walls.bands) {
    // Parapet ring bands lie on the outline; every other band is a tower wall.
    const cx = q.x + q.w / 2, cy = q.y + q.h / 2;
    const nearOutline = main.outline.some((p, i) => {
      const n = main.outline[(i + 1) % main.outline.length]!;
      const dx = n[0] - p[0], dy = n[1] - p[1];
      const l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((cx - p[0]) * dx + (cy - p[1]) * dy) / l2)) : 0;
      return Math.hypot(cx - (p[0] + t * dx), cy - (p[1] + t * dy)) < 0.45;
    });
    if (nearOutline) continue;
    const own = towerTops.find((tt) => insidePolygon(tt.ring, cx, cy)) ?? towerTops.find((tt) => tt.ring.some((pt) => Math.hypot(pt[0] - cx, pt[1] - cy) < 0.5));
    const top = own ? own.top : ROOF.tower;
    prims.push({ type: "box", centre: { x: cx, y: (ROOF.level + top) / 2, z: cy }, size: { x: q.w, y: top - ROOF.level, z: q.h }, material: "plaster", tag: "roof:tower" });
  }
  // The two stair towers the roof sheet closes (x 31.6–35.12; z 16.26–22.28 and 52.02–58.24): walls and a cap to +17.31, seen on every elevation over the roof.
  for (const [z0, z1] of [[16.26, 22.28], [52.02, 58.24]] as const) {
    const ring: Outline = [[31.6, z0], [35.12, z0], [35.12, z1], [31.6, z1]];
    prims.push({ type: "prism", ring, y0: ROOF.level, y1: ROOF.towerTop, material: "plaster", tag: "roof:tower" });
    prims.push(slab(ring.map(([x, z]) => [x < 33 ? x - 0.1 : x + 0.1, z < (z0 + z1) / 2 ? z - 0.1 : z + 0.1] as [number, number]), ROOF.towerTop - 0.05, 0.2, "slab", "roof:tower-cap"));
  }
  say(`  מגדלי גג: ${towers} + 2 מגדלי מדרגות`);
  plansOut.roof = { level: ROOF.level, outlines: [main.outline.map(([x, y]) => [Number(x.toFixed(2)), Number(y.toFixed(2))] as [number, number])], rooms: [], walls: r.walls.bands.map((q) => ({ o: q.orientation, x: Number(q.x.toFixed(2)), y: Number(q.y.toFixed(2)), w: Number(q.w.toFixed(2)), h: Number(q.h.toFixed(2)) })), openings: [], items: towerTops.map((tt) => ({ kind: "tower", top: tt.top, ring: tt.ring.map(([x, y]) => [Number(x.toFixed(2)), Number(y.toFixed(2))]) })) };
  read.roof = r;
}

// Ground around the building, and the body's dimensions against the sheet's printed ones.
const all = Object.values(blockList).flat();
const bx = {
  x0: Math.min(...all.flatMap((b) => b.outline.map((p) => p[0]))), x1: Math.max(...all.flatMap((b) => b.outline.map((p) => p[0]))),
  z0: Math.min(...all.flatMap((b) => b.outline.map((p) => p[1]))), z1: Math.max(...all.flatMap((b) => b.outline.map((p) => p[1]))),
};
say(`\nמעטפת (ללא פסי הצללה): מזרח-מערב ${(bx.x1 - bx.x0).toFixed(2)} מ' (בחזית דרומית מודפס 38.30), צפון-דרום ${(bx.z1 - bx.z0).toFixed(2)} מ' (בחזית מזרחית מודפס 48.35)`);
const pad = 30;
prims.push({ type: "prism", ring: [[bx.x0 - pad, bx.z0 - pad], [bx.x1 + pad, bx.z0 - pad], [bx.x1 + pad, bx.z1 + pad], [bx.x0 - pad, bx.z1 + pad]], y0: -0.6, y1: -0.06, material: "grass", tag: "site:ground" });
// The yard is paved close round the school (red-brown pavers, as the site photos show) and runs out to a lawn with trees: trees stand only on the lawn, clear of the sight lines of the booklet's cameras.
const midX = (bx.x0 + bx.x1) / 2, midZ = (bx.z0 + bx.z1) / 2;
prims.push({ type: "prism", ring: [[bx.x0 - 8000, bx.z0 - 8000], [bx.x1 + 8000, bx.z0 - 8000], [bx.x1 + 8000, bx.z1 + 8000], [bx.x0 - 8000, bx.z1 + 8000]], y0: -1.2, y1: -0.1, material: "grass", tag: "site:ground-far" });
{
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const camsRel: Array<[number, number]> = [[46, 46], [-46, -46], [-46, 46], [46, -46], [6, 72]];
  let placed = 0;
  for (let i = 0; i < 400 && placed < 60; i++) {
    const x = midX + (rnd() - 0.5) * 120, z = midZ + (rnd() - 0.5) * 130;
    // On the lawn: outside the paved yard (16 m round the school), within the near ground.
    if (x > bx.x0 - 17 && x < bx.x1 + 17 && z > bx.z0 - 17 && z < bx.z1 + 17) continue;
    if (Math.abs(x - midX) > 56 || Math.abs(z - midZ) > 62) continue;
    const blocked = camsRel.some(([dx, dz]) => {
      const ax = midX + dx, az = midZ + dz, vx = midX - ax, vz = midZ - az, l2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      return Math.hypot(x - (ax + vx * t), z - (az + vz * t)) < 9;
    });
    if (blocked) continue;
    if (Math.hypot(x - (bx.x1 + 10), z - (bx.z1 + 7)) < 12 || Math.hypot(x - (bx.x0 - 4), z - midZ) < 9 || Math.hypot(x - (bx.x1 - 5), z - (bx.z1 - 7)) < 14) continue;
    prims.push({ type: "tree", at: { x, y: -0.06, z }, height: 5 + rnd() * 4, crown: 2 + rnd() * 1.6, tag: "site:tree" });
    placed++;
  }
  say(`עצים על המדשאה: ${placed}`);
  let seed2 = 23;
  const rnd2 = () => ((seed2 = (seed2 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 140; i++) {
    const a = rnd2() * Math.PI * 2, rad = 75 + rnd2() * 380;
    prims.push({ type: "tree", at: { x: midX + Math.cos(a) * rad, y: -0.1, z: midZ + Math.sin(a) * rad }, height: 7 + rnd2() * 6, crown: 3 + rnd2() * 2.5, tag: "site:tree" });
  }
}
const apron = 16;
prims.push({ type: "prism", ring: [[bx.x0 - apron, bx.z0 - apron], [bx.x1 + apron, bx.z0 - apron], [bx.x1 + apron, bx.z1 + apron], [bx.x0 - apron, bx.z1 + apron]], y0: -0.3, y1: -0.04, material: "paving", tag: "site:apron" });
// The entrance at the stair landing (ground floor, east wall z 56.1–57.25, the WIN lines the sheet draws there): a glazed door in a green frame, stone over it.
{
  const x = 51.6, z0 = 56.1, z1 = 57.25, zc = (z0 + z1) / 2, w = z1 - z0, hd = 2.2;
  prims.push({ type: "box", centre: { x, y: hd + (H - hd) / 2, z: zc }, size: { x: 0.24, y: H - hd, z: w }, material: "stone", tag: "floor-0:doorhead" });
  prims.push({ type: "box", centre: { x, y: (hd - 0.1) / 2 + 0.0, z: zc }, size: { x: 0.03, y: hd - 0.1, z: w - 0.1 }, material: "glass", tag: "floor-0:door" });
  prims.push({ type: "box", centre: { x: x + 0.02, y: hd - 0.05, z: zc }, size: { x: 0.08, y: 0.1, z: w }, material: "frame", tag: "floor-0:door" });
  for (const zz of [z0 + 0.04, z1 - 0.04, zc]) prims.push({ type: "box", centre: { x: x + 0.02, y: hd / 2, z: zz }, size: { x: 0.08, y: hd, z: 0.07 }, material: "frame", tag: "floor-0:door" });
  say("  דלת כניסה בקצה המדרגות (קיר מזרחי, z 56.1–57.25) נפתחה והוצבה דלת מזוגגת");
}
// Partition plaster that runs on out to the lobby's arc: its end face lay in the arc's outer face and showed as a white strip between two windows. It stops 0.35 m inside the wall (r 17.9).
{
  let cut = 0;
  const arcWall = (x: number, z: number) => Math.hypot(x - CIRC.x, z - CIRC.z);
  for (const q of prims) {
    if (q.type !== "box" || q.material !== "plaster" || !/^floor-\d$/.test(q.tag ?? "") || q.rotY) continue;
    const alongX = q.size.x >= q.size.z;
    const half = (alongX ? q.size.x : q.size.z) / 2;
    for (const sg of [-1, 1]) {
      const ex = q.centre.x + (alongX ? sg * half : 0), ez = q.centre.z + (alongX ? 0 : sg * half);
      const r = arcWall(ex, ez);
      if (ex < 40 || ex > 51.5 || ez < 53 || r < 17.95 || r > 19.7) continue;
      const over = r - 17.9;
      const len = (alongX ? q.size.x : q.size.z) - over;
      if (len < 0.05) continue;
      if (alongX) { q.size.x = len; q.centre.x -= sg * over / 2; } else { q.size.z = len; q.centre.z -= sg * over / 2; }
      cut++;
      break;
    }
  }
  say(`  קצוות מחיצות טיח שנעצרו בתוך קיר הקשת: ${cut}`);
}
// An inner partition's plaster end that reaches the outer face of the facade shows on it as a white strip (a "slot" in the stone): it stops 0.3 m short of that face, inside the wall.
{
  let trimmed = 0;
  for (const f of FLOORS) {
    const ring = blockList[f.id]![0]!.outline;
    const mine = prims.filter((q) => q.type === "box" && q.tag === f.id && q.material === "plaster" && !q.rotY) as Array<Extract<Primitive, { type: "box" }>>;
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i]!, [bx2, bz] = ring[(i + 1) % ring.length]!;
      const alongX = Math.abs(bz - az) <= 0.05;
      if (!alongX && Math.abs(bx2 - ax) > 0.05) continue;
      const len = Math.hypot(bx2 - ax, bz - az);
      if (len < 0.8) continue;
      let nx = (bz - az) / len, nz = -(bx2 - ax) / len;
      if (insidePolygon(ring, (ax + bx2) / 2 + nx * 0.5, (az + bz) / 2 + nz * 0.5)) { nx = -nx; nz = -nz; }
      const line = alongX ? az : ax, sign = alongX ? nz : nx;
      const lo = alongX ? Math.min(ax, bx2) : Math.min(az, bz), hi = alongX ? Math.max(ax, bx2) : Math.max(az, bz);
      for (const q of mine) {
        const lat = alongX ? q.centre.x : q.centre.z, latHalf = alongX ? q.size.x / 2 : q.size.z / 2;
        const across = alongX ? q.size.z : q.size.x, thick = alongX ? q.size.x : q.size.z;
        if (lat < lo - 0.01 || lat > hi + 0.01 || across < 0.5 || thick > 0.35 || latHalf * 2 > 0.35) continue;
        const c = alongX ? q.centre.z : q.centre.x;
        const outer = c + sign * (across / 2), inner = c - sign * (across / 2);
        // The end must be at the outer face (within 4 cm) or beyond it.
        if ((outer - line) * sign < -0.04 || (inner - line) * sign > -0.4) continue;
        const newOuter = line - sign * 0.3, newAcross = Math.abs(newOuter - inner), newC = (inner + newOuter) / 2;
        if (alongX) { q.size.z = newAcross; q.centre.z = newC; } else { q.size.x = newAcross; q.centre.x = newC; }
        trimmed++;
      }
    }
  }
  say(`  קצוות מחיצות טיח שנעצרו 0.3 מ' לפני פני החזית: ${trimmed}`);
}
// Full-height slots in the outer walls (the plan reader lost a short stretch of wall, 0.08–1.5 m, below the perimeter check's 1.5 m): closed in the facade stone, so no wall stands open on the rooms behind it.
{
  const skip = /furniture|inside|light|lamp|bars|stair|shade|slab|floor$|ceiling/;
  for (const f of FLOORS) {
    const ring = blockList[f.id]![0]!.outline;
    // Only the facade layer counts as wall here (stone, glass, frames, doors): a plaster lining left standing where the stone is missing is the white strip itself.
    const mine = prims.filter((q) => q.type === "box" && (q.tag ?? "").startsWith(f.id) && !skip.test(q.tag ?? "") && q.material !== "plaster" && !q.rotY) as Array<Extract<Primitive, { type: "box" }>>;
    let filled = 0;
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i]!, [bx2, bz] = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(bx2 - ax, bz - az);
      const alongX = Math.abs(bz - az) <= 0.05;
      if (len < 0.8 || (!alongX && Math.abs(bx2 - ax) > 0.05)) continue;
      let nx = (bz - az) / len, nz = -(bx2 - ax) / len;
      if (insidePolygon(ring, (ax + bx2) / 2 + nx * 0.5, (az + bz) / 2 + nz * 0.5)) { nx = -nx; nz = -nz; }
      const covered = (px: number, pz: number, y: number) => mine.some((q) => Math.abs(q.centre.x - px) <= q.size.x / 2 + (alongX ? 0 : 0.45) && Math.abs(q.centre.z - pz) <= q.size.z / 2 + (alongX ? 0.45 : 0) && Math.abs(q.centre.y - (f.level + y)) <= q.size.y / 2 + 0.001);
      let run = 0, start = 0;
      const flush = (end: number) => {
        if (run < 0.08) { run = 0; return; }
        const mid = start + run / 2, px = ax + ((bx2 - ax) / len) * mid, pz = az + ((bz - az) / len) * mid;
        prims.push({ type: "box", centre: { x: px - nx * 0.12, y: f.level + H / 2, z: pz - nz * 0.12 }, size: alongX ? { x: run, y: H, z: 0.24 } : { x: 0.24, y: H, z: run }, material: "stone", tag: `${f.id}:infill` });
        filled++;
        run = 0;
        void end;
      };
      for (let t = 0; t <= len; t += 0.05) {
        const px = ax + ((bx2 - ax) / len) * t, pz = az + ((bz - az) / len) * t;
        // The lobby's curved glass wall is built apart (its own glass and posts): nothing is filled behind it.
        // The ground floor's east wall has an opening 1.15 m wide at the stair landing (z 56.1–57.25): it is a door, not a slot to fill.
        const stairDoor = f.id === "floor-0" && px > 51 && pz > 56.0 && pz < 57.3;
        const lobbyCurve = Math.hypot(px - CIRC.x, pz - CIRC.z) < 20.5 && pz > 52 && px < 51.0;
        const open = !lobbyCurve && !stairDoor && [0.3, 1.5, 3.0].every((y) => !covered(px, pz, y));
        if (open) { if (run === 0) start = t; run = t - start + 0.05; } else flush(t);
      }
      flush(len);
    }
    if (filled) say(`  ${f.id}: פתחי קיר מלאי-גובה שנסגרו באבן: ${filled}`);
  }
}
// An interior doorway's header (plaster from 2.2 m) the plan reader left over a window's opening covers the top 0.3 m of its glass: it starts at the window's head instead.
{
  let fixed = 0;
  for (const p of prims) {
    if (p.type !== "box" || p.material !== "plaster" || !/^floor-\d$/.test(p.tag ?? "") || Math.abs(p.size.y - (H - 2.2)) > 0.02) continue;
    const level = p.centre.y - p.size.y / 2 - 2.2;
    for (const g of prims) {
      if (g.type !== "box" || g.material !== "glass" || g.tag !== `${p.tag}:window`) continue;
      const gTop = g.centre.y + g.size.y / 2;
      if (gTop <= level + 2.2 + 0.01 || Math.abs(g.centre.x - p.centre.x) > g.size.x / 2 + p.size.x / 2 || Math.abs(g.centre.z - p.centre.z) > g.size.z / 2 + p.size.z / 2 + 0.7) continue;
      p.size.y = level + H - gTop;
      p.centre.y = gTop + p.size.y / 2;
      fixed++;
      break;
    }
  }
  say(`כותרות פתח פנימי שהורמו לראש החלון: ${fixed}`);
}
// Exterior lighting as the site photos show it: black wall-pack lamps on the stone walls of the existing floors, one every ~7 m, at 2.7 m, a warm lens in each.
{
  let n = 0;
  for (const f of FLOORS.slice(0, 2)) {
    const ring = blockList[f.id]![0]!.outline;
    for (let i = 0; i < ring.length; i++) {
      const [ax, az] = ring[i]!, [bx2, bz] = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(bx2 - ax, bz - az);
      const alongX = Math.abs(bz - az) <= 0.05;
      if (len < 3 || (!alongX && Math.abs(bx2 - ax) > 0.05)) continue;
      let nx = (bz - az) / len, nz = -(bx2 - ax) / len;
      if (insidePolygon(ring, (ax + bx2) / 2 + nx * 0.5, (az + bz) / 2 + nz * 0.5)) { nx = -nx; nz = -nz; }
      const count = Math.max(1, Math.floor(len / 4.5));
      for (let k = 0; k < count; k++) {
        const y = f.level + 2.7;
        // A lamp hangs on the stone: from its slot it slides along the wall (up to 3.6 m either way) to the nearest spot with stone behind it and no glass or frame within 0.6 m.
        const spot = (t: number) => {
          const px = ax + (bx2 - ax) * t, pz = az + (bz - az) * t;
          const hits = (q: Extract<Primitive, { type: "box" }>, mx: number, mz: number) => Math.abs(q.centre.x - px) <= q.size.x / 2 + mx && Math.abs(q.centre.z - pz) <= q.size.z / 2 + mz && Math.abs(q.centre.y - y) <= q.size.y / 2 + 0.2;
          const glass = prims.some((q) => q.type === "box" && (q.material === "glass" || q.material === "frame") && new RegExp(`^${f.id}:(window|curtain|glazing|curved|door)`).test(q.tag ?? "") && hits(q, alongX ? 0.6 : 0.4, alongX ? 0.4 : 0.6));
          const stone = prims.some((q) => q.type === "box" && q.material === "stone" && (q.tag === f.id || q.tag === `${f.id}:infill`) && hits(q, alongX ? 0.15 : 0.4, alongX ? 0.4 : 0.15));
          return !glass && stone ? { px, pz } : null;
        };
        const t0 = (k + 0.5) / count;
        let at: { px: number; pz: number } | null = null;
        for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4, 3.0, -3.0, 3.6, -3.6]) {
          const t = t0 + off / len;
          if (t < 0.02 || t > 0.98) continue;
          at = spot(t);
          if (at) break;
        }
        if (!at) continue;
        const { px, pz } = at;
        prims.push({ type: "box", centre: { x: px + nx * 0.13, y, z: pz + nz * 0.13 }, size: alongX ? { x: 0.36, y: 0.22, z: 0.24 } : { x: 0.24, y: 0.22, z: 0.36 }, material: "darkSteel", tag: `${f.id}:lamp` });
        prims.push({ type: "box", centre: { x: px + nx * 0.26, y: y - 0.02, z: pz + nz * 0.26 }, size: alongX ? { x: 0.3, y: 0.14, z: 0.02 } : { x: 0.02, y: 0.14, z: 0.3 }, material: "lightPanel", tag: `${f.id}:lamp:lens` });
        n++;
      }
    }
  }
  say(`גופי תאורה חיצוניים (wall-pack): ${n}`);
}
// The existing floors' windows carry the vertical green security bars the site photos show on almost every one (every 14 cm, over the glass).
{
  const bars: Primitive[] = [];
  for (const p of prims) {
    if (p.type !== "box" || p.material !== "glass" || !/^floor-[01]:window$/.test(p.tag ?? "")) continue;
    const alongX = p.size.x >= p.size.z;
    const len = alongX ? p.size.x : p.size.z;
    const rot = p.rotY ?? 0;
    const ux = alongX ? Math.cos(rot) : Math.sin(rot), uz = alongX ? -Math.sin(rot) : Math.cos(rot);
    const count = Math.max(2, Math.round(len / 0.14));
    for (let i = 0; i < count; i++) {
      const t = ((i + 0.5) / count - 0.5) * len;
      bars.push({ type: "box", centre: { x: p.centre.x + ux * t, y: p.centre.y, z: p.centre.z + uz * t }, size: alongX ? { x: 0.022, y: p.size.y, z: 0.07 } : { x: 0.07, y: p.size.y, z: 0.022 }, ...(p.rotY !== undefined ? { rotY: p.rotY } : {}), material: "frame", tag: (p.tag ?? "").replace("window", "bars") });
    }
  }
  prims.push(...bars);
  say(`חיזורים (סורגים אנכיים) בחלונות הקומות הקיימות: ${bars.length} סורגים`);
}
// Stone "fins" the plan reader leaves where a partition runs on past the outline at the lobby's arc start (a 1 × 0.6 m block standing out of the curved wall): dropped, the arc is built from its own facets.
{
  let dropped = 0;
  for (let i = prims.length - 1; i >= 0; i--) {
    const q = prims[i]!;
    if (q.type === "box" && /:fin$/.test(q.tag ?? "") && q.centre.x > 39.5 && q.centre.x < 44 && q.centre.z > 52 && q.centre.z < 58) { prims.splice(i, 1); dropped++; }
  }
  // On floors 2 and 3 the arc wall is built from the arc itself (CURVE_UPPER); the plan reader's own fills in the band between r 17.6 and 19.7 (a 2.4 × 2 m block, slivers and a fin, seen through the windows as stone behind the glass and standing proud of the wall) are the same wall read twice: dropped.
  let band = 0;
  for (let i = prims.length - 1; i >= 0; i--) {
    const q = prims[i]!;
    if (q.type !== "box" || !/^floor-[23](:fin)?$/.test(q.tag ?? "") || (q.material !== "stone" && q.material !== "plaster")) continue;
    const r = Math.hypot(q.centre.x - CIRC.x, q.centre.z - CIRC.z);
    if (r > 17.6 && r < 19.7 && q.centre.z > 54.4 && q.centre.x > 40.2 && q.centre.x < 51 && q.size.y > 0.3) { prims.splice(i, 1); band++; }
  }
  // The plan reader's plaster fills in the footprint of the wing-to-arc return (floors 0–3): axis-aligned boxes that poke out past the return's diagonal face as a white strip. The return is built from the sheet's own lines, so they go.
  let ret = 0;
  for (let i = prims.length - 1; i >= 0; i--) {
    const q = prims[i]!;
    if (q.type !== "box" || !/^floor-[0-3]$/.test(q.tag ?? "") || q.material !== "plaster" || q.size.y < 0.3) continue;
    const r = Math.hypot(q.centre.x - CIRC.x, q.centre.z - CIRC.z);
    if (r > 18.0 && q.centre.x > 39.4 && q.centre.x < 41.1 && q.centre.z > 52.2 && q.centre.z < 54.1 && q.size.z > 0.05) { prims.splice(i, 1); ret++; }
  }
  say(`  מילויי טיח בצומת הכנף והקשת שהוסרו: ${ret}`);
  say(`  גושי מילוי של הקשת בקומות 2-3 שהוסרו (נקראו פעמיים): ${band}`);
  say(`  גושי אבן בולטים בתחילת הקשת שהוסרו: ${dropped}`);
}
const model = {
  name: 'בי"ס וולף בני ברק',
  primitives: prims,
  extent: { x: bx.x0 - 10, z: bx.z0 - 10, width: bx.x1 - bx.x0 + 20, depth: bx.z1 - bx.z0 + 20, yMin: -0.6, yMax: ROOF.towerMiddle },
  north: { x: 0, z: -1 },
  // The site photos (21/10/2026): honed sand-cream limestone, dark-green frames, cream-ochre concrete canopies, red-brown pavers.
  palette: { limestone: true, redPavers: true, golden: true, colors: { frame: "#1d4a3c", concrete: "#d8caa4", stoneDark: "#bfb293", slab: "#e4dfd2" } },
};
say(`פרימיטיבים: ${prims.length}`);

// Rooms table.
say("\n## חדרים: שטח מודפס מול שטח מהקירות\n");
say('| קומה | שם | סוג | מודפס מ"ר | מהקירות מ"ר |');
say("|---|---|---|---|---|");
for (const row of roomRows) say(row);
{
  const rows = roomRows.map((s) => s.split("|").map((c) => c.trim())).map((c) => ({ printed: Number(c[4]), have: Number(c[5]) })).filter((r) => r.printed > 0 && r.have > 0);
  const within = rows.filter((r) => Math.abs(r.have - r.printed) / r.printed <= 0.15).length;
  const within30 = rows.filter((r) => Math.abs(r.have - r.printed) / r.printed <= 0.3).length;
  say(`
חדרים עם שטח מודפס: ${rows.length}; בתוך ±15%: ${within}; בתוך ±30%: ${within30}`);
}

// Wall check against the drawing: DXF wall ink vs the model's wall bands.
{
  const cm = 5;
  const cols = Math.ceil(FRAME.width / cm), rows = Math.ceil(FRAME.height / cm);
  say('\nבדיקת קירות: דיו ה-DXF (שכבת WALL) מול פסי הקיר במודל (רסטר 5 ס"מ, סבילות 15 ס"מ):');
  for (const f of [...FLOORS, { id: "roof" }]) {
    const r = read[f.id]!;
    const ink = new Uint8Array(cols * rows);
    for (const [ax, ay, bx2, by] of r.segs) {
      const n = Math.max(1, Math.ceil((Math.hypot(bx2 - ax, by - ay) * 100) / cm));
      for (let i = 0; i <= n; i++) {
        const x = Math.floor(((ax + ((bx2 - ax) * i) / n) * 100) / cm), y = Math.floor(((ay + ((by - ay) * i) / n) * 100) / cm);
        if (x >= 0 && y >= 0 && x < cols && y < rows) ink[y * cols + x] = 1;
      }
    }
    const band = new Uint8Array(cols * rows);
    for (const b of r.walls.bands) for (let y = Math.floor((b.y * 100) / cm); y <= Math.floor(((b.y + b.h) * 100) / cm); y++) for (let x = Math.floor((b.x * 100) / cm); x <= Math.floor(((b.x + b.w) * 100) / cm); x++) if (x >= 0 && y >= 0 && x < cols && y < rows) band[y * cols + x] = 1;
    const grow = (m: Uint8Array, k: number) => {
      const o = new Uint8Array(m.length);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (m[y * cols + x]) for (let dy = -k; dy <= k; dy++) for (let dx = -k; dx <= k; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < cols && yy < rows) o[yy * cols + xx] = 1; }
      return o;
    };
    const bandG = grow(band, 3), inkG = grow(ink, 3);
    let inkN = 0, inkHit = 0, bandN = 0, bandHit = 0;
    for (let i = 0; i < ink.length; i++) { if (ink[i]) { inkN++; if (bandG[i]) inkHit++; } if (band[i]) { bandN++; if (inkG[i]) bandHit++; } }
    say(`  ${f.id}: דיו שכוסה ${((100 * inkHit) / Math.max(1, inkN)).toFixed(1)}%, קירות הנתמכים בדיו ${((100 * bandHit) / Math.max(1, bandN)).toFixed(1)}%`);
  }
}

// ---- Sections of the PDF against the model: the cut walls the section draws against the walls the model has on the cut plane.
{
  const { readPdfPage } = await import("@/lib/projects/building/pdf-paths");
  const page = await readPdfPage(new Uint8Array(fs.readFileSync(path.join(dir!, "garmushka_seminar volf-חזיתות-חתכים.pdf"))), 1);
  const PT = 28.35;
  say("\n## חתכים מה-PDF מול המודל: מפלסים\n");
  // Long horizontal lines of each section (slabs, parapet, screen, towers) as metres over the lowest floor line, against the model's levels.
  const modelLevels = [0, H, 2 * H, 3 * H, ROOF.level, ROOF.parapetTop, ROOF.tower, ROOF.towerTop, ROOF.towerMiddle];
  const SECS = [{ id: "A-A", x0: 130, x1: 2050, y0: 150, y1: 1090 }, { id: "B-B", x0: 330, x1: 1950, y0: 1600, y1: 2450 }];
  for (const sec of SECS) {
    const hor = new Map<number, number>();
    for (const q of page.paths) for (const ring of q.rings) for (let i = 1; i < ring.length; i++) {
      const [ax, ay] = ring[i - 1]!, [bx2, by] = ring[i]!;
      if (Math.abs(ay - by) > 0.6 || Math.min(ax, bx2) < sec.x0 || Math.max(ax, bx2) > sec.x1 || ay < sec.y0 || ay > sec.y1 || Math.abs(bx2 - ax) < 150) continue;
      const k2 = Math.round(ay / 2) * 2;
      hor.set(k2, (hor.get(k2) ?? 0) + Math.abs(bx2 - ax));
    }
    const lines2 = [...hor].filter(([, l]) => l >= 500).map(([y, l]) => ({ y, l })).sort((p1, p2) => p2.y - p1.y);
    if (!lines2.length) { say(sec.id + ": לא נמצאו קווים"); continue; }
    // The ground line: the lowest line with at least 900 pt of ink.
    // The ground floor's top is 6 pt (21 cm) above the lowest line with 900 pt of ink: the slab's underside.
    const ground = (lines2.find((q) => q.l >= 900) ?? lines2[0]!).y - 6;
    const seen: number[] = [];
    const rowsOut: string[] = [];
    for (const q of lines2) {
      const lvl = (ground - q.y) / PT;
      if (lvl < -0.2 || lvl > 19.5 || seen.some((v) => Math.abs(v - lvl) < 0.12)) continue;
      seen.push(lvl);
      const near = modelLevels.reduce((best, m) => (Math.abs(m - lvl) < Math.abs(best - lvl) ? m : best), modelLevels[0]!);
      rowsOut.push("  " + lvl.toFixed(2) + " מ' (אורך קו " + q.l.toFixed(0) + " pt) → מפלס קרוב במודל " + near.toFixed(2) + ", הפרש " + (((lvl - near) * 100) | 0) + " ס\"מ");
    }
    say(sec.id + " (קרקע y=" + ground + "):");
    for (const r of rowsOut) say(r);
  }
}

fs.writeFileSync(path.join(outDir, "model.json"), JSON.stringify(model));
fs.writeFileSync(path.join(outDir, "rooms.json"), JSON.stringify(roomsOut));
fs.writeFileSync(path.join(outDir, "plans.json"), JSON.stringify(plansOut));
fs.writeFileSync(path.join(outDir, "drawing.json"), JSON.stringify(Object.fromEntries(Object.entries(read).map(([k, v]) => [k, { segs: v.segs.map((q) => q.map((n) => Number(n.toFixed(2)))), win: v.winSegs.map((q) => q.map((n) => Number(n.toFixed(2)))) }]))));
if (flag === "--no-render") {
  fs.writeFileSync(path.join(outDir, "report.md"), lines.join("\n"));
  process.exit(0);
}

// ---- Elevations: the model drawn from each side, the elevation drawing laid over it, registered by the level marks and the body's edges.
const EW = 2400;
const elevAll: Record<string, { lines: Array<Array<[number, number]>>; u0: number; u1: number; v0: number; v1: number; rightIsPlus: boolean; lo: number; hi: number }> = {};
for (const fc of FACADES) {
  const [a, b] = fc.x as [number, number];
  const { bx0, bx1, lo, hi, plan } = facadeBase(fc);
  if (bx1 < bx0) { say("חזית " + fc.he + ": לא נמצא קו הבסיס"); continue; }
  say("חזית " + fc.he + ": גוף " + ((bx1 - bx0) / 100).toFixed(2) + " מ' בשרטוט; במודל " + (hi - lo).toFixed(2) + " מ'");
  const margin = 4;
  const u0 = lo - margin, u1 = hi + margin, v0 = -1.5, v1 = 18.5;
  const EH = Math.round((EW * (v1 - v0)) / (u1 - u0));
  const mid = (u0 + u1) / 2, vm = (v0 + v1) / 2;
  const far = 90;
  const cx = (bx.x0 + bx.x1) / 2, cz = (bx.z0 + bx.z1) / 2;
  const pos = fc.axis === "x" ? { x: mid, y: vm, z: cz + fc.cam.dz * far } : { x: cx + fc.cam.dx * far, y: vm, z: mid };
  const target = fc.axis === "x" ? { x: mid, y: vm, z: cz } : { x: cx, y: vm, z: mid };
  const [shot] = await renderBuildingFrames(
    [{ model, camera: { position: pos, target, fovDeg: 20, orthoHalfWidth: (u1 - u0) / 2, hideTags: ["site"], studio: true }, width: EW, height: EH, sun: { azimuthDeg: fc.id === "south" ? 200 : fc.id === "north" ? 20 : fc.id === "east" ? 110 : 290, elevationDeg: 45 }, exposure: 0.7, ao: true }],
    { outputWidthPx: 99999 },
  );
  const rightIsPlus = fc.id === "south" || fc.id === "west";
  const sx = (u: number) => (rightIsPlus ? u - u0 : u1 - u) * (EW / (u1 - u0));
  const sy = (v: number) => (v1 - v) * (EH / (v1 - v0));
  // Facade check on the render itself: holes (background showing through the body) and the elevation's windows that the model left as wall.
  {
    const raw = await sharp(shot!).resize(EW, EH).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const ch = raw.info.channels, px3 = raw.data;
    const at = (x: number, y: number) => { const i = (y * EW + x) * ch; return [px3[i]!, px3[i + 1]!, px3[i + 2]!] as const; };
    const bg = at(3, 3);
    const isBg = (x: number, y: number) => { const c = at(x, y); return Math.abs(c[0] - bg[0]) < 7 && Math.abs(c[1] - bg[1]) < 7 && Math.abs(c[2] - bg[2]) < 7; };
    const ppm = EW / (u1 - u0);
    const [bx0p, bx1p] = (rightIsPlus ? [lo - u0, hi - u0] : [u1 - hi, u1 - lo]).map((v) => Math.round(v * ppm)) as [number, number];
    const byTop = Math.round((v1 - 13.9) * (EH / (v1 - v0))), byBot = Math.round((v1 - 0.05) * (EH / (v1 - v0)));
    const STEP = 4;
    const gw = Math.ceil((bx1p - bx0p) / STEP), gh = Math.ceil((byBot - byTop) / STEP);
    const hole = new Uint8Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) hole[gy * gw + gx] = isBg(Math.min(EW - 1, bx0p + gx * STEP + 1), Math.min(EH - 1, byTop + gy * STEP + 1)) ? 1 : 0;
    const seenH = new Uint8Array(gw * gh);
    const holes: string[] = [];
    for (let i = 0; i < hole.length; i++) {
      if (!hole[i] || seenH[i]) continue;
      const stack = [i]; seenH[i] = 1;
      let n = 0, x0g = gw, x1g = 0, y0g = gh, y1g = 0;
      while (stack.length) {
        const c = stack.pop()!; const cx2 = c % gw, cy2 = (c - cx2) / gw; n++;
        x0g = Math.min(x0g, cx2); x1g = Math.max(x1g, cx2); y0g = Math.min(y0g, cy2); y1g = Math.max(y1g, cy2);
        for (const nb of [cx2 > 0 ? c - 1 : -1, cx2 < gw - 1 ? c + 1 : -1, cy2 > 0 ? c - gw : -1, cy2 < gh - 1 ? c + gw : -1]) if (nb >= 0 && hole[nb] && !seenH[nb]) { seenH[nb] = 1; stack.push(nb); }
      }
      const m2 = (n * STEP * STEP) / (ppm * ppm);
      if (m2 < 0.6) continue;
      const uC = (x0g + x1g) / 2 * STEP / ppm, vC = v1 - (byTop + (y0g + y1g) / 2 * STEP) / (EH / (v1 - v0));
      const plan0 = rightIsPlus ? u0 + (bx0p / ppm) + uC - (bx0p / ppm) : u1 - (bx0p / ppm) - uC;
      holes.push(`${m2.toFixed(1)} מ"ר ב-(${(rightIsPlus ? u0 + (bx0p + (x0g + x1g) / 2 * STEP) / ppm : u1 - (bx0p + (x0g + x1g) / 2 * STEP) / ppm).toFixed(1)} מ' לאורך, גובה ${vC.toFixed(1)} מ')`);
      void plan0;
    }
    say("חזית " + fc.he + ": חורים בגוף (רקע נראה דרך הקירות): " + (holes.length ? holes.join("; ") : "אין"));
    // The elevation's own windows against the render: a window is glass, dark in the studio light.
    let cnt = 0, bad = 0;
    const missing: string[] = [];
    for (const w of ELEV.filter((q) => q.facade === fc.id)) {
      const xa = Math.round(sx(w.s0)), xb = Math.round(sx(w.s1));
      const [xl, xr] = [Math.min(xa, xb), Math.max(xa, xb)];
      const yt = Math.round(sy(Math.min(w.v1, 13.9))), yb = Math.round(sy(Math.max(w.v0, 0.05)));
      if (xr - xl < 6 || yb - yt < 6) continue;
      let dark = 0, tot = 0;
      for (let y = yt + 2; y < yb - 2; y += 3) for (let x = xl + 2; x < xr - 2; x += 3) { const c = at(Math.max(0, Math.min(EW - 1, x)), Math.max(0, Math.min(EH - 1, y))); tot++; if ((c[0] + c[1] + c[2]) / 3 < 120) dark++; }
      cnt++;
      if (tot && dark / tot < 0.4) { bad++; missing.push(`(${w.s0.toFixed(1)}–${w.s1.toFixed(1)}, ${w.v0.toFixed(1)}–${w.v1.toFixed(1)})`); }
    }
    say("חזית " + fc.he + ": חלונות מהשרטוט שנבדקו " + cnt + ", בלי זכוכית במודל " + bad + (missing.length ? " — " + missing.slice(0, 8).join("; ") : ""));
  }
  const elevOut: Array<Array<[number, number]>> = [];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${EW}" height="${EH}">`;
  for (const p of chazPieces) {
    const ptsIn = p.pts!.every((q) => q.x >= a && q.x <= b && q.y >= GROUND_Y - 200 && q.y <= GROUND_Y + 2000);
    if (!ptsIn) continue;
    elevOut.push(p.pts!.map((q) => [Number(plan(q.x).toFixed(2)), Number(((q.y - GROUND_Y) / 100).toFixed(2))] as [number, number]));
    svg += `<polyline fill="none" stroke="#e00000" stroke-width="1.1" points="${p.pts!.map((q) => `${sx(plan(q.x)).toFixed(1)},${sy((q.y - GROUND_Y) / 100).toFixed(1)}`).join(" ")}"/>`;
  }
  svg += "</svg>";
  const out = path.join(outDir, `elev-${fc.id}.jpg`);
  await sharp(shot!).resize(EW, EH).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 88 }).toFile(out);
  console.log("elevation", out);
  elevAll[fc.id] = { lines: elevOut, u0, u1, v0, v1, rightIsPlus, lo, hi };
}
fs.writeFileSync(path.join(outDir, "elevations.json"), JSON.stringify(elevAll));
fs.writeFileSync(path.join(outDir, "report.md"), lines.join("\n"));

// ---- Overlays: each floor from above, cut 1.5 m over its level, the DXF wall ink laid over it.
const F = { x0: bx.x0 - 3, x1: bx.x1 + 3, z0: bx.z0 - 3, z1: bx.z1 + 3 };
const W = 2400;
const Hpx = Math.round((W * (F.z1 - F.z0)) / (F.x1 - F.x0));
const k = W / (F.x1 - F.x0);
for (const f of FLOORS) {
  const cx = (F.x0 + F.x1) / 2, cz = (F.z0 + F.z1) / 2;
  const [frame] = await renderBuildingFrames(
    [{ model, camera: { position: { x: cx, y: 400, z: cz }, target: { x: cx, y: 0, z: cz }, up: { x: 0, y: 0, z: -1 }, fovDeg: 30, orthoHalfWidth: (F.x1 - F.x0) / 2, cutAboveM: f.level + 1.5, interior: true, hideTags: ["roof", "site"].concat(FLOORS.filter((g) => g.level > f.level).map((g) => g.id)) }, width: W, height: Hpx, sun: { azimuthDeg: 160, elevationDeg: 72 }, exposure: 0.64, ao: false }],
    { outputWidthPx: 99999 },
  );
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hpx}">`;
  for (const [ax, ay, bx2, by] of read[f.id]!.segs) svg += `<line x1="${((ax - F.x0) * k).toFixed(1)}" y1="${((ay - F.z0) * k).toFixed(1)}" x2="${((bx2 - F.x0) * k).toFixed(1)}" y2="${((by - F.z0) * k).toFixed(1)}" stroke="#e00000" stroke-width="1.4"/>`;
  svg += "</svg>";
  const out = path.join(outDir, `overlay-${f.id}.jpg`);
  await sharp(frame!).resize(W, Hpx).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 88 }).toFile(out);
  console.log("overlay", out);
}
// Overview perspectives.
const ocx = (bx.x0 + bx.x1) / 2, ocz = (bx.z0 + bx.z1) / 2;
for (const [name, sx, sz] of [["se", 1, 1], ["nw", -1, -1], ["sw", -1, 1]] as const) {
  const [shot] = await renderBuildingFrames(
    [{ model, camera: { position: { x: ocx + sx * 70, y: 45, z: ocz + sz * 70 }, target: { x: ocx, y: 6, z: ocz }, fovDeg: 38 }, width: 1800, height: 1200, sun: { azimuthDeg: sx > 0 ? 140 : 230, elevationDeg: 38 }, exposure: 0.66, ao: true }],
    { outputWidthPx: 99999 },
  );
  await sharp(shot!).jpeg({ quality: 88 }).toFile(path.join(outDir, `view-${name}.jpg`));
  console.log("view", name);
}
process.exit(0);
