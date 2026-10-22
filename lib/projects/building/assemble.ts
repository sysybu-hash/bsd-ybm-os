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
  /** The frame standing proud of a window. Absent: the dark stone a permit elevation draws. */
  surroundMaterial?: BuildingMaterial;
  /** The frame of the glazing itself. Absent: aluminium. */
  frameMaterial?: BuildingMaterial;
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
    // A wall standing out past the floor's outline — the partition between
    // two flats' terraces — has the weather on both faces: it is clad whole.
    // Plastered as an inside wall, it stood up the facade as a white fin.
    // A party wall that runs on out past the facade to part two terraces is
    // split where it crosses the outline: plaster within, clad without.
    if (side === 0) {
      const horizontal = b.orientation === "h";
      const length = horizontal ? b.w : b.h;
      const steps = Math.max(1, Math.round(length / 0.1));
      const inAt = (t: number) =>
        insidePolygon(ring, horizontal ? b.x + t : b.x + b.w / 2, horizontal ? b.y + b.h / 2 : b.y + t);
      let start = 0;
      let inside = inAt((0.5 * length) / steps);
      for (let k = 1; k <= steps; k++) {
        const here = k < steps ? inAt(((k + 0.5) * length) / steps) : !inside;
        if (here === inside) continue;
        const t0 = (start * length) / steps;
        const t1 = (k * length) / steps;
        if (horizontal) box(b.x + t0, b.y, t1 - t0, b.h, a, c, inside ? floor.interior : floor.facade, inside ? tag : `${tag}:fin`);
        else box(b.x, b.y + t0, b.w, t1 - t0, a, c, inside ? floor.interior : floor.facade, inside ? tag : `${tag}:fin`);
        start = k;
        inside = here;
      }
      return;
    }
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

  // A curtain wall is glass from end to end: a door the plan draws in it is a leaf in that glass, with no stone over it and no portal round it.
  const curtains = openings.filter((c) => within(c) && (c.orientation === "h" ? c.w : c.h) >= 6 && outerSide(c) !== 0);
  const inCurtain = (o: PlanOpening) => {
    const [a0, a1] = o.orientation === "h" ? [o.x, o.x + o.w] : [o.y, o.y + o.h];
    return curtains.some((c) => {
      if (c === o || c.orientation !== o.orientation) return false;
      const [c0, c1] = c.orientation === "h" ? [c.x, c.x + c.w] : [c.y, c.y + c.h];
      const across = c.orientation === "h" ? Math.abs(c.y - o.y) : Math.abs(c.x - o.x);
      return a0 >= c0 - 0.05 && a1 <= c1 + 0.05 && across < 0.6;
    });
  };

  for (const found of openings) {
    if (!within(found)) continue;
    // Outside is where the floor's own outline says, not where the reader's
    // footprint guessed: a window is on the outline, a doorway within it.
    const side = outerSide(found);
    // A gap past the outline — a recess's mouth, between two terraces — is open air, not a doorway.
    if (side === 0 && !insidePolygon(ring, found.x + found.w / 2, found.y + found.h / 2)) continue;
    const wide = (found.orientation === "h" ? found.w : found.h) >= 6;
    const o: PlanOpening = { ...found, exterior: side !== 0, kind: side === 0 ? "doorway" : wide ? "curtain" : "window" };
    if (o.kind === "doorway") {
      wallPiece(o, y0 + 2.2, top, 0);
      continue;
    }
    if (o.kind === "window" && o.door) {
      // A door the plan draws: to the floor, in a frame on its jambs and head —
      // a timber leaf, or glazed where it opens onto a balcony or a terrace.
      const glassWall = inCurtain(o);
      const surround = glassWall ? 0 : floor.window.surround;
      const head = Math.max(2.0, o.head ?? floor.window.head);
      if (!glassWall) wallPiece(o, y0 + head, top, side);
      const along = o.orientation === "h" ? o.w : o.h;
      const proud = 0.06;
      const surroundMaterial = floor.surroundMaterial ?? "stoneDark";
      const outer = (o.orientation === "h" ? (side < 0 ? o.y : o.y + o.h) : side < 0 ? o.x : o.x + o.w) - (side < 0 ? proud : 0);
      // The surround laid on the wall round the opening, as a window's is —
      // laid within it, a 16 cm frame left an 86 cm entrance a 54 cm leaf
      // (Gottlieb, 11/10/2026: "why are the doors so narrow?"). A plain
      // door's frame is the slim one of its own leaf.
      const frame = surround > 0 ? 0.05 : Math.max(surround, 0.08);
      const reach = (t: number) => {
        const mid = o.orientation === "h" ? o.y + o.h / 2 : o.x + o.w / 2;
        const at = (o.orientation === "h" ? o.x : o.y) + t;
        return o.orientation === "h" ? insidePolygon(ring, at, mid) : insidePolygon(ring, mid, at);
      };
      const room = (from: number, dir: -1 | 1) => {
        for (let e = surround; e > 0.005; e -= 0.01) if (reach(from + dir * (e - 0.005))) return e;
        return 0;
      };
      const before = surround > 0 ? room(0, -1) : 0;
      const after = surround > 0 ? room(along, 1) : 0;
      const headTop = Math.min(head + surround, floor.height - 0.02);
      const pieces: Array<[number, number, number, number]> =
        surround > 0
          ? [[-before, 0, 0, headTop], [along, along + after, 0, headTop], [-before, along + after, head, headTop], [0, frame, 0, head], [along - frame, along, 0, head], [0, along, head - frame, head]]
          : [[0, frame, 0, head], [along - frame, along, 0, head], [0, along, head - frame, head]];
      for (const [p0, p1, h0, h1] of pieces) {
        if (p1 - p0 < 0.01 || h1 - h0 < 0.01) continue;
        const material = surround > 0 && (p1 <= 0.001 || p0 >= along - 0.001 || h0 >= head - 0.001) ? surroundMaterial : surround > 0 ? (floor.frameMaterial ?? "frame") : surroundMaterial;
        if (o.orientation === "h") box(o.x + p0, outer, p1 - p0, SKIN + proud, y0 + h0, y0 + h1, material, `${tag}:door`);
        else box(outer, o.y + p0, SKIN + proud, p1 - p0, y0 + h0, y0 + h1, material, `${tag}:door`);
      }
      if (o.full || glassWall) glazing(out, o, y0, y0 + head - frame, frame, side, `${tag}:door`, o.sliding ? Math.max(2, Math.round(along / 1.5)) : 1, floor.frameMaterial ?? "frame");
      else {
        const thick = o.orientation === "h" ? o.h : o.w;
        const face = (o.orientation === "h" ? o.y : o.x) + (side < 0 ? 0.12 : side > 0 ? thick - 0.12 : thick / 2);
        const len = along - 2 * frame;
        const start = (o.orientation === "h" ? o.x : o.y) + frame;
        const centre = o.orientation === "h" ? { x: start + len / 2, y: y0 + (head - frame) / 2, z: face } : { x: face, y: y0 + (head - frame) / 2, z: start + len / 2 };
        const size = o.orientation === "h" ? { x: len, y: head - frame, z: 0.05 } : { x: 0.05, y: head - frame, z: len };
        out.push({ type: "box", centre, size, material: "timber", tag: `${tag}:door` });
      }
      continue;
    }
    if (o.kind === "window") {
      const { surround } = floor.window;
      // As the elevation draws it where it does; a door onto a terrace is glazed from the floor.
      const head = o.head ?? floor.window.head;
      const sill = o.sill ?? (o.full ? 0 : floor.window.sill);
      wallPiece(o, y0, y0 + sill, side);
      wallPiece(o, y0 + head, top, side);
      // The stone surround, standing proud of the facade by 6 cm, laid on the
      // wall round the opening as a mason sets it — not within it. Laid within,
      // a 16 cm frame ate 32 cm of every window's glass: a 0.60 m bathroom
      // window glazed 0.28 m, a 0.40 m one a slit. The opening is the sheet's.
      const along = o.orientation === "h" ? o.w : o.h;
      const proud = 0.06;
      const surroundMaterial = floor.surroundMaterial ?? "stoneDark";
      const outer = (o.orientation === "h" ? (side < 0 ? o.y : o.y + o.h) : side < 0 ? o.x : o.x + o.w) - (side < 0 ? proud : 0);
      // A jamb stops where its wall does: at a corner the frame runs to the edge, not past it.
      const reach = (t: number) => {
        const mid = o.orientation === "h" ? o.y + o.h / 2 : o.x + o.w / 2;
        const at = (o.orientation === "h" ? o.x : o.y) + t;
        return o.orientation === "h" ? insidePolygon(ring, at, mid) : insidePolygon(ring, mid, at);
      };
      const room = (from: number, dir: -1 | 1) => {
        for (let e = surround; e > 0.005; e -= 0.01) if (reach(from + dir * (e - 0.005))) return e;
        return 0;
      };
      const before = room(0, -1);
      const after = room(along, 1);
      const headTop = Math.min(head + surround, floor.height - 0.02);
      const ledge = !(o.full || sill < 0.05);
      const sillBottom = Math.max(0, sill - surround);
      const pieces: Array<[number, number, number, number]> = [
        [-before, 0, sill, headTop],
        [along, along + after, sill, headTop],
        [-before, along + after, head, headTop],
      ];
      for (const [p0, p1, h0, h1] of pieces) {
        if (p1 - p0 < 0.01 || h1 - h0 < 0.01) continue;
        if (o.orientation === "h") box(o.x + p0, outer, p1 - p0, SKIN + proud, y0 + h0, y0 + h1, surroundMaterial, `${tag}:surround`);
        else box(outer, o.y + p0, SKIN + proud, p1 - p0, y0 + h0, y0 + h1, surroundMaterial, `${tag}:surround`);
      }
      // The sill: the frame's bottom course, a stone ledge 4 cm prouder and a little wider.
      const sillMaterial = floor.surroundMaterial ?? "stone";
      if (ledge) {
        const s0 = -before - 0.04;
        const s1 = along + after + 0.04;
        const face = side < 0 ? outer - 0.04 : outer;
        if (o.orientation === "h") box(o.x + s0, face, s1 - s0, SKIN + proud + 0.04, y0 + sillBottom, y0 + sill, sillMaterial, `${tag}:sill`);
        else box(face, o.y + s0, SKIN + proud + 0.04, s1 - s0, y0 + sillBottom, y0 + sill, sillMaterial, `${tag}:sill`);
      }
      // The glass fills the opening; a window of two leaves where it is wide enough to slide.
      glazing(out, o, y0 + sill, y0 + head, 0, side, `${tag}:window`, along >= 0.9 ? 2 : 1, floor.frameMaterial ?? "frame");
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
  frameMaterial: BuildingMaterial = "frame",
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
  put(start, start + len, a, a + frameT, 0.08, frameMaterial);
  put(start, start + len, b - frameT, b, 0.08, frameMaterial);
  for (let i = 0; i <= panes; i++) {
    const x = start + (len * i) / panes;
    put(x - frameT / 2, x + frameT / 2, a, b, 0.08, frameMaterial);
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
    // A drawn edge is rarely exactly square: 2 cm over 5 m still runs along x.
    const horizontal = Math.abs(by - ay) <= Math.abs(bx - ax);
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
