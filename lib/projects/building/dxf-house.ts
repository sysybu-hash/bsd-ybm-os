import {
  blockKind,
  doorWidthCm,
  GENERIC_CAD_PROFILE,
  hatchKind,
  layerKind,
  profileFor,
  type CadKind,
  type CadOfficeProfile,
} from "@/lib/projects/building/cad-layers";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import {
  anchorOf,
  apply,
  entitiesWithin,
  fillTriangles,
  flattenDxf,
  IDENTITY,
  readDxfDrawing,
  type DxfDrawing,
  type DxfPiece,
  type Pt,
} from "@/lib/projects/dxf-drawing";
import { levelMarks } from "@/lib/projects/floor-split";
import type { DrawnPiece, DwfArc, DwfGeometry, PlacedText } from "@/lib/projects/floorplan-dwf";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

/**
 * A house's sheets read from its DXF: for each, what the drawing says it
 * holds (the inventory — walls, doors with their widths, windows, parking
 * bays, lawns, fences, stairs, rooms, the plot) and the same sheet as the
 * geometry a DWF plot gives (`DwfGeometry`), so everything downstream of the
 * strip reader stands the house up unchanged.
 *
 * The inventory is the truth the model is checked against, item by item
 * (house-truth.ts); it was first written by hand for one DWG
 * (scripts/_dwg-truth) and is read here from any DXF whose office has a
 * profile (cad-layers.ts).
 */

type XY = [number, number];

export type CadSheet = {
  /** The layout tab's name, e.g. "A_קומת קרקע". */
  name: string;
  /** The model the sheet belongs to, from its name ("A"); the name itself when it names no model. */
  model: string;
  /** 0 the ground floor, 1 the first, −1 a basement, "roof"; null when the name does not say. */
  storey: number | "roof" | null;
  /** The model-space window the sheet shows, in drawing units. */
  centre: Pt;
  width: number;
  height: number;
};

export type InventoryInsert = {
  block: string;
  layer: string;
  at: XY;
  rotDeg: number;
  mirrored: boolean;
  box?: XY[];
  group?: string;
};

export type HouseInventory = {
  sheet: string;
  model: string;
  storey: number | "roof" | null;
  profile: string;
  unitsM: number;
  frame: string;
  walls: Array<{ layer: string; kind: "hatch" | "outline"; exterior: boolean; ring: XY[]; areaM2: number }>;
  wallLines: Array<{ layer: string; exterior: boolean; pts: XY[] }>;
  doors: Array<InventoryInsert & { widthCm: number | null; leafCm: number | null; opening: { hinge: XY; end: XY; centre: XY; widthM: number } | null }>;
  windows: Array<InventoryInsert & { centre?: XY; widthCm?: number; depthCm?: number; runs?: "x" | "z" }>;
  parking: Array<InventoryInsert & { rings: XY[][]; label?: string }>;
  hatches: Array<{ layer: string; pattern: string; solid: boolean; kind: CadKind | null; ring: XY[]; areaM2: number }>;
  fences: Array<{ pts: XY[]; closed: boolean }>;
  railings: Array<{ pts: XY[]; closed: boolean }>;
  stairs: Array<{ pts: XY[]; closed: boolean }>;
  overhead: Array<{ pts: XY[]; closed: boolean }>;
  plot: { block?: string; rings: XY[][] } | null;
  trees: InventoryInsert[];
  gates: InventoryInsert[];
  bins: InventoryInsert[];
  sanitary: InventoryInsert[];
  furniture: InventoryInsert[];
  other: InventoryInsert[];
  texts: Array<{ text: string; layer: string; at: XY; heightCm: number; via?: string }>;
  fenceTexts: Array<{ text: string; layer: string; at: XY; heightCm: number; via?: string }>;
  rooms: Array<{ name: string | null; at: XY; dims: string | null; statedM2: number | null }>;
  counts: {
    doors: number;
    doorWidths: Record<string, number>;
    windows: number;
    parking: number;
    rooms: number;
    lawnM2: number;
    pavingM2: number;
    trees: number;
    gates: number;
    fenceSegments: number;
    stairsLines: number;
    hatchPatterns: Record<string, number>;
  };
};

/**
 * A storey's name, as offices write it: in Hebrew, in English, or in Hebrew
 * written in Latin letters (Wolf's files are "tochnit karka", "tochnit 1",
 * "tochnit gag"). A transliterated word counts only as a word of its own, so
 * "gag" in a longer word is not a roof.
 */
const WORD = (alternatives: string) => new RegExp(String.raw`(?:^|[\s_\-.])(?:${alternatives})(?=[\s_\-.]|$)`, "i");
const STOREY_WORDS: Array<[RegExp, number | "roof"]> = [
  [/קומת\s*קרקע|קרקע|ground/i, 0],
  [WORD("karka|qarqa|karqa"), 0],
  [/קומה\s*א'?|קומהא|first|floor\s*1|level\s*1/i, 1],
  [/קומה\s*ב'?|קומהב|second|floor\s*2|level\s*2/i, 2],
  [/קומה\s*ג'?|קומהג|third|floor\s*3|level\s*3/i, 3],
  [/מרתף|basement/i, -1],
  [WORD("martef"), -1],
  [/גג|roof/i, "roof"],
  [WORD("gag"), "roof"],
];
/** "tochnit 2", "koma 3", "floor 4", "קומה 5": the storey by its number. */
const NUMBERED_STOREY = /(?:tochnit|toknit|komat|koma|floor|level|קומה)[\s_\-]*(\d{1,2})(?!\d)/i;

export function storeyOf(name: string): number | "roof" | null {
  for (const [re, storey] of STOREY_WORDS) if (re.test(name)) return storey;
  const numbered = NUMBERED_STOREY.exec(name);
  return numbered ? Number(numbered[1]) : null;
}

/** The model a sheet's name belongs to: the name without its storey and trailing copy number. */
export function modelOf(name: string): string {
  let rest = name;
  for (const [re] of [...STOREY_WORDS, [NUMBERED_STOREY] as const]) rest = rest.replace(re, " ");
  // "tochnit karka" leaves "tochnit" ("plan"), which names no model.
  rest = rest.replace(/(?:^|[\s_\-])(?:tochnit|toknit|komat|koma)(?=[\s_\-]|$)/gi, " ");
  rest = rest.replace(/[_\-–—]+/g, " ").replace(/\d+\s*$/, "").replace(/\s+/g, " ").trim();
  return rest || name.trim();
}

const SHEET_LIMIT = 1e7;

/**
 * The drawing's sheets: each layout tab's main viewport, the one that shows
 * the most of model space. A window several tabs share (a key plan, the
 * site) is no tab's own. A drawing with no layouts is one sheet, all of it.
 */
export function dxfSheets(drawing: DxfDrawing): CadSheet[] {
  const anchors = drawing.entities.flatMap((e) => {
    const p = anchorOf(e);
    return p && Math.abs(p.x) < SHEET_LIMIT && Math.abs(p.y) < SHEET_LIMIT ? [p] : [];
  });
  const key = (v: { centre: Pt; width: number; height: number }) => `${Math.round(v.centre.x)},${Math.round(v.centre.y)},${Math.round(v.width)},${Math.round(v.height)}`;
  const shared = new Map<string, number>();
  for (const l of drawing.layouts) for (const k of new Set(l.viewports.map(key))) shared.set(k, (shared.get(k) ?? 0) + 1);
  const sheets: CadSheet[] = [];
  for (const layout of drawing.layouts) {
    let best: { v: (typeof layout.viewports)[number]; count: number } | null = null;
    for (const v of layout.viewports) {
      if (Math.abs(v.centre.x) > SHEET_LIMIT || Math.abs(v.centre.y) > SHEET_LIMIT) continue;
      if ((shared.get(key(v)) ?? 0) >= 3) continue;
      const count = anchors.filter((p) => Math.abs(p.x - v.centre.x) <= v.width / 2 && Math.abs(p.y - v.centre.y) <= v.height / 2).length;
      if (count > 0 && (!best || count > best.count)) best = { v, count };
    }
    if (!best) continue;
    sheets.push({ name: layout.name, model: modelOf(layout.name), storey: storeyOf(layout.name), centre: best.v.centre, width: best.v.width, height: best.v.height });
  }
  if (sheets.length || !anchors.length) return sheets;
  const xs = anchors.map((p) => p.x);
  const ys = anchors.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return [{ name: "גיליון", model: "גיליון", storey: null, centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, width: (x1 - x0) * 1.05 || 1, height: (y1 - y0) * 1.05 || 1 }];
}

const blockCache = new WeakMap<DxfDrawing, Map<string, DxfPiece[]>>();

/** A block's own pieces about its base point, read once. */
function blockLocal(drawing: DxfDrawing, name: string, layer: string): DxfPiece[] {
  let cache = blockCache.get(drawing);
  if (!cache) blockCache.set(drawing, (cache = new Map()));
  const k = `${name}\u0000${layer}`;
  if (!cache.has(k)) {
    const blk = drawing.blocks.get(name);
    cache.set(k, blk ? flattenDxf(drawing, blk.entities, { m: IDENTITY, layer, path: [name], depth: 1 }) : []);
  }
  return cache.get(k)!;
}

function bbox(pts: Pt[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

function ringArea(r: Pt[]): number {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i]!;
    const b = r[(i + 1) % r.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

const UNIT_CANDIDATES = [0.001, 0.01, 0.0254, 0.1, 0.3048, 1];

/**
 * Metres per drawing unit. The header's $INSUNITS is believed only where the
 * drawing bears it out — Gottlieb's says millimetres and draws in
 * centimetres. Door leaves (0.5–1.2 m) decide first, then the sheet's size (a
 * house's sheet is 5–200 m across).
 */
export function inferUnitsM(drawing: DxfDrawing, pieces: DxfPiece[], profile: CadOfficeProfile, sheet?: CadSheet): number {
  const radii: number[] = [];
  for (const p of pieces) {
    if (!p.insert || blockKind(profile, p.insert, p.layer) !== "door") continue;
    const arcs = blockLocal(drawing, p.insert, p.layer).filter((q) => q.arc);
    const r = Math.max(0, ...arcs.map((q) => q.arc!.r));
    if (r > 0) radii.push(r * Math.sqrt(Math.abs(p.m!.a * p.m!.d - p.m!.b * p.m!.c)));
  }
  radii.sort((a, b) => a - b);
  const leaf = radii[radii.length >> 1];
  const fits = (u: number) => (leaf != null ? leaf * u >= 0.45 && leaf * u <= 1.25 : sheet ? sheet.width * u >= 5 && sheet.width * u <= 200 : false);
  if (drawing.headerUnitsM && fits(drawing.headerUnitsM)) return drawing.headerUnitsM;
  return UNIT_CANDIDATES.find(fits) ?? drawing.headerUnitsM ?? 0.01;
}

/** Hebrew words on a plan that name no room: its fences, its yard, its titles. */
export const ROOM_EXCLUDE = /גדר|מעקה|חניה|כניסה|קומ|פחי|פילר|שער|גינון|ריצוף|מונה|חזית|חתך|קנ"מ|תכנית/;
const DIMS = /^\d+(\.\d+)?\s*\*\s*\d+(\.\d+)?/;

/**
 * A room label's "W*L", as the architect writes it under the room's name:
 * its two sides in metres, and their product. What follows the two numbers
 * ("3.00*3.40 /") is not read — it left the ממ"ד and the baths without an area.
 */
export function parseRoomDims(text: string): { w: number; l: number; areaM2: number } | null {
  const m = /^(\d+(?:\.\d+)?)\s*\*\s*(\d+(?:\.\d+)?)/.exec(text.trim());
  if (!m) return null;
  const [w, l] = [Number(m[1]), Number(m[2])];
  if (!(w > 0 && l > 0 && w < 40 && l < 40)) return null;
  return { w, l, areaM2: Math.round(w * l * 100) / 100 };
}

/**
 * What one sheet of the drawing holds, in metres: x to the sheet's right, z
 * down it, from the sheet's centre.
 */
export function houseInventory(drawing: DxfDrawing, sheet: CadSheet, options?: { profile?: CadOfficeProfile; pieces?: DxfPiece[]; unitsM?: number }): HouseInventory {
  const profile = options?.profile ?? profileFor(drawing.layers.keys());
  const pieces = options?.pieces ?? flattenDxf(drawing, entitiesWithin(drawing, sheet));
  const u = options?.unitsM ?? inferUnitsM(drawing, pieces, profile, sheet);
  const P = (p: Pt): XY => [Math.round((p.x - sheet.centre.x) * u * 1000) / 1000, Math.round(-(p.y - sheet.centre.y) * u * 1000) / 1000];
  const cm = (v: number) => Math.round(v * u * 100);
  const m2 = (r: Pt[]) => Math.round(ringArea(r) * u * u * 1000) / 1000;
  const inv: HouseInventory = {
    sheet: sheet.name,
    model: sheet.model,
    storey: sheet.storey,
    profile: profile.id,
    unitsM: u,
    frame: "metres; x to the sheet's right, z down the sheet; origin = the sheet's centre",
    walls: [],
    wallLines: [],
    doors: [],
    windows: [],
    parking: [],
    hatches: [],
    fences: [],
    railings: [],
    stairs: [],
    overhead: [],
    plot: null,
    trees: [],
    gates: [],
    bins: [],
    sanitary: [],
    furniture: [],
    other: [],
    texts: [],
    fenceTexts: [],
    rooms: [],
    counts: { doors: 0, doorWidths: {}, windows: 0, parking: 0, rooms: 0, lawnM2: 0, pavingM2: 0, trees: 0, gates: 0, fenceSegments: 0, stairsLines: 0, hatchPatterns: {} },
  };

  const groupOf = (path: string[]) => (path.length === 1 && blockKind(profile, path[0]!, "") === "group" ? path[0] : undefined);
  const loose = (p: DxfPiece) => p.path.length === 0 || groupOf(p.path) != null;

  for (const ins of pieces) {
    if (!ins.insert || !loose(ins)) continue;
    const kind = blockKind(profile, ins.insert, ins.layer);
    if (kind === "group" || kind === "ignore") continue;
    const local = blockLocal(drawing, ins.insert, ins.layer);
    const pts = local.flatMap((q) => q.pts ?? q.rings?.flat() ?? []);
    const lb = pts.length ? bbox(pts) : null;
    const m = ins.m!;
    const world = (p: Pt) => apply(m, p);
    const rec: InventoryInsert = {
      block: ins.insert,
      layer: ins.layer,
      at: P(ins.at!),
      rotDeg: Math.round(((ins.rot ?? 0) * 180) / Math.PI * 10) / 10,
      mirrored: ins.mirrored ?? false,
      group: groupOf(ins.path),
    };
    if (lb) rec.box = [{ x: lb.x0, y: lb.y0 }, { x: lb.x1, y: lb.y0 }, { x: lb.x1, y: lb.y1 }, { x: lb.x0, y: lb.y1 }].map(world).map(P);
    const s = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
    if (kind === "door") {
      const arc = local.filter((q) => q.arc).sort((a, b) => b.arc!.r - a.arc!.r)[0];
      let opening: HouseInventory["doors"][number]["opening"] = null;
      if (arc?.arc) {
        const h = arc.arc.c;
        const r = arc.arc.r;
        const ends = [arc.pts![0]!, arc.pts![arc.pts!.length - 1]!];
        // The leaf is the line from the hinge one radius long; the opening runs from the hinge to the arc's end away from it.
        const leaf = local.find((q) => q.type === "LINE" && q.pts!.some((p) => Math.hypot(p.x - h.x, p.y - h.y) < r * 0.05) && Math.abs(Math.hypot(q.pts![0]!.x - q.pts![1]!.x, q.pts![0]!.y - q.pts![1]!.y) - r) < r * 0.15);
        let wallEnd = ends[0]!;
        if (leaf) {
          const tip = leaf.pts!.find((p) => Math.hypot(p.x - h.x, p.y - h.y) > r * 0.05) ?? leaf.pts![1]!;
          wallEnd = [...ends].sort((a, b) => Math.hypot(b.x - tip.x, b.y - tip.y) - Math.hypot(a.x - tip.x, a.y - tip.y))[0]!;
        }
        const a = world(h);
        const b = world(wallEnd);
        opening = { hinge: P(a), end: P(b), centre: P({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), widthM: Math.round(Math.hypot(a.x - b.x, a.y - b.y) * u * 100) / 100 };
      }
      const leafCm = arc?.arc ? cm(arc.arc.r * s) : null;
      inv.doors.push({ ...rec, widthCm: doorWidthCm(profile, ins.insert) ?? (leafCm != null ? leafCm + 10 : null), leafCm, opening });
    } else if (kind === "window") {
      const win: HouseInventory["windows"][number] = { ...rec };
      if (lb) {
        const along = lb.x1 - lb.x0 >= lb.y1 - lb.y0;
        const ax = along ? { x: m.a, y: m.b } : { x: m.c, y: m.d };
        win.centre = P(world({ x: (lb.x0 + lb.x1) / 2, y: (lb.y0 + lb.y1) / 2 }));
        win.widthCm = cm(along ? (lb.x1 - lb.x0) * Math.hypot(m.a, m.b) : (lb.y1 - lb.y0) * Math.hypot(m.c, m.d));
        win.depthCm = cm(along ? (lb.y1 - lb.y0) * Math.hypot(m.c, m.d) : (lb.x1 - lb.x0) * Math.hypot(m.a, m.b));
        win.runs = Math.abs(ax.x) >= Math.abs(ax.y) ? "x" : "z";
      }
      // A window drawn twice is one: Gottlieb A's "add on" group holds its own
      // copy of a window the plan already draws, at the very same place.
      const same = (w: typeof win) => w.centre && win.centre && Math.hypot(w.centre[0] - win.centre[0], w.centre[1] - win.centre[1]) < 0.03 && w.widthCm === win.widthCm;
      if (!inv.windows.some(same)) inv.windows.push(win);
    } else if (kind === "parking") {
      const rings = local.filter((q) => q.pts && (q.closed || q.type === "LWPOLYLINE")).map((q) => q.pts!.map(world).map(P));
      inv.parking.push({ ...rec, rings, label: local.find((q) => q.text)?.text });
    } else if (kind === "plot") inv.plot = { block: ins.insert, rings: local.filter((q) => q.pts).map((q) => q.pts!.map(world).map(P)) };
    else if (kind === "tree" || kind === "planting") inv.trees.push(rec);
    else if (kind === "gate") inv.gates.push(rec);
    else if (kind === "bins") inv.bins.push(rec);
    else if (kind === "sanitary") inv.sanitary.push(rec);
    else if (kind === "furniture" || layerKind(profile, ins.layer) == null || ins.layer === "0") inv.furniture.push(rec);
    else inv.other.push(rec);
  }

  for (const p of pieces) {
    if (p.insert) continue;
    const inBlock = !loose(p);
    const blockName = p.path[0] ?? "";
    const lk = layerKind(profile, p.layer);
    if ((lk === "wall-ext" || lk === "wall-int") && !inBlock) {
      const exterior = lk === "wall-ext";
      if (p.rings) for (const r of p.rings) inv.walls.push({ layer: p.layer, kind: "hatch", exterior, ring: r.map(P), areaM2: m2(r) });
      else if (p.pts && p.closed) inv.walls.push({ layer: p.layer, kind: "outline", exterior, ring: p.pts.map(P), areaM2: m2(p.pts) });
      else if (p.pts) inv.wallLines.push({ layer: p.layer, exterior, pts: p.pts.map(P) });
      continue;
    }
    if (p.type === "HATCH" && p.rings && !inBlock) {
      const kind = hatchKind(profile, p.pattern ?? "", p.layer);
      if ((kind === "wall-ext" || kind === "wall-int") && p.solid) {
        for (const r of p.rings) inv.walls.push({ layer: p.layer, kind: "hatch", exterior: kind === "wall-ext", ring: r.map(P), areaM2: m2(r) });
        continue;
      }
      for (const r of p.rings) inv.hatches.push({ layer: p.layer, pattern: p.pattern ?? "", solid: p.solid ?? false, kind, ring: r.map(P), areaM2: m2(r) });
      continue;
    }
    if (p.pts && !inBlock && !p.dimension) {
      const line = { pts: p.pts.map(P), closed: p.closed ?? false };
      if (lk === "fence") inv.fences.push(line);
      else if (lk === "railing") inv.railings.push(line);
      else if (lk === "stairs") inv.stairs.push(line);
      else if (lk === "overhead") inv.overhead.push(line);
      else if (lk === "plot" && !inv.plot) inv.plot = { rings: [p.pts.map(P)] };
      else if (lk === "plot") inv.plot!.rings.push(p.pts.map(P));
      continue;
    }
    if (p.text != null && !p.dimension && !p.path.some((n) => n.startsWith("*D"))) {
      const t = { text: p.text, layer: p.layer, at: P(p.at!), heightCm: cm(p.height ?? 0), via: inBlock ? blockName : undefined };
      const fromLabelBlock = inBlock && blockKind(profile, blockName, p.layer) === "ignore";
      if (fromLabelBlock || /גדר|מעקה/.test(p.text)) inv.fenceTexts.push(t);
      if (!inBlock || fromLabelBlock) inv.texts.push(t);
    }
  }

  // Rooms: a name, and the "W*L" under it.
  const dims = inv.texts.filter((t) => DIMS.test(t.text.replace(/\s/g, "")));
  const names = inv.texts.filter((t) => /[\u0590-\u05FF]/.test(t.text) && !ROOM_EXCLUDE.test(t.text) && t.text.length <= 24);
  const used = new Set<(typeof dims)[number]>();
  for (const n of names) {
    const near = dims
      .filter((q) => !used.has(q))
      .map((q) => ({ q, d: Math.hypot(q.at[0] - n.at[0], q.at[1] - n.at[1]) }))
      .sort((a, b) => a.d - b.d)[0];
    const dim = near && near.d < 1.6 ? near.q : null;
    if (dim) used.add(dim);
    inv.rooms.push({ name: n.text, at: n.at, dims: dim?.text ?? null, statedM2: dim ? (parseRoomDims(dim.text)?.areaM2 ?? null) : null });
  }
  for (const d of dims) {
    if (used.has(d)) continue;
    inv.rooms.push({ name: null, at: d.at, dims: d.text, statedM2: parseRoomDims(d.text)?.areaM2 ?? null });
  }

  const sum = (kind: CadKind) => Math.round(inv.hatches.filter((h) => h.kind === kind).reduce((s, h) => s + h.areaM2, 0) * 10) / 10;
  inv.counts = {
    doors: inv.doors.length,
    doorWidths: inv.doors.reduce<Record<string, number>>((o, d) => ((o[String(d.widthCm)] = (o[String(d.widthCm)] ?? 0) + 1), o), {}),
    windows: inv.windows.length,
    parking: inv.parking.length,
    rooms: inv.rooms.length,
    lawnM2: sum("lawn"),
    pavingM2: sum("paving"),
    trees: inv.trees.length,
    gates: inv.gates.length + (inv.texts.some((t) => /שער/.test(t.text)) && !inv.gates.length ? 1 : 0),
    fenceSegments: inv.fences.length,
    stairsLines: inv.stairs.length,
    hatchPatterns: inv.hatches.reduce<Record<string, number>>((o, h) => {
      const k = `${h.pattern}@${h.layer}`;
      o[k] = Math.round(((o[k] ?? 0) + h.areaM2) * 10) / 10;
      return o;
    }, {}),
  };
  return inv;
}

/** A wall's solid fill, in the grey a permit plot prints poché in (dwf-floor reads walls from it). */
export const POCHE_PEN = 0x1000000 | 0x989898;
/** The heavy pen a permit plot draws walls' faces in: 0.4 mm, in points. */
const HEAVY_PEN_PT = 1.14;

/** A colour as a plotted pen: black ink is pen 0, as a DWF's default pen; any other colour its RGB. */
function penOf(colour: number): number {
  return colour === 0 ? 0 : 0x1000000 | colour;
}

/**
 * A line's pen as a permit set is plotted: its colours in black and its greys
 * screened (an office's plot style), so the strip readers see the ink a DWF
 * gives them. Hatch strokes keep their colour — the lawn's dots and the
 * pavers' herringbone are told apart by it (house-yard.ts).
 */
function linePen(colour: number): number {
  const r = (colour >> 16) & 0xff;
  const g = (colour >> 8) & 0xff;
  const b = colour & 0xff;
  return Math.max(r, g, b) - Math.min(r, g, b) <= 8 && colour !== 0 ? 0x1000000 | colour : 0;
}

/** A neutral grey a fill must not print in unless it is a wall, or the wall reader takes it for poché. */
function pocheLike(colour: number): boolean {
  const r = (colour >> 16) & 0xff;
  const g = (colour >> 8) & 0xff;
  const b = colour & 0xff;
  return Math.max(r, g, b) - Math.min(r, g, b) <= 8 && r < 0xc0 && r > 0x30;
}

/** A neutral grey, light grey (ACI 9's #c0c0c0) included: the colours walls are hatched in. */
function greyFill(colour: number): boolean {
  const r = (colour >> 16) & 0xff;
  const g = (colour >> 8) & 0xff;
  const b = colour & 0xff;
  return Math.max(r, g, b) - Math.min(r, g, b) <= 8 && r <= 0xd0 && r > 0x30;
}

/**
 * The sheet as a DWF plot draws it: page points at 1:100, y down from the
 * window's top-left, every line, curve, pattern stroke, fill and text the
 * strip reader and the house readers take from a DWF.
 */
export function sheetGeometryFromDxf(drawing: DxfDrawing, sheet: CadSheet, options?: { profile?: CadOfficeProfile; pieces?: DxfPiece[]; unitsM?: number }): DwfGeometry {
  const profile = options?.profile ?? profileFor(drawing.layers.keys());
  const pieces = options?.pieces ?? flattenDxf(drawing, entitiesWithin(drawing, sheet));
  const u = options?.unitsM ?? inferUnitsM(drawing, pieces, profile, sheet);
  const k = u * DWF_FLOOR_UNITS_PER_METRE;
  const x0 = sheet.centre.x - sheet.width / 2;
  const yTop = sheet.centre.y + sheet.height / 2;
  const px = (p: Pt): [number, number] => [(p.x - x0) * k, (yTop - p.y) * k];
  const width = (mm: number) => (mm >= 0.4 ? (mm * 72) / 25.4 : 0.5);

  const segments: VectorSegment[] = [];
  const curves: VectorSegment[] = [];
  const texts: PlacedText[] = [];
  const fills: Array<Array<[number, number]>> = [];
  const fillPens: number[] = [];
  const arcs: DwfArc[] = [];
  const push = (into: VectorSegment[], a: Pt, b: Pt, lineWidth: number, pen: number) => {
    const [x1, y1] = px(a);
    const [x2, y2] = px(b);
    into.push({ x1, y1, x2, y2, lineWidth, stroke: pen });
  };
  const heavyKinds = profile.heavy ?? GENERIC_CAD_PROFILE.heavy ?? [];
  // The drawing's own colours, for its picture (DwfGeometry.display). Black on white: white ink is drawn black.
  const ink = (c: number) => (c === 0xffffff || c === 0 ? 0x111111 : c);
  const display: NonNullable<DwfGeometry["display"]> = { lines: [], fills: [] };
  for (const p of pieces) {
    if (p.insert) continue;
    if (p.text != null && p.at && !p.dimension) {
      const [x, y] = px(p.at);
      texts.push({ x, y, text: p.text, height: (p.height ?? 0) * k });
      continue;
    }
    if (p.rings) {
      const hk = hatchKind(profile, p.pattern ?? "", p.layer);
      // A wall is filled loose (or in a group block) and in grey; a block's own fill — a column symbol — or a coloured one — a counter's wood — is not poché even on a wall layer.
      const wall =
        (hk === "wall-ext" || hk === "wall-int") &&
        greyFill(p.colour) &&
        (p.path.length === 0 || (p.path.length === 1 && blockKind(profile, p.path[0]!, "") === "group"));
      if (p.solid) for (const tri of fillTriangles(p.rings)) display.fills.push({ pts: tri.map(px), rgb: ink(p.colour) });
      for (const [a, b] of p.strokes ?? []) {
        const [x1, y1] = px(a);
        const [x2, y2] = px(b);
        display.lines.push({ x1, y1, x2, y2, rgb: ink(p.colour), w: width(p.weightMm) });
      }
      if (p.solid) {
        // A plot prints an office's other fills in its default pen; a drawing from an unknown office keeps its dark greys, which is how the DWF reader finds poché too.
        const pen = wall ? POCHE_PEN : profile === GENERIC_CAD_PROFILE && pocheLike(p.colour) ? penOf(p.colour) : 0;
        for (const tri of fillTriangles(p.rings)) {
          fills.push(tri.map(px));
          fillPens.push(pen);
        }
      }
      const pen = penOf(p.colour);
      for (const [a, b] of p.strokes ?? []) push(segments, a, b, width(p.weightMm), pen);
      continue;
    }
    if (!p.pts || p.pts.length < 2) continue;
    const curved = Boolean(p.arc || p.circle || p.type === "ELLIPSE" || p.type === "SPLINE");
    const lk = layerKind(profile, p.layer);
    const heavy = lk != null && heavyKinds.includes(lk);
    const lineWidth = heavy ? Math.max(HEAVY_PEN_PT, width(p.weightMm)) : width(p.weightMm);
    const pen = heavy ? 0 : linePen(p.colour);
    for (let i = 1; i < p.pts.length; i++) push(curved ? curves : segments, p.pts[i - 1]!, p.pts[i]!, lineWidth, pen);
    for (let i = 1; i < p.pts.length; i++) {
      const [x1, y1] = px(p.pts[i - 1]!);
      const [x2, y2] = px(p.pts[i]!);
      display.lines.push({ x1, y1, x2, y2, rgb: ink(p.colour), w: lineWidth });
    }
    // A DWF's arcs are page angles: y runs down, so a world sweep from s to e is −e to −s.
    if (p.arc) {
      const [cx, cy] = px(p.arc.c);
      let end = p.arc.end;
      while (end <= p.arc.start) end += Math.PI * 2;
      arcs.push({ cx, cy, r: p.arc.r * k, start: -end, end: -p.arc.start });
    } else if (p.circle) {
      const [cx, cy] = px(p.circle.c);
      arcs.push({ cx, cy, r: p.circle.r * k, start: -Math.PI * 2, end: 0 });
    }
  }
  return { pageWidth: sheet.width * k, pageHeight: sheet.height * k, segments, curves, walls: [], texts, fills, fillPens, arcs, display };
}

/**
 * The furniture a sheet's CAD blocks name, as the furniture readers name it,
 * on the page (`sheetGeometryFromDxf`'s frame): a wardrobe ("aron"), a bed, a
 * dining table with its chairs, a sofa, a bath, a basin's vanity, a WC, a
 * sink, a hob, a fridge, a washer. Named blocks by their name; the office's
 * anonymous ones (*U…) by their layer and size. Read from the drawing, no
 * shape is guessed: Gottlieb A's second bedroom's row of floor tiles was read
 * from the plot as a shelf and its wardrobe was lost (12/10/2026).
 */
/**
 * The walls an office hatches in a pattern, not filled solid, printed as
 * poché: the page's wall reader finds solid grey, and on Gottlieb A's upper
 * floor the corner piers — hatched, between two windows — were read as
 * nothing; the corners stood open, a niche in each (12/10/2026). A hatch the
 * inventory calls a wall, as thin as one (twice its area over its perimeter
 * under 36 cm — a wall 30 cm thick, an L of two), is filled.
 */
function withHatchedWalls(g: DwfGeometry, inv: HouseInventory, sheet: CadSheet, unitsM: number): DwfGeometry {
  const k = DWF_FLOOR_UNITS_PER_METRE;
  const [hw, hh] = [(sheet.width * unitsM) / 2, (sheet.height * unitsM) / 2];
  const fills = [...g.fills];
  const fillPens = [...(g.fillPens ?? g.fills.map(() => 0))];
  let added = 0;
  // The house's extent: its walls' hatch — the yard's walls are drawn in outline, not hatched.
  const outer = (inv.walls as Array<{ kind?: string; exterior?: boolean; ring: Array<[number, number]> }>).filter((w) => w.kind === "hatch").flatMap((w) => w.ring);
  const house = outer.length
    ? { x0: Math.min(...outer.map(([x]) => x)), x1: Math.max(...outer.map(([x]) => x)), z0: Math.min(...outer.map(([, z]) => z)), z1: Math.max(...outer.map(([, z]) => z)) }
    : null;
  for (const w of inv.walls as Array<{ kind?: string; ring?: Array<[number, number]> }>) {
    // A partition drawn as its outline — two lines closed at their ends, no
    // fill — is a wall as much as a hatched one: Gottlieb A's plasterboard
    // walls round its bathrooms and halls were left out (13/10/2026).
    // An outline on the outer walls' layer is a garden wall, raised a storey high it stood across the yard.
    const ww = w as { kind?: string; ring?: Array<[number, number]>; exterior?: boolean };
    if ((ww.kind !== "hatch" && !(ww.kind === "outline" && !ww.exterior)) || !w.ring || w.ring.length < 3) continue;
    if (ww.kind === "outline") {
      // Only within the house — its outer walls' extent: the yard's walls share the layer.
      const xs = w.ring.map(([x]) => x), zs = w.ring.map(([, z]) => z);
      if (!house || Math.min(...xs) < house.x0 - 0.05 || Math.max(...xs) > house.x1 + 0.05 || Math.min(...zs) < house.z0 - 0.05 || Math.max(...zs) > house.z1 + 0.05) continue;
      // And not a room name's frame: a box with the name written in it.
      const inside = (t: { x: number; y: number }) => {
        const [tx, tz] = [t.x / k - hw, t.y / k - hh];
        return tx >= Math.min(...xs) && tx <= Math.max(...xs) && tz >= Math.min(...zs) && tz <= Math.max(...zs);
      };
      if (g.texts.some(inside)) continue;
    }
    const ring = w.ring.map(([x, z]) => ({ x, y: z }));
    let area = 0;
    let perimeter = 0;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      area += a.x * b.y - b.x * a.y;
      perimeter += Math.hypot(b.x - a.x, b.y - a.y);
    }
    area = Math.abs(area) / 2;
    if (area < 0.02 || perimeter === 0 || (2 * area) / perimeter > 0.36) continue;
    for (const tri of fillTriangles([ring])) {
      fills.push(tri.map((q) => [(q.x + hw) * k, (q.y + hh) * k] as [number, number]));
      fillPens.push(POCHE_PEN);
      added++;
    }
  }
  return added ? { ...g, fills, fillPens } : g;
}

/**
 * A room's name is printed on a small filled box — its mask, on the same
 * layer as the walls' hatch — and the box was read as wall: Gottlieb A's
 * upper floor stood a pillar in its ממ"ד, its bathroom and its bedroom
 * (13/10/2026). A box no larger than a label, with a name or a room's
 * dimensions written in it, is the label's.
 */
function withoutLabelBoxes(g: DwfGeometry, inv: HouseInventory, sheet: CadSheet, unitsM: number): DwfGeometry {
  if (!g.fillPens) return g;
  const k = DWF_FLOOR_UNITS_PER_METRE;
  const [hw, hh] = [(sheet.width * unitsM) / 2, (sheet.height * unitsM) / 2];
  const labels = g.texts.filter((t) => /[֐-׿]/.test(t.text) || /\d\s*[*x×]\s*\d/.test(t.text));
  type Box = [number, number, number, number];
  const small: Box[] = [];
  for (const w of inv.walls) {
    if (w.kind !== "hatch" || w.ring.length < 4 || w.areaM2 > 0.8) continue;
    const xs = w.ring.map(([x]) => x);
    const zs = w.ring.map(([, z]) => z);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    // A label's size: a line of text high, a name or two long.
    const [s, l] = [Math.min(x1 - x0, z1 - z0), Math.max(x1 - x0, z1 - z0)];
    if (s > 0.36 || l > 1.4 || w.areaM2 < 0.85 * (x1 - x0) * (z1 - z0)) continue;
    small.push([(x0 + hw) * k, (z0 + hh) * k, (x1 + hw) * k, (z1 + hh) * k]);
  }
  const m = 0.05 * k;
  const named = small.filter((b) => labels.some((t) => t.x >= b[0] - m && t.x <= b[2] + m && t.y >= b[1] - m && t.y <= b[3] + m));
  // A label is two boxes, its name's and its dimensions', and the dimensions
  // may be set beside theirs: a box laid flat against a named one, the same
  // way and most of its length, is the label's. One step only — run on from
  // box to box, it took the short walls round Gottlieb A's ממ"ד (13/10/2026).
  const wide = (b: Box) => b[2] - b[0] >= b[3] - b[1];
  const stacked = (a: Box, b: Box) => {
    if (wide(a) !== wide(b)) return false;
    const [u, v] = wide(a) ? [0, 1] : [1, 0];
    const along = Math.min(a[u + 2]!, b[u + 2]!) - Math.max(a[u]!, b[u]!);
    const gap = Math.max(a[v]!, b[v]!) - Math.min(a[v + 2]!, b[v + 2]!);
    return gap <= m && along >= 0.6 * Math.min(a[u + 2]! - a[u]!, b[u + 2]! - b[u]!);
  };
  const boxes = [...named, ...small.filter((b) => !named.includes(b) && named.some((l) => stacked(l, b)))];
  if (!boxes.length) return g;
  const fillPens = g.fillPens.map((pen, i) =>
    pen === POCHE_PEN && boxes.some(([x0, y0, x1, y1]) => g.fills[i]!.every(([x, y]) => x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1)) ? 0 : pen,
  );
  return { ...g, fillPens };
}

/** Whether a point is inside a ring (even–odd). */
function inRing(r: XY[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i]!;
    const [xj, zj] = r[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The kitchen's worktops, hatched solid on a wall layer: a run 50–70 cm deep
 * with the sink or the hob drawn on it — a straight run, or an L drawn as one
 * hatch — and a straight run carried on from one round the corner. Read as
 * wall, Gottlieb A's worktop stood a full storey high round its sink
 * (13/10/2026). The pieces in page units; the rings, in metres, whose fill is
 * the worktops' and no wall's.
 */
function drawnWorktops(inv: HouseInventory, sheet: CadSheet, unitsM: number): { pieces: DrawnPiece[]; rings: XY[][] } {
  const k = DWF_FLOOR_UNITS_PER_METRE;
  const [hw, hh] = [(sheet.width * unitsM) / 2, (sheet.height * unitsM) / 2];
  type Box = { x0: number; x1: number; z0: number; z1: number };
  const boxOf = (r: XY[]): Box => ({ x0: Math.min(...r.map((p) => p[0])), x1: Math.max(...r.map((p) => p[0])), z0: Math.min(...r.map((p) => p[1])), z1: Math.max(...r.map((p) => p[1])) });
  // A square-cornered ring as rectangles: its cells between the corners' lines, run together.
  const rects = (r: XY[]): Box[] => {
    const xs = [...new Set(r.map((p) => Math.round(p[0] * 1000) / 1000))].sort((a, b) => a - b);
    const zs = [...new Set(r.map((p) => Math.round(p[1] * 1000) / 1000))].sort((a, b) => a - b);
    if (xs.length > 8 || zs.length > 8) return [];
    const strips: Box[] = [];
    for (let j = 0; j + 1 < zs.length; j++) {
      let open: Box | null = null;
      for (let i = 0; i + 1 < xs.length; i++) {
        const cell = inRing(r, (xs[i]! + xs[i + 1]!) / 2, (zs[j]! + zs[j + 1]!) / 2);
        if (cell && open) open.x1 = xs[i + 1]!;
        else if (cell) open = { x0: xs[i]!, x1: xs[i + 1]!, z0: zs[j]!, z1: zs[j + 1]! };
        if (!cell && open) (strips.push(open), (open = null));
      }
      if (open) strips.push(open);
    }
    const out: Box[] = [];
    for (const s of strips) {
      const above = out.find((o) => Math.abs(o.x0 - s.x0) < 1e-3 && Math.abs(o.x1 - s.x1) < 1e-3 && Math.abs(o.z1 - s.z0) < 1e-3);
      if (above) above.z1 = s.z1;
      else out.push({ ...s });
    }
    return out;
  };
  const cooking = [...inv.furniture, ...inv.sanitary, ...inv.other]
    .filter((it) => it.box && /kiyor|gaz/i.test(it.block))
    .map((it) => boxOf(it.box!))
    .map((c) => [(c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2] as XY);
  const deep = (b: Box) => Math.min(b.x1 - b.x0, b.z1 - b.z0) >= 0.45 && Math.min(b.x1 - b.x0, b.z1 - b.z0) <= 0.75;
  // Each hatch as its rectangles; a worktop's are all a worktop deep.
  const runs = inv.walls
    .filter((w) => w.kind === "hatch" && w.ring.length >= 4 && w.areaM2 <= 3.5)
    .map((w) => ({ ring: w.ring, parts: rects(w.ring) }))
    .filter(({ parts }) => parts.length > 0 && parts.length <= 3 && parts.every(deep));
  const held = runs.filter(({ ring }) => cooking.some(([x, z]) => inRing(ring, x, z)));
  const touch = (a: Box, b: Box) => a.x0 <= b.x1 + 0.05 && b.x0 <= a.x1 + 0.05 && a.z0 <= b.z1 + 0.05 && b.z0 <= a.z1 + 0.05;
  // One straight run round the corner, not on from run to run along the walls.
  const carried = runs.filter((r) => !held.includes(r) && r.parts.length === 1 && held.some((h) => h.parts.some((p) => touch(p, r.parts[0]!))));
  const tops = [...held, ...carried];
  return {
    pieces: tops.flatMap((t) => t.parts).map((b) => ({ x: (b.x0 + hw) * k, y: (b.z0 + hh) * k, w: (b.x1 - b.x0) * k, h: (b.z1 - b.z0) * k, kind: "counter" as const })),
    rings: tops.map((t) => t.ring),
  };
}

/** The yard's lawn, paving and planting as the file's hatches name them (cad-layers.ts), and its windows as its blocks place them, in page units. */
function withZones(g: DwfGeometry, inv: HouseInventory, sheet: CadSheet, unitsM: number): DwfGeometry {
  const k = DWF_FLOOR_UNITS_PER_METRE;
  const [hw, hh] = [(sheet.width * unitsM) / 2, (sheet.height * unitsM) / 2];
  const windowsDrawn = inv.windows.flatMap((w) => {
    if (!w.box || !w.runs) return [];
    const xs = w.box.map(([x]) => (x + hw) * k);
    const ys = w.box.map(([, z]) => (z + hh) * k);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0, runs: w.runs === "x" ? ("x" as const) : ("y" as const) }];
  });
  const zones = inv.hatches
    .filter((h) => (h.kind === "lawn" || h.kind === "paving" || h.kind === "planting") && h.ring.length >= 3 && h.areaM2 >= 0.2)
    .map((h) => ({ kind: h.kind as "lawn" | "paving" | "planting", ring: h.ring.map(([x, z]) => [(x + hw) * k, (z + hh) * k] as [number, number]) }));
  const wallLines = inv.wallLines.flatMap((l) => l.pts.slice(1).map((b, i) => ({ x1: (l.pts[i]![0] + hw) * k, y1: (l.pts[i]![1] + hh) * k, x2: (b[0] + hw) * k, y2: (b[1] + hh) * k, ...(l.exterior ? {} : { inner: true }) })));
  const stairLines = inv.stairs.flatMap((st) => {
    const pts = st.closed ? [...st.pts, st.pts[0]!] : st.pts;
    return pts.slice(1).map((b, i) => ({ x1: (pts[i]![0] + hw) * k, y1: (pts[i]![1] + hh) * k, x2: (b[0] + hw) * k, y2: (b[1] + hh) * k }));
  });
  // The overhead lines over a stair, within half a metre of it: its walk line, arrow and break line.
  // A stair is its treads' boxes run together — the ground floor draws its second flight only in hidden lines, its arrow over them.
  let stairBoxes = inv.stairs.map((st) => {
    const xs = st.pts.map(([x]) => x);
    const zs = st.pts.map(([, z]) => z);
    return { x0: Math.min(...xs) - 0.5, x1: Math.max(...xs) + 0.5, z0: Math.min(...zs) - 0.5, z1: Math.max(...zs) + 0.5 };
  });
  for (let merged = true; merged; ) {
    merged = false;
    const next: typeof stairBoxes = [];
    for (const b of stairBoxes) {
      const m = next.find((o) => b.x0 <= o.x1 && b.x1 >= o.x0 && b.z0 <= o.z1 && b.z1 >= o.z0);
      if (m) {
        Object.assign(m, { x0: Math.min(m.x0, b.x0), x1: Math.max(m.x1, b.x1), z0: Math.min(m.z0, b.z0), z1: Math.max(m.z1, b.z1) });
        merged = true;
      } else next.push({ ...b });
    }
    stairBoxes = next;
  }
  const overStair = ([x, z]: XY) => stairBoxes.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
  const walkLines = inv.overhead
    .filter((l) => !l.closed && l.pts.length >= 2 && l.pts.every(overStair))
    .flatMap((l) => l.pts.slice(1).map((b, i) => ({ x1: (l.pts[i]![0] + hw) * k, y1: (l.pts[i]![1] + hh) * k, x2: (b[0] + hw) * k, y2: (b[1] + hh) * k })));
  const parkingDrawn = inv.parking.flatMap((p) => {
    if (!p.box) return [];
    const xs = p.box.map(([x]) => (x + hw) * k), ys = p.box.map(([, z]) => (z + hh) * k);
    return [{ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }];
  });
  // The plot: the largest ring of its block.
  const plotRing = inv.plot?.rings.slice().sort((a, b) => (Math.max(...b.map((p) => p[0])) - Math.min(...b.map((p) => p[0]))) - (Math.max(...a.map((p) => p[0])) - Math.min(...a.map((p) => p[0]))))[0];
  const plotDrawn = plotRing
    ? { x0: (Math.min(...plotRing.map((p) => p[0])) + hw) * k, x1: (Math.max(...plotRing.map((p) => p[0])) + hw) * k, y0: (Math.min(...plotRing.map((p) => p[1])) + hh) * k, y1: (Math.max(...plotRing.map((p) => p[1])) + hh) * k }
    : null;
  const doorsDrawn = inv.doors.flatMap((d) => (d.opening ? [{ x1: (d.opening.hinge[0] + hw) * k, y1: (d.opening.hinge[1] + hh) * k, x2: (d.opening.end[0] + hw) * k, y2: (d.opening.end[1] + hh) * k }] : []));
  const roomsDrawn = inv.rooms.map((r) => ({ x: (r.at[0] + hw) * k, y: (r.at[1] + hh) * k, name: r.name, dims: r.dims }));
  return { ...g, wallPen: POCHE_PEN, ...(doorsDrawn.length ? { doorsDrawn } : {}), ...(plotDrawn ? { plotDrawn } : {}), ...(stairLines.length ? { stairLines } : {}), ...(walkLines.length ? { walkLines } : {}), ...(parkingDrawn.length ? { parkingDrawn } : {}), ...(wallLines.length ? { wallLines } : {}), ...(zones.length ? { zones } : {}), ...(windowsDrawn.length ? { windowsDrawn } : {}), ...(roomsDrawn.length ? { roomsDrawn } : {}) };
}

function withDrawnFurniture(g: DwfGeometry, inv: HouseInventory, sheet: CadSheet, unitsM: number): DwfGeometry {
  const worktops = drawnWorktops(inv, sheet, unitsM);
  const furniture = [...drawnFurniture(inv, sheet, unitsM), ...worktops.pieces];
  if (!furniture.length) return g;
  // A piece's own grey fill is no wall's poché: inside the "add on" group a
  // vanity's fill was printed as wall, and the outer wall grew 70 cm thick
  // over it — the vanity and its basin built into the wall (12/10/2026).
  // The block's own box as drawn, as well as the pieces read from it: a
  // kitchen table is built narrower than its block with its chairs, and the
  // fill outside the table stood as a grid of walls round it (13/10/2026).
  const k = DWF_FLOOR_UNITS_PER_METRE;
  const [hw, hh] = [(sheet.width * unitsM) / 2, (sheet.height * unitsM) / 2];
  const blocks = [...inv.furniture, ...inv.sanitary, ...inv.other].flatMap((it) => {
    if (!it.box) return [];
    const xs = it.box.map(([x]) => (x + hw) * k);
    const ys = it.box.map(([, z]) => (z + hh) * k);
    const b = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    // Only a block a piece was read from, and a piece's size: never a group a room large.
    const read = furniture.some((p) => p.x + p.w / 2 >= b.x && p.x + p.w / 2 <= b.x + b.w && p.y + p.h / 2 >= b.y && p.y + p.h / 2 <= b.y + b.h);
    return read && b.w * b.h <= 6 * k * k ? [b] : [];
  });
  const worktopRings = worktops.rings;
  const fillPens = g.fillPens?.map((pen, i) => {
    if (pen !== POCHE_PEN) return pen;
    // Wholly inside a piece: a wall's L of poché triangulates into long
    // triangles whose middles fell in a bed against it, and the corner walls of
    // the upper floor went (12/10/2026).
    const tri = g.fills[i]!;
    if ([...furniture, ...blocks].some((p) => tri.every(([x, y]) => x >= p.x - 1 && x <= p.x + p.w + 1 && y >= p.y - 1 && y <= p.y + p.h + 1))) return 0;
    // A worktop's L triangulates across its corner: its fill is every triangle within its ring.
    const [cx, cz] = [tri.reduce((t, [x]) => t + x, 0) / tri.length / k - hw, tri.reduce((t, [, y]) => t + y, 0) / tri.length / k - hh];
    return worktopRings.some((r) => inRing(r, cx, cz)) ? 0 : pen;
  });
  return { ...g, furniture, ...(fillPens ? { fillPens } : {}) };
}

export function drawnFurniture(inv: HouseInventory, sheet: CadSheet, unitsM: number): DrawnPiece[] {
  const k = DWF_FLOOR_UNITS_PER_METRE;
  const [hw, hh] = [(sheet.width * unitsM) / 2, (sheet.height * unitsM) / 2];
  const out: DrawnPiece[] = [];
  const add = (x0: number, z0: number, x1: number, z1: number, kind: DrawnPiece["kind"], fixture?: DrawnPiece["fixture"]) =>
    out.push({ x: (x0 + hw) * k, y: (z0 + hh) * k, w: (x1 - x0) * k, h: (z1 - z0) * k, kind, ...(fixture ? { fixture } : {}) });
  for (const it of [...inv.furniture, ...inv.sanitary, ...inv.other]) {
    if (!it.box) continue;
    const xs = it.box.map(([x]) => x);
    const zs = it.box.map(([, z]) => z);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const [w, d] = [x1 - x0, z1 - z0];
    const [s, l] = [Math.min(w, d), Math.max(w, d)];
    const name = it.block.toLowerCase();
    const sanLayer = /san/i.test(it.layer);
    if (/^aron$/.test(name)) add(x0, z0, x1, z1, "storage");
    else if (/mekarer/.test(name)) add(x0, z0, x1, z1, "storage");
    else if (/gaz/.test(name)) add(x0, z0, x1, z1, "hob");
    else if (/kiyor/.test(name)) add(x0, z0, x1, z1, "sink");
    else if (/sherotim/.test(name)) add(x0, z0, x1, z1, "fixture", "toilet");
    else if (/kvisa/.test(name)) add(x0, z0, x1, z1, "fixture", "washer");
    else if (s >= 0.8 && s <= 1.0 && l >= 1.85 && l <= 2.15) add(x0, z0, x1, z1, "bed");
    else if (s >= 1.3 && s <= 2.2 && l >= 1.85 && l <= 2.3) add(x0, z0, x1, z1, "bed");
    else if (!sanLayer && s >= 0.6 && s <= 0.85 && l >= 1.45 && l <= 1.9) add(x0, z0, x1, z1, "fixture", "bath");
    else if (sanLayer && s >= 0.4 && s <= 0.65 && l >= 0.9 && l <= 2.0) add(x0, z0, x1, z1, "fixture", "basin");
    else if (s >= 0.25 && s <= 0.65 && l <= 0.7) add(x0, z0, x1, z1, "fixture", "basin");
    else if (s >= 0.6 && s <= 1.0 && l >= 1.6 && l <= 3.0) add(x0, z0, x1, z1, "seat");
    else if ((s >= 1.0 && l <= 3.2) || (s >= 0.9 && l >= 1.0 && l <= 1.6)) {
      // A table with its chairs round it, all inside the block's box. A box
      // near square has no chairs at its ends: its chairs flank the table's
      // long sides, so the table runs along the box's shorter side — laid
      // along the longer, Gottlieb A's kitchen table turned across and its
      // chairs went into the wall (12/10/2026).
      const ends = l / s >= 1.3;
      const alongX = ends ? w >= d : w < d;
      const [along, across] = alongX ? [w, d] : [d, w];
      const tw = Math.max(0.5, across - 0.8);
      const tl = Math.max(0.8, along - (ends ? 0.9 : 0.1));
      const [cx, cz] = [(x0 + x1) / 2, (z0 + z1) / 2];
      const [hx, hz] = alongX ? [tl / 2, tw / 2] : [tw / 2, tl / 2];
      add(cx - hx, cz - hz, cx + hx, cz + hz, "table");
      const per = Math.max(1, Math.round(tl / 0.55));
      const off = across / 2 - 0.2;
      for (let i = 0; i < per; i++) {
        const u = -tl / 2 + (tl * (i + 0.5)) / per;
        for (const side of [-1, 1]) {
          const [px, pz] = alongX ? [cx + u, cz + side * off] : [cx + side * off, cz + u];
          add(px - 0.2, pz - 0.2, px + 0.2, pz + 0.2, "seat");
        }
      }
      if (ends) {
        for (const end of [-1, 1]) {
          const u = end * (along / 2 - 0.2);
          const [px, pz] = alongX ? [cx + u, cz] : [cx, cz + u];
          add(px - 0.2, pz - 0.2, px + 0.2, pz + 0.2, "seat");
        }
      }
    }
  }
  return out;
}

/** Where a piece lies, for framing: its first point. */
const pieceAt = (p: DxfPiece): Pt | null => p.pts?.[0] ?? p.at ?? p.arc?.c ?? p.circle?.c ?? p.rings?.[0]?.[0] ?? null;

/**
 * A single-floor file read whole: its drawing is often blocks inside blocks (so entities' own anchors say nothing about where the plan lies) and keeps a survey,
 * a grid or a title block far away. The sheet is the main cluster of the WALL pieces (all pieces where it has none): the points within a few typical distances of
 * their median, repeated, padded a tenth. The pieces handed on are those of the whole drawing that fall inside it.
 */
export function wholeSheet(drawing: DxfDrawing, profile: CadOfficeProfile): { sheet: CadSheet; pieces: DxfPiece[] } | null {
  const all = flattenDxf(drawing);
  const at = all.flatMap((p) => {
    const pt = pieceAt(p);
    return pt && Number.isFinite(pt.x) && Number.isFinite(pt.y) ? [{ p, pt }] : [];
  });
  const wallish = at.filter(({ p }) => {
    const k = layerKind(profile, p.layer);
    return k === "wall-ext" || k === "wall-int";
  });
  let pts = (wallish.length >= 50 ? wallish : at).map((v) => v.pt);
  if (pts.length < 3) return null;
  // The plan is the largest connected mass of wall points: cells four typical wall pieces a side, neighbours within two
  // cells joined, so a long plan stays whole and a survey or title block far away is left out.
  // Cell size without trusting the header's unit: four typical wall pieces long, so a plan's wings (courtyards a few pieces wide) stay joined and a far stray does not.
  const size = (p: DxfPiece) => {
    const q = p.pts ?? p.rings?.[0] ?? (p.arc ? [{ x: p.arc.c.x - p.arc.r, y: p.arc.c.y - p.arc.r }, { x: p.arc.c.x + p.arc.r, y: p.arc.c.y + p.arc.r }] : []);
    if (q.length < 2) return 0;
    return Math.hypot(Math.max(...q.map((v) => v.x)) - Math.min(...q.map((v) => v.x)), Math.max(...q.map((v) => v.y)) - Math.min(...q.map((v) => v.y)));
  };
  const sizes = (wallish.length >= 50 ? wallish : at).map((v) => size(v.p)).filter((v) => v > 0).sort((a, b) => a - b);
  const cell = Math.max((sizes[sizes.length >> 1] ?? 1) * 4, 1);
  const key = (q: Pt) => `${Math.floor(q.x / cell)},${Math.floor(q.y / cell)}`;
  const cells = new Map<string, Pt[]>();
  for (const q of pts) (cells.get(key(q)) ?? cells.set(key(q), []).get(key(q))!).push(q);
  const seen = new Set<string>();
  const comps: Pt[][] = [];
  for (const start of cells.keys()) {
    if (seen.has(start)) continue;
    const comp: Pt[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const k = stack.pop()!;
      comp.push(...cells.get(k)!);
      const [cx, cy] = k.split(",").map(Number) as [number, number];
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
        const n = `${cx + dx},${cy + dy}`;
        if (cells.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
      }
    }
    comps.push(comp);
  }
  // A plan's wings can lie apart (a courtyard wider than the cell): every mass at least a tenth of the largest is the plan; lone far strays are not.
  const largest = Math.max(...comps.map((c) => c.length));
  pts = comps.filter((c) => c.length >= largest * 0.1).flat();
  const [x0, x1, y0, y1] = [Math.min(...pts.map((q) => q.x)), Math.max(...pts.map((q) => q.x)), Math.min(...pts.map((q) => q.y)), Math.max(...pts.map((q) => q.y))];
  const sheet: CadSheet = { name: "גיליון", model: "גיליון", storey: null, centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, width: (x1 - x0) * 1.1 || 1, height: (y1 - y0) * 1.1 || 1 };
  const inside = at.filter(({ pt }) => Math.abs(pt.x - sheet.centre.x) <= sheet.width / 2 && Math.abs(pt.y - sheet.centre.y) <= sheet.height / 2).map((v) => v.p);
  return { sheet, pieces: inside };
}

export type DxfHouse = {
  drawing: DxfDrawing;
  profile: CadOfficeProfile;
  sheets: Array<CadSheet & { unitsM: number; inventory: HouseInventory; geometry: DwfGeometry }>;
};

/**
 * Read a house's DXF: its sheets (one per layout tab, or the whole drawing),
 * each as the inventory and as the strip geometry. `pick` keeps only the
 * sheets wanted — an office's drawing often holds every model it designs.
 */
export function readDxfHouse(input: string | Uint8Array, options?: { pick?: (sheet: CadSheet) => boolean; profile?: CadOfficeProfile; /** One sheet: all of model space (a file that is a single floor, whatever its layouts show). */ whole?: boolean }): DxfHouse | null {
  const drawing = readDxfDrawing(input);
  if (!drawing) return null;
  const profile = options?.profile ?? profileFor(drawing.layers.keys());
  const whole = options?.whole ? wholeSheet(drawing, profile) : null;
  const sheets = (whole ? [whole.sheet] : dxfSheets(drawing)).filter((s) => options?.pick?.(s) ?? true);
  return {
    drawing,
    profile,
    sheets: sheets.map((sheet) => {
      const pieces = whole ? whole.pieces : flattenDxf(drawing, entitiesWithin(drawing, sheet));
      const unitsM = inferUnitsM(drawing, pieces, profile, sheet);
      return {
        ...sheet,
        unitsM,
        inventory: houseInventory(drawing, sheet, { profile, pieces, unitsM }),
        geometry: (() => {
          const inv = houseInventory(drawing, sheet, { profile, pieces, unitsM });
          const g = withZones(withDrawnFurniture(withoutLabelBoxes(withHatchedWalls(sheetGeometryFromDxf(drawing, sheet, { profile, pieces, unitsM }), inv, sheet, unitsM), inv, sheet, unitsM), inv, sheet, unitsM), inv, sheet, unitsM);
          return whole ? { ...g, singleSheet: true } : g;
        })(),
      };
    }),
  };
}

const FACADE_TITLE = /^\s*חזית\s+(צפונית|דרומית|מזרחית|מערבית)/;
/** The plot's line and the building line, drawn up a facade from under its land to its roof. */
const SITE_LINE = /(gvul|kav)[\s_-]*(migrash|binyan)|גבול[\s_-]*מגרש|קו[\s_-]*(בנין|בניין|מגרש)/i;

/**
 * A facades DXF's elevations, each the drawing over its title ("חזית צפונית
 * / 1:100"), left to right, as a plot draws them. Model space is read whole:
 * an office draws its facades where the site plan stands, on the country's
 * grid (Gottlieb's at x ≈ 24,800,000 cm), past what a sheet's window is
 * looked for in, and its layouts frame sketches, not the facades.
 */
export function dxfFacades(drawing: DxfDrawing, profile: CadOfficeProfile = profileFor(drawing.layers.keys())): Array<{ title: string; geometry: DwfGeometry }> {
  const pieces = flattenDxf(drawing);
  const titles = pieces
    .flatMap((p) => (p.text != null && p.at && !p.dimension && FACADE_TITLE.test(p.text) ? [{ title: p.text.trim(), at: p.at }] : []))
    .sort((a, b) => a.at.x - b.at.x);
  if (!titles.length) return [];
  const xs = titles.map((t) => t.at.x);
  const ys = titles.map((t) => t.at.y);
  const whole: CadSheet = {
    name: "",
    model: "",
    storey: null,
    centre: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 },
    width: Math.max(...xs) - Math.min(...xs) + 1,
    height: 1,
  };
  const unitsM = inferUnitsM(drawing, pieces, profile, whole);
  const m = (metres: number) => metres / unitsM;
  return titles.map(({ title, at }, i) => {
    // Half way to the next title each side, a house's plot at most: the drawing over this title, not its neighbour's.
    const gaps = [i > 0 ? at.x - xs[i - 1]! : Infinity, i < xs.length - 1 ? xs[i + 1]! - at.x : Infinity];
    const half = Math.min(m(30), ...gaps.map((g) => g / 2));
    const sheet: CadSheet = { name: title, model: "", storey: null, centre: { x: at.x, y: at.y + m(11) }, width: 2 * half, height: m(26) };
    const drawn = flattenDxf(drawing, entitiesWithin(drawing, sheet));
    // Standing taller than the house, those lines were read for its outline (22 m for 16): the sheet shows them, the reading does not.
    const read = sheetGeometryFromDxf(drawing, sheet, { profile, unitsM, pieces: drawn.filter((p) => !SITE_LINE.test(p.layer) && !p.path.some((b) => SITE_LINE.test(b))) });
    const shown = sheetGeometryFromDxf(drawing, sheet, { profile, unitsM, pieces: drawn });
    // A level's lettering stands a quarter metre over its triangle: read as a mark, every opening fell 0.32 m.
    // The marks are read off the triangles (house-levels.ts), as on a plot, whose lettering is strokes.
    const lettering = (t: PlacedText) => levelMarks([t]).length > 0;
    const geometry = { ...read, texts: read.texts.filter((t) => !lettering(t)) };
    return { title, geometry: shown.display ? { ...geometry, display: { ...shown.display, texts: shown.texts.filter(lettering) } } : geometry };
  });
}
