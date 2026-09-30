import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";
import type { PlanOpening } from "@/lib/projects/building/plan-openings";
import type { PlanWalls } from "@/lib/projects/building/plan-walls";

/**
 * One floor's walls and openings, stood up to its height.
 *
 * Plan metres map straight to the model: x east, z south (the plan's y). A
 * wall on the floor's outline is clad: a skin of the facade's stone on its
 * outer face and plaster within. A window leaves the wall below its sill and
 * above its head, a stone surround the elevation draws, a frame and glass. A
 * doorway leaves a lintel.
 */
export type Outline = Array<[number, number]>;

export type FloorSpec = {
  id: string;
  /** Finished floor level, metres above ±0.00. */
  level: number;
  /** Floor to floor. */
  height: number;
  /** The floor's outer outline in plan metres. */
  outline: Outline;
  window: { sill: number; head: number; surround: number };
  /** Where a curtain wall stops below the floor's top, stone above it; the full height when absent. */
  curtainHead?: number;
  /** Material of the outer skin, and of the walls inside. */
  facade: BuildingMaterial;
  interior: BuildingMaterial;
};

export function insidePolygon(ring: Outline, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Grow a rectilinear outline's test by a margin: inside, or within `m` of it. */
function nearOutline(ring: Outline, x: number, y: number, m: number): boolean {
  if (insidePolygon(ring, x, y)) return true;
  for (const [dx, dy] of [[m, 0], [-m, 0], [0, m], [0, -m]] as const) if (insidePolygon(ring, x + dx, y + dy)) return true;
  return false;
}

const SKIN = 0.05;

/** An outline pulled in by `d` metres: a slab stops behind the cladding. */
export function inset(ring: Outline, d: number): Outline {
  const n = ring.length;
  const out: Outline = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = ring[(i + n - 1) % n]!;
    const [x, y] = ring[i]!;
    const [nx, ny] = ring[(i + 1) % n]!;
    // Move the vertex along the bisector of its two edges' inward normals.
    const e1 = normalIn(ring, px, py, x, y);
    const e2 = normalIn(ring, x, y, nx, ny);
    out.push([x + (e1[0] + e2[0]) * d, y + (e1[1] + e2[1]) * d]);
  }
  return out;
}

function normalIn(ring: Outline, ax: number, ay: number, bx: number, by: number): [number, number] {
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let nx = (by - ay) / len;
  let ny = -(bx - ax) / len;
  if (!insidePolygon(ring, (ax + bx) / 2 + nx * 0.2, (ay + by) / 2 + ny * 0.2)) {
    nx = -nx;
    ny = -ny;
  }
  return [nx, ny];
}

export function floorPrimitives(walls: PlanWalls, openings: PlanOpening[], floor: FloorSpec): Primitive[] {
  const out: Primitive[] = [];
  const tag = floor.id;
  const y0 = floor.level;
  const top = floor.level + floor.height;
  const box = (x: number, z: number, w: number, d: number, a: number, b: number, material: BuildingMaterial, t = tag) => {
    if (w <= 0.001 || d <= 0.001 || b - a <= 0.001) return;
    out.push({
      type: "box",
      centre: { x: x + w / 2, y: (a + b) / 2, z: z + d / 2 },
      size: { x: w, y: b - a, z: d },
      material,
      tag: t,
    });
  };
  const ring = floor.outline;
  const within = (b: { x: number; y: number; w: number; h: number }) => nearOutline(ring, b.x + b.w / 2, b.y + b.h / 2, 0.35);

  /** Which long face of a band faces out: -1 (smaller x/y), +1, or 0 for none. */
  const outerSide = (b: { orientation: "h" | "v"; x: number; y: number; w: number; h: number }): -1 | 0 | 1 => {
    const probe = 0.3;
    const samples = [0.2, 0.5, 0.8];
    let lo = 0;
    let hi = 0;
    for (const s of samples) {
      if (b.orientation === "h") {
        const x = b.x + b.w * s;
        if (!insidePolygon(ring, x, b.y - probe)) lo++;
        if (!insidePolygon(ring, x, b.y + b.h + probe)) hi++;
      } else {
        const y = b.y + b.h * s;
        if (!insidePolygon(ring, b.x - probe, y)) lo++;
        if (!insidePolygon(ring, b.x + b.w + probe, y)) hi++;
      }
    }
    if (lo >= 2 && hi < 2) return -1;
    if (hi >= 2 && lo < 2) return 1;
    return 0;
  };

  /** A piece of wall between two heights, clad where it faces out. */
  const wallPiece = (b: { orientation: "h" | "v"; x: number; y: number; w: number; h: number }, a: number, c: number, side: -1 | 0 | 1) => {
    if (side === 0) return box(b.x, b.y, b.w, b.h, a, c, floor.interior);
    // Stone through, so the ends and reveals a corner shows are stone too,
    // with a plaster lining on the face that looks in.
    const LINING = 0.015;
    if (b.orientation === "h") {
      const liningY = side < 0 ? b.y + b.h - LINING : b.y;
      const coreY = side < 0 ? b.y : b.y + LINING;
      box(b.x, coreY, b.w, b.h - LINING, a, c, floor.facade);
      box(b.x, liningY, b.w, LINING, a, c, floor.interior);
    } else {
      const liningX = side < 0 ? b.x + b.w - LINING : b.x;
      const coreX = side < 0 ? b.x : b.x + LINING;
      box(coreX, b.y, b.w - LINING, b.h, a, c, floor.facade);
      box(liningX, b.y, LINING, b.h, a, c, floor.interior);
    }
  };

  for (const b of walls.bands) {
    if (!within(b) || Math.max(b.w, b.h) < 0.15) continue;
    wallPiece(b, y0, top, outerSide(b));
  }

  for (const found of openings) {
    if (!within(found)) continue;
    // Outside is where the floor's own outline says, not where the reader's
    // footprint guessed: a window is on the outline, a doorway within it.
    const side = outerSide(found);
    const wide = (found.orientation === "h" ? found.w : found.h) >= 6;
    const o: PlanOpening = { ...found, exterior: side !== 0, kind: side === 0 ? "doorway" : wide ? "curtain" : "window" };
    if (o.kind === "doorway") {
      wallPiece(o, y0 + 2.2, top, 0);
      continue;
    }
    if (o.kind === "window") {
      const { sill, head, surround } = floor.window;
      wallPiece(o, y0, y0 + sill, side);
      wallPiece(o, y0 + head, top, side);
      // The stone surround, standing proud of the facade by 6 cm.
      const along = o.orientation === "h" ? o.w : o.h;
      const proud = 0.06;
      const outer = (o.orientation === "h" ? (side < 0 ? o.y : o.y + o.h) : side < 0 ? o.x : o.x + o.w) - (side < 0 ? proud : 0);
      const pieces: Array<[number, number, number, number]> = [
        [0, surround, sill, head],
        [along - surround, along, sill, head],
        [0, along, sill, sill + surround],
        [0, along, head - surround, head],
      ];
      for (const [p0, p1, h0, h1] of pieces) {
        if (o.orientation === "h") box(o.x + p0, outer, p1 - p0, SKIN + proud, y0 + h0, y0 + h1, "stoneDark", `${tag}:surround`);
        else box(outer, o.y + p0, SKIN + proud, p1 - p0, y0 + h0, y0 + h1, "stoneDark", `${tag}:surround`);
      }
      // The sill: a stone ledge standing 8 cm proud under the surround.
      if (o.orientation === "h") box(o.x - 0.05, outer - 0.03, o.w + 0.1, SKIN + proud + 0.04, y0 + sill - 0.06, y0 + sill, "stone", `${tag}:sill`);
      else box(outer - 0.03, o.y - 0.05, SKIN + proud + 0.04, o.h + 0.1, y0 + sill - 0.06, y0 + sill, "stone", `${tag}:sill`);
      glazing(out, o, y0 + sill + surround, y0 + head - surround, surround, side, `${tag}:window`, 1);
      continue;
    }
    // A curtain wall: to its head, mullions every two metres or so, stone above.
    const head = floor.curtainHead != null ? y0 + floor.curtainHead : top;
    if (head < top) wallPiece(o, head, top, side);
    glazing(out, o, y0, head, 0, side, `${tag}:curtain`, Math.max(2, Math.round((o.orientation === "h" ? o.w : o.h) / 2.1)));
  }
  return out;
}

/**
 * Glass and its frame in an opening: a pane set 12 cm back from the outer
 * face, a 6 cm aluminium frame round it and `panes` lights across.
 */
function glazing(
  out: Primitive[],
  o: PlanOpening,
  a: number,
  b: number,
  inset: number,
  side: -1 | 0 | 1,
  tag: string,
  panes: number,
): void {
  const horizontal = o.orientation === "h";
  const len = (horizontal ? o.w : o.h) - 2 * inset;
  const start = (horizontal ? o.x : o.y) + inset;
  const thick = horizontal ? o.h : o.w;
  const face = (horizontal ? o.y : o.x) + (side < 0 ? 0.12 : side > 0 ? thick - 0.12 : thick / 2);
  const frameT = 0.06;
  const put = (s: number, e: number, h0: number, h1: number, depth: number, material: BuildingMaterial) => {
    const size = horizontal ? { x: e - s, y: h1 - h0, z: depth } : { x: depth, y: h1 - h0, z: e - s };
    const centre = horizontal
      ? { x: (s + e) / 2, y: (h0 + h1) / 2, z: face }
      : { x: face, y: (h0 + h1) / 2, z: (s + e) / 2 };
    out.push({ type: "box", centre, size, material, tag });
  };
  put(start, start + len, a, b, 0.02, "glass");
  put(start, start + len, a, a + frameT, 0.08, "frame");
  put(start, start + len, b - frameT, b, 0.08, "frame");
  for (let i = 0; i <= panes; i++) {
    const x = start + (len * i) / panes;
    put(x - frameT / 2, x + frameT / 2, a, b, 0.08, "frame");
  }
}

/** A slab over an outline, with holes, its top at `level`. */
export function slab(outline: Outline, level: number, thickness: number, material: BuildingMaterial, tag: string, holes?: Outline[]): Primitive {
  return { type: "prism", ring: outline, holes, y0: level - thickness, y1: level, material, tag };
}

/** A parapet along an outline's edges, standing on `level` to `top`. */
export function parapet(outline: Outline, level: number, top: number, thickness: number, material: BuildingMaterial, tag: string): Primitive[] {
  const out: Primitive[] = [];
  for (let i = 0; i < outline.length; i++) {
    const [ax, ay] = outline[i]!;
    const [bx, by] = outline[(i + 1) % outline.length]!;
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 0.01) continue;
    // The normal that points into the outline.
    let nx = (by - ay) / len;
    let ny = -(bx - ax) / len;
    if (!insidePolygon(outline, (ax + bx) / 2 + nx * 0.5, (ay + by) / 2 + ny * 0.5)) {
      nx = -nx;
      ny = -ny;
    }
    const cx = (ax + bx) / 2 + (nx * thickness) / 2;
    const cy = (ay + by) / 2 + (ny * thickness) / 2;
    const horizontal = Math.abs(by - ay) < 1e-6;
    out.push({
      type: "box",
      centre: { x: cx, y: (level + top) / 2, z: cy },
      size: horizontal ? { x: len, y: top - level, z: thickness } : { x: thickness, y: top - level, z: len },
      material,
      tag,
    });
  }
  return out;
}
