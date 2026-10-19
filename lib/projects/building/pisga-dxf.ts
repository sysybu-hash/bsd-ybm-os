import { arcPoints, entitiesWithin, flattenDxf, type DxfDrawing, type DxfPiece, type Pt } from "@/lib/projects/dxf-drawing";
import type { PaintedPath, PdfPage } from "@/lib/projects/building/pdf-paths";
import { bandsOf, type PlanWalls } from "@/lib/projects/building/plan-walls";
import { inset, insidePolygon } from "@/lib/projects/building/assemble";
import type { PlanOpening } from "@/lib/projects/building/plan-openings";
import type { RoomKind, RoomLabel } from "@/lib/projects/building/plan-rooms";

/**
 * מרכז פסג"ה from its architect's DXF (29.04.25 עבודה): the working drawing
 * the permit booklet was plotted from, so the building is read from the
 * drawing's own entities — walls, windows, doors, fixtures, furniture — and
 * not from strokes off a PDF page.
 *
 * Model space holds the sheets side by side on one row, 9,257 units wide,
 * 5,492 tall and 9,757 apart; the plans of the floors register exactly by
 * that pitch. A unit is a centimetre, whatever $INSUNITS says.
 *
 * Everything downstream (wall bands, openings, rooms, furniture, the
 * floors' primitives) reads a `PdfPage` of painted paths, so a DXF sheet is
 * handed over as one: paths in centimetres a point, y down, in the frame
 * `pisga.ts` builds in, the pens it expects (walls red, the fine pen black).
 */

/** Sheets of the working drawing, by the left edge of their frame. */
export const PISGA_DXF = {
  frameY: 641275,
  width: 9257,
  height: 5492,
  /** Floor −2, floor −1 and the roof level, left to right. */
  sheets: { "floor-2": 175326, "floor-1": 185083, roof: 194453 },
  /** The building's north-west outer corner on a floor sheet, from the frame's left edge and its bottom edge. */
  corner: { x: 1985, y: 3395 },
} as const;

export type PisgaDxfFloor = keyof typeof PISGA_DXF.sheets;

/** `pisga.ts`'s frame: page point (500, 1030) is metres (0, 0), and the north-west corner is at (0.88, 1.02). */
const PAGE_ORIGIN = { x: 500, y: 1030 };
const CORNER_M = { x: 0.88, y: 1.02 };

const WALL = /^קיר (בטון|בלוק)/;
const FINE = /^(רהיטים|כלים סניטריים)|^furniture$/;
const WALL_PEN = 0xff0000;
const FINE_PEN = 0x000000;

type Ring = Array<[number, number]>;

/** A piece's outlines as point lists in drawing units: polylines, arcs and circles flattened. */
function outlinesOf(p: DxfPiece): Pt[][] {
  if (p.pts && p.pts.length >= 2) return [p.closed ? [...p.pts, p.pts[0]!] : p.pts];
  if (p.arc) return [arcPoints(p.arc.c, p.arc.r, p.arc.start, p.arc.end)];
  if (p.circle) return [arcPoints(p.circle.c, p.circle.r, 0, Math.PI * 2)];
  return [];
}

/**
 * A floor sheet of the DXF as a painted page: the walls' layers red, the
 * furniture's and the fixtures' black in the fine pen, in `pisga.ts`'s frame.
 * `sheetLeft` is the frame's left edge in drawing units.
 */
export function dxfPlanPage(drawing: DxfDrawing, sheetLeft: number, options?: { pieces?: DxfPiece[] }): PdfPage {
  const { frameY, width, height, corner } = PISGA_DXF;
  const x0 = sheetLeft + corner.x;
  const y0 = frameY + corner.y;
  const ox = PAGE_ORIGIN.x + CORNER_M.x * 100;
  const oy = PAGE_ORIGIN.y + CORNER_M.y * 100;
  const toPage = (q: Pt): [number, number] => [q.x - x0 + ox, y0 - q.y + oy];
  const pieces = options?.pieces ?? flattenDxf(drawing, entitiesWithin(drawing, { centre: { x: sheetLeft + width / 2, y: frameY + height / 2 }, width, height }));
  const paths: PaintedPath[] = [];
  for (const p of pieces) {
    // A column drawn as a circle is a column, not a run of wall: read apart (dxfColumns).
    const wall = WALL.test(p.layer) && !p.circle;
    const fine = !wall && !p.circle && FINE.test(p.layer);
    if (!wall && !fine) continue;
    const pen = wall ? WALL_PEN : FINE_PEN;
    const rings: Ring[] = outlinesOf(p).map((r) => r.map(toPage));
    if (p.rings && p.solid && wall) {
      paths.push({ rings: p.rings.map((r) => r.map(toPage)), filled: true, stroked: false, fill: pen, stroke: null, lineWidth: 1 });
      continue;
    }
    if (rings.length) paths.push({ rings, filled: false, stroked: true, fill: null, stroke: pen, lineWidth: wall ? 1 : 0.24 });
  }
  return { width: 2400, height: 1700, paths };
}

/** The drawing's SHX-Hebrew text comes out in visual order: a number's digits reversed, "מ״ר" as "מר". */
export function logicalLabel(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\d+/g, (n) => [...n].reverse().join(""))
    .replace(/\s*(\d+)\s+מר$/, ' $1 מ"ר')
    .replace(/ממ"מ/g, 'ממ"ד');
}

/** What a room's name says it is. The order matters: "מרחב לימוד" before "חדר". */
const KINDS: Array<[RegExp, RoomKind]> = [
  [/אולם/, "hall"],
  [/חלל כפול/, "void"],
  [/עיצוב מרחבי|מרחב לימוד/, "design"],
  [/מחשב/, "computers"],
  [/סדנ|פינת קפה/, "workshop"],
  [/כיתה/, "classroom"],
  [/מטבח/, "kitchen"],
  [/ממ"/, "mmd"],
  [/מבואה|מזכירות/, "lobby"],
  [/מנהל|מפקחים|מדריכים|חדר עזר|אב בית/, "office"],
  [/שירותים/, "wc"],
  [/מדרגות/, "stair"],
  [/מעלית/, "lift"],
  [/מעבר/, "corridor"],
];
/** Lettering on a plan that names no room: its notes, its marks, its fittings. */
const NOT_A_ROOM = /מחיצה|שחרור|סימן|קולר|מאחז|משטח|סף|כסא|גג|מרפסת|קירוי|קו |סוכך|מצללה|סבכה|יציאת חרום|רמפה|כביש|מדרכה|צ"|צמ"|עמדות|מתחת|אטימת|קיר המשך|ממ"ד.*שרות|שרות/;

/**
 * The rooms a floor sheet names, each where its text stands, in the plan
 * frame (metres, x east, y south). Only text that names a kind of room is
 * kept: a sheet's notes, marks and fittings share its text layer.
 */
export function dxfRoomLabels(drawing: DxfDrawing, floor: PisgaDxfFloor): RoomLabel[] {
  const left = PISGA_DXF.sheets[floor];
  const { frameY, width, height, corner } = PISGA_DXF;
  const pieces = flattenDxf(drawing, entitiesWithin(drawing, { centre: { x: left + width / 2, y: frameY + height / 2 }, width, height }));
  const out: RoomLabel[] = [];
  for (const p of pieces) {
    if (!p.text || !p.at || p.dimension || !/[֐-׿]/.test(p.text)) continue;
    const name = logicalLabel(p.text);
    if (NOT_A_ROOM.test(name)) continue;
    const kind = KINDS.find(([re]) => re.test(name))?.[1];
    if (!kind) continue;
    const printed = /(\d+)\s*מ"ר/.exec(name);
    out.push({ x: (p.at.x - left - corner.x) / 100 + CORNER_M.x, y: (frameY + corner.y - p.at.y) / 100 + CORNER_M.y, name, kind, ...(printed ? { areaM2: Number(printed[1]) } : {}) });
  }
  return out;
}

type Seg = [number, number, number, number];

/** A DXF sheet's piece in the plan frame, metres (x east, y south). */
const frameOf = (left: number, shiftX = 0) => {
  const { frameY, corner } = PISGA_DXF;
  return (q: Pt): [number, number] => [(q.x - left - corner.x - shiftX) / 100 + CORNER_M.x, (frameY + corner.y - q.y) / 100 + CORNER_M.y];
};

const sheetPieces = (drawing: DxfDrawing, left: number) => {
  const { frameY, width, height } = PISGA_DXF;
  return flattenDxf(drawing, entitiesWithin(drawing, { centre: { x: left + width / 2, y: frameY + height / 2 }, width, height }));
};

/**
 * The WC stalls' partitions of a floor: the segments of the xref layer
 * "…TRESPA" (the panels' make), in the plan frame. Too thin for the wall
 * reader, which closes a wall's two faces; they are built as thin boxes.
 */
export function dxfPartitions(drawing: DxfDrawing, floor: PisgaDxfFloor): Seg[] {
  const at = frameOf(PISGA_DXF.sheets[floor]);
  const out: Seg[] = [];
  for (const p of sheetPieces(drawing, PISGA_DXF.sheets[floor])) {
    if (!/TRESPA/i.test(p.layer) || !p.pts) continue;
    for (let i = 1; i < p.pts.length; i++) {
      const [x1, y1] = at(p.pts[i - 1]!);
      const [x2, y2] = at(p.pts[i]!);
      if (Math.hypot(x2 - x1, y2 - y1) >= 0.15) out.push([x1, y1, x2, y2]);
    }
  }
  return out;
}

/** The roof level's sheet sits 152 units left of the floors' frame (their plot lines register it). */
const ROOF_SHIFT = -152;

export type DxfRoof = {
  /** The roof slab's outline: the edge line the sheet draws round the building. */
  outline: Array<[number, number]>;
  /** The lift's bulkhead, from its closed wall ring. */
  lift: { x0: number; x1: number; z0: number; z1: number } | null;
  /** The car park's asphalt: the sheet's grey fill, cut at the roof's south edge. */
  deck: Array<[number, number]> | null;
  /** The bays' lines (layer TNUA) on the deck. */
  bayLines: Seg[];
};

/** Sutherland–Hodgman against one half-plane: the ring's part with `keep(p)`, edges cut where `cut` finds them. */
function clipRing(ring: Array<[number, number]>, keep: (p: [number, number]) => boolean, cut: (a: [number, number], b: [number, number]) => [number, number]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    if (keep(a)) out.push(a);
    if (keep(a) !== keep(b)) out.push(cut(a, b));
  }
  return out;
}

/**
 * The roof level (sheet "תכנית גג"): the slab's edge — the building's outer
 * wall ring, which runs 1.24 m north of the walls (the roof overhangs) and
 * out over the ramp to the south — the lift's shaft, the car park's fill and
 * its bays.
 */
export function dxfRoof(drawing: DxfDrawing): DxfRoof | null {
  const left = 203544;
  const at = frameOf(left, ROOF_SHIFT);
  const pieces = sheetPieces(drawing, left);
  const rings = pieces.filter((p) => /^קיר בטון/.test(p.layer) && p.pts && p.pts.length >= 5 && !p.closed).map((p) => p.pts!.map(at));
  const outer = rings.sort((a, b) => Math.max(...b.map((q) => q[1])) - Math.max(...a.map((q) => q[1])) || b.length - a.length)[0];
  if (!outer) return null;
  const xs = outer.map((q) => q[0]);
  const zs = outer.map((q) => q[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const lifts = pieces.filter((p) => /^קיר בטון/.test(p.layer) && p.pts && p.closed && p.pts.length >= 4).map((p) => p.pts!.map(at));
  const liftRing = lifts.find((r) => r.every((q) => q[0] > 28 && q[0] < 36 && q[1] > 10 && q[1] < 17));
  const lift = liftRing ? { x0: Math.min(...liftRing.map((q) => q[0])), x1: Math.max(...liftRing.map((q) => q[0])), z0: Math.min(...liftRing.map((q) => q[1])), z1: Math.max(...liftRing.map((q) => q[1])) } : null;
  // The south-west run stops where the stair opening starts; the deck's south edge starts at the lift's west face.
  const southWest = Math.max(...outer.filter((q) => q[0] < 10).map((q) => q[1]));
  const notchX = lift ? lift.x0 : 30.44;
  const outline: Array<[number, number]> = [[x0, z0], [x1, z0], [x1, z1], [notchX, z1], [notchX, southWest], [x0, southWest]];

  let deck: Array<[number, number]> | null = null;
  const fill = pieces.find((p) => p.rings && p.solid && /^מילוי/.test(p.layer) && (p.rings[0]?.length ?? 0) > 3 && p.colour === 0xc0c0c0);
  if (fill?.rings?.[0]) {
    let ring = fill.rings[0].map(at);
    // The fill runs on south through the drive to the street; the street is built apart, so it stops 2.4 m past the roof's edge, where the drive's own pad begins.
    const zEnd = z1 + 2.4;
    ring = clipRing(ring, (p) => p[1] <= zEnd, (a, b) => [a[0] + ((b[0] - a[0]) * (zEnd - a[1])) / (b[1] - a[1]), zEnd]);
    ring = clipRing(ring, (p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]);
    if (ring.length >= 3) deck = ring;
  }
  const bayLines: Seg[] = [];
  for (const p of pieces) {
    if (p.layer !== "TNUA" || !p.pts || p.pts.length < 2) continue;
    const pts = p.pts.map(at);
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1]!;
      const [bx, bz] = pts[i]!;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 2 || len > 13 || Math.min(ax, bx) < 33 || Math.max(ax, bx) > x1 + 0.1 || Math.min(az, bz) < 2 || Math.max(az, bz) > z1) continue;
      bayLines.push([ax, az, bx, bz]);
    }
  }
  return { outline, lift, deck, bayLines };
}

export type DxfSymbol = {
  /** Its box in the plan frame, metres. */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** A door's swing arcs: the hinge, and the two ends of the arc. */
  arcs: Array<{ hinge: [number, number]; ends: [[number, number], [number, number]]; r: number }>;
};

/**
 * The windows and the doors a floor sheet draws, each a cluster of the
 * pieces on its layer that touch within 25 cm — a block's lines and arcs.
 */
export function dxfSymbols(drawing: DxfDrawing, floor: PisgaDxfFloor): { windows: DxfSymbol[]; doors: DxfSymbol[] } {
  const left = PISGA_DXF.sheets[floor];
  const at = frameOf(left);
  const pieces = sheetPieces(drawing, left);
  const cluster = (match: RegExp): DxfSymbol[] => {
    const parts = pieces.flatMap((p) => {
      if (!match.test(p.layer)) return [];
      const pts = [...(p.pts ?? []), ...(p.arc ? arcPoints(p.arc.c, p.arc.r, p.arc.start, p.arc.end) : []), ...(p.circle ? [p.circle.c] : [])].map(at);
      if (!pts.length) return [];
      const arcs: DxfSymbol["arcs"] = p.arc && p.arc.r > 0 ? [{ hinge: at(p.arc.c), ends: [at({ x: p.arc.c.x + p.arc.r * Math.cos(p.arc.start), y: p.arc.c.y + p.arc.r * Math.sin(p.arc.start) }), at({ x: p.arc.c.x + p.arc.r * Math.cos(p.arc.end), y: p.arc.c.y + p.arc.r * Math.sin(p.arc.end) })], r: p.arc.r / 100 }] : [];
      return [{ x0: Math.min(...pts.map((q) => q[0])), x1: Math.max(...pts.map((q) => q[0])), z0: Math.min(...pts.map((q) => q[1])), z1: Math.max(...pts.map((q) => q[1])), arcs }];
    });
    const parent = parts.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
    const m = 0.25;
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i]!;
        const b = parts[j]!;
        if (a.x0 - m <= b.x1 && b.x0 - m <= a.x1 && a.z0 - m <= b.z1 && b.z0 - m <= a.z1) parent[find(i)] = find(j);
      }
    }
    const groups = new Map<number, DxfSymbol>();
    parts.forEach((p, i) => {
      const k = find(i);
      const g = groups.get(k);
      if (!g) groups.set(k, { ...p });
      else {
        g.x0 = Math.min(g.x0, p.x0);
        g.x1 = Math.max(g.x1, p.x1);
        g.z0 = Math.min(g.z0, p.z0);
        g.z1 = Math.max(g.z1, p.z1);
        g.arcs.push(...p.arcs);
      }
    });
    return [...groups.values()];
  };
  return { windows: cluster(/^חלון/), doors: cluster(/^דלטוט/).filter((s) => s.arcs.length > 0) };
}

/**
 * Level marks printed on a floor sheet: "+12.77=935.97" (relative = absolute,
 * ±0.00 being 923.20), or either figure alone. Each comes back relative.
 */
export function dxfLevelMarks(drawing: DxfDrawing, floor: PisgaDxfFloor): Array<{ value: number; x: number; z: number; both: boolean }> {
  const left = PISGA_DXF.sheets[floor];
  const at = frameOf(left);
  const out: Array<{ value: number; x: number; z: number; both: boolean }> = [];
  for (const p of sheetPieces(drawing, left)) {
    const t = (p.text ?? "").replace(/^%%\s*/, "").replace(/\s+/g, "");
    const m = /^([+-]?)(\d{1,3}\.\d\d)(?:=(\d{3}\.\d\d))?$/.exec(t);
    if (!m || !p.at) continue;
    const n = Number(m[2]);
    const value = n > 900 ? Math.round((n - 923.2) * 100) / 100 : (m[1] === "-" ? -1 : 1) * n;
    const [x, z] = at(p.at);
    out.push({ value, x, z, both: m[3] != null });
  }
  return out;
}

/** The columns a floor sheet draws as circles on the wall layers: centre and radius, metres in the plan frame. */
export function dxfColumns(drawing: DxfDrawing, floor: PisgaDxfFloor): Array<{ x: number; z: number; r: number }> {
  const at = frameOf(PISGA_DXF.sheets[floor]);
  const out: Array<{ x: number; z: number; r: number }> = [];
  for (const p of sheetPieces(drawing, PISGA_DXF.sheets[floor])) {
    if (!p.circle || !WALL.test(p.layer)) continue;
    const [x, z] = at(p.circle.c);
    out.push({ x, z, r: p.circle.r / 100 });
  }
  return out;
}

/**
 * A window the sheet draws in a wall it leaves solid is cut out of the wall:
 * the symbol's span along the wall, the wall's thickness across it. A
 * window already standing in a gap is cut again, harmlessly.
 */
export function cutDxfWindows(walls: PlanWalls, windows: DxfSymbol[], doors: DoorRect[] = []): PlanWalls {
  const { cols, rows } = walls.mask;
  const m = walls.cm / 100;
  const data = new Uint8Array(walls.mask.data);
  for (const w of windows) {
    const wide = w.x1 - w.x0;
    const deep = w.z1 - w.z0;
    if (Math.min(wide, deep) > 0.7 || Math.max(wide, deep) < 0.4) continue;
    // Along the symbol's long side, a hand's breadth either way across.
    const [x0, x1, z0, z1] = wide >= deep ? [w.x0, w.x1, w.z0 - 0.2, w.z1 + 0.2] : [w.x0 - 0.2, w.x1 + 0.2, w.z0, w.z1];
    for (let y = Math.max(0, Math.floor(z0 / m)); y <= Math.min(rows - 1, Math.ceil(z1 / m)); y++) for (let x = Math.max(0, Math.floor(x0 / m)); x <= Math.min(cols - 1, Math.ceil(x1 / m)); x++) data[y * cols + x] = 0;
  }
  for (const d of doors) {
    for (let y = Math.max(0, Math.floor(d.y / m)); y <= Math.min(rows - 1, Math.ceil((d.y + d.h) / m)); y++) for (let x = Math.max(0, Math.floor(d.x / m)); x <= Math.min(cols - 1, Math.ceil((d.x + d.w) / m)); x++) data[y * cols + x] = 0;
  }
  const mask = { cols, rows, data };
  return { ...walls, mask, bands: bandsOf(mask, walls.cm) };
}

/**
 * A gap in a wall is a window where the sheet draws one in the building's
 * outer wall (within 0.6 m of the outline's box), and outward is away from
 * the building's centre. Any other gap — an open arcade, a stair's well, a
 * wall the sheet leaves out, a glazed partition inside — is a doorway.
 */
/** The outline's nearest edge to a point: how far, and the edge's normal pointing out of the building. */
function nearestOutlineEdge(outline: Array<[number, number]>, x: number, z: number) {
  let best = { d: Infinity, nx: 0, nz: 0 };
  for (let i = 0; i < outline.length; i++) {
    const [ax, az] = outline[i]!;
    const [bx, bz] = outline[(i + 1) % outline.length]!;
    const len = Math.hypot(bx - ax, bz - az);
    if (len === 0) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (len * len)));
    const d = Math.hypot(x - (ax + t * (bx - ax)), z - (az + t * (bz - az)));
    if (d < best.d) {
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      // Out of the building: the side a step along the normal is not inside the outline.
      const out = insidePolygon(outline, x + nx * 0.3, z + nz * 0.3) ? -1 : 1;
      best = { d, nx: nx * out, nz: nz * out };
    }
  }
  return best;
}

export type DoorRect = { orientation: "h" | "v"; x: number; y: number; w: number; h: number; outward: 1 | -1 };

/**
 * The openings of the doors a floor sheet draws in the outer wall: each
 * leaf's swing runs from its hinge to the arc's end that lies along the
 * wall, so the opening is hinge to that end — a double door's two leaves
 * make one opening — and the wall's thickness across.
 */
export function exteriorDoorRects(doors: DxfSymbol[], outline: Array<[number, number]>): DoorRect[] {
  const out: DoorRect[] = [];
  for (const d of doors) {
    const hinge0 = d.arcs[0]!.hinge;
    const edge = nearestOutlineEdge(outline, hinge0[0], hinge0[1]);
    if (edge.d > 0.6) continue;
    const orientation: "h" | "v" = Math.abs(edge.nz) >= Math.abs(edge.nx) ? "h" : "v";
    const lo: number[] = [];
    const across: number[] = [];
    for (const a of d.arcs) {
      const along = orientation === "h" ? 0 : 1;
      const perp = 1 - along;
      // The end that stays on the wall's line is the leaf shut.
      const shut = a.ends.slice().sort((p, q) => Math.abs(p[perp]! - a.hinge[perp]!) - Math.abs(q[perp]! - a.hinge[perp]!))[0]!;
      lo.push(a.hinge[along]!, shut[along]!);
      across.push(a.hinge[perp]!);
    }
    const a0 = Math.min(...lo);
    const a1 = Math.max(...lo);
    const c = across.reduce((x, y) => x + y, 0) / across.length;
    const t = 0.3;
    const outward = ((orientation === "h" ? edge.nz : edge.nx) >= 0 ? 1 : -1) as 1 | -1;
    out.push(orientation === "h" ? { orientation, x: a0, y: c - t / 2, w: a1 - a0, h: t, outward } : { orientation, x: c - t / 2, y: a0, w: t, h: a1 - a0, outward });
  }
  return out;
}

export function openingsByDxfWindows(openings: PlanOpening[], windows: DxfSymbol[], outline: Array<[number, number]>, doors: DoorRect[] = []): PlanOpening[] {
  const m = 0.3;
  const nearestEdge = (x: number, z: number) => nearestOutlineEdge(outline, x, z);
  const overlaps = (o: { x: number; y: number; w: number; h: number }, d: { x: number; y: number; w: number; h: number }) => d.x - m <= o.x + o.w && o.x - m <= d.x + d.w && d.y - m <= o.y + o.h && o.y - m <= d.y + d.h;
  const asDoor = (d: DoorRect): PlanOpening => ({ orientation: d.orientation, x: d.x, y: d.y, w: d.w, h: d.h, exterior: true, kind: "window", full: true, door: true, head: 2.4, outward: d.outward });
  const doorFor = (o: PlanOpening) => doors.find((d) => d.orientation === o.orientation && overlaps(o, d));
  const mapped = openings.map((o) => {
    const door = doorFor(o);
    if (door) return asDoor({ ...door, x: Math.max(door.x, o.x), y: Math.max(door.y, o.y), w: door.w, h: door.h });
    const drawn = windows.some((w) => w.x0 - m <= o.x + o.w && o.x - m <= w.x1 && w.z0 - m <= o.y + o.h && o.y - m <= w.z1);
    const edge = nearestEdge(o.x + o.w / 2, o.y + o.h / 2);
    if (!drawn || edge.d > 0.6) return { ...o, exterior: false, kind: "doorway" as const, outward: undefined };
    // "h": the wall runs along x, the opening looks along z; "v" the other way.
    const outward = ((o.orientation === "h" ? edge.nz : edge.nx) >= 0 ? 1 : -1) as 1 | -1;
    return { ...o, exterior: true, kind: o.w >= 6 ? ("curtain" as const) : ("window" as const), outward };
  });
  // A window the sheet draws in the outer wall where no gap was found (the wall is drawn through it, or in pieces the reader joined) is cut in.
  for (const w of windows) {
    const wide = w.x1 - w.x0;
    const deep = w.z1 - w.z0;
    if (Math.min(wide, deep) > 0.7 || Math.max(wide, deep) < 0.4) continue;
    const orientation = wide >= deep ? ("h" as const) : ("v" as const);
    const centre = nearestEdge((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2);
    if (centre.d > 0.6) continue;
    if (mapped.some((o) => o.exterior && w.x0 - m <= o.x + o.w && o.x - m <= w.x1 && w.z0 - m <= o.y + o.h && o.y - m <= w.z1)) continue;
    const t = 0.3;
    const [x, y, ww, hh] = orientation === "h" ? [w.x0, (w.z0 + w.z1) / 2 - t / 2, wide, t] : [(w.x0 + w.x1) / 2 - t / 2, w.z0, t, deep];
    mapped.push({ orientation, x, y, w: ww, h: hh, exterior: true, kind: (orientation === "h" ? wide : deep) >= 6 ? "curtain" : "window", outward: ((orientation === "h" ? centre.nz : centre.nx) >= 0 ? 1 : -1) as 1 | -1 });
  }
  // A door the sheet draws in the outer wall where no gap was found is cut in, as a window is.
  for (const d of doors) if (!mapped.some((o) => o.door && overlaps(o, d))) mapped.push(asDoor(d));
  return mapped;
}

/** The sheet's windows drawn inside the building — glazed partitions: the symbols farther than 0.6 m from its outline. */
export function glazedPartitions(windows: DxfSymbol[], outline: Array<[number, number]>): DxfSymbol[] {
  const distance = (x: number, z: number) => {
    let d = Infinity;
    for (let i = 0; i < outline.length; i++) {
      const [ax, az] = outline[i]!;
      const [bx, bz] = outline[(i + 1) % outline.length]!;
      const len2 = (bx - ax) ** 2 + (bz - az) ** 2;
      const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / len2)) : 0;
      d = Math.min(d, Math.hypot(x - (ax + t * (bx - ax)), z - (az + t * (bz - az))));
    }
    return d;
  };
  return windows.filter((w) => Math.min(w.x1 - w.x0, w.z1 - w.z0) <= 0.7 && Math.max(w.x1 - w.x0, w.z1 - w.z0) >= 0.4 && distance((w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2) > 0.6 && insidePolygon(outline, (w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2));
}

/**
 * The movable acoustic partitions that divide an open plan into its printed
 * rooms: dashed "overhead" lines (…קו נסתר עליון) inside the building, which
 * the sheet names "מחיצה אקוסטית ניידת". Not walls — they split the rooms,
 * the walls do not. Each as segments in the plan frame.
 */
export function dxfDividers(drawing: DxfDrawing, floor: PisgaDxfFloor, outline: Array<[number, number]>): Seg[] {
  const at = frameOf(PISGA_DXF.sheets[floor]);
  const inner = inset(outline, 1.0);
  const out: Seg[] = [];
  const seen = new Set<string>();
  for (const p of sheetPieces(drawing, PISGA_DXF.sheets[floor])) {
    if (!/^קו נס[תט]ר עליון/.test(p.layer) || !p.pts || p.pts.length < 2 || p.closed) continue;
    const pts = p.pts.map(at);
    if (!pts.every(([x, z]) => insidePolygon(inner, x, z))) continue;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1]!;
      const [bx, bz] = pts[i]!;
      if (Math.hypot(bx - ax, bz - az) < 1.5) continue;
      // The sheet draws each twice, a centimetre apart.
      const key = [ax, az, bx, bz].map((v) => Math.round(v * 5)).join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([ax, az, bx, bz]);
    }
  }
  return out;
}

export type StairFlight = { x0: number; x1: number; /** The treads' z (the sheet draws a line each), north to south. */ treads: number[] };

/**
 * The emergency stair on the west face, as floor −1's sheet draws it: runs of
 * 1.2 m treads (short lines across the flight, 26 cm apart) in two flights
 * side by side — the one against the building and the one beyond it.
 */
export function dxfEmergencyStair(drawing: DxfDrawing): StairFlight[] {
  const left = PISGA_DXF.sheets["floor-1"];
  const at = frameOf(left);
  const lines: Array<[number, number, number]> = [];
  for (const p of sheetPieces(drawing, left)) {
    if (!/^מבט דק/.test(p.layer) || !p.pts || p.pts.length !== 2) continue;
    const [[ax, az], [bx, bz]] = [at(p.pts[0]!), at(p.pts[1]!)];
    if (Math.abs(az - bz) > 0.02 || Math.abs(Math.abs(bx - ax) - 1.2) > 0.05 || Math.min(ax, bx) < -2 || Math.max(ax, bx) > 1.0 || az < 11 || az > 16) continue;
    lines.push([Math.min(ax, bx), Math.max(ax, bx), az]);
  }
  const flights = new Map<string, StairFlight>();
  for (const [x0, x1, z] of lines) {
    const key = `${Math.round(x0 * 10)}`;
    const f = flights.get(key) ?? { x0, x1, treads: [] };
    if (!f.treads.some((t) => Math.abs(t - z) < 0.05)) f.treads.push(z);
    flights.set(key, f);
  }
  return [...flights.values()].map((f) => ({ ...f, treads: f.treads.sort((a, b) => a - b) })).filter((f) => f.treads.length >= 8).sort((a, b) => b.x1 - a.x1);
}

/** Furniture: the furniture layer, and blocks on layer 0 (the office desks, the reception counter, the hall's seating). */
const isFurn = (p: DxfPiece) => /^(רהיטים|furniture)/.test(p.layer) || (p.layer === "0" && p.path.length > 0 && !/chets|miflas|miplas|^_/.test(p.path.join(">")) && p.type !== "ATTRIB" && p.type !== "TEXT" && p.type !== "MTEXT");

export type FurnitureShape = {
  /** Centre in the plan frame, metres. */
  x: number;
  z: number;
  /** Length along `angle` and width across it, metres; angle in radians (plan frame, x east, z south). */
  length: number;
  width: number;
  angle: number;
  round: boolean;
  kind: "chair" | "table" | "round-table" | "stool" | "sofa" | "armchair" | "cabinet" | "bench";
};

/**
 * Pieces of a sheet's layer, grouped where they touch (within 4 cm): a chair
 * drawn as an arc and a seat, a table drawn as an outline and its inner
 * edge, are one group each. Each group is one piece of furniture.
 */
export function groupsOf(drawing: DxfDrawing, floor: PisgaDxfFloor, layer: RegExp, accept?: (p: DxfPiece) => boolean, margin = 0.04) {
  const left = PISGA_DXF.sheets[floor];
  const at = frameOf(left);
  type Part = { pts: Array<[number, number]>; circleR: number; x0: number; x1: number; z0: number; z1: number };
  const parts: Part[] = [];
  for (const p of sheetPieces(drawing, left)) {
    if (!layer.test(p.layer) || p.text || (accept && !accept(p))) continue;
    const pts: Array<[number, number]> = p.circle ? arcPoints(p.circle.c, p.circle.r, 0, Math.PI * 2).map(at) : p.arc ? arcPoints(p.arc.c, p.arc.r, p.arc.start, p.arc.end).map(at) : (p.pts ?? []).map(at);
    if (pts.length < 2) continue;
    const xs = pts.map((q) => q[0]);
    const zs = pts.map((q) => q[1]);
    parts.push({ pts, circleR: p.circle ? p.circle.r / 100 : 0, x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) });
  }
  const parent = parts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const m = margin;
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i]!;
      const b = parts[j]!;
      if (a.x0 - m <= b.x1 && b.x0 - m <= a.x1 && a.z0 - m <= b.z1 && b.z0 - m <= a.z1) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, Part[]>();
  parts.forEach((p, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), p]));
  return [...groups.values()].map((g) => {
    const pts = g.flatMap((p) => p.pts);
    // The axis: the group's longest straight edge, snapped to the plan's axes within 6 degrees.
    let ang = 0;
    let best = 0;
    for (const p of g) {
      for (let i = 1; i < p.pts.length; i++) {
        const l = Math.hypot(p.pts[i]![0] - p.pts[i - 1]![0], p.pts[i]![1] - p.pts[i - 1]![1]);
        if (l > best && l > 0.3) {
          best = l;
          ang = Math.atan2(p.pts[i]![1] - p.pts[i - 1]![1], p.pts[i]![0] - p.pts[i - 1]![0]);
        }
      }
    }
    for (const snap of [0, Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI]) if (Math.abs(ang - snap) < 0.1) ang = snap;
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    const us = pts.map(([x, z]) => x * c + z * sn);
    const vs = pts.map(([x, z]) => -x * sn + z * c);
    const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
    const um = (u0 + u1) / 2;
    const vm = (v0 + v1) / 2;
    return { cx: um * c - vm * sn, cz: um * sn + vm * c, len: u1 - u0, wid: v1 - v0, ang, hasCircle: Math.max(...g.map((p) => p.circleR)), parts: g.length };
  });
}

/**
 * The furniture a floor sheet draws: each group of its pieces on the
 * furniture layers is one piece, sized and turned as drawn. Where chairs
 * stand round a gap the sheet leaves bare, the table between them is put
 * back at the middle of the ring.
 */
export function dxfFurnitureShapes(drawing: DxfDrawing, floor: PisgaDxfFloor): FurnitureShape[] {
  const left = PISGA_DXF.sheets[floor];
  const at = frameOf(left);
  type Raw = { x0: number; x1: number; z0: number; z1: number; cx: number; cz: number; len: number; wid: number; ang: number; round: boolean };
  const raw: Raw[] = [];
  const isClosed = (p: DxfPiece) => !!p.pts && p.pts.length >= 4 && (p.closed || Math.hypot(p.pts[0]!.x - p.pts[p.pts.length - 1]!.x, p.pts[0]!.y - p.pts[p.pts.length - 1]!.y) < 3);
  for (const p of sheetPieces(drawing, left)) {
    if (!isFurn(p) || p.text) continue;
    if (p.circle) {
      const [cx, cz] = at(p.circle.c);
      const r = p.circle.r / 100;
      if (r >= 0.12 && r <= 1.6) raw.push({ x0: cx - r, x1: cx + r, z0: cz - r, z1: cz + r, cx, cz, len: 2 * r, wid: 2 * r, ang: 0, round: true });
      continue;
    }
    if (!isClosed(p)) continue;
    const pts = p.pts!.map(at);
    let ang = 0;
    let best = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
      if (l > best) { best = l; ang = Math.atan2(pts[i]![1] - pts[i - 1]![1], pts[i]![0] - pts[i - 1]![0]); }
    }
    for (const snap of [0, Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI]) if (Math.abs(ang - snap) < 0.1) ang = snap;
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    const us = pts.map(([x, z]) => x * c + z * sn);
    const vs = pts.map(([x, z]) => -x * sn + z * c);
    const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
    const len = u1 - u0;
    const wid = v1 - v0;
    if (len < 0.2 || len > 9 || wid < 0.15) continue;
    const um = (u0 + u1) / 2;
    const vm = (v0 + v1) / 2;
    const xs = pts.map((q) => q[0]);
    const zs = pts.map((q) => q[1]);
    let area2 = 0;
    for (let i = 0; i < pts.length; i++) { const a2 = pts[i]!; const b2 = pts[(i + 1) % pts.length]!; area2 += a2[0] * b2[1] - b2[0] * a2[1]; }
    // A circle fills 79% of its box; a rounded rectangle (an armchair's outline) over 90%.
    const round = pts.length >= 8 && wid / len > 0.85 && Math.abs(area2) / 2 / (len * wid) < 0.84;
    raw.push({ x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs), cx: um * c - vm * sn, cz: um * sn + vm * c, len, wid, ang, round });
  }
  // Only the outermost: an outline lying wholly inside a larger one is part of it.
  const outer = raw.filter((a, i) => !raw.some((b, j) => j !== i && b.len * b.wid > a.len * a.wid * 1.15 && a.x0 >= b.x0 - 0.02 && a.x1 <= b.x1 + 0.02 && a.z0 >= b.z0 - 0.02 && a.z1 <= b.z1 + 0.02 && b.len * b.wid < 14));
  const seen = new Set<string>();
  const out: FurnitureShape[] = [];
  const classify = (len: number, wid: number, round: boolean): FurnitureShape["kind"] => {
    if (round) return len >= 0.85 ? "round-table" : "stool";
    if (len <= 0.78 && wid <= 0.78) return "chair";
    if (len <= 1.2 && wid <= 1.0 && wid >= 0.6) return "armchair";
    if (wid <= 1.1 && len > 1.2 && len <= 3.2 && wid >= 0.7) return "sofa";
    if (wid <= 0.7 && len > 1.2) return "cabinet";
    return "table";
  };
  for (const r of outer) {
    const key = `${r.cx.toFixed(1)},${r.cz.toFixed(1)},${r.len.toFixed(1)},${r.wid.toFixed(1)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x: r.cx, z: r.cz, length: r.len, width: r.wid, angle: r.ang, round: r.round, kind: classify(r.len, r.wid, r.round) });
  }
  // Chairs drawn open — a seat and its back as arcs and strokes: each cluster of small open pieces is one chair.
  // Not the stray two-point LINEs: they are a desk's grain, and join a chair to it.
  const small = (p: DxfPiece) => !p.circle && !isClosed(p) && p.type !== "LINE" && !!(p.pts || p.arc);
  for (const g of groupsOf(drawing, floor, /^(0|רהיטים|furniture)/, (p) => isFurn(p) && small(p), 0.012)) {
    if (g.len > 0.8 || g.wid > 0.8 || g.len < 0.25 || g.wid < 0.2) continue;
    if (out.some((o) => Math.abs(o.x - g.cx) < 0.25 && Math.abs(o.z - g.cz) < 0.25)) continue;
    out.push({ x: g.cx, z: g.cz, length: g.len, width: g.wid, angle: g.ang, round: false, kind: "chair" });
  }
  // Chairs and monitors drawn in short strokes: clusters of short LINEs (under 25 cm) that make a 30–80 cm piece of 10 strokes or more.
  const strokes = (p: DxfPiece) => p.type === "LINE" && !!p.pts && p.pts.length === 2 && Math.hypot(p.pts[0]!.x - p.pts[1]!.x, p.pts[0]!.y - p.pts[1]!.y) / 100 < 0.25;
  for (const g of groupsOf(drawing, floor, /^(0|רהיטים|furniture)/, (p) => isFurn(p) && strokes(p), 0.012)) {
    if (g.parts < 10 || g.len > 0.8 || g.wid > 0.8 || g.len < 0.3 || g.wid < 0.25) continue;
    if (out.some((o) => Math.abs(o.x - g.cx) < 0.3 && Math.abs(o.z - g.cz) < 0.3)) continue;
    out.push({ x: g.cx, z: g.cz, length: g.len, width: g.wid, angle: g.ang, round: false, kind: "chair" });
  }
  // Desks and benches drawn open — long strokes in a pair or a frame: each cluster of the long open pieces is one piece of its size.
  const long = (p: DxfPiece) => !p.circle && !isClosed(p) && !!p.pts && p.pts.length >= 2 && Math.hypot(p.pts[0]!.x - p.pts[p.pts.length - 1]!.x, p.pts[0]!.y - p.pts[p.pts.length - 1]!.y) / 100 > 0.5;
  for (const g of groupsOf(drawing, floor, /^(0|רהיטים|furniture)/, (p) => isFurn(p) && long(p))) {
    if (g.len < 0.8 || g.wid < 0.35 || g.len > 6 || g.wid > 3) continue;
    if (out.some((o) => o.kind !== "chair" && Math.abs(o.x - g.cx) < Math.max(0.4, g.len / 3) && Math.abs(o.z - g.cz) < Math.max(0.4, g.wid / 3))) continue;
    out.push({ x: g.cx, z: g.cz, length: g.len, width: g.wid, angle: g.ang, round: false, kind: classify(g.len, g.wid, false) });
  }
  // Whatever the sheet still draws on a furniture layer that no pass above took: each cluster of any pieces, of a size a piece of furniture is, stands as that piece.
  for (const g of groupsOf(drawing, floor, /^(0|רהיטים|furniture)/, (p) => isFurn(p), 0.012)) {
    const [L, W] = g.len >= g.wid ? [g.len, g.wid] : [g.wid, g.len];
    if (L < 0.3 || L > 3.4 || W < 0.2 || W > 2.2) continue;
    const ang = g.len >= g.wid ? g.ang : g.ang + Math.PI / 2;
    const r = Math.max(0.3, W / 2);
    if (out.some((o) => { const d = o.kind === "chair" ? 0.15 : r; return Math.abs(o.x - g.cx) < d && Math.abs(o.z - g.cz) < d; })) continue;
    out.push({ x: g.cx, z: g.cz, length: L, width: W, angle: ang, round: false, kind: classify(L, W, false) });
  }
  // A sofa or armchair stands square to the walls; a piece set diagonally in a room is a table.
  for (const o of out) {
    const q = ((o.angle % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
    if ((o.kind === "sofa" || o.kind === "armchair") && Math.min(q, Math.PI / 2 - q) > 0.15) o.kind = "table";
  }
  // A table put back where chairs ring a bare middle.
  const chairs = out.filter((s) => s.kind === "chair");
  const done = new Set<FurnitureShape>();
  for (const c0 of chairs) {
    if (done.has(c0)) continue;
    const ring = chairs.filter((c) => !done.has(c) && Math.hypot(c.x - c0.x, c.z - c0.z) < 1.6);
    if (ring.length < 3) continue;
    const mx = ring.reduce((a, c) => a + c.x, 0) / ring.length;
    const mz = ring.reduce((a, c) => a + c.z, 0) / ring.length;
    if (out.some((s) => s.kind !== "chair" && Math.abs(s.x - mx) < 0.8 && Math.abs(s.z - mz) < 0.8)) continue;
    const r = Math.max(...ring.map((c) => Math.hypot(c.x - mx, c.z - mz)));
    if (r < 0.55 || r > 1.5) continue;
    // The chairs must surround the middle, not stand in a row: no gap in their bearings wider than 200 degrees.
    const bearings = ring.map((c) => Math.atan2(c.z - mz, c.x - mx)).sort((a, b) => a - b);
    let gap = bearings[0]! + 2 * Math.PI - bearings[bearings.length - 1]!;
    for (let i = 1; i < bearings.length; i++) gap = Math.max(gap, bearings[i]! - bearings[i - 1]!);
    if (gap > (200 * Math.PI) / 180) continue;
    ring.forEach((c) => done.add(c));
    out.push({ x: mx, z: mz, length: 2 * (r - 0.3), width: 2 * (r - 0.3), angle: 0, round: true, kind: "round-table" });
  }
  return out;
}

export type FixtureShape = { x: number; z: number; length: number; width: number; angle: number; kind: "pan" | "basin" | "counter" | "other" };

/** The sanitary fixtures a floor sheet draws: each group on its fixture layer, a pan, a basin, a counter, by size. */
export function dxfFixtures(drawing: DxfDrawing, floor: PisgaDxfFloor): FixtureShape[] {
  const out: FixtureShape[] = [];
  for (const g of groupsOf(drawing, floor, /^כלים סניטריים/)) {
    const [L, W] = g.len >= g.wid ? [g.len, g.wid] : [g.wid, g.len];
    const ang = g.len >= g.wid ? g.ang : g.ang + Math.PI / 2;
    if (L > 2.4 || L < 0.2) continue;
    let kind: FixtureShape["kind"];
    if (L >= 1.0 && W <= 0.7) kind = "counter";
    else if (L >= 0.55 && L <= 0.85 && W >= 0.3 && W <= 0.55) kind = "pan";
    else if (L <= 0.55) kind = "basin";
    else kind = "other";
    out.push({ x: g.cx, z: g.cz, length: L, width: W, angle: ang, kind });
  }
  return out;
}


/** The pieces of furniture as boxes: each outline extruded to what it is. */
export function furnitureFromShapes(shapes: FurnitureShape[], level: number, tag: string): Array<{ cx: number; cy: number; cz: number; sx: number; sy: number; sz: number; rotY: number; material: "timber" | "seatFabric" | "sofaFabric" | "metal" | "worktop" | "cabinet" | "walnut" }> {
  const out: ReturnType<typeof furnitureFromShapes> = [];
  void tag;
  for (const s of shapes) {
    const base = { rotY: -s.angle };
    const put = (u: number, v: number, sx: number, sy: number, sz: number, y0: number, material: (typeof out)[number]["material"]) => {
      const c = Math.cos(s.angle);
      const sn = Math.sin(s.angle);
      out.push({ cx: s.x + u * c - v * sn, cy: level + y0 + sy / 2, cz: s.z + u * sn + v * c, sx, sy, sz, material, ...base });
    };
    const { length: L, width: W } = s;
    switch (s.kind) {
      case "chair":
        put(0, 0, L, 0.06, W, 0.44, "seatFabric");
        put(0, -W / 2 + 0.04, L, 0.46, 0.06, 0.5, "seatFabric");
        for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) put(a * (L / 2 - 0.04), b * (W / 2 - 0.04), 0.035, 0.44, 0.035, 0, "metal");
        break;
      case "armchair":
      case "sofa":
        put(0, 0, L, 0.4, W, 0, "sofaFabric");
        put(0, -W / 2 + 0.1, L, 0.45, 0.2, 0.4, "sofaFabric");
        if (L > 1.5) for (const e of [-1, 1]) put(e * (L / 2 - 0.1), 0, 0.2, 0.25, W, 0.4, "sofaFabric");
        break;
      case "cabinet":
        put(0, 0, L, 0.9, W, 0, "cabinet");
        put(0, 0, L + 0.02, 0.03, W + 0.02, 0.9, "worktop");
        break;
      case "round-table":
      case "table":
      case "bench":
        put(0, 0, L, 0.04, W, 0.72, s.kind === "round-table" ? "walnut" : "timber");
        if (s.kind === "round-table") put(0, 0, 0.1, 0.72, 0.1, 0, "metal");
        else for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) put(a * (L / 2 - 0.06), b * (W / 2 - 0.06), 0.05, 0.72, 0.05, 0, "metal");
        break;
      case "stool":
        put(0, 0, L, 0.05, W, 0.45, "walnut");
        put(0, 0, 0.06, 0.45, 0.06, 0, "metal");
        break;
    }
  }
  return out;
}


/**
 * The hall's seats as the sheet draws them: each seat is a pair of 45 cm strokes 12 cm apart (its seat and its back), at a 56 cm pitch
 * along a row, 95 cm between rows. Centres in the plan frame, metres.
 */
export function dxfHallSeats(drawing: DxfDrawing): Array<{ x: number; z: number; w: number; d: number }> {
  const left = PISGA_DXF.sheets["floor-1"];
  const at = frameOf(left);
  const strokes: Array<{ x: number; z: number }> = [];
  for (const p of sheetPieces(drawing, left)) {
    if (p.type !== "LINE" || !p.pts || p.pts.length !== 2 || !/^(0|רהיטים)/.test(p.layer)) continue;
    const [[ax, az], [bx, bz]] = [at(p.pts[0]!), at(p.pts[1]!)];
    if (Math.abs(az - bz) > 0.01 || Math.abs(Math.abs(bx - ax) - 0.45) > 0.02) continue;
    const x = (ax + bx) / 2;
    if (x < 44.6 || x > 53.5 || az < 3.4 || az > 16) continue;
    strokes.push({ x, z: az });
  }
  const out: Array<{ x: number; z: number; w: number; d: number }> = [];
  const used = new Set<number>();
  strokes.forEach((a, i) => {
    if (used.has(i)) return;
    const j = strokes.findIndex((b, k) => k !== i && !used.has(k) && Math.abs(b.x - a.x) < 0.03 && Math.abs(b.z - a.z) > 0.05 && Math.abs(b.z - a.z) < 0.2);
    if (j < 0) return;
    used.add(i);
    used.add(j);
    out.push({ x: a.x, z: (a.z + strokes[j]!.z) / 2, w: 0.45, d: Math.abs(a.z - strokes[j]!.z) + 0.34 });
  });
  return out;
}
