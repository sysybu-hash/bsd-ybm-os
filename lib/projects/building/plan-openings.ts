import type { PlanWalls } from "@/lib/projects/building/plan-walls";
import { dilate, emptyMask, erode, label, type Mask } from "@/lib/projects/building/raster";

/**
 * The openings of a floor: every gap between two runs of one wall line.
 *
 * A plan draws a window or a door by stopping the wall, so a gap between two
 * bands that stand on the same line, with no other wall across it, is an
 * opening. Which kind is settled by where it stands: on the floor's outline
 * it is glazing — a curtain wall where it is wider than any window — and
 * inside it is a doorway.
 */
export type PlanOpening = {
  orientation: "h" | "v";
  /** The hole in plan, metres from the plan's corner. */
  x: number;
  y: number;
  w: number;
  h: number;
  exterior: boolean;
  kind: "window" | "curtain" | "doorway";
  /** Which side is outside, for an exterior opening: +1 toward larger x or y. */
  outward?: 1 | -1;
  /** Glazed to the floor: a door onto a terrace, not a window over a sill. */
  full?: boolean;
  /** A door the plan draws — its leaf's swing — in an outside wall: to the floor, in a frame. */
  door?: boolean;
  /** A sliding door the plan draws — its panels on tracks of their own — glazed to the floor; no leaf swings. */
  sliding?: boolean;
  /** Its sill and head above the floor, where an elevation draws them. */
  sill?: number;
  head?: number;
};

export type Footprint = { mask: Mask; cm: number };

/** The floor's outline: its walls closed across every opening, and filled. */
export function footprintOf(walls: PlanWalls, reachM = 6): Footprint {
  const r = Math.round((reachM * 100) / walls.cm / 2);
  const closed = erode(dilate(walls.mask, r), r);
  const outside = label(closed, 0);
  const mask = emptyMask(closed.cols, closed.rows);
  for (let i = 0; i < mask.data.length; i++) {
    mask.data[i] = closed.data[i] || !outside.touchesEdge[outside.ids[i]!] ? 1 : 0;
  }
  return { mask, cm: walls.cm };
}

export function findOpenings(
  walls: PlanWalls,
  footprint: Footprint,
  options?: { minM?: number; maxM?: number; curtainFromM?: number },
): PlanOpening[] {
  const minM = options?.minM ?? 0.4;
  const maxM = options?.maxM ?? 12;
  const curtainFrom = options?.curtainFromM ?? 6;
  const out: PlanOpening[] = [];
  const inside = (x: number, y: number) => {
    const px = Math.round((x * 100) / footprint.cm);
    const py = Math.round((y * 100) / footprint.cm);
    const { cols, rows, data } = footprint.mask;
    return px >= 0 && py >= 0 && px < cols && py < rows && data[py * cols + px] === 1;
  };
  const crosses = (x: number, y: number, w: number, h: number) =>
    walls.bands.some((b) => b.x < x + w - 0.02 && b.x + b.w > x + 0.02 && b.y < y + h - 0.02 && b.y + b.h > y + 0.02);

  for (const orientation of ["h", "v"] as const) {
    const bands = walls.bands.filter((b) => b.orientation === orientation);
    // Along: the coordinate the wall runs in; across: its thickness.
    const along = (b: (typeof bands)[number]) => (orientation === "h" ? [b.x, b.x + b.w] : [b.y, b.y + b.h]) as [number, number];
    const across = (b: (typeof bands)[number]) => (orientation === "h" ? [b.y, b.y + b.h] : [b.x, b.x + b.w]) as [number, number];
    for (const a of bands) {
      const [, aEnd] = along(a);
      const [a0, a1] = across(a);
      let best: { b: (typeof bands)[number]; gap: number } | null = null;
      for (const b of bands) {
        if (b === a) continue;
        const [bStart] = along(b);
        const gap = bStart - aEnd;
        if (gap < minM || gap > maxM) continue;
        const [b0, b1] = across(b);
        const overlap = Math.min(a1, b1) - Math.max(a0, b0);
        if (overlap < 0.6 * Math.min(a1 - a0, b1 - b0)) continue;
        if (!best || gap < best.gap) best = { b, gap };
      }
      if (!best) continue;
      const [b0, b1] = across(best.b);
      const t0 = Math.max(a0, b0);
      const t1 = Math.min(a1, b1);
      const rect =
        orientation === "h"
          ? { x: aEnd, y: t0, w: best.gap, h: t1 - t0 }
          : { x: t0, y: aEnd, w: t1 - t0, h: best.gap };
      if (crosses(rect.x, rect.y, rect.w, rect.h)) continue;
      // Either side of the hole, a little way out.
      const mid = orientation === "h" ? rect.x + rect.w / 2 : rect.y + rect.h / 2;
      const off = (t1 - t0) / 2 + 0.4;
      const centre = (t0 + t1) / 2;
      const lo = orientation === "h" ? inside(mid, centre - off) : inside(centre - off, mid);
      const hi = orientation === "h" ? inside(mid, centre + off) : inside(centre + off, mid);
      // The world on both sides: a gap between two walls the building does not close.
      if (!lo && !hi) continue;
      const exterior = lo !== hi;
      out.push({
        orientation,
        ...rect,
        exterior,
        kind: exterior ? (best.gap >= curtainFrom ? "curtain" : "window") : "doorway",
        ...(exterior ? { outward: (lo ? 1 : -1) as 1 | -1 } : {}),
      });
    }
  }
  return out;
}

/**
 * Windows the plan draws in a wall it leaves solid: a wall read as one run
 * where the sheet draws a window's frame in it — three or more lines along
 * the wall, all of one length, capped across at both ends — is cut there, so
 * the window is an opening like any other. `lines` are the sheet's, metres
 * in the walls' frame.
 */
export function cutFramedWindows(walls: PlanWalls, lines: Array<{ x1: number; y1: number; x2: number; y2: number }>): PlanWalls {
  const TOL = 0.03;
  const bands: PlanWalls["bands"] = [];
  for (const b of walls.bands) {
    const h = b.orientation === "h";
    const [a0, a1] = h ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
    const [t0, t1] = h ? [b.y, b.y + b.h] : [b.x, b.x + b.w];
    if (a1 - a0 < 1 || t1 - t0 < 0.15) {
      bands.push(b);
      continue;
    }
    // Lines along the wall, within its thickness, and lines across it.
    const along: Array<[number, number]> = [];
    const across: Array<{ at: number; lo: number; hi: number }> = [];
    for (const l of lines) {
      const [u1, v1, u2, v2] = h ? [l.x1, l.y1, l.x2, l.y2] : [l.y1, l.x1, l.y2, l.x2];
      if (Math.abs(v1 - v2) < 0.005 && v1 >= t0 - 0.08 && v1 <= t1 + 0.08) {
        const [s, e] = [Math.min(u1, u2), Math.max(u1, u2)];
        if (e - s >= 0.4 && e - s <= 2.6 && s >= a0 + 0.1 && e <= a1 - 0.1) along.push([s, e]);
      } else if (Math.abs(u1 - u2) < 0.005 && u1 > a0 && u1 < a1) {
        const [lo, hi] = [Math.min(v1, v2), Math.max(v1, v2)];
        if (Math.min(hi, t1) - Math.max(lo, t0) >= 0.1) across.push({ at: u1, lo, hi });
      }
    }
    const cuts: Array<[number, number]> = [];
    for (const [s, e] of along) {
      if (cuts.some(([p, q]) => s < q && e > p)) continue;
      const same = along.filter(([p, q]) => Math.abs(p - s) <= TOL && Math.abs(q - e) <= TOL).length;
      // Capped at the frame's ends, or just within them where the sash's own frame is drawn.
      const capped = [s, e].every((end) => across.some((c) => Math.abs(c.at - end) <= 0.08 && (c.at - end) * (end === s ? 1 : -1) >= -TOL));
      if (same >= 3 && capped) cuts.push([s, e]);
    }
    if (cuts.length === 0) {
      bands.push(b);
      continue;
    }
    cuts.sort((p, q) => p[0] - q[0]);
    let from = a0;
    for (const [s, e] of [...cuts, [a1, a1] as [number, number]]) {
      if (s - from > 0.02) bands.push(h ? { ...b, x: from, w: s - from } : { ...b, y: from, h: s - from });
      from = e;
    }
  }
  return { ...walls, bands };
}

/** A swing the plan draws, metres in the openings' frame: hinge, radius and sweep in radians. */
export type PlanSwing = { cx: number; cy: number; r: number; sweep: number };

/**
 * Which outside openings are doors: those the plan draws a leaf's swing in.
 *
 * A door is drawn as its leaf's quarter circle, hinged at one jamb with the
 * leaf as wide as the opening; a window has none. So an opening to 1.3 m
 * with a quarter-ish arc as wide as it (0.65–1.2 of it), hinged by one of its
 * jambs, is a door — wherever it opens to.
 */
export function markDoors(openings: PlanOpening[], swings: PlanSwing[]): PlanOpening[] {
  const leaves = swings.filter((s) => s.r >= 0.55 && s.r <= 1.4 && s.sweep >= 1.2 && s.sweep <= 1.95);
  return openings.map((o) => {
    if (!o.exterior || o.kind !== "window") return o;
    const width = o.orientation === "h" ? o.w : o.h;
    if (width > 1.3) return o;
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const thick = o.orientation === "h" ? o.h : o.w;
    const hinged = leaves.some((s) => {
      const along = Math.abs(o.orientation === "h" ? s.cx - cx : s.cy - cy);
      const across = Math.abs(o.orientation === "h" ? s.cy - cy : s.cx - cx);
      return s.r >= 0.65 * width && s.r <= 1.2 * width && Math.abs(along - width / 2) <= 0.25 && across <= thick / 2 + 0.3;
    });
    return hinged ? { ...o, door: true } : o;
  });
}

/** A swing with its arc's ends, radians in the plan's frame: where the leaf closes and where it opens. */
export type PlanLeaf = PlanSwing & { start: number; end: number };

type Line = { x1: number; y1: number; x2: number; y2: number };

const isLeaf = (s: PlanSwing) => s.r >= 0.55 && s.r <= 1.4 && s.sweep >= 1.2 && s.sweep <= 1.95;

/**
 * Hangs each leaf on the opening it swings in, inside or out — as markDoors
 * marks the outside ones: an opening no wider than a door, hinged by one of
 * its jambs, the leaf as wide as it. Each swing hangs one door; `free` are
 * the swings no opening took.
 */
export function hangLeaves<S extends PlanSwing>(openings: PlanOpening[], swings: S[]): { openings: PlanOpening[]; free: S[] } {
  const leaves = swings.filter(isLeaf);
  const used = new Set<number>();
  const hangs = (o: PlanOpening, s: PlanSwing) => {
    const width = o.orientation === "h" ? o.w : o.h;
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const thick = o.orientation === "h" ? o.h : o.w;
    const along = Math.abs(o.orientation === "h" ? s.cx - cx : s.cy - cy);
    const across = Math.abs(o.orientation === "h" ? s.cy - cy : s.cx - cx);
    return s.r >= 0.65 * width && s.r <= 1.2 * width && Math.abs(along - width / 2) <= 0.25 && across <= thick / 2 + 0.3;
  };
  const out = openings.map((o) => {
    if (o.kind === "curtain" || (o.orientation === "h" ? o.w : o.h) > 1.3) return o;
    const k = leaves.findIndex((s, i) => !used.has(i) && hangs(o, s));
    if (k < 0) return o;
    used.add(k);
    return o.door ? o : { ...o, door: true };
  });
  return { openings: out, free: leaves.filter((_, i) => !used.has(i)) };
}

/**
 * The door a free swing draws where the walls show none — the walls read on
 * through it, or stopped at a corner, or the leaf itself read as a wall.
 *
 * Its two edges lie along the plan's axes: the leaf open, which the plan
 * draws as a line from the hinge as long as the leaf, and the leaf shut,
 * which lies in the wall. The door is the wall's thickness along the shut
 * edge; nothing the leaf sweeps stands. Where both edges, or neither, are
 * drawn, or they are not square to the plan, the swing is left alone.
 */
export function doorFromSwing(s: PlanLeaf, walls: PlanWalls, lines: Line[]): { door: { orientation: "h" | "v"; x: number; y: number; w: number; h: number }; shut: { x: number; y: number }; open: { x: number; y: number } } | null {
  const axis = (t: number) => {
    const x = Math.cos(t);
    const y = Math.sin(t);
    if (Math.abs(x) > 0.985) return { x: Math.sign(x), y: 0 };
    if (Math.abs(y) > 0.985) return { x: 0, y: Math.sign(y) };
    return null;
  };
  const a = axis(s.start);
  const b = axis(s.end);
  if (!a || !b || a.x * b.x + a.y * b.y !== 0) return null;
  const drawn = (d: { x: number; y: number }) => {
    const ex = s.cx + d.x * s.r;
    const ey = s.cy + d.y * s.r;
    return lines.some(
      (l) =>
        (Math.hypot(l.x1 - s.cx, l.y1 - s.cy) <= 0.04 && Math.hypot(l.x2 - ex, l.y2 - ey) <= 0.06) ||
        (Math.hypot(l.x2 - s.cx, l.y2 - s.cy) <= 0.04 && Math.hypot(l.x1 - ex, l.y1 - ey) <= 0.06),
    );
  };
  const [da, db] = [drawn(a), drawn(b)];
  if (da === db) return null;
  const open = da ? a : b;
  const shut = da ? b : a;
  const orientation: "h" | "v" = shut.x !== 0 ? "h" : "v";
  // The wall the door stands in lies behind the hinge from where the leaf opens to.
  const across = (p: number, q: number) => (orientation === "h" ? [p, q] : [q, p]);
  const hingeAcross = orientation === "h" ? s.cy : s.cx;
  const back = orientation === "h" ? -open.y : -open.x;
  const lo = Math.min(orientation === "h" ? s.cx : s.cy, (orientation === "h" ? s.cx : s.cy) + (orientation === "h" ? shut.x : shut.y) * s.r);
  const hi = lo + s.r;
  let thick = 0.1;
  for (const band of walls.bands) {
    if (band.orientation !== orientation) continue;
    const [b0, b1] = orientation === "h" ? [band.y, band.y + band.h] : [band.x, band.x + band.w];
    const [a0, a1] = orientation === "h" ? [band.x, band.x + band.w] : [band.y, band.y + band.h];
    // A run of the same wall: on the hinge's line, within half a metre of the door's ends.
    if (a1 < lo - 0.6 || a0 > hi + 0.6 || (a0 > lo + 0.02 && a1 < hi - 0.02)) continue;
    const near = back > 0 ? b0 : b1;
    if (Math.abs(near - hingeAcross) > 0.05) continue;
    thick = Math.max(thick, Math.min(0.45, b1 - b0));
  }
  const [c0, c1] = back > 0 ? [hingeAcross, hingeAcross + thick] : [hingeAcross - thick, hingeAcross];
  const [x, y] = across(lo, c0);
  const [w, h] = across(s.r, c1 - c0);
  return { door: { orientation, x: x!, y: y!, w: w!, h: h! }, shut, open };
}

/** Walls with the door's hole and its leaf's sweep cut out of them. */
function carveDoor(walls: PlanWalls, s: PlanLeaf, d: NonNullable<ReturnType<typeof doorFromSwing>>): PlanWalls {
  const bands: PlanWalls["bands"] = [];
  const hole = d.door;
  const cut = (band: PlanWalls["bands"][number], from: number, to: number) => {
    const h = band.orientation === "h";
    const [a0, a1] = h ? [band.x, band.x + band.w] : [band.y, band.y + band.h];
    if (to <= a0 + 0.01 || from >= a1 - 0.01) return [band];
    const kept: PlanWalls["bands"] = [];
    if (from - a0 > 0.03) kept.push(h ? { ...band, w: from - a0 } : { ...band, h: from - a0 });
    if (a1 - to > 0.03) kept.push(h ? { ...band, x: to, w: a1 - to } : { ...band, y: to, h: a1 - to });
    return kept;
  };
  // The leaf's frame: u along the shut leaf, v along the open one, from the hinge.
  const toUV = (x: number, y: number) => ({ u: (x - s.cx) * d.shut.x + (y - s.cy) * d.shut.y, v: (x - s.cx) * d.open.x + (y - s.cy) * d.open.y });
  for (const band of walls.bands) {
    const h = band.orientation === "h";
    // The hole: the door's own wall, where the shut leaf lies.
    if (band.orientation === hole.orientation) {
      const inHole = h ? band.y < hole.y + hole.h - 0.01 && band.y + band.h > hole.y + 0.01 : band.x < hole.x + hole.w - 0.01 && band.x + band.w > hole.x + 0.01;
      if (inHole) {
        const [from, to] = h ? [hole.x, hole.x + hole.w] : [hole.y, hole.y + hole.h];
        bands.push(...cut(band, from, to));
        continue;
      }
    }
    // The sweep: what stands in the quarter circle the leaf turns through.
    const p = toUV(band.x, band.y);
    const q = toUV(band.x + band.w, band.y + band.h);
    const [u0, u1] = [Math.max(0, Math.min(p.u, q.u)), Math.max(p.u, q.u)];
    const [v0, v1] = [Math.max(0, Math.min(p.v, q.v)), Math.max(p.v, q.v)];
    if (u1 - u0 < 0.05 || v1 - v0 < 0.05 || u0 >= s.r || v0 >= s.r) {
      bands.push(band);
      continue;
    }
    // Along the band, the stretch the arc covers at the band's nearer edge.
    const alongU = (h ? d.shut.x : d.shut.y) !== 0;
    const reach = Math.sqrt(Math.max(0, s.r * s.r - (alongU ? v0 : u0) ** 2));
    const [s0, s1] = alongU ? [u0, Math.min(u1, reach)] : [v0, Math.min(v1, reach)];
    if (s1 - s0 < 0.03) {
      bands.push(band);
      continue;
    }
    const sign = alongU ? (h ? d.shut.x : d.shut.y) : h ? d.open.x : d.open.y;
    const origin = h ? s.cx : s.cy;
    const [e0, e1] = sign > 0 ? [origin + s0, origin + s1] : [origin - s1, origin - s0];
    bands.push(...cut(band, e0, e1));
  }
  return { ...walls, bands };
}

/**
 * A house's openings: those its walls leave, and a door wherever the plan
 * swings a leaf the walls do not open for — the walls carved to it. Every
 * opening a leaf swings in is marked a door, inside or out.
 */
export function houseOpenings(walls: PlanWalls, footprint: Footprint, swings: PlanLeaf[], lines: Line[]): { walls: PlanWalls; openings: PlanOpening[] } {
  const found = houseDoors(walls, footprint, swings, lines);
  return { ...found, openings: markSliding(found.openings, lines) };
}

/**
 * Which outside openings are sliding doors: those the plan draws two or more
 * panels in, each on a track of its own across the wall and each only part of
 * the opening, together most of it. A window's frame is lines of one length,
 * the opening's; a sliding door's panels pass each other.
 */
export function markSliding(openings: PlanOpening[], lines: Line[]): PlanOpening[] {
  return openings.map((o) => {
    if (!o.exterior || o.door || o.kind === "doorway") return o;
    const h = o.orientation === "h";
    const [a0, a1] = h ? [o.x, o.x + o.w] : [o.y, o.y + o.h];
    const [t0, t1] = h ? [o.y, o.y + o.h] : [o.x, o.x + o.w];
    const width = a1 - a0;
    if (width < 1.4) return o;
    // Each track: the stretch its lines along the opening cover, by where across the wall it runs.
    const tracks: Array<{ at: number; s: number; e: number }> = [];
    for (const l of lines) {
      const [u1, v1, u2, v2] = h ? [l.x1, l.y1, l.x2, l.y2] : [l.y1, l.x1, l.y2, l.x2];
      if (Math.abs(v1 - v2) > 0.005 || v1 <= t0 + 0.02 || v1 >= t1 - 0.02) continue;
      const s = Math.max(Math.min(u1, u2), a0);
      const e = Math.min(Math.max(u1, u2), a1);
      if (e - s < 0.4 || e - s > 0.75 * width) continue;
      const t = tracks.find((k) => Math.abs(k.at - v1) <= 0.012 && s <= k.e + 0.05 && e >= k.s - 0.05);
      if (t) Object.assign(t, { s: Math.min(t.s, s), e: Math.max(t.e, e) });
      else tracks.push({ at: v1, s, e });
    }
    const panels = tracks.filter((k) => k.e - k.s >= 0.4 && k.e - k.s <= 0.75 * width);
    const passing = panels.some((p) => panels.some((q) => Math.abs(p.at - q.at) >= 0.03 && Math.abs(p.s - q.s) > 0.2 && Math.abs(p.e - q.e) > 0.2 && Math.max(p.e, q.e) - Math.min(p.s, q.s) >= 0.8 * width));
    return passing ? { ...o, kind: "window" as const, door: true, sliding: true, full: true } : o;
  });
}

function houseDoors(walls: PlanWalls, footprint: Footprint, swings: PlanLeaf[], lines: Line[]): { walls: PlanWalls; openings: PlanOpening[] } {
  const first = hangLeaves(markDoors(findOpenings(walls, footprint), swings), swings);
  let carved = walls;
  const doors: PlanOpening[] = [];
  const hung = new Set<PlanLeaf>();
  const inside = (x: number, y: number) => {
    const px = Math.round((x * 100) / footprint.cm);
    const py = Math.round((y * 100) / footprint.cm);
    const { cols, rows, data } = footprint.mask;
    return px >= 0 && py >= 0 && px < cols && py < rows && data[py * cols + px] === 1;
  };
  for (const s of first.free) {
    const d = doorFromSwing(s, carved, lines);
    if (!d) continue;
    carved = carveDoor(carved, s, d);
    hung.add(s);
    const o = d.door;
    const mid = o.orientation === "h" ? o.x + o.w / 2 : o.y + o.h / 2;
    const centre = o.orientation === "h" ? o.y + o.h / 2 : o.x + o.w / 2;
    const off = (o.orientation === "h" ? o.h : o.w) / 2 + 0.4;
    const lo = o.orientation === "h" ? inside(mid, centre - off) : inside(centre - off, mid);
    const hi = o.orientation === "h" ? inside(mid, centre + off) : inside(centre + off, mid);
    const exterior = lo !== hi;
    doors.push({ ...o, exterior, kind: exterior ? "window" : "doorway", door: true, ...(exterior ? { outward: (lo ? 1 : -1) as 1 | -1 } : {}) });
  }
  if (!doors.length) return { walls, openings: first.openings };
  // The carved walls' own gaps, less those a swung door now stands in.
  const overlap = (p: PlanOpening, q: PlanOpening) =>
    Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x)) * Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
  const rest = swings.filter((s) => !hung.has(s));
  const gaps = findOpenings(carved, footprint).filter(
    (o) => !doors.some((d) => d.orientation === o.orientation && overlap(o, d) > 0.3 * Math.min(o.w * o.h, d.w * d.h)),
  );
  return { walls: carved, openings: [...hangLeaves(markDoors(gaps, rest), rest).openings, ...doors] };
}

/** A door a CAD file places, metres in the walls' frame: the line from its hinge to its leaf's far end, along its wall. */
export type DrawnPlanDoor = { x1: number; y1: number; x2: number; y2: number };

/**
 * A house's doors where its CAD file places them: a door read from its swing
 * was lost where the arc fell short of the wall's gap (Gottlieb A, upper
 * floor: three of eighteen). A door already read there keeps its place; an
 * opening read there as a window or a doorway becomes the door; else the
 * wall is cut to the door's span — or, where the plan leaves the span open
 * at a wall's end, that wall's thickness framed — and the door stood in it.
 * A door read from a swing in the wall beside a placed door, which no block
 * stands in, was that swing hung in the wrong wall: a wall the reading cut
 * for it (`before`: the walls as read) is closed again, a gap the plan
 * leaves stays a doorway with no door.
 */
export function fitDrawnDoors(walls: PlanWalls, openings: PlanOpening[], drawn: DrawnPlanDoor[], footprint: Footprint, before?: PlanWalls): { walls: PlanWalls; openings: PlanOpening[] } {
  let bands = walls.bands;
  let out = [...openings];
  const spanOf = (d: DrawnPlanDoor) => {
    const h = Math.abs(d.x2 - d.x1) >= Math.abs(d.y2 - d.y1);
    return { h, s0: h ? Math.min(d.x1, d.x2) : Math.min(d.y1, d.y2), s1: h ? Math.max(d.x1, d.x2) : Math.max(d.y1, d.y2), mid: h ? (d.y1 + d.y2) / 2 : (d.x1 + d.x2) / 2 };
  };
  // A block drawn with its leaf swung open, square to its wall: the door is in that wall, from its hinge.
  const swungOf = (d: DrawnPlanDoor): DrawnPlanDoor[] => {
    const { h, s0, s1 } = spanOf(d);
    return [s1 - s0, s0 - s1].map((l) => (h ? { x1: d.x1, y1: d.y1, x2: d.x1, y2: d.y1 + l } : { x1: d.x1, y1: d.y1, x2: d.x1 + l, y2: d.y1 }));
  };
  const nearTo = (d: DrawnPlanDoor, share: number) => (o: PlanOpening) => {
    const { h, s0, s1, mid } = spanOf(d);
    if ((h ? "h" : "v") !== o.orientation) return false;
    const along = Math.max(0, Math.min(h ? o.x + o.w : o.y + o.h, s1) - Math.max(h ? o.x : o.y, s0));
    return along >= share * (s1 - s0) && Math.abs((h ? o.y + o.h / 2 : o.x + o.w / 2) - mid) < 0.35;
  };
  const square = new Set(drawn.filter((d) => !openings.some(nearTo(d, 0.3))));
  const placedAt = (o: PlanOpening) => drawn.some((d) => [d, ...(square.has(d) ? swungOf(d) : [])].some((v) => nearTo(v, 0.3)(o)));
  const box = (o: PlanOpening) => ({ x0: o.x, y0: o.y, x1: o.x + o.w, y1: o.y + o.h });
  const area = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }) =>
    Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const stray = out.filter((o) => {
    if (!o.door || o.sliding || placedAt(o)) return false;
    const [cx, cy] = [o.x + o.w / 2, o.y + o.h / 2];
    return drawn.some((d) => Math.hypot((d.x1 + d.x2) / 2 - cx, (d.y1 + d.y2) / 2 - cy) < 1.0);
  });
  for (const o of stray) {
    const b = box(o);
    const cut = (before?.bands ?? []).some((w) => w.orientation === o.orientation && area(b, { x0: w.x, y0: w.y, x1: w.x + w.w, y1: w.y + w.h }) > 0.5 * o.w * o.h);
    if (cut) {
      bands = [...bands, { orientation: o.orientation, x: o.x, y: o.y, w: o.w, h: o.h }];
      out = out.filter((p) => p !== o);
    } else {
      out = out.map((p) => (p === o ? { ...p, door: false, kind: p.exterior ? "window" : "doorway" } : p));
    }
  }
  const inside = (x: number, y: number) => {
    const px = Math.round((x * 100) / footprint.cm);
    const py = Math.round((y * 100) / footprint.cm);
    const { cols, rows, data } = footprint.mask;
    return px >= 0 && py >= 0 && px < cols && py < rows && data[py * cols + px] === 1;
  };
  for (const d of drawn) {
    const h = Math.abs(d.x2 - d.x1) >= Math.abs(d.y2 - d.y1);
    const orientation: "h" | "v" = h ? "h" : "v";
    const [s0, s1] = h ? [Math.min(d.x1, d.x2), Math.max(d.x1, d.x2)] : [Math.min(d.y1, d.y2), Math.max(d.y1, d.y2)];
    const mid = h ? (d.y1 + d.y2) / 2 : (d.x1 + d.x2) / 2;
    if (s1 - s0 < 0.4) continue;
    const overlapAlong = (a0: number, a1: number) => Math.max(0, Math.min(a1, s1) - Math.max(a0, s0));
    const near = nearTo(d, 0.5);
    if (out.some((o) => o.door && near(o))) continue;
    const read = out.find((o) => !o.door && near(o));
    if (read) {
      out = out.map((o) => (o === read ? { ...o, door: true, kind: o.exterior ? "window" : "doorway" } : o));
      continue;
    }
    const onLine = (b: PlanWalls["bands"][number]) => {
      if (b.orientation !== orientation) return false;
      const [t0, t1] = h ? [b.y, b.y + b.h] : [b.x, b.x + b.w];
      return mid >= t0 - 0.12 && mid <= t1 + 0.12;
    };
    const band =
      bands.find((b) => onLine(b) && overlapAlong(h ? b.x : b.y, h ? b.x + b.w : b.y + b.h) >= 0.2) ??
      // The span already open: the wall the door closes, ending at it.
      bands.find((b) => {
        if (!onLine(b)) return false;
        const [a0, a1] = h ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
        return Math.min(Math.abs(a0 - s1), Math.abs(a1 - s0)) <= 0.6;
      });
    if (!band) {
      if (!square.has(d)) continue;
      const swung = swungOf(d).map((v) => nearTo(v, 0.5));
      if (out.some((o) => o.door && swung.some((f) => f(o)))) continue;
      const opened = out.find((o) => !o.door && swung.some((f) => f(o)));
      if (opened) out = out.map((o) => (o === opened ? { ...o, door: true, kind: o.exterior ? "window" : "doorway" } : o));
      continue;
    }
    const across = h ? [band.y, band.y + band.h] : [band.x, band.x + band.w];
    bands = bands.flatMap((b) => {
      if (b.orientation !== orientation) return [b];
      const [t0, t1] = h ? [b.y, b.y + b.h] : [b.x, b.x + b.w];
      if (t1 <= across[0]! + 0.01 || t0 >= across[1]! - 0.01) return [b];
      const [a0, a1] = h ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
      if (s1 <= a0 + 0.01 || s0 >= a1 - 0.01) return [b];
      const kept: PlanWalls["bands"] = [];
      if (s0 - a0 > 0.03) kept.push(h ? { ...b, w: s0 - a0 } : { ...b, h: s0 - a0 });
      if (a1 - s1 > 0.03) kept.push(h ? { ...b, x: s1, w: a1 - s1 } : { ...b, y: s1, h: a1 - s1 });
      return kept;
    });
    const [t0, t1] = across as [number, number];
    const off = (t1 - t0) / 2 + 0.4;
    const centre = (s0 + s1) / 2;
    const cm = (t0 + t1) / 2;
    const lo = h ? inside(centre, cm - off) : inside(cm - off, centre);
    const hi = h ? inside(centre, cm + off) : inside(cm + off, centre);
    const exterior = lo !== hi;
    out.push({
      orientation,
      x: h ? s0 : t0,
      y: h ? t0 : s0,
      w: h ? s1 - s0 : t1 - t0,
      h: h ? t1 - t0 : s1 - s0,
      exterior,
      kind: exterior ? "window" : "doorway",
      door: true,
      ...(exterior ? { outward: (lo ? 1 : -1) as 1 | -1 } : {}),
    });
  }
  return { walls: { ...walls, bands }, openings: out };
}

/** A window a CAD file places, metres in the walls' frame: its box and the axis it runs along. */
export type DrawnPlanWindow = { x: number; y: number; w: number; h: number; runs: "x" | "y" };

/**
 * A house's windows where its CAD file places them, each as wide as its
 * block: a window read from the gaps its walls leave was missed where the
 * hatch ran on across it, and guessed where a gap was something else
 * (Gottlieb, 13/10/2026: four of the upper floor's eighteen were lost). The
 * wall is cut to each window's span; a window read where one is placed gives
 * way to it; a door the plan swings is kept — a block over it is its glazing.
 */
export function fitDrawnWindows(walls: PlanWalls, openings: PlanOpening[], drawn: DrawnPlanWindow[], footprint: Footprint): { walls: PlanWalls; openings: PlanOpening[] } {
  let bands = walls.bands;
  let out = [...openings];
  const inside = (x: number, y: number) => {
    const px = Math.round((x * 100) / footprint.cm);
    const py = Math.round((y * 100) / footprint.cm);
    const { cols, rows, data } = footprint.mask;
    return px >= 0 && py >= 0 && px < cols && py < rows && data[py * cols + px] === 1;
  };
  for (const win of drawn) {
    const h = win.runs === "x";
    const orientation: "h" | "v" = h ? "h" : "v";
    const [s0, s1] = h ? [win.x, win.x + win.w] : [win.y, win.y + win.h];
    const mid = h ? win.y + win.h / 2 : win.x + win.w / 2;
    if (s1 - s0 < 0.3) continue;
    const overlapAlong = (a0: number, a1: number) => Math.max(0, Math.min(a1, s1) - Math.max(a0, s0));
    // A door already there keeps its place: the block is its glass.
    const door = out.find((o) => o.orientation === orientation && o.door && overlapAlong(h ? o.x : o.y, h ? o.x + o.w : o.y + o.h) >= 0.5 * (s1 - s0) && Math.abs((h ? o.y + o.h / 2 : o.x + o.w / 2) - mid) < 0.35);
    if (door) continue;
    // The wall the window stands in: one running its way, through its middle, along most of it.
    const band = bands.find((b) => {
      if (b.orientation !== orientation) return false;
      const [t0, t1] = h ? [b.y, b.y + b.h] : [b.x, b.x + b.w];
      return mid >= t0 - 0.12 && mid <= t1 + 0.12 && overlapAlong(h ? b.x : b.y, h ? b.x + b.w : b.y + b.h) >= 0.2;
    });
    const read = out.filter((o) => o.orientation === orientation && !o.door && overlapAlong(h ? o.x : o.y, h ? o.x + o.w : o.y + o.h) > 0.05 && Math.abs((h ? o.y + o.h / 2 : o.x + o.w / 2) - mid) < 0.35);
    const across = band ? (h ? [band.y, band.y + band.h] : [band.x, band.x + band.w]) : read[0] ? (h ? [read[0].y, read[0].y + read[0].h] : [read[0].x, read[0].x + read[0].w]) : null;
    if (!across) continue;
    // Cut every wall of its way, across its thickness, to the window's span.
    bands = bands.flatMap((b) => {
      if (b.orientation !== orientation) return [b];
      const [t0, t1] = h ? [b.y, b.y + b.h] : [b.x, b.x + b.w];
      if (t1 <= across[0]! + 0.01 || t0 >= across[1]! - 0.01) return [b];
      const [a0, a1] = h ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
      if (s1 <= a0 + 0.01 || s0 >= a1 - 0.01) return [b];
      const kept: PlanWalls["bands"] = [];
      if (s0 - a0 > 0.03) kept.push(h ? { ...b, w: s0 - a0 } : { ...b, h: s0 - a0 });
      if (a1 - s1 > 0.03) kept.push(h ? { ...b, x: s1, w: a1 - s1 } : { ...b, y: s1, h: a1 - s1 });
      return kept;
    });
    out = out.filter((o) => !read.includes(o));
    const [t0, t1] = across as [number, number];
    const cm = (t0 + t1) / 2;
    const off = (t1 - t0) / 2 + 0.4;
    const centre = (s0 + s1) / 2;
    const lo = h ? inside(centre, cm - off) : inside(cm - off, centre);
    const hi = h ? inside(centre, cm + off) : inside(cm + off, centre);
    const exterior = lo !== hi;
    const kept = read.find((o) => o.full || o.sill != null);
    out.push({
      orientation,
      x: h ? s0 : t0,
      y: h ? t0 : s0,
      w: h ? s1 - s0 : t1 - t0,
      h: h ? t1 - t0 : s1 - s0,
      exterior,
      kind: "window",
      ...(exterior ? { outward: (lo ? 1 : -1) as 1 | -1 } : {}),
      ...(kept?.full ? { full: true } : {}),
    });
  }
  return { walls: { ...walls, bands }, openings: out };
}
