import { blockKind, hatchKind, layerKind, profileFor, type CadKind, type CadOfficeProfile } from "@/lib/projects/building/cad-layers";
import { apartmentMarks, type ApartmentMark } from "@/lib/projects/dxf-apartment";
import { entitiesWithin, flattenDxf, type DxfDrawing, type DxfPiece, type Pt } from "@/lib/projects/dxf-drawing";

/**
 * One flat out of a whole-floor DXF, found the way a visitor finds it: in
 * through its front door, through every inner door, and no further.
 *
 * A sales drawing marks each flat with its number by the entrance and draws
 * no outline around it. The floor is cut into spaces by its walls, windows
 * and railings, with every door shut; the doors then join the spaces into a
 * graph. The common hall is the space all the flats' numbers lead to by the
 * fewest doors, and a flat is every space its number reaches without passing
 * through that hall, the outside or another flat's number. Balconies behind
 * the flat's glass are added when they are paved or named as one.
 *
 * The drawing says what each line is through the office's layer profile; a
 * line it does not name stops nothing, so an axis or a furniture outline
 * never cuts a room in two.
 */

/** A door of the flat as its block draws it, drawing units. */
export type UnitDoor = {
  box: { x0: number; y0: number; x1: number; y1: number };
  /** The spaces the door joins (see UnitPlan.space). */
  spaces: number[];
  /** Leads out of the flat: to the hall, or to a space that is not the flat's. */
  entrance: boolean;
  /** Each leaf's swing: hinge, radius, and the arc's two ends. A sliding door has none. */
  swings: Array<{ hinge: Pt; r: number; a: Pt; b: Pt }>;
  /** The block's straight strokes, for the leaf's open end. */
  strokes: Array<[Pt, Pt]>;
};

/** A furniture or fixture block on the flat, drawing units. */
export type UnitPiece = {
  block: string;
  layer: string;
  kind: CadKind | null;
  corners: Pt[];
  /** The block's own closed outlines, each as its box: a dining set's table and every chair round it. */
  parts?: Array<{ x0: number; y0: number; x1: number; y1: number }>;
};

export type UnitPlan = {
  number: number;
  /** Metres per drawing unit. */
  unitsM: number;
  /** The raster the flat was found on, in drawing units: column 0 at x0, row 0 at y1 (y runs down). */
  x0: number;
  y1: number;
  cell: number;
  cols: number;
  rows: number;
  /** Per cell: 1 the flat's floor, 2 a balcony, 0 neither. */
  mask: Uint8Array;
  netM2: number;
  /** The floor and the walls around it, as a sale sheet counts gross area. */
  grossM2: number;
  balconyM2: number;
  /** The area printed beside the number, when one is. */
  printedM2?: number;
  /** Drawing-unit boxes of the doors that lead out of the flat to the hall. */
  entrances: Array<{ x0: number; y0: number; x1: number; y1: number }>;
  /** Per cell: 0 free, 1 wall, 2 window, 3 railing. */
  grid: Uint8Array;
  /** Per cell: the space it lies in with every door shut, -1 on a line; 0 is outside. */
  space: Int32Array;
  /** The spaces that make up the flat. */
  flatSpaces: number[];
  doors: UnitDoor[];
  /** Every text on the flat and around it, as the drawing places it. */
  texts: Array<{ text: string; at: Pt; height: number }>;
  pieces: UnitPiece[];
  /**
   * The loose strokes of built-in joinery — a worktop's front, a wardrobe's
   * outline, an island — drawn as lines on a furniture or sanitary layer, not
   * as a block. Drawing units.
   */
  outlines: Array<[Pt, Pt]>;
  /** Drawing units: the flat's floor, balconies and the walls around them. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
};

export type UnitPlanFailure = { number: number; reason: string };

/** How far around its number a flat may reach. */
const REACH_M = 16;
const CELL_M = 0.03;
/** A wall's thickness counted into gross area. */
const GROSS_WALL_M = 0.3;
/** How far past the floor the crop keeps lines: the walls and the window frames. */
const KEEP_M = 0.4;
const BALCONY_MAX_M2 = 30;

const FREE = 0;
const WALL = 1;
const GLASS = 2;
const RAIL = 3;
const DOOR = 4;

const isWall = (kind: CadKind | null) => kind === "wall-ext" || kind === "wall-int";
const isGlass = (kind: CadKind | null) => kind === "window";
const isRail = (kind: CadKind | null) => kind === "railing" || kind === "fence";

/** What a piece is: its outermost block's name first, then its layer; a hatch by its pattern. */
function kindOf(profile: CadOfficeProfile, p: DxfPiece): CadKind | null {
  if (p.dimension) return "dimension";
  if (p.rings) return hatchKind(profile, p.pattern ?? "", p.layer);
  const block = p.path[0];
  if (block) {
    const byBlock = blockKind(profile, block, p.layer);
    if (byBlock && byBlock !== "group") return byBlock;
  }
  return layerKind(profile, p.layer);
}

type Box = { x0: number; y0: number; x1: number; y1: number };

/**
 * The flat numbered `number`, or why it could not be closed.
 *
 * With `floor` (a box in drawing units), the whole storey in it instead: every
 * enclosed space — each flat, the hall, the shafts — is the "flat", and the
 * balconies behind their glass with it. Uziel 53's exterior is stacked from
 * its floors read so: the building reader missed half their walls, while this
 * one closes every flat of the same drawing.
 */
export function unitByDoors(
  drawing: DxfDrawing,
  number: number,
  options?: {
    floor?: Box;
    /** The office's profile as a person confirmed its layers (withLayerMap); by the drawing's own layers when absent. */
    profile?: CadOfficeProfile;
  },
): UnitPlan | UnitPlanFailure {
  const unitsM = drawing.headerUnitsM;
  if (!unitsM) return { number, reason: "no-units" };
  const marks = apartmentMarks(drawing);
  const box = options?.floor;
  const mark = box ? { number, x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 } as ApartmentMark : marks.find((m) => m.number === number);
  if (!mark) return { number, reason: "no-mark" };
  const U = 1 / unitsM;
  const R = box ? Math.max(box.x1 - box.x0, box.y1 - box.y0) / 2 + 2 * U : REACH_M * U;
  const cell = CELL_M * U;
  const x0 = mark.x - R;
  const y1 = mark.y + R;
  const cols = Math.ceil((2 * R) / cell);
  const rows = cols;
  const N = cols * rows;
  const cx = (x: number) => Math.floor((x - x0) / cell);
  const cy = (y: number) => Math.floor((y1 - y) / cell);
  const at = (q: Pt) => {
    const X = cx(q.x);
    const Y = cy(q.y);
    return X >= 0 && Y >= 0 && X < cols && Y < rows ? Y * cols + X : -1;
  };

  const profile = options?.profile ?? profileFor(drawing.layers.keys());
  const pieces = flattenDxf(drawing, entitiesWithin(drawing, { centre: mark, width: 2 * R, height: 2 * R }));

  const grid = new Uint8Array(N);
  const line = (a: Pt, b: Pt, v: number) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cell / 2)) + 1;
    for (let i = 0; i <= steps; i++) {
      const c = at({ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps });
      if (c >= 0 && grid[c]! < v) grid[c] = v;
    }
  };
  const fill = (target: Uint8Array, rings: Pt[][], v: number) => {
    for (let y = 0; y < rows; y++) {
      const wy = y1 - (y + 0.5) * cell;
      const xs: number[] = [];
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[i]!;
          const b = ring[j]!;
          if (a.y > wy !== b.y > wy) xs.push(a.x + ((wy - a.y) * (b.x - a.x)) / (b.y - a.y));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(0, cx(xs[k]!));
        const to = Math.min(cols - 1, cx(xs[k + 1]!));
        for (let x = from; x <= to; x++) if (target[y * cols + x]! < v) target[y * cols + x] = v;
      }
    }
  };

  // Doors: each door insert's extent, leaf and swing, from the pieces that follow it.
  const doors: Box[] = [];
  const doorDrawn: Array<Pick<UnitDoor, "swings" | "strokes">> = [];
  const placed: UnitPiece[] = [];
  const outlines: Array<[Pt, Pt]> = [];
  const seats: Array<{ at: Pt; piece: UnitPiece; arc: { c: Pt; r: number; start: number; end: number } }> = [];
  const pave = new Uint8Array(N);
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!;
    if (p.text != null) continue;
    const kind = kindOf(profile, p);
    if (p.insert) {
      const insertKind = blockKind(profile, p.insert, p.layer);
      const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      const drawn: Pick<UnitDoor, "swings" | "strokes"> = { swings: [], strokes: [] };
      const parts: NonNullable<UnitPiece["parts"]> = [];
      let doorLines = false;
      for (let j = i + 1; j < pieces.length && pieces[j]!.path.length > p.path.length; j++) {
        const child = pieces[j]!;
        if (child.pts && !child.arc && kindOf(profile, child) === "door") doorLines = true;
        const ring = child.pts && child.pts.length > 3 && (child.closed || Math.hypot(child.pts[0]!.x - child.pts.at(-1)!.x, child.pts[0]!.y - child.pts.at(-1)!.y) * unitsM < 0.01);
        if (ring) {
          const xs = child.pts!.map((q) => q.x);
          const ys = child.pts!.map((q) => q.y);
          parts.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
        }
        for (const q of child.pts ?? []) {
          box.x0 = Math.min(box.x0, q.x);
          box.y0 = Math.min(box.y0, q.y);
          box.x1 = Math.max(box.x1, q.x);
          box.y1 = Math.max(box.y1, q.y);
        }
        if (child.arc && child.arc.r * unitsM >= 0.4 && child.arc.r * unitsM <= 1.3) {
          const { c, r, start, end } = child.arc;
          drawn.swings.push({ hinge: c, r, a: { x: c.x + r * Math.cos(start), y: c.y + r * Math.sin(start) }, b: { x: c.x + r * Math.cos(end), y: c.y + r * Math.sin(end) } });
        } else if (child.pts && !child.arc && !child.circle) {
          for (let k = 1; k < child.pts.length; k++) drawn.strokes.push([child.pts[k - 1]!, child.pts[k]!]);
        }
      }
      if (!Number.isFinite(box.x0)) continue;
      // A window drawn as a block of door-layer lines with no swing, in a wall's depth: flats 20 and 21's facade
      // windows (*U160–*U163 on A-TX2) were skipped as door strokes and left the facade open. Its lines are glass.
      const deep = Math.min(box.x1 - box.x0, box.y1 - box.y0) * unitsM;
      const long = Math.max(box.x1 - box.x0, box.y1 - box.y0) * unitsM;
      const swingless = drawn.swings.length === 0 && deep <= 0.5 && long >= 0.6;
      if (swingless && doorLines && (insertKind == null || profile.doorNeedsSwing)) {
        for (const [a, b] of drawn.strokes) line(a, b, GLASS);
        continue;
      }
      if (insertKind === "door") {
        doors.push(box);
        doorDrawn.push(drawn);
      } else if (p.path.length === 0 && p.m && (insertKind === "furniture" || insertKind === "sanitary" || kind === "overhead" || kind === "sanitary")) {
        placed.push({ block: p.insert, layer: p.layer, kind: insertKind ?? kind, corners: [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }], parts });
      }
      continue;
    }
    if (kind === "door" || p.dimension) continue;
    if (p.rings) {
      if (kind === "paving") fill(pave, p.rings, 1);
      else if (isWall(kind) && p.path.length === 0) fill(grid, p.rings, WALL);
      continue;
    }
    const v = isWall(kind) ? WALL : isGlass(kind) ? GLASS : isRail(kind) ? RAIL : FREE;
    // A stool drawn loose at an island: the half circle of its seat.
    if (!v && p.path.length === 0 && p.arc && (kind === "overhead" || kind === "sanitary" || kind === "furniture")) {
      const { c, r, start, end } = p.arc;
      if (r * unitsM >= 0.12 && r * unitsM <= 0.32) {
        const mid = (start + (end < start ? end + Math.PI * 2 : end)) / 2;
        // The arc is drawn from the worktop's edge: the seat stands clear of it, a stool's half-width out.
        const out = Math.max(r, 0.25 / unitsM);
        const at = { x: c.x + out * Math.cos(mid), y: c.y + out * Math.sin(mid) };
        const half = 0.19 / unitsM;
        seats.push({ at, arc: p.arc, piece: { block: "stool", layer: p.layer, kind, corners: [{ x: at.x - half, y: at.y - half }, { x: at.x + half, y: at.y - half }, { x: at.x + half, y: at.y + half }, { x: at.x - half, y: at.y + half }] } });
      }
      continue;
    }
    if (!v && p.path.length === 0 && p.pts && !p.arc && !p.circle && (kind === "overhead" || kind === "sanitary" || kind === "furniture")) {
      for (let k = 1; k < p.pts.length; k++) outlines.push([p.pts[k - 1]!, p.pts[k]!]);
      if (p.closed && p.pts.length > 2) outlines.push([p.pts[p.pts.length - 1]!, p.pts[0]!]);
    }
    if (!v || !p.pts) continue;
    for (let k = 1; k < p.pts.length; k++) line(p.pts[k - 1]!, p.pts[k]!, v);
  }

  // Stools stand apart, a seat's width or more. Arcs that crowd each other are
  // the pieces of one drawn outline — דירה 17's oval basin, eight arcs, came
  // back as eight stools heaped on the vanity — so they stay its outline, and
  // the ring they close is that basin.
  const crowded = seats.filter((s) => seats.some((o) => o !== s && Math.hypot(o.at.x - s.at.x, o.at.y - s.at.y) * unitsM < 0.3));
  const rings: Array<typeof crowded> = [];
  for (const s of crowded) {
    const near = rings.filter((g) => g.some((o) => Math.hypot(o.at.x - s.at.x, o.at.y - s.at.y) * unitsM < 0.3));
    const merged = near.flat().concat(s);
    for (const g of near) rings.splice(rings.indexOf(g), 1);
    rings.push(merged);
  }
  for (const g of rings) {
    if (g.length < 3) continue;
    // Bounded by the arcs as drawn, not their whole circles: a quarter of a wide circle reaches nowhere near its far side.
    const along = g.flatMap(({ arc: { c, r, start, end } }) => {
      const e = end < start ? end + Math.PI * 2 : end;
      return Array.from({ length: 13 }, (_, k) => ({ x: c.x + r * Math.cos(start + ((e - start) * k) / 12), y: c.y + r * Math.sin(start + ((e - start) * k) / 12) }));
    });
    const xs = along.map((p) => p.x);
    const ys = along.map((p) => p.y);
    const box = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    if (Math.max(box.x1 - box.x0, box.y1 - box.y0) * unitsM > 0.9) continue;
    // The ring is the bowl alone (17's: 39 by 23): grown to a vanity's, so the bowl stands on the top, not hidden in it.
    const wide = box.x1 - box.x0 >= box.y1 - box.y0;
    const grow = (lo: number, hi: number, m: number) => { const pad = Math.max(0, m / unitsM - (hi - lo)) / 2; return [lo - pad, hi + pad] as const; };
    [box.x0, box.x1] = grow(box.x0, box.x1, wide ? 0.55 : 0.38);
    [box.y0, box.y1] = grow(box.y0, box.y1, wide ? 0.38 : 0.55);
    placed.push({ block: "drawn-basin", layer: g[0]!.piece.layer, kind: g[0]!.piece.kind, corners: [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }] });
  }
  for (const s of seats) {
    if (!seats.some((o) => o !== s && Math.hypot(o.at.x - s.at.x, o.at.y - s.at.y) * unitsM < 0.3)) {
      placed.push(s.piece);
      continue;
    }
    const { c, r, start } = s.arc;
    const end = s.arc.end < start ? s.arc.end + Math.PI * 2 : s.arc.end;
    const n = Math.max(2, Math.ceil((end - start) / (Math.PI / 12)));
    for (let k = 1; k <= n; k++) {
      const a0 = start + ((end - start) * (k - 1)) / n, a1 = start + ((end - start) * k) / n;
      outlines.push([{ x: c.x + r * Math.cos(a0), y: c.y + r * Math.sin(a0) }, { x: c.x + r * Math.cos(a1), y: c.y + r * Math.sin(a1) }]);
    }
  }

  // Every door shut: the floor falls into spaces.
  const shut = grid.slice();
  for (const d of doors) fill(shut, [[{ x: d.x0, y: d.y0 }, { x: d.x1, y: d.y0 }, { x: d.x1, y: d.y1 }, { x: d.x0, y: d.y1 }]], DOOR);
  const space = new Int32Array(N).fill(-1);
  const sizes: number[] = [];
  const flood = (seeds: number[], id: number) => {
    const stack: number[] = [];
    for (const s of seeds) {
      if (shut[s] === FREE && space[s] === -1) {
        space[s] = id;
        stack.push(s);
      }
    }
    let count = 0;
    while (stack.length) {
      const s = stack.pop()!;
      count++;
      const x = s % cols;
      for (const t of [x > 0 ? s - 1 : -1, x < cols - 1 ? s + 1 : -1, s - cols, s + cols]) {
        if (t >= 0 && t < N && shut[t] === FREE && space[t] === -1) {
          space[t] = id;
          stack.push(t);
        }
      }
    }
    return count;
  };
  const OUTSIDE = 0;
  const border: number[] = [];
  for (let x = 0; x < cols; x++) border.push(x, (rows - 1) * cols + x);
  for (let y = 0; y < rows; y++) border.push(y * cols, y * cols + cols - 1);
  sizes.push(flood(border, OUTSIDE));
  for (let s = 0; s < N; s++) if (shut[s] === FREE && space[s] === -1) sizes.push(flood([s], sizes.length));

  // A door joins the spaces around its box.
  const doorSpaces = doors.map((d) => {
    const ids = new Set<number>();
    const X0 = Math.max(0, cx(d.x0) - 1);
    const X1 = Math.min(cols - 1, cx(d.x1) + 1);
    const Y0 = Math.max(0, cy(d.y1) - 1);
    const Y1 = Math.min(rows - 1, cy(d.y0) + 1);
    for (let y = Y0; y <= Y1; y++) {
      for (let x = X0; x <= X1; x++) {
        const id = space[y * cols + x]!;
        if (id >= 0) ids.add(id);
      }
    }
    return ids;
  });
  const links = new Map<number, Set<number>>();
  doorSpaces.forEach((ids) => {
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        if (!links.has(a)) links.set(a, new Set());
        links.get(a)!.add(b);
      }
    }
  });

  // A number stands on its flat's floor; one on a line takes the nearest floor.
  const spaceOf = (m: ApartmentMark): number => {
    const X = cx(m.x);
    const Y = cy(m.y);
    const reach = Math.round(1.2 / unitsM / cell);
    let best = -1;
    let bestD = Infinity;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const X2 = X + dx;
        const Y2 = Y + dy;
        if (X2 < 0 || Y2 < 0 || X2 >= cols || Y2 >= rows) continue;
        const id = space[Y2 * cols + X2]!;
        const d = dx * dx + dy * dy;
        if (id > OUTSIDE && d < bestD) {
          best = id;
          bestD = d;
        }
      }
    }
    return best;
  };
  // A whole storey: every enclosed space in the box is its floor, and no number, hall or neighbour splits it.
  const own = box ? Math.max(-1, ...Array.from({ length: sizes.length - 1 }, (_, i) => i + 1).filter((id) => sizes[id]! > 0)) : spaceOf(mark);
  if (own < 0) return { number, reason: "mark-off-floor" };
  const others = new Set<number>();
  const markSpaces = new Set<number>([own]);
  for (const m of box ? [] : marks) {
    if (m.number === number || Math.abs(m.x - mark.x) > R || Math.abs(m.y - mark.y) > R) continue;
    const id = spaceOf(m);
    if (id > OUTSIDE && id !== own) {
      others.add(id);
      markSpaces.add(id);
    }
  }

  // The hall: the unnumbered space nearest, in doors, to every number on the floor.
  const hops = (from: number) => {
    const d = new Map<number, number>([[from, 0]]);
    const queue = [from];
    for (let h = 0; h < queue.length; h++) {
      const a = queue[h]!;
      for (const b of links.get(a) ?? []) {
        if (b === OUTSIDE || d.has(b)) continue;
        d.set(b, d.get(a)! + 1);
        queue.push(b);
      }
    }
    return d;
  };
  const fromMarks = [...markSpaces].map(hops);
  let hall = -1;
  let hallScore = Infinity;
  if (markSpaces.size > 1) {
    for (let id = 1; id < sizes.length; id++) {
      if (markSpaces.has(id)) continue;
      let sum = 0;
      let reached = 0;
      for (const d of fromMarks) {
        const h = d.get(id);
        if (h != null) {
          sum += h;
          reached++;
        }
      }
      if (reached < 2) continue;
      // Every number reached counts for more than any distance.
      const score = (markSpaces.size - reached) * 1000 + sum;
      if (score < hallScore || (score === hallScore && sizes[id]! > sizes[hall]!)) {
        hall = id;
        hallScore = score;
      }
    }
  }

  // The flat: every space reached from its number, short of the hall, the outside and the other flats.
  const flat = new Set<number>(box ? Array.from({ length: sizes.length - 1 }, (_, i) => i + 1) : [own]);
  const queue = box ? [] : [own];
  for (let h = 0; h < queue.length; h++) {
    for (const b of links.get(queue[h]!) ?? []) {
      if (b === OUTSIDE || b === hall || others.has(b) || flat.has(b)) continue;
      flat.add(b);
      queue.push(b);
    }
  }

  const FLAT = 1;
  const BALCONY = 2;
  const mask = new Uint8Array(N);
  for (let s = 0; s < N; s++) if (space[s]! >= 0 && flat.has(space[s]!)) mask[s] = FLAT;
  // An inner door's own floor: the box between two of the flat's spaces.
  const entrances: Box[] = [];
  doors.forEach((d, k) => {
    const ids = [...doorSpaces[k]!];
    if (ids.length === 0 || !ids.some((id) => flat.has(id))) return;
    if (!ids.every((id) => flat.has(id))) {
      if (ids.includes(hall)) entrances.push(d);
      return;
    }
    for (let y = Math.max(0, cy(d.y1)); y <= Math.min(rows - 1, cy(d.y0)); y++) {
      for (let x = Math.max(0, cx(d.x0)); x <= Math.min(cols - 1, cx(d.x1)); x++) {
        if (grid[y * cols + x] === FREE) mask[y * cols + x] = FLAT;
      }
    }
  });

  // Balconies behind the flat's glass: walk glass and free cells that are
  // neither the flat nor outside; a group paved or named a balcony is one.
  const balconyWords = pieces.flatMap((p) => (p.text != null && p.at && /מרפס/u.test(p.text) ? [p.at] : []));
  const seen = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (mask[i] !== FLAT) continue;
    const xi = i % cols;
    for (const t0 of [xi > 0 ? i - 1 : -1, xi < cols - 1 ? i + 1 : -1, i - cols, i + cols]) {
      if (t0 < 0 || t0 >= N || seen[t0] || (grid[t0] !== GLASS && grid[t0] !== RAIL)) continue;
      const group: number[] = [];
      const stack = [t0];
      seen[t0] = 1;
      while (stack.length) {
        const s = stack.pop()!;
        group.push(s);
        const x = s % cols;
        for (const t of [x > 0 ? s - 1 : -1, x < cols - 1 ? s + 1 : -1, s - cols, s + cols]) {
          if (t < 0 || t >= N || seen[t] || mask[t] !== 0) continue;
          if (grid[t] === GLASS || grid[t] === RAIL || (grid[t] === FREE && space[t]! > OUTSIDE && !others.has(space[t]!) && space[t] !== hall)) {
            seen[t] = 1;
            stack.push(t);
          }
        }
      }
      const free = group.filter((c) => grid[c] === FREE);
      const m2 = free.length * cell * cell * unitsM * unitsM;
      if (m2 < 0.5 || m2 > BALCONY_MAX_M2) continue;
      const paved = free.filter((c) => pave[c]).length / free.length;
      const cells = new Set(free);
      const named = balconyWords.some((t) => cells.has(at(t)));
      if (paved > 0.3 || named) for (const c of free) mask[c] = BALCONY;
    }
  }
  // A paved space reached through a door is a balcony too.
  for (let s = 0; s < N; s++) if (mask[s] === FLAT && pave[s]) mask[s] = BALCONY;
  // And one the sheet names a balcony and nothing else: flat 17's roof terrace (מרפסת גג), unpaved, read as a lobby.
  {
    const roomWords = pieces.flatMap((p) => (p.text != null && p.at && /שינה|הורים|מטבח|סלון|מגורים|ממ["״']?ד|רחצ|שירות|מקלחת|אמבט|אוכל|מבוא|כביסה|מחסן|חדר/u.test(p.text) && !/מרפס/u.test(p.text) ? [p.at] : []));
    const spaceAt = (q: { x: number; y: number }) => {
      const s = at(q);
      return s >= 0 && s < N && mask[s] === FLAT ? space[s]! : null;
    };
    const named = new Set(balconyWords.map(spaceAt).filter((id): id is number => id != null));
    for (const q of roomWords) {
      const id = spaceAt(q);
      if (id != null) named.delete(id);
    }
    if (named.size) for (let s = 0; s < N; s++) if (mask[s] === FLAT && named.has(space[s]!)) mask[s] = BALCONY;
  }

  // Gross: the floor and every wall cell within a wall's thickness of it.
  const wallReach = Math.round(GROSS_WALL_M / unitsM / cell);
  const dist = new Int16Array(N).fill(-1);
  const ring: number[] = [];
  let net = 0;
  let balcony = 0;
  for (let s = 0; s < N; s++) {
    if (mask[s] === FLAT) {
      net++;
      dist[s] = 0;
      ring.push(s);
    } else if (mask[s] === BALCONY) balcony++;
  }
  if (net === 0) return { number, reason: "no-floor" };
  let walls = 0;
  for (let h = 0; h < ring.length; h++) {
    const s = ring[h]!;
    if (dist[s]! >= wallReach) continue;
    const x = s % cols;
    for (const t of [x > 0 ? s - 1 : -1, x < cols - 1 ? s + 1 : -1, s - cols, s + cols]) {
      if (t < 0 || t >= N || dist[t] !== -1 || grid[t] === FREE) continue;
      dist[t] = dist[s]! + 1;
      walls++;
      ring.push(t);
    }
  }
  const m2 = (c: number) => Math.round(c * cell * cell * unitsM * unitsM * 10) / 10;
  const flatDoors: UnitDoor[] = [];
  doors.forEach((d, k) => {
    const ids = [...doorSpaces[k]!];
    if (!ids.some((id) => flat.has(id))) return;
    flatDoors.push({ box: d, spaces: ids, entrance: !ids.every((id) => flat.has(id) || mask[firstCellOf(id)] === BALCONY), ...doorDrawn[k]! });
  });
  function firstCellOf(id: number): number {
    for (let s = 0; s < N; s++) if (space[s] === id) return s;
    return 0;
  }

  // The printed area: a decimal figure within 2.5 m of the number.
  const printed = pieces
    .flatMap((p) => {
      const value = p.text != null && !p.dimension ? /^\s*(\d{2,3}\.\d{1,2})\s*$/.exec(p.text)?.[1] : undefined;
      return value && p.at ? [{ v: Number(value), d: Math.hypot(p.at.x - mark.x, p.at.y - mark.y) * unitsM }] : [];
    })
    .filter((row) => row.d <= 2.5)
    .sort((a, b) => a.d - b.d)[0];

  const bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (let s = 0; s < N; s++) {
    if (!mask[s]) continue;
    const x = s % cols;
    const y = (s - x) / cols;
    bounds.x0 = Math.min(bounds.x0, x0 + x * cell);
    bounds.x1 = Math.max(bounds.x1, x0 + (x + 1) * cell);
    bounds.y1 = Math.max(bounds.y1, y1 - y * cell);
    bounds.y0 = Math.min(bounds.y0, y1 - (y + 1) * cell);
  }
  return {
    number,
    unitsM,
    x0,
    y1,
    cell,
    cols,
    rows,
    mask,
    netM2: m2(net),
    grossM2: m2(net + walls),
    balconyM2: m2(balcony),
    ...(printed ? { printedM2: printed.v } : {}),
    entrances,
    bounds,
    grid,
    space,
    flatSpaces: [...flat],
    doors: flatDoors,
    texts: pieces.flatMap((p) => (p.text != null && p.at && !p.dimension ? [{ text: p.text, at: p.at, height: p.height ?? 0 }] : [])),
    pieces: placed,
    outlines,
  };
}

export const isUnitFailure = (r: UnitPlan | UnitPlanFailure): r is UnitPlanFailure => "reason" in r;

/**
 * Whether a drawing-unit point lies on the flat, its balconies, or within
 * `marginM` of them — the walls and frames that bound them.
 */
export function unitContains(plan: UnitPlan, marginM = KEEP_M): (q: Pt) => boolean {
  const reach = Math.max(0, Math.round(marginM / plan.unitsM / plan.cell));
  const { cols, rows } = plan;
  // Grown once: a cell is kept when any floor cell lies within the margin.
  const grown = new Uint8Array(plan.mask.length);
  const dist = new Int16Array(plan.mask.length).fill(-1);
  const queue: number[] = [];
  for (let s = 0; s < plan.mask.length; s++) {
    if (plan.mask[s]) {
      grown[s] = 1;
      dist[s] = 0;
      queue.push(s);
    }
  }
  for (let h = 0; h < queue.length; h++) {
    const s = queue[h]!;
    if (dist[s]! >= reach) continue;
    const x = s % cols;
    for (const t of [x > 0 ? s - 1 : -1, x < cols - 1 ? s + 1 : -1, s - cols, s + cols]) {
      if (t < 0 || t >= grown.length || dist[t] !== -1) continue;
      dist[t] = dist[s]! + 1;
      grown[t] = 1;
      queue.push(t);
    }
  }
  return (q) => {
    const X = Math.floor((q.x - plan.x0) / plan.cell);
    const Y = Math.floor((plan.y1 - q.y) / plan.cell);
    return X >= 0 && Y >= 0 && X < cols && Y < rows && grown[Y * cols + X] === 1;
  };
}
