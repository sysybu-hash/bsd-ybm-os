import sharp from "sharp";

import { blockKind, hatchKind, layerKind, profileFor, type CadKind, type CadOfficeProfile } from "@/lib/projects/building/cad-layers";
import { flattenDxf, readDxfDrawing, type DxfDrawing, type DxfPiece, type Pt } from "@/lib/projects/dxf-drawing";
import { createLogger } from "@/lib/logger";
import {
  WALL_MIN_LINE_WIDTH,
  type FloorplanVectorGeometry,
  type VectorSegment,
} from "@/lib/projects/floorplan-vector";

const log = createLogger("floorplan-dxf");

/**
 * A CAD drawing, as the same geometry a sales sheet's vectors produce.
 *
 * The pipeline downstream of `buildFlatFromGeometry` reads segments, curves and
 * a stroke width per segment — nothing about PDFs. A DXF carries the same
 * drawing with better provenance: layers, blocks and hatches say what each
 * piece is, so the stroke width a PDF forces us to infer is assigned outright.
 *
 * The drawing is read whole (dxf-drawing.ts): block references expanded into
 * world coordinates, solid and pattern hatches, legacy code pages, layers that
 * are switched off. What it holds is named by the office's layer profile
 * (cad-layers.ts), and what the plan does not take is reported, never dropped
 * silently (see DxfReadReport).
 *
 * Three things differ from a PDF and are handled below. A DXF's y axis points
 * up. It has no page: an architect's model space holds every sheet side by side
 * — plans, sections, elevations, details — so the plans are found as the
 * clusters of wall that doors open in, and one is the page. And its header's
 * unit is often wrong (Pisga's says millimetres and draws in centimetres), so
 * the unit is the one under which its doors and walls measure as doors and
 * walls.
 */

type Point = Pt;

/** Layer names that mean "wall" in the Hebrew and English drawings we see. */
const WALL_LAYER = /(^|[-_ ])(wall|walls|a-wall|קיר|קירות|מחיצ)/iu;

export function isWallLayer(layer?: string): boolean {
  return Boolean(layer && WALL_LAYER.test(layer));
}

const UNITS_M: Record<number, number> = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1 };

/**
 * Metres per drawing unit, from the header's $INSUNITS.
 *
 * 1 = inches, 2 = feet, 4 = mm, 5 = cm, 6 = m. Anything else is unknown, and
 * the caller locks scale off the printed area the way it does for a PDF.
 */
export function metresPerUnit(header?: Record<string, unknown>): number | undefined {
  const raw = header?.["$INSUNITS"];
  const code = typeof raw === "number" ? raw : Number((raw as { value?: unknown })?.value ?? NaN);
  return UNITS_M[code];
}

/**
 * The page a DXF plan is handed over on: PDF points at 1:50, the scale every
 * threshold downstream was tuned at (pads, probes and grid steps in page
 * units). A plan in millimetres is twenty times that, and the scan grid had to
 * coarsen to fit it.
 */
export const DXF_PAGE_UNITS_PER_METRE = 72 / 0.0254 / 50;

/**
 * Words only a dwelling prints. A commercial floor has toilets and stairs as
 * well, so a bathroom or a staircase says nothing; a bedroom, a ממ"ד or a
 * numbered flat does.
 */
const DWELLING_LABEL_RE = /שינה|הורים|ממ["״']?ד|דירה\s*\d|bed\s*room|master/iu;

/** How many of these texts name a dwelling. See DWELLING_LABEL_RE. */
export function countDwellingLabels(texts: Array<{ text?: string } | string>): number {
  let count = 0;
  for (const row of texts) {
    const text = typeof row === "string" ? row : row.text;
    if (text && DWELLING_LABEL_RE.test(text)) count += 1;
  }
  return count;
}

/** A label to print on the preview, in page units. */
export type DxfLabel = { x: number; y: number; text: string; height: number; rotation: number };

/** One plan the drawing holds: a cluster of wall that doors open in. */
export type DxfPlanSheet = {
  /** The cluster's extent, in metres. */
  widthM: number;
  heightM: number;
  /** Wall drawn in it, metres of line. */
  wallM: number;
  /** Door swings in it. */
  doors: number;
  /** A room name or title printed in it, when one is. */
  title?: string;
};

/**
 * What the reader took from the drawing and what it did not, in the
 * architect's terms. Every piece the plan does not take is counted here.
 */
export type DxfReadReport = {
  profile: string;
  /** Metres per drawing unit, and what said so. */
  unitsM: number;
  unitsFrom: "header" | "doors" | "walls" | "unknown";
  headerUnitsM?: number;
  /** Every plan found, the one on the page first. */
  plans: DxfPlanSheet[];
  /** Wall clusters with no door in them: sections, elevations, details. */
  otherWallClusters: number;
  /** On the page: pieces read as walls, lines and curves, texts. */
  read: { walls: number; lines: number; curves: number; texts: number };
  /** On the page and not taken, by reason. */
  skipped: {
    dimensions: number;
    /** Pattern and non-wall fills, by pattern name. */
    hatches: Record<string, number>;
    /** Pieces on layers that never plot ("Defpoints"). */
    nonPlotting: number;
  };
  /** Pieces off the page: the other sheets of model space. */
  offPage: number;
  /** Entity types the reader has no geometry for (IMAGE, MULTILEADER, …), with counts. */
  unsupported: Record<string, number>;
  /** Layers switched off or frozen, which the drawing does not print. */
  hiddenLayers: string[];
};

/** Entity types flattenDxf turns into geometry or text; everything else is reported. */
const HANDLED = new Set([
  "LINE", "LWPOLYLINE", "POLYLINE", "ARC", "CIRCLE", "ELLIPSE", "SPLINE", "SOLID", "TRACE",
  "HATCH", "TEXT", "MTEXT", "ATTRIB", "INSERT", "DIMENSION", "POINT", "VIEWPORT", "ATTDEF",
]);

const NON_PLOTTING = /^defpoints$/i;
/** A dimension's own block: AutoCAD names them *D1, *D2, … */
const DIMENSION_BLOCK = /^\*D\d/i;

/** What a piece is, by its hatch pattern, its block, then its layer. */
function kindOf(profile: CadOfficeProfile, p: DxfPiece): CadKind | null {
  if (p.dimension || p.path.some((name) => DIMENSION_BLOCK.test(name))) return "dimension";
  if (p.rings) return hatchKind(profile, p.pattern ?? "", p.layer);
  const block = p.path[0];
  if (block) {
    const byBlock = blockKind(profile, block, p.layer);
    if (byBlock && byBlock !== "group") return byBlock;
  }
  return layerKind(profile, p.layer);
}

const isWallKind = (kind: CadKind | null) => kind === "wall-ext" || kind === "wall-int";

/** A piece's outline points in drawing units, for the extent tests. */
function piecePoints(p: DxfPiece): Point[] {
  if (p.pts?.length) return p.pts;
  if (p.rings?.length) return p.rings.flat();
  if (p.at) return [p.at];
  return [];
}

function boxOf(points: Point[]): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const q of points) {
    if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
    x0 = Math.min(x0, q.x);
    y0 = Math.min(y0, q.y);
    x1 = Math.max(x1, q.x);
    y1 = Math.max(y1, q.y);
  }
  return x0 <= x1 && y0 <= y1 ? { x0, y0, x1, y1 } : null;
}

/** A quarter turn, give or take: what a door's swing sweeps. */
function quarterArc(p: DxfPiece): { c: Point; r: number; ends: [Point, Point] } | null {
  if (!p.arc || !p.pts || p.pts.length < 2) return null;
  let sweep = p.arc.end - p.arc.start;
  while (sweep <= 0) sweep += Math.PI * 2;
  const deg = (sweep * 180) / Math.PI;
  return deg >= 70 && deg <= 110 ? { c: p.arc.c, r: p.arc.r, ends: [p.pts[0]!, p.pts[p.pts.length - 1]!] } : null;
}

/**
 * The door swings: quarter arcs with their leaf drawn, a straight line from
 * the hinge to one end of the arc. A basin's rounded corner or a chair's back
 * is a quarter arc too, at any size, and has no leaf.
 */
function doorSwings(pieces: DxfPiece[]): Array<{ c: Point; r: number }> {
  const arcs = pieces.flatMap((p) => {
    const q = quarterArc(p);
    return q ? [q] : [];
  });
  if (arcs.length === 0) return [];
  // Straight lines by their ends, on a grid of a typical arc's size.
  const radii = arcs.map((a) => a.r).sort((x, y) => x - y);
  const cell = Math.max(radii[radii.length >> 1]! * 0.25, 1e-9);
  const ends = new Map<string, Array<[Point, Point]>>();
  const key = (q: Point) => `${Math.floor(q.x / cell)}:${Math.floor(q.y / cell)}`;
  for (const p of pieces) {
    if (!p.pts || p.arc || p.circle || p.rings || p.type === "SPLINE" || p.type === "ELLIPSE") continue;
    for (let i = 1; i < p.pts.length; i++) {
      const seg: [Point, Point] = [p.pts[i - 1]!, p.pts[i]!];
      for (const q of seg) {
        const k = key(q);
        const list = ends.get(k);
        if (list) list.push(seg);
        else ends.set(k, [seg]);
      }
    }
  }
  const near = (q: Point, reach: number) => {
    const out: Array<[Point, Point]> = [];
    const i0 = Math.floor((q.x - reach) / cell);
    const i1 = Math.floor((q.x + reach) / cell);
    const j0 = Math.floor((q.y - reach) / cell);
    const j1 = Math.floor((q.y + reach) / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) out.push(...(ends.get(`${i}:${j}`) ?? []));
    return out;
  };
  const close = (a: Point, b: Point, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;
  return arcs.filter((arc) => {
    const tol = arc.r * 0.06;
    return near(arc.c, tol).some(([a, b]) => {
      const tip = close(a, arc.c, tol) ? b : close(b, arc.c, tol) ? a : null;
      return tip != null && (close(tip, arc.ends[0], arc.r * 0.12) || close(tip, arc.ends[1], arc.r * 0.12));
    });
  });
}

/** The distances between a wall's two faces: each axis-aligned face to the nearest parallel one beside it. */
function wallFaceGaps(walls: DxfPiece[]): number[] {
  type Face = { at: number; lo: number; hi: number };
  const faces: { v: Face[]; h: Face[] } = { v: [], h: [] };
  for (const p of walls) {
    const pts = p.pts ?? p.rings?.[0];
    if (!pts) continue;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if (dx < dy * 1e-3 && dy > 0) faces.v.push({ at: a.x, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) });
      else if (dy < dx * 1e-3 && dx > 0) faces.h.push({ at: a.y, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) });
    }
  }
  const gaps: number[] = [];
  for (const list of [faces.v, faces.h]) {
    list.sort((p, q) => p.at - q.at);
    for (let i = 0; i < list.length && gaps.length < 20_000; i++) {
      const f = list[i]!;
      const len = f.hi - f.lo;
      for (let j = i + 1; j < list.length && j < i + 60; j++) {
        const g = list[j]!;
        const d = g.at - f.at;
        if (d <= len * 1e-3) continue;
        if (Math.min(f.hi, g.hi) - Math.max(f.lo, g.lo) >= Math.max(d, len * 0.5)) {
          gaps.push(d);
          break;
        }
      }
    }
  }
  return gaps;
}

const UNIT_CANDIDATES = [0.001, 0.01, 0.0254, 0.1, 0.3048, 1];

/**
 * Metres per drawing unit, from what the drawing draws.
 *
 * A door's leaf is 0.6 to 1.2 m and a wall 7 to 60 cm thick, in every office.
 * The unit is the one under which most swings and most wall pairs measure so;
 * the header's own is kept whenever it does nearly as well, and is the answer
 * when the drawing has neither.
 */
export function inferMetresPerUnit(
  swings: Array<{ r: number }>,
  walls: DxfPiece[],
  headerUnitsM?: number,
): { unitsM: number; from: DxfReadReport["unitsFrom"] } | null {
  const radii = swings.map((s) => s.r);
  const gaps = wallFaceGaps(walls);
  const score = (u: number) => ({
    doors: radii.filter((r) => r * u >= 0.6 && r * u <= 1.2).length,
    walls: gaps.filter((g) => g * u >= 0.07 && g * u <= 0.6).length,
  });
  const scored = UNIT_CANDIDATES.map((u) => ({ u, ...score(u) }));
  const best = scored.reduce((a, b) => (b.doors * 3 + b.walls > a.doors * 3 + a.walls ? b : a));
  const evidence = best.doors * 3 + best.walls;
  if (evidence < 3) return headerUnitsM ? { unitsM: headerUnitsM, from: "header" } : null;
  if (headerUnitsM) {
    const own = score(headerUnitsM);
    if (own.doors * 3 + own.walls >= evidence * 0.7) return { unitsM: headerUnitsM, from: "header" };
  }
  return { unitsM: best.u, from: best.doors >= 3 ? "doors" : "walls" };
}

type Cluster = { x0: number; y0: number; x1: number; y1: number; wallLength: number };

/**
 * The drawing's wall, gathered into the drawings it makes up: pieces whose
 * extents come within `gap` of each other are one drawing.
 */
function wallClusters(walls: DxfPiece[], gap: number): Cluster[] {
  const boxes = walls.flatMap((p) => {
    const box = boxOf(piecePoints(p));
    if (!box) return [];
    const pts = p.pts ?? p.rings?.[0] ?? [];
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    return [{ ...box, wallLength: length }];
  });
  boxes.sort((a, b) => a.x0 - b.x0);
  const parent = boxes.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  // Swept by x: a box meets only those that start before it ends, plus the gap.
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]!;
    for (let j = i + 1; j < boxes.length && boxes[j]!.x0 <= a.x1 + gap; j++) {
      const b = boxes[j]!;
      if (b.y0 <= a.y1 + gap && a.y0 <= b.y1 + gap) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, Cluster>();
  boxes.forEach((b, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (!g) groups.set(root, { ...b });
    else {
      g.x0 = Math.min(g.x0, b.x0);
      g.y0 = Math.min(g.y0, b.y0);
      g.x1 = Math.max(g.x1, b.x1);
      g.y1 = Math.max(g.y1, b.y1);
      g.wallLength += b.wallLength;
    }
  });
  return [...groups.values()];
}

/** The read drawing: every piece with what it is, and the unit. */
type ReadDrawing = {
  drawing: DxfDrawing;
  profile: CadOfficeProfile;
  pieces: Array<{ p: DxfPiece; kind: CadKind | null; wall: boolean }>;
  unitsM?: number;
  unitsFrom: DxfReadReport["unitsFrom"];
  plans: Array<Cluster & { doors: number }>;
  otherWallClusters: number;
};

function readPieces(drawing: DxfDrawing): ReadDrawing {
  const profile = profileFor(drawing.layers.keys());
  const pieces = flattenDxf(drawing).map((p) => {
    const kind = kindOf(profile, p);
    // A wall is a wall's outline or its fill. A column drawn as a circle on a
    // wall layer is a column, and is left to the furniture pass as a curve;
    // a block's own fill on a wall layer is its symbol, not poché.
    const wall =
      (isWallKind(kind) || (kind == null && isWallLayer(p.layer))) &&
      !p.circle &&
      p.text == null &&
      !p.insert &&
      (!p.rings || p.path.length === 0);
    return { p, kind, wall };
  });
  const walls = pieces.filter((row) => row.wall).map((row) => row.p);
  const doors = doorSwings(pieces.map((row) => row.p));
  const units = inferMetresPerUnit(doors, walls, drawing.headerUnitsM);
  const unitsM = units?.unitsM;
  if (!unitsM || walls.length === 0) {
    return { drawing, profile, pieces, unitsM, unitsFrom: units?.from ?? "unknown", plans: [], otherWallClusters: 0 };
  }
  // Sheets stand tens of metres apart; the parts of one plan, a corridor apart at most.
  const clusters = wallClusters(walls, 4 / unitsM).filter((c) => c.wallLength * unitsM >= 8);
  const swings = doors.filter((s) => s.r * unitsM >= 0.6 && s.r * unitsM <= 1.2).map((s) => s.c);
  const margin = 1.5 / unitsM;
  const counted = clusters.map((c) => ({
    ...c,
    doors: swings.filter((s) => s.x >= c.x0 - margin && s.x <= c.x1 + margin && s.y >= c.y0 - margin && s.y <= c.y1 + margin).length,
  }));
  // A plan is where doors open; a section or an elevation draws its walls cut, with none.
  const withDoors = counted.filter((c) => c.doors >= 2);
  const plans = (withDoors.length ? withDoors : counted).sort((a, b) => b.wallLength - a.wallLength);
  return {
    drawing,
    profile,
    pieces,
    unitsM,
    unitsFrom: units?.from ?? "unknown",
    plans,
    otherWallClusters: counted.length - withDoors.length,
  };
}

/** The pieces of one plan, on its page, with the report of what was taken. */
function planGeometry(read: ReadDrawing, planIndex: number): FloorplanVectorGeometry | null {
  const { pieces, unitsM } = read;
  const plan = read.plans[planIndex];
  // A drawing with no wall the reader can see is still a drawing: the whole of
  // it is the page, in its own units, as before.
  const all = plan == null;
  const pad = plan && unitsM ? 2 / unitsM : 0;
  const window = plan
    ? { x0: plan.x0 - pad, y0: plan.y0 - pad, x1: plan.x1 + pad, y1: plan.y1 + pad }
    : boxOf(pieces.flatMap((row) => (row.p.text == null ? piecePoints(row.p) : [])));
  if (!window) return null;
  const within = (q: Point) => q.x >= window.x0 && q.x <= window.x1 && q.y >= window.y0 && q.y <= window.y1;

  // Page units: points at 1:50 when the unit is known, the drawing's own otherwise.
  const k = unitsM ? unitsM * DXF_PAGE_UNITS_PER_METRE : 1;
  const toPage = (q: Point): Point => ({ x: (q.x - window.x0) * k, y: (window.y1 - q.y) * k });

  const segments: VectorSegment[] = [];
  const curves: VectorSegment[] = [];
  const labels: DxfLabel[] = [];
  const report: DxfReadReport["read"] = { walls: 0, lines: 0, curves: 0, texts: 0 };
  const skipped: DxfReadReport["skipped"] = { dimensions: 0, hatches: {}, nonPlotting: 0 };
  let offPage = 0;
  const push = (into: VectorSegment[], pts: Point[], lineWidth: number, closed = false) => {
    const page = pts.map(toPage);
    if (closed && page.length > 2) page.push(page[0]!);
    for (let i = 1; i < page.length; i++) {
      const a = page[i - 1]!;
      const b = page[i]!;
      if (a.x === b.x && a.y === b.y) continue;
      into.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, lineWidth });
    }
  };

  for (const { p, kind, wall } of pieces) {
    if (p.insert) continue;
    const anchor = piecePoints(p)[0];
    if (!anchor) continue;
    if (!all && !within(anchor)) {
      offPage += 1;
      continue;
    }
    if (NON_PLOTTING.test(p.layer)) {
      skipped.nonPlotting += 1;
      continue;
    }
    if (kind === "dimension") {
      skipped.dimensions += 1;
      continue;
    }
    if (p.text != null) {
      if (!p.at) continue;
      const at = toPage(p.at);
      labels.push({ x: at.x, y: at.y, text: p.text, height: (p.height ?? 0) * k, rotation: p.rotation ?? 0 });
      report.texts += 1;
      continue;
    }
    if (p.rings) {
      // A wall's fill is the wall: its outline is two faces the wall detector
      // pairs. Any other fill — paving, lawn, earth — is a surface the plan
      // does not build, and is reported by pattern.
      if (wall) {
        for (const ring of p.rings) push(segments, ring, WALL_MIN_LINE_WIDTH, true);
        report.walls += 1;
      } else {
        const name = p.pattern || "?";
        skipped.hatches[name] = (skipped.hatches[name] ?? 0) + 1;
      }
      continue;
    }
    if (!p.pts || p.pts.length < 2) continue;
    if (wall) {
      // A curved wall too: its chords are short faces, paired like any other.
      push(segments, p.pts, WALL_MIN_LINE_WIDTH);
      report.walls += 1;
      continue;
    }
    const curved = Boolean(p.arc || p.circle || p.type === "ELLIPSE" || p.type === "SPLINE");
    // A curve reaches the pipeline as the chords a PDF's curves give: a swing,
    // a basin, a pan. Kept apart from the segments, as on a PDF.
    if (curved) {
      push(curves, p.pts, 1);
      report.curves += 1;
    } else {
      push(segments, p.pts, 1);
      report.lines += 1;
    }
  }
  if (segments.length === 0 && curves.length === 0) return null;

  const pageWidth = (window.x1 - window.x0) * k;
  const pageHeight = (window.y1 - window.y0) * k;
  if (!(pageWidth > 0) || !(pageHeight > 0)) return null;
  const axis = (seg: VectorSegment) =>
    Math.abs(seg.x1 - seg.x2) <= Math.abs(seg.y1 - seg.y2) * 1e-6 + 1e-6 ||
    Math.abs(seg.y1 - seg.y2) <= Math.abs(seg.x1 - seg.x2) * 1e-6 + 1e-6;
  const walls = segments.filter((seg) => seg.lineWidth >= WALL_MIN_LINE_WIDTH && axis(seg));

  const unsupported: Record<string, number> = {};
  for (const e of read.drawing.entities) {
    if (!HANDLED.has(e.type)) unsupported[e.type] = (unsupported[e.type] ?? 0) + 1;
  }
  const hiddenLayers = [...read.drawing.layers.values()].filter((l) => l.off || l.frozen).map((l) => l.name);
  const plans: DxfPlanSheet[] = read.plans.map((c) => ({
    widthM: unitsM ? (c.x1 - c.x0) * unitsM : c.x1 - c.x0,
    heightM: unitsM ? (c.y1 - c.y0) * unitsM : c.y1 - c.y0,
    wallM: unitsM ? c.wallLength * unitsM : c.wallLength,
    doors: c.doors,
  }));
  // The page's plan first, as the report says.
  if (planIndex > 0) plans.unshift(...plans.splice(planIndex, 1));
  const cad: DxfReadReport = {
    profile: read.profile.id,
    unitsM: unitsM ?? 0,
    unitsFrom: read.unitsFrom,
    ...(read.drawing.headerUnitsM ? { headerUnitsM: read.drawing.headerUnitsM } : {}),
    plans,
    otherWallClusters: read.otherWallClusters,
    read: report,
    skipped,
    offPage,
    unsupported,
    hiddenLayers,
  };
  const unitsPerMetre = unitsM ? DXF_PAGE_UNITS_PER_METRE : undefined;
  const dwellingLabels = countDwellingLabels(labels);
  log.info("dxf geometry read", {
    segments: segments.length,
    curves: curves.length,
    walls: walls.length,
    unitsM,
    unitsFrom: read.unitsFrom,
    plans: plans.length,
    plan: planIndex,
    offPage,
    dwellingLabels,
  });
  return {
    pageWidth,
    pageHeight,
    segments,
    walls,
    curves,
    ...(unitsPerMetre ? { unitsPerMetre } : {}),
    dwellingLabels,
    labels,
    cad,
  };
}

/**
 * Every plan the drawing holds, each on its own page, the one with the most
 * wall first. A drawing with no plan the reader can find is one page, whole.
 */
export function planGeometriesFromDxf(input: string | Uint8Array): FloorplanVectorGeometry[] {
  const drawing = readDxfDrawing(input);
  if (!drawing) return [];
  return readDxfPlans(drawing).geometries;
}

/**
 * The drawing's plans, at most `limit` of them, and every text it prints: the
 * identify step reads what a drawing is from both, on one pass over it.
 */
export function readDxfPlans(
  drawing: DxfDrawing,
  limit = Infinity,
): { geometries: FloorplanVectorGeometry[]; texts: string[] } {
  const read = readPieces(drawing);
  const count = Math.min(limit, Math.max(1, read.plans.length));
  const geometries: FloorplanVectorGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const geometry = planGeometry(read, read.plans.length ? i : -1);
    if (geometry) geometries.push(geometry);
  }
  const texts = read.pieces.flatMap((row) => (row.p.text && !row.p.dimension ? [row.p.text] : []));
  return { geometries, texts };
}

/**
 * Parse a DXF (text, or its bytes, which carry the code page) into the
 * pipeline's geometry: the plan with the most wall, on its own page. The rest
 * of the drawing is counted in `geometry.cad`. Returns null for anything
 * unreadable, or a drawing with nothing to draw.
 */
export async function geometryFromDxf(input: string | Uint8Array): Promise<FloorplanVectorGeometry | null> {
  try {
    const drawing = readDxfDrawing(input);
    if (!drawing) return null;
    const read = readPieces(drawing);
    return planGeometry(read, read.plans.length ? 0 : -1);
  } catch (err: unknown) {
    log.warn("dxf parse failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * The report as the lines a person reads under the plate (Hebrew): which plan
 * this is of how many, and what the drawing holds that the plate does not.
 */
export function dxfReportLines(report: DxfReadReport): string[] {
  const lines: string[] = [];
  if (report.unitsFrom === "doors" || report.unitsFrom === "walls") {
    const unit = (m: number) => (m === 0.001 ? "מ״מ" : m === 0.01 ? "ס״מ" : m === 1 ? "מ׳" : `${m} מ׳`);
    lines.push(
      `יחידת השרטוט נקבעה לפי ${report.unitsFrom === "doors" ? "רדיוסי הדלתות" : "עובי הקירות"}: ${unit(report.unitsM)}` +
        (report.headerUnitsM ? ` (כותרת הקובץ אומרת ${unit(report.headerUnitsM)})` : ""),
    );
  }
  if (report.plans.length > 1) {
    lines.push(`בקובץ ${report.plans.length} תוכניות; מוצגת אחת (${Math.round(report.plans[0]!.widthM)} × ${Math.round(report.plans[0]!.heightM)} מ׳)`);
  }
  if (report.otherWallClusters > 0) lines.push(`${report.otherWallClusters} שרטוטי קירות בלי דלתות (חתכים, חזיתות, פרטים) לא נבנו`);
  const hatches = Object.entries(report.skipped.hatches).sort((a, b) => b[1] - a[1]);
  if (hatches.length) {
    lines.push(`שטחי מילוי שלא נבנו: ${hatches.slice(0, 6).map(([name, n]) => `${name} (${n})`).join(", ")}${hatches.length > 6 ? "…" : ""}`);
  }
  if (report.skipped.dimensions > 0) lines.push(`${report.skipped.dimensions} חלקי מידות נקראו כמידות ולא כקווים`);
  const unsupported = Object.entries(report.unsupported);
  if (unsupported.length) lines.push(`ישויות שאין להן קורא: ${unsupported.map(([type, n]) => `${type} (${n})`).join(", ")}`);
  return lines;
}

/**
 * A CAD upload the pipeline cannot read. Its message is for the person who
 * uploaded it: the file is at fault, not the service, so it answers 400.
 */
export class FloorplanCadUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FloorplanCadUnreadableError";
  }
}

/**
 * Rasterise a DXF page without passing the non-image DXF bytes to image/OCR
 * providers. Wall layers stay heavy, all other geometry stays legible, and
 * the drawing's text is printed where it stands so the raster fallback can
 * read labels.
 */
export async function renderDxfPageJpeg(
  geometry: FloorplanVectorGeometry,
  width = 2200,
): Promise<Buffer | null> {
  if (
    !Number.isFinite(geometry.pageWidth) ||
    !Number.isFinite(geometry.pageHeight) ||
    geometry.pageWidth <= 0 ||
    geometry.pageHeight <= 0 ||
    !Number.isFinite(width) ||
    width < 64
  ) return null;
  if (geometry.segments.length === 0 && geometry.curves.length === 0) return null;
  const height = Math.max(64, Math.round(width * geometry.pageHeight / geometry.pageWidth));
  if (height > 8192) return null;
  const scale = width / geometry.pageWidth;
  const thin = Math.max(0.45, Math.min(1.1, Math.min(width, height) * 0.00055));
  const thick = Math.max(1.1, Math.min(2.4, Math.min(width, height) * 0.0014));
  // A whole-site drawing is millions of lines, most shorter than a pixel at
  // this width. Writing every one into the SVG is what fills the memory; a line
  // under half a pixel draws nothing anyway.
  const all = [...geometry.segments, ...geometry.curves];
  const minLength = all.length > 200_000 ? 0.5 / scale : 0;
  const visible =
    minLength > 0
      ? all.filter((segment) => Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1) >= minLength)
      : all;
  const lines = visible.map((segment) => {
    const wall = segment.lineWidth >= WALL_MIN_LINE_WIDTH;
    const color = wall ? "#20252b" : "#555d66";
    const strokeWidth = wall ? thick : thin;
    return `<line x1="${segment.x1}" y1="${segment.y1}" x2="${segment.x2}" y2="${segment.y2}" stroke="${color}" stroke-width="${strokeWidth / scale}" stroke-linecap="round"/>`;
  }).join("");

  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;",
  })[char]!);
  const labels = (geometry.labels ?? []).map((label) => {
    const size = Math.max(thin / scale, (label.height || 2.5) * 0.72);
    const rotation = Number.isFinite(label.rotation) ? -label.rotation : 0;
    return `<text x="${label.x}" y="${label.y}" font-family="Arial,sans-serif" font-size="${size}" fill="#3d4650" direction="rtl" unicode-bidi="plaintext" transform="rotate(${rotation} ${label.x} ${label.y})">${escape(label.text)}</text>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${geometry.pageWidth} ${geometry.pageHeight}"><rect width="100%" height="100%" fill="#fff"/>${lines}${labels}</svg>`;
  try {
    return await sharp(Buffer.from(svg)).jpeg({ quality: 94, mozjpeg: true }).toBuffer();
  } catch (err: unknown) {
    log.warn("dxf page rasterisation failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export { looksLikeDwg, looksLikeDxf } from "@/lib/projects/photo-prep/mime";
