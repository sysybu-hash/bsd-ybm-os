import { buildWallRuns, type WallRun } from "@/lib/projects/floorplan-rooms";
import {
  isAxisAligned,
  segmentLength,
  type VectorSegment,
} from "@/lib/projects/floorplan-vector";

/**
 * Turning the CAD's wall lines into solid walls, so a still can be rendered
 * instead of asked for.
 *
 * Everything upstream of this file was an attempt to persuade an image model to
 * copy a wall graph, and it does not copy anything — it samples. Five runs and
 * five repair passes on דירה 14 still produced invented rooms and openings,
 * because "trace the plan" is a request, not a constraint. The geometry is
 * already exact in the PDF; this builds the flat out of it, and then the walls
 * are right because they were constructed, not because a model was convinced.
 *
 * A wall on these sheets is drawn as two parallel faces a wall's thickness
 * apart. buildWallRuns merges the collinear strokes of each face; this pairs the
 * faces back into bodies with a centre line and a real thickness.
 */

export type WallBody = {
  orientation: "h" | "v";
  /** Centre of the wall across its thickness: y for horizontal, x for vertical. */
  centre: number;
  thickness: number;
  from: number;
  to: number;
};

/**
 * How thick a pair of faces may be and still be one wall.
 *
 * These were fixed page units, and 18 of them was too mean. The north wall of
 * דירה 14 is drawn with its faces 19.8 units apart — 45 cm at that sheet's
 * scale, which is an ordinary exterior or ממ"ד wall — so the pair was rejected,
 * no body was built, and the flood fill escaped through the hole into the living
 * room. A ממ"ד wall elsewhere on the same sheet measured 17.6 and only just
 * survived.
 *
 * Judged in metres now, wherever the scale is known: an Israeli partition is
 * 8 cm and a protected-room wall can be half a metre.
 */
const MIN_THICKNESS_M = 0.06;
const MAX_THICKNESS_M = 0.55;
/** Fallbacks in page units, for callers with no scale to hand. */
const MIN_THICKNESS = 2.5;
const MAX_THICKNESS = 26;
/** Below this a "wall" is a furniture edge or a stray tick, not a partition. */
const MIN_WALL_LENGTH = 10;
/** What a single-line partition is drawn at when the sheet gives it no second face. */
const NOMINAL_THICKNESS = 7;
/**
 * How long an unpaired face may be, against the longest paired wall on its axis,
 * before it is read as a dimension chain rather than a partition.
 */
const MAX_UNPAIRED_SHARE = 0.85;

/**
 * Pairs parallel faces into wall bodies.
 *
 * Each face is matched with its nearest unused partner at a plausible wall
 * thickness that actually runs alongside it. A face left unpaired is still a
 * wall — the sheet draws some partitions as a single heavy line — so it is kept
 * at a nominal thickness rather than dropped, which is what left holes in the
 * envelope when this was tried by pairing alone.
 */
export function buildWallBodies(
  runs: WallRun[],
  options?: { unitsPerMetre?: number },
): WallBody[] {
  const upm = options?.unitsPerMetre;
  const minThickness = upm && upm > 0 ? MIN_THICKNESS_M * upm : MIN_THICKNESS;
  const maxThickness = upm && upm > 0 ? MAX_THICKNESS_M * upm : MAX_THICKNESS;
  const bodies: WallBody[] = [];
  const unpaired: WallBody[] = [];
  const used = new Set<number>();

  for (const orientation of ["h", "v"] as const) {
    const faces = runs
      .map((run, index) => ({ run, index }))
      .filter((f) => f.run.orientation === orientation && f.run.to - f.run.from >= MIN_WALL_LENGTH)
      .sort((a, b) => a.run.at - b.run.at);

    for (let i = 0; i < faces.length; i++) {
      const a = faces[i]!;
      if (used.has(a.index)) continue;

      let partner: { face: (typeof faces)[number]; overlap: number } | null = null;
      for (let j = i + 1; j < faces.length; j++) {
        const b = faces[j]!;
        if (used.has(b.index)) continue;
        const gap = b.run.at - a.run.at;
        if (gap < minThickness) continue;
        if (gap > maxThickness) break; // sorted: nothing further is closer
        const overlap =
          Math.min(a.run.to, b.run.to) - Math.max(a.run.from, b.run.from);
        if (overlap <= 0) continue;
        // Prefer the face that shares the most length, not merely the nearest.
        if (!partner || overlap > partner.overlap) partner = { face: b, overlap };
      }

      if (partner && partner.overlap >= (a.run.to - a.run.from) * 0.4) {
        used.add(a.index);
        used.add(partner.face.index);
        bodies.push({
          orientation,
          centre: (a.run.at + partner.face.run.at) / 2,
          thickness: partner.face.run.at - a.run.at,
          // The body spans the union: a wall's two faces stop at different
          // places where a door reveal or a corner cuts one of them short.
          from: Math.min(a.run.from, partner.face.run.from),
          to: Math.max(a.run.to, partner.face.run.to),
        });
      } else {
        used.add(a.index);
        unpaired.push({
          orientation,
          centre: a.run.at,
          thickness: NOMINAL_THICKNESS,
          from: a.run.from,
          to: a.run.to,
        });
      }
    }
  }

  // A face with no partner is usually a partition the sheet draws as one heavy
  // line, and dropping those left holes in the envelope. But it is sometimes a
  // dimension chain or a grid line, and promoting one of those to a wall put a
  // solid bar straight down the middle of דירה 14, running past the flat at both
  // ends. Length separates them: a genuine partition that long would have been
  // drawn with two faces like every other long wall.
  const extent = { h: 0, v: 0 };
  for (const b of bodies) {
    // A horizontal body's length measures the drawing's width, and vice versa.
    const axis = b.orientation === "h" ? "h" : "v";
    extent[axis] = Math.max(extent[axis], b.to - b.from);
  }
  for (const b of unpaired) {
    const limit = extent[b.orientation];
    if (limit > 0 && b.to - b.from > limit * MAX_UNPAIRED_SHARE) continue;
    bodies.push(b);
  }
  return dropCombs(dedupe(dropGridLines(bodies)), 3, 26, maxThickness * 0.45);
}

/**
 * Drops the sheet's grid and dimension chains, which pair with each other.
 *
 * Two of them run the full height of דירה 14 a few units apart, so the face
 * pairing read them as one 15-unit wall and drew a solid bar down the middle of
 * the flat, past the building at both ends. Length alone cannot separate them
 * from a long exterior wall.
 *
 * What separates them is that walls end at other walls. Perpendicular bodies
 * mark where real structure exists; a wall closes into them, and a grid line
 * runs out past everything at both ends.
 */
function dropGridLines(bodies: WallBody[], slack = 12): WallBody[] {
  const spanOf = (orientation: "h" | "v") => {
    const centres = bodies.filter((b) => b.orientation === orientation).map((b) => b.centre);
    return centres.length
      ? { min: Math.min(...centres), max: Math.max(...centres) }
      : null;
  };
  // A vertical body is bounded by where the horizontal bodies sit, and vice versa.
  const bounds = { v: spanOf("h"), h: spanOf("v") };
  return bodies.filter((b) => {
    const limit = bounds[b.orientation];
    if (!limit) return true;
    return !(b.from < limit.min - slack && b.to > limit.max + slack);
  });
}

/**
 * Drops paving hatch and stair treads, which are drawn exactly like thin walls.
 *
 * The terrace on דירה 14 is paved with parallel lines a few units apart, and the
 * building stair is a row of treads. Each pair reads as a thin wall, so the
 * terrace came back partitioned into strips. What tells them apart from walls is
 * repetition: a hatch is a comb of parallel lines at an even pitch, and a flat
 * does not have four parallel partitions ten units apart.
 */
function dropCombs(
  bodies: WallBody[],
  minTeeth = 3,
  maxPitch = 26,
  maxToothThickness = Infinity,
): WallBody[] {
  const drop = new Set<WallBody>();
  for (const orientation of ["h", "v"] as const) {
    // Only thin bodies can be teeth. A wall drawn with hatch inside it produces
    // parallel bodies at an even pitch exactly like paving does, and judging on
    // spacing alone deleted the 45 cm north wall of דירה 14 along with the hatch
    // that fills it — which is the hole the flood fill kept escaping through.
    const line = bodies
      .filter((b) => b.orientation === orientation && b.thickness <= maxToothThickness)
      .sort((a, b) => a.centre - b.centre);
    let run: WallBody[] = [];
    const flush = () => {
      if (run.length >= minTeeth) for (const b of run) drop.add(b);
      run = [];
    };
    for (let i = 0; i < line.length; i++) {
      const cur = line[i]!;
      const prev = run[run.length - 1];
      if (!prev) {
        run = [cur];
        continue;
      }
      const pitch = cur.centre - prev.centre;
      // Teeth of one comb also overlap along their length; two partitions that
      // happen to be evenly spaced sit in different parts of the flat.
      const overlap = Math.min(cur.to, prev.to) - Math.max(cur.from, prev.from);
      const sameComb =
        pitch > 0 && pitch <= maxPitch && overlap > (cur.to - cur.from) * 0.5;
      if (sameComb) run.push(cur);
      else {
        flush();
        run = [cur];
      }
    }
    flush();
  }
  return bodies.filter((b) => !drop.has(b));
}

/**
 * Collapses bodies built from the same wall.
 *
 * A wall drawn with three faces — two outer and a reveal line between them —
 * pairs into two overlapping bodies on almost the same centre. Rendered, they
 * double the wall's apparent thickness.
 */
function dedupe(bodies: WallBody[]): WallBody[] {
  const out: WallBody[] = [];
  for (const b of bodies.slice().sort((p, q) => q.thickness - p.thickness)) {
    const covered = out.some((o) => {
      if (o.orientation !== b.orientation) return false;
      // Overlapping across the thickness, not merely near in centre. The centre
      // test was `|dc| <= (ta + tb) / 2`, which two stacked walls satisfy by
      // construction — the top-right wall of דירה 14 sits 24 units from the one
      // above it, each about 20 to 28 thick, so the thicker one deleted it and
      // 190 hatch strokes went uncovered where the outline steps.
      if (!overlapAcross(o, b, 0.6)) return false;
      return Math.min(o.to, b.to) - Math.max(o.from, b.from) > (b.to - b.from) * 0.6;
    });
    if (!covered) out.push(b);
  }
  return out;
}

/**
 * Wall bodies fit to build from, as opposed to bodies fit to hint with.
 *
 * The wall set feeding the image model could carry noise: a stray furniture edge
 * in a reference picture costs nothing. Extruded into a solid it becomes a wall
 * standing in the middle of a room, and דירה 14 rendered as a forest of them.
 *
 * Length separates them, with a real gap to cut in: on that sheet the bodies run
 * 0.54 m at the first quartile and 3.25 m at the third, because a partition
 * spans a room and a counter edge spans a counter.
 */
export function wallBodiesFromSegments(
  walls: VectorSegment[],
  options?: { unitsPerMetre?: number; minLengthM?: number },
): WallBody[] {
  const upm = options?.unitsPerMetre;
  const bodies = buildWallBodies(buildWallRuns(walls), { unitsPerMetre: upm });
  if (!upm || !(upm > 0)) return bodies;
  return keepStructural(bodies, upm, options?.minLengthM ?? 0.8);
}

/**
 * Keeps the walls and drops the furniture, without cutting on length alone.
 *
 * Length is most of the signal — a partition spans a room and a counter edge
 * spans a counter — but cutting at 0.8 m also deleted the short pieces of wall
 * either side of a doorway, and the rooms downstairs fell open because their
 * walls had been reduced to disconnected posts.
 *
 * A jamb is short but it is collinear with the long wall it belongs to; a
 * counter edge is short and sits on its own line. So a short body is kept when
 * it lies on the same line as a wall that earned its place on length.
 */
function keepStructural(bodies: WallBody[], unitsPerMetre: number, minLengthM: number): WallBody[] {
  const min = minLengthM * unitsPerMetre;
  const long = bodies.filter((b) => b.to - b.from >= min);
  const tolerance = Math.max(3, unitsPerMetre * 0.12);
  return bodies.filter((b) => {
    if (b.to - b.from >= min) return true;
    return long.some(
      (l) =>
        l.orientation === b.orientation &&
        Math.abs(l.centre - b.centre) <= tolerance &&
        // On the same line and end to end with it, not merely parallel to it
        // somewhere else in the flat.
        b.from <= l.to + unitsPerMetre * 1.6 &&
        b.to >= l.from - unitsPerMetre * 1.6,
    );
  });
}

/** The rectangle a body covers in plan, in page units. */
export function bodyRect(b: WallBody): { x: number; y: number; w: number; h: number } {
  const half = b.thickness / 2;
  return b.orientation === "h"
    ? { x: b.from, y: b.centre - half, w: b.to - b.from, h: b.thickness }
    : { x: b.centre - half, y: b.from, w: b.thickness, h: b.to - b.from };
}

/**
 * Bridges the openings along each wall line, for masking only.
 *
 * A door or a window is a gap in the drawn wall, but the wall line carries on
 * through it — there is a lintel over every opening. Growing walls outward to
 * close those gaps was the first attempt and it failed both ways at once: a
 * 1 m seal was too small for a 2.4 m terrace slider, so the outside flooded
 * into the living room and it rendered with no floor, and the same growth
 * pushed floor out past the walls elsewhere.
 *
 * Joining bodies along their own line closes each opening exactly, without
 * moving any wall. The bridges are never drawn — they exist only so the flood
 * fill can tell inside from outside.
 */
/** Whether two bodies overlap across their thickness by at least `share`. */
function overlapAcross(a: WallBody, b: WallBody, share: number): boolean {
  const aLow = a.centre - a.thickness / 2;
  const aHigh = a.centre + a.thickness / 2;
  const bLow = b.centre - b.thickness / 2;
  const bHigh = b.centre + b.thickness / 2;
  const across = Math.min(aHigh, bHigh) - Math.max(aLow, bLow);
  return across >= Math.min(a.thickness, b.thickness) * share;
}

export function bridgeOpenings(bodies: WallBody[], maxOpening: number): WallBody[] {
  const out: WallBody[] = [];
  for (const orientation of ["h", "v"] as const) {
    const line = bodies
      .filter((b) => b.orientation === orientation)
      .sort((a, b) => a.centre - b.centre || a.from - b.from);
    let group: WallBody[] = [];
    const flush = () => {
      if (group.length === 0) return;
      group.sort((a, b) => a.from - b.from);
      let cur = { ...group[0]! };
      for (let i = 1; i < group.length; i++) {
        const next = group[i]!;
        if (next.from - cur.to <= maxOpening) {
          cur.to = Math.max(cur.to, next.to);
          cur.thickness = Math.max(cur.thickness, next.thickness);
        } else {
          out.push(cur);
          cur = { ...next };
        }
      }
      out.push(cur);
      group = [];
    };
    for (const b of line) {
      const anchor = group[0];
      // Same line, within a wall's own thickness — measured against the group's
      // first member, not the previous one. Chaining off the previous member let
      // bodies at 1140, 1150, 1160, 1172 join hand to hand into a single group
      // far wider than any wall, and the merged body took the first member's
      // centre, so a real 2.17 m bathroom partition disappeared into a wall
      // 30 cm away from it. Same mistake as buildWallRuns made, one level up.
      // Same line means the two bodies overlap across their thickness, not that
      // their centres are close. Centre distance was the test and it fails both
      // ways: loose, it merged a wall with the one stacked above it; tight, it
      // left one wall in pieces, because different stretches of it pair with
      // different faces where a reveal line runs out, so their centres differ by
      // more than the tolerance. Overlap is the same criterion dedupe uses, and
      // it is the one that means "these are the same wall".
      if (anchor && !overlapAcross(anchor, b, 0.5)) flush();
      group.push(b);
    }
    flush();
  }
  return out;
}

/**
 * Extends walls to the walls they nearly meet, so corners actually close.
 *
 * CAD draws a corner as two lines that stop at the joint, at the inner face, or
 * a little short of each other — it does not matter on paper, and it is fatal to
 * a flood fill. On דירה 14 the east wall and the north wall passed within a
 * wall's thickness without touching, and the outside poured through that corner
 * into the living room, which then rendered with no floor.
 *
 * Only ends that are already close to a crossing wall are moved, and only as far
 * as that wall. Like the bridges, this is for masking; it never changes what is
 * drawn.
 */
export function closeCorners(bodies: WallBody[], reach: number): WallBody[] {
  return bodies.map((b) => {
    const crossing = bodies.filter((o) => {
      if (o.orientation === b.orientation) return false;
      // The crossing wall has to actually span this wall's line.
      const half = o.thickness / 2 + b.thickness;
      return b.centre >= o.from - half && b.centre <= o.to + half;
    });
    let { from, to } = b;
    for (const o of crossing) {
      const near = o.centre + o.thickness / 2;
      const far = o.centre - o.thickness / 2;
      if (Math.abs(from - near) <= reach && near < from) from = far;
      else if (Math.abs(from - far) <= reach && far < from) from = far;
      if (Math.abs(to - far) <= reach && far > to) to = near;
      else if (Math.abs(to - near) <= reach && near > to) to = near;
    }
    return { ...b, from, to };
  });
}

/**
 * The rectangles that plug the gaps where two wall ends stop near each other.
 *
 * closeCorners handles an end that runs past a crossing wall's line. It cannot
 * handle a step in the outline, where the north wall ends at one x and the east
 * wall starts at another, both short of the corner and offset in both
 * directions: neither end lies on the other's line, so neither is extended, and
 * the outside pours through the notch between them. On דירה 14 that single
 * 70-unit notch is why the living room came back with no floor under it.
 *
 * Endpoints that stop within reach of each other were meant to be one corner, so
 * the box spanning them is filled. Mask only — nothing here is drawn.
 */
export function endGapPatches(
  bodies: WallBody[],
  reach: number,
): Array<{ x: number; y: number; w: number; h: number }> {
  const ends = bodies.flatMap((b) =>
    [b.from, b.to].map((at) =>
      b.orientation === "h" ? { x: at, y: b.centre } : { x: b.centre, y: at },
    ),
  );
  const patches: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let i = 0; i < ends.length; i++) {
    for (let j = i + 1; j < ends.length; j++) {
      const a = ends[i]!;
      const b = ends[j]!;
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      if (dx > reach || dy > reach) continue;
      if (dx < 1 && dy < 1) continue;
      patches.push({
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.max(dx, 1),
        h: Math.max(dy, 1),
      });
    }
  }
  return patches;
}

export type SpanRow = { y: number; spans: Array<[number, number]> };

/**
 * The floor of the flat: everything the walls enclose, as horizontal runs.
 *
 * Room rectangles cannot describe this. The flood fill returns bounding boxes,
 * an L-shaped room is not its bounding box, and eighteen of them still left the
 * lower half of דירה 14 rendering with no floor under it at all. The inside of
 * the flat is one region with a stepped edge, so it is measured as one region.
 *
 * Walls are painted a little thicker than they are before the outside is
 * flooded, because a doorway is a real gap in the CAD geometry and the flood
 * would pour through it and swallow the whole page. `seal` is how wide an
 * opening can be and still be closed off; a door is ~90 cm.
 *
 * Returned as row spans rather than a polygon: exact, trivial to draw, and it
 * does not need contour tracing to be correct.
 */
export function interiorSpans(
  bodies: WallBody[],
  bounds: { x: number; y: number; width: number; height: number },
  options?: {
    resolution?: number;
    maxOpeningUnits?: number;
    cornerReachUnits?: number;
    /**
     * Raw CAD segments painted into the mask as well, to close the envelope.
     *
     * Reconstructed bodies are clean enough to draw but not guaranteed to be
     * watertight: on דירה 14 the boundary steps out at the top right and the
     * short wall across that step was never rebuilt, so the outside poured in
     * through a 70-unit hole and the living room rendered with no floor. The
     * original ink has no such holes — it is what the draughtsman drew — so it
     * is used to decide inside from outside, while the bodies remain what gets
     * drawn.
     */
    sealingSegments?: VectorSegment[];
    /**
     * Leave the wall cells out of the result.
     *
     * Wall cells normally count as floor — a wall stands on the slab, and
     * leaving them out draws a hairline of background along every wall. For
     * telling one flat from its neighbour it has to be the other way round: with
     * the walls counted in, every region touches every other through them, and a
     * sheet carrying two apartments and a stair core came back as one enclosed
     * region of 153 m².
     */
    excludeWalls?: boolean;
    /**
     * Treat walls at least this thick as barriers, thinner ones as floor.
     *
     * Neither of the two settings above separates one flat from its neighbour.
     * Count the walls as floor and every region joins through them — the uncut
     * דירה 14 sheet came back as a single 153 m² region covering the flat, its
     * neighbour and the stair core. Leave them out and the flat itself falls
     * apart into 37 rooms, since a room is exactly what a wall encloses.
     *
     * The distinction that does hold is architectural: rooms inside a flat are
     * divided by thin partitions, and flats are divided from each other by thick
     * party and exterior walls. So thin walls join what they separate, and thick
     * ones do not.
     */
    barrierThicknessUnits?: number;
  },
): SpanRow[] {
  const step = options?.resolution ?? 2;
  // A terrace slider is the widest opening on these sheets at about 2.4 m.
  const maxOpening = options?.maxOpeningUnits ?? 120;
  // Corner reach decides whether the flat closes, and it is sharper than it
  // looks. Swept on דירה 14 against the 132.19 m² the sheet prints: at 0.9 m the
  // living room is still outside and the region measures 93 m²; at 1.2 m the
  // living room comes in and it measures 134.2; at 1.4 m it breaks through into
  // the neighbouring flat and measures 145. Widening the opening bridge instead
  // does nothing at all — 2 m, 3 m and 4 m all give the same 93 m² — so what was
  // holding the living room out was unclosed corners, not unbridged doorways.
  const reach = options?.cornerReachUnits ?? maxOpening / 2;
  const sealed = bridgeOpenings(closeCorners(bodies, reach), maxOpening);
  const w = Math.ceil(bounds.width / step) + 2;
  const h = Math.ceil(bounds.height / step) + 2;
  if (w <= 2 || h <= 2) return [];

  const WALL = 1;
  const OUTSIDE = 2;
  const grid = new Uint8Array(w * h);

  const paint = (rx: number, ry: number, rw: number, rh: number) => {
    const x0 = Math.max(0, Math.floor((rx - bounds.x) / step) + 1);
    const x1 = Math.min(w - 1, Math.ceil((rx + rw - bounds.x) / step) + 1);
    const y0 = Math.max(0, Math.floor((ry - bounds.y) / step) + 1);
    const y1 = Math.min(h - 1, Math.ceil((ry + rh - bounds.y) / step) + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) grid[y * w + x] = WALL;
    }
  };

  for (const seg of options?.sealingSegments ?? []) {
    const x = Math.min(seg.x1, seg.x2);
    const y = Math.min(seg.y1, seg.y2);
    paint(x, y, Math.abs(seg.x2 - seg.x1) || step, Math.abs(seg.y2 - seg.y1) || step);
  }

  const barrier = options?.barrierThicknessUnits;
  for (const b of sealed) {
    if (barrier !== undefined && b.thickness < barrier) continue;
    const r = bodyRect(b);
    paint(r.x, r.y, r.w, r.h);
  }
  for (const p of endGapPatches(sealed, reach)) paint(p.x, p.y, p.w, p.h);

  // Flood the border inward. What it cannot reach is enclosed — the flat.
  const queue: number[] = [];
  const visit = (i: number) => {
    if (grid[i] === 0) {
      grid[i] = OUTSIDE;
      queue.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    visit(x);
    visit((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    visit(y * w);
    visit(y * w + w - 1);
  }
  while (queue.length > 0) {
    const i = queue.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (y > 0) visit(i - w);
    if (y < h - 1) visit(i + w);
  }

  const rows: SpanRow[] = [];
  for (let y = 1; y < h - 1; y++) {
    const spans: Array<[number, number]> = [];
    let start = -1;
    for (let x = 1; x < w; x++) {
      const cell = grid[y * w + x];
      // In barrier mode a painted cell is a party or exterior wall, and it must
      // not count as floor: counting it joined the two flats through the very
      // wall that divides them, which is how a sheet carrying two apartments
      // came back as one region.
      const wallsAreFloor = !options?.excludeWalls && barrier === undefined;
      const inside = x < w - 1 && (wallsAreFloor ? cell !== OUTSIDE : cell === 0);
      if (inside && start < 0) start = x;
      else if (!inside && start >= 0) {
        spans.push([bounds.x + (start - 1) * step, bounds.x + (x - 1) * step]);
        start = -1;
      }
    }
    if (spans.length > 0) rows.push({ y: bounds.y + (y - 1) * step, spans });
  }
  return rows;
}

/** The area of an interior mask, in page units squared. */
export function spanArea(rows: SpanRow[]): number {
  if (rows.length === 0) return 0;
  const rowHeight = rows.length > 1 ? rows[1]!.y - rows[0]!.y : 1;
  return (
    rows.reduce((sum, r) => sum + r.spans.reduce((t, [a, b]) => t + (b - a), 0), 0) * rowHeight
  );
}

/**
 * Page units per metre, solved from the shell the walls enclose.
 *
 * The seed comes from the flood fill's room boxes against the sheet's gross
 * area, and boxes overstate an L-shaped room while missing others entirely: on
 * דירה 14 that gave 43.67 units/m, which made the flat 207 m² when the sheet
 * says 111 plus about 21 of terrace. Reading the printed dimension chain instead
 * would settle it, but this CAD draws its numbers as vector outlines — the page
 * carries eleven text items in total — so there is nothing to read.
 *
 * The mask itself is the better ruler. Its outline is faithful, so the scale is
 * whatever makes its area equal the area the sheet prints. Two passes: seed,
 * measure, solve, rebuild. An independent check agrees — at the scale this
 * returns for 14 the median wall comes out 12 cm.
 */
export function calibrateFromInterior(
  seedScale: number,
  interiorUnitArea: number,
  knownAreaM2: number,
): number | null {
  if (!(seedScale > 0) || !(interiorUnitArea > 0) || !(knownAreaM2 > 10)) return null;
  const unitsPerMetre = Math.sqrt(interiorUnitArea / knownAreaM2);
  if (!(unitsPerMetre > 8) || unitsPerMetre > 400) return null;
  return unitsPerMetre;
}

/**
 * The hatch that fills a wall, which is what a wall actually is on this sheet.
 *
 * Everything before this looked for walls in their outlines — heavy pens,
 * parallel faces, plausible thicknesses, minimum lengths — and every one of
 * those describes a kitchen counter and a terrace edge just as well. Overlaying
 * the reconstruction on the drawing showed the result plainly: the counter run
 * came back as a wall, the terrace paving came back as walls, and the bathroom
 * walls came back as nothing at all.
 *
 * The sheet is not ambiguous about it. A wall is a band filled with 45° hatch;
 * a bath, a toilet, a washing machine and a worktop have no hatch inside them.
 * דירה 14 carries 5,108 short strokes at a median angle of exactly 45.0°, and
 * the very first filter in this pipeline — isAxisAligned — was throwing every
 * one of them away.
 */
export type HatchPoint = { x: number; y: number };

export function extractHatchStrokes(
  segments: VectorSegment[],
  options?: { maxStrokeLength?: number },
): HatchPoint[] {
  const maxLength = options?.maxStrokeLength ?? 40;
  const out: HatchPoint[] = [];
  for (const s of segments) {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const length = Math.hypot(dx, dy);
    if (length < 1 || length > maxLength) continue;
    const degrees = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI) % 180;
    const angle = degrees > 90 ? 180 - degrees : degrees;
    // Wide enough to take a hatch drawn at 30° or 60°, narrow enough to exclude
    // a door swing arc's chords and the odd sloped fitting.
    if (angle <= 25 || angle >= 65) continue;
    out.push({ x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 });
  }
  return out;
}

/** Grid lookup over hatch points, so a density test is not a linear scan. */
export class HatchField {
  private readonly cells = new Map<string, number>();

  constructor(
    points: HatchPoint[],
    // Fine enough that a band cannot borrow a neighbouring wall's strokes: at
    // cell 6 an empty patch of living-room floor beside a wall measured 23
    // strokes per 100 units, as much as a real thin partition.
    private readonly cell = 2,
  ) {
    for (const p of points) {
      const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
      this.cells.set(key, (this.cells.get(key) ?? 0) + 1);
    }
  }

  /** Strokes counted inside a rectangle. */
  count(rect: { x: number; y: number; w: number; h: number }): number {
    let count = 0;
    const x0 = Math.floor(rect.x / this.cell);
    const x1 = Math.floor((rect.x + rect.w) / this.cell);
    const y0 = Math.floor(rect.y / this.cell);
    const y1 = Math.floor((rect.y + rect.h) / this.cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) count += this.cells.get(`${cx},${cy}`) ?? 0;
    }
    return count;
  }

  /** Strokes per 100 square units inside a rectangle. */
  density(rect: { x: number; y: number; w: number; h: number }): number {
    const area = rect.w * rect.h;
    if (!(area > 0)) return 0;
    return (this.count(rect) / area) * 100;
  }

  /**
   * Strokes per 100 units along a band's length.
   *
   * The reasoning is sound — a 10 cm partition carries the same hatch pitch
   * along its length as a 45 cm exterior wall but has a quarter of the area to
   * spread those strokes over — and it measured worse end to end: swapping the
   * accept test to this took דירה 14 from 42 walls to 31 and moved the floor
   * further from the area the sheet prints. Kept because the measure is useful
   * and the next sheet may want it; not used to accept a band.
   */
  perLength(rect: { x: number; y: number; w: number; h: number }): number {
    const along = Math.max(rect.w, rect.h);
    if (!(along > 0)) return 0;
    return (this.count(rect) / along) * 100;
  }

  get size(): number {
    return this.cells.size;
  }
}

/**
 * Walls, found by asking which bands are filled with hatch.
 *
 * This replaces the stack of proxies — heavy pen, minimum length, parallel face,
 * comb rejection, nested rejection — that between them let a kitchen counter and
 * a terrace's paving through while losing the bathroom walls entirely. Each of
 * those rules was a guess at what a wall looks like from outside. The hatch says
 * what a wall is.
 *
 * Because the test is positive, the candidate net can be cast much wider: every
 * axis-aligned segment is a possible wall face, at any length, and the hatch
 * decides. That is what recovers the walls the old filters never built.
 */
export function wallBodiesFromHatch(
  segments: VectorSegment[],
  options: {
    unitsPerMetre: number;
    minDensity?: number;
    minLengthM?: number;
    /** How far apart two pieces of one wall may be and still be joined. */
    mergeGapM?: number;
    /**
     * Return the pieces without joining them across doorways.
     *
     * The gaps between pieces of one wall are the doorways, and joining is what
     * loses them: asked for the openings after the merge, דירה 14 reports one,
     * 11 cm wide. The caller that wants to draw the doors needs the pieces.
     */
    keepOpenings?: boolean;
  },
): WallBody[] {
  const upm = options.unitsPerMetre;
  // Swept against hatch coverage on דירה 14: 0.2 gives 78.6%, 0.4 gives 82.8%,
  // 0.7 gives 82.3%, 1.2 gives 80.8%. Flat enough that the walls still missing
  // are not being lost at the margin.
  const minDensity = options.minDensity ?? 0.4;
  const minLength = (options.minLengthM ?? 0.2) * upm;
  const field = new HatchField(extractHatchStrokes(segments));
  if (field.size === 0) return [];

  const runs = buildWallRuns(
    segments.filter((s) => isAxisAligned(s) && segmentLength(s) >= 3),
  );
  const minThickness = MIN_THICKNESS_M * upm;
  const maxThickness = MAX_THICKNESS_M * upm;

  const bodies: WallBody[] = [];
  for (const orientation of ["h", "v"] as const) {
    const faces = runs
      .filter((r) => r.orientation === orientation && r.to - r.from >= minLength)
      .sort((a, b) => a.at - b.at);

    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        const a = faces[i]!;
        const b = faces[j]!;
        const gap = b.at - a.at;
        if (gap < minThickness) continue;
        if (gap > maxThickness) break;
        const from = Math.max(a.from, b.from);
        const to = Math.min(a.to, b.to);
        if (to - from < minLength) continue;

        const body: WallBody = {
          orientation,
          centre: (a.at + b.at) / 2,
          thickness: gap,
          from,
          to,
        };
        // Hatch all the way across, not on average. Averaging accepted a pair
        // made of one wall's far face and the next wall's near face: hatch at
        // both ends, bare room in the middle, mean density fine. Thirty of
        // דירה 14's walls came out 40 to 55 cm thick that way, and no Israeli
        // partition is 50 cm. Slicing across the band catches the hollow middle,
        // which pairing each face with its nearest partner instead did not —
        // that halved coverage, because a wall drawn with a reveal line pairs to
        // the reveal rather than to its own far face.
        // Hatch in the middle, not on average across the band.
        if (field.density(bodyRect(body)) < minDensity) continue;
        if (!hatchFillsMiddle(field, body, minDensity)) continue;
        bodies.push(body);
      }
    }
  }

  // A hatched band is found once per pair of faces that brackets it, so a wall
  // drawn with a reveal line comes back two or three times over.
  //
  // Then close the gaps. A body can only span where both its faces span, so a
  // door reveal or a corner where one face stops short cuts the wall in two and
  // the reconstruction comes back dashed. Taking the bands straight off the
  // hatch instead was tried and is worse — the strokes are diagonal, so each
  // row's run sits shifted from the one above and almost nothing stacks.
  // Fitted to the hatch each band actually contains. A pair's faces are not
  // always the wall's own — one can bracket the wall plus a slice of the room
  // beside it and still pass, because the hatch it needs is in there somewhere.
  // Unfitted, the reconstruction drew 47 m² of wall where the sheet has 22, at a
  // median of 41 cm where an Israeli wall is 8 to 25, and ate the rooms from
  // both sides. Fitting takes it to 36 m² and 24 cm, and IoU against the sheet's
  // own walls from 41.6% to 47.6%.
  const deduped = shrinkToHatch(dedupe(bodies), segments);
  if (options.keepOpenings) return deduped.filter((b) => b.to - b.from >= minLength);
  const merged = bridgeOpenings(deduped, (options.mergeGapM ?? 1.2) * upm);
  return merged.filter((b) => b.to - b.from >= minLength);
}

/**
 * Whether hatch fills the middle of a band, not merely its edges.
 *
 * Strokes are indexed by their midpoint, so a stroke that spans a wall face to
 * face registers only in the middle of that wall — which makes the middle the
 * one place that separates a real wall from a pair made of two walls with room
 * between them. That pair has hatch at both ends and a hollow centre, and an
 * average over the whole band could not see it: thirty of דירה 14's walls came
 * out 40 to 55 cm thick, and no Israeli partition is 50 cm.
 *
 * Requiring every slice to carry hatch was tried and is wrong for the same
 * indexing reason — it rejects thin walls whose strokes all land centrally.
 */
function hatchFillsMiddle(field: HatchField, body: WallBody, minDensity: number): boolean {
  const rect = bodyRect(body);
  const across = body.orientation === "h" ? rect.h : rect.w;
  if (across < 6) return true; // Too thin to have a middle distinct from its edges.
  const from = across / 3;
  const size = across / 3;
  const middle =
    body.orientation === "h"
      ? { x: rect.x, y: rect.y + from, w: rect.w, h: size }
      : { x: rect.x + from, y: rect.y, w: size, h: rect.h };
  return field.density(middle) >= minDensity;
}

/**
 * Drops wall bodies that lie outside the drawing.
 *
 * The hatch test is positive, so it also finds hatch outside the apartment: a
 * filled cell in the title block came back as a wall, and that one stray at the
 * far corner of the sheet stretched the bounding box enough to throw the scale
 * off by a third and shrink the floor to 64 m².
 *
 * Clustering the bodies by contact was tried first and is wrong here — walls
 * legitimately stop either side of every doorway, so the flat is not one
 * connected body of them and the largest cluster came back as eight walls. The
 * vector pass already knows where the drawing is; bound the bodies by that.
 */
export function clipBodiesToBounds(
  bodies: WallBody[],
  bounds: { x: number; y: number; width: number; height: number },
  margin = 8,
  options?: { truncate?: boolean },
): WallBody[] {
  const lowX = bounds.x - margin;
  const highX = bounds.x + bounds.width + margin;
  const lowY = bounds.y - margin;
  const highY = bounds.y + bounds.height + margin;

  if (!options?.truncate) {
    return bodies.filter((b) => {
      const r = bodyRect(b);
      return r.x >= lowX && r.y >= lowY && r.x + r.w <= highX && r.y + r.h <= highY;
    });
  }

  // Cut walls at the boundary rather than dropping them.
  //
  // Dropping loses every wall that straddles the line, and the party wall
  // between two flats always does — which is why isolating by a box cost four
  // points of wall coverage while the uncut sheet was gaining them. A truncated
  // party wall is still this flat's east wall.
  const out: WallBody[] = [];
  for (const b of bodies) {
    const alongLow = b.orientation === "h" ? lowX : lowY;
    const alongHigh = b.orientation === "h" ? highX : highY;
    const acrossLow = b.orientation === "h" ? lowY : lowX;
    const acrossHigh = b.orientation === "h" ? highY : highX;
    if (b.centre < acrossLow || b.centre > acrossHigh) continue;
    const from = Math.max(b.from, alongLow);
    const to = Math.min(b.to, alongHigh);
    if (to - from <= 0) continue;
    out.push({ ...b, from, to });
  }
  return out;
}

/**
 * The enclosed regions of a sheet, separated, so one flat can be picked out.
 *
 * A sales sheet is not always one apartment. The uncut דירה 14 carries its
 * neighbour and the building's stair core as well, and the client had been
 * cropping the PDF by hand to keep them out of the render — which severed wall
 * faces mid-run and cost the reconstruction four points of hatch coverage.
 *
 * Better to take the whole sheet and separate the flats afterwards. Each is its
 * own enclosed region once the walls are sealed, and the sheet prints the area
 * of the one we want.
 */
export function interiorComponents(
  bodies: WallBody[],
  bounds: { x: number; y: number; width: number; height: number },
  options?: Parameters<typeof interiorSpans>[2],
): SpanRow[][] {
  const rows = interiorSpans(bodies, bounds, options);
  if (rows.length === 0) return [];
  const pitch = rows.length > 1 ? rows[1]!.y - rows[0]!.y : 1;

  type Node = { row: number; span: [number, number]; parent: number };
  const nodes: Node[] = [];
  const index = new Map<number, number[]>();
  rows.forEach((row, r) => {
    const ids: number[] = [];
    for (const span of row.spans) {
      ids.push(nodes.length);
      nodes.push({ row: r, span, parent: nodes.length });
    }
    index.set(r, ids);
  });
  const find = (a: number): number => {
    let n = a;
    while (nodes[n]!.parent !== n) {
      nodes[n]!.parent = nodes[nodes[n]!.parent]!.parent;
      n = nodes[n]!.parent;
    }
    return n;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) nodes[ra]!.parent = rb;
  };

  // Spans that overlap on consecutive rows are the same region.
  for (let r = 1; r < rows.length; r++) {
    for (const a of index.get(r - 1) ?? []) {
      for (const b of index.get(r) ?? []) {
        const [a0, a1] = nodes[a]!.span;
        const [b0, b1] = nodes[b]!.span;
        if (Math.min(a1, b1) - Math.max(a0, b0) > 0) union(a, b);
      }
    }
  }

  const byRoot = new Map<number, Map<number, Array<[number, number]>>>();
  nodes.forEach((node, i) => {
    const root = find(i);
    const rowsOf = byRoot.get(root) ?? new Map<number, Array<[number, number]>>();
    const spans = rowsOf.get(node.row) ?? [];
    spans.push(node.span);
    rowsOf.set(node.row, spans);
    byRoot.set(root, rowsOf);
  });

  return [...byRoot.values()]
    .map((rowsOf) =>
      [...rowsOf.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([r, spans]) => ({ y: rows[r]!.y, spans })),
    )
    .sort((a, b) => spanArea(b) - spanArea(a))
    .map((component) => {
      // spanArea reads the pitch off the first two rows; a component whose rows
      // are not consecutive would otherwise measure wrong.
      void pitch;
      return component;
    });
}

/**
 * The region whose area is closest to the area the sheet prints for the flat.
 *
 * Size is what separates the apartment from its neighbour and from the stair
 * core, and the sheet states it — so there is nothing to infer.
 */
export function pickComponentByArea(
  components: SpanRow[][],
  unitsPerMetre: number,
  targetM2: number,
): SpanRow[] | null {
  if (components.length === 0) return null;
  let best: SpanRow[] | null = null;
  let bestError = Infinity;
  for (const component of components) {
    const m2 = spanArea(component) / (unitsPerMetre * unitsPerMetre);
    const error = Math.abs(m2 - targetM2);
    if (error < bestError) {
      bestError = error;
      best = component;
    }
  }
  return best;
}

export type Opening = {
  orientation: "h" | "v";
  /** Centre of the wall the opening sits in. */
  centre: number;
  thickness: number;
  from: number;
  to: number;
};

/**
 * The doorways, taken from the gaps bridging already has to find.
 *
 * bridgeOpenings closes these so the flood fill can tell inside from outside,
 * and then throws them away. Drawn instead, they stop the model inventing its
 * own: given a shell whose walls simply stop, it cut two openings דירה 14 does
 * not have, because nothing in the picture said which breaks were the doors.
 */
export function findOpenings(
  bodies: WallBody[],
  maxOpening: number,
  minOpening = 0,
): Opening[] {
  const openings: Opening[] = [];
  for (const orientation of ["h", "v"] as const) {
    const line = bodies
      .filter((b) => b.orientation === orientation)
      .sort((a, b) => a.centre - b.centre || a.from - b.from);
    let group: WallBody[] = [];
    const flush = () => {
      if (group.length < 2) {
        group = [];
        return;
      }
      group.sort((a, b) => a.from - b.from);
      for (let i = 1; i < group.length; i++) {
        const prev = group[i - 1]!;
        const next = group[i]!;
        const gap = next.from - prev.to;
        // A doorway is at least a door wide. Under that the gap is two pieces
        // of one wall meeting at a joint, and דירה 14 has nineteen of those —
        // 5 to 40 cm — against five real openings.
        if (gap < Math.max(1, minOpening) || gap > maxOpening) continue;
        openings.push({
          orientation,
          centre: (prev.centre + next.centre) / 2,
          thickness: Math.max(prev.thickness, next.thickness),
          from: prev.to,
          to: next.from,
        });
      }
      group = [];
    };
    for (const b of line) {
      const anchor = group[0];
      const sameLine = Math.max(3, anchor ? anchor.thickness * 0.3 : 3);
      if (anchor && Math.abs(b.centre - anchor.centre) > sameLine) flush();
      group.push(b);
    }
    flush();
  }
  return openings;
}

/** The rectangle an opening occupies, matching bodyRect's convention. */
export function openingRect(o: Opening): { x: number; y: number; w: number; h: number } {
  const half = o.thickness / 2;
  return o.orientation === "h"
    ? { x: o.from, y: o.centre - half, w: o.to - o.from, h: o.thickness }
    : { x: o.centre - half, y: o.from, w: o.thickness, h: o.to - o.from };
}

/**
 * The flat's footprint, taken from where its walls are rather than by flooding.
 *
 * Flood filling cannot do this and the reason is structural: every room has a
 * door, a door is a gap in the hatch, so the walls never close around anything —
 * rasterising the strokes as barriers encloses 0.0 m². Bridging the doors closes
 * the flat and simultaneously joins it to the neighbour through the shared
 * landing, and the "isolated flat" came out the size of the whole drawing.
 *
 * A scanline cannot leak. On each row the flat runs from its leftmost wall to
 * its rightmost, on each column from topmost to bottommost, and a cell inside
 * both is inside the flat. Taking both axes is what keeps a stepped outline:
 * rows alone square off a notch, columns alone square off a different one, and
 * the intersection keeps the step.
 *
 * On דירה 14 rows give 134.5 m², columns 132.8 and the intersection 126.0,
 * against the 132.19 the sheet prints.
 */
export function footprintByScanFill(
  bodies: WallBody[],
  bounds: { x: number; y: number; width: number; height: number },
  options?: { resolution?: number },
): SpanRow[] {
  const step = options?.resolution ?? 2;
  const pad = 8;
  const w = Math.ceil((bounds.width + pad * 2) / step);
  const h = Math.ceil((bounds.height + pad * 2) / step);
  if (w <= 0 || h <= 0) return [];
  const originX = bounds.x - pad;
  const originY = bounds.y - pad;
  const gx = (x: number) => Math.floor((x - originX) / step);
  const gy = (y: number) => Math.floor((y - originY) / step);

  const wall = new Uint8Array(w * h);
  for (const body of bodies) {
    const r = bodyRect(body);
    const x0 = Math.max(0, gx(r.x));
    const x1 = Math.min(w - 1, gx(r.x + r.w));
    const y0 = Math.max(0, gy(r.y));
    const y1 = Math.min(h - 1, gy(r.y + r.h));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) wall[y * w + x] = 1;
    }
  }

  const rowIn = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < w; x++) {
      if (wall[y * w + x]) {
        if (first < 0) first = x;
        last = x;
      }
    }
    if (first >= 0) for (let x = first; x <= last; x++) rowIn[y * w + x] = 1;
  }

  const colIn = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let first = -1;
    let last = -1;
    for (let y = 0; y < h; y++) {
      if (wall[y * w + x]) {
        if (first < 0) first = y;
        last = y;
      }
    }
    if (first >= 0) for (let y = first; y <= last; y++) colIn[y * w + x] = 1;
  }

  const rows: SpanRow[] = [];
  for (let y = 0; y < h; y++) {
    const spans: Array<[number, number]> = [];
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const inside = x < w && rowIn[y * w + x] === 1 && colIn[y * w + x] === 1;
      if (inside && start < 0) start = x;
      else if (!inside && start >= 0) {
        spans.push([originX + start * step, originX + x * step]);
        start = -1;
      }
    }
    if (spans.length > 0) rows.push({ y: originY + y * step, spans });
  }
  return rows;
}

/**
 * Shrinks each wall to the hatch it actually contains.
 *
 * A body's thickness comes from the two faces that were paired, and those faces
 * are not always the wall's own: a pair can bracket the wall plus a slice of the
 * room beside it and still pass every test, because the hatch it needs is in
 * there somewhere. Measured against the sheet, the reconstruction recalled 93.7%
 * of the wall hatch at 41.5% precision — 47 m² of wall drawn where the drawing
 * has 21, a median wall of 41 cm where an Israeli wall is 8 to 25, and rooms
 * eaten from both sides until they stopped reading as rooms.
 *
 * Capping the thickness instead cost recall immediately, 93.7% to 42.2%, since
 * the over-thick bodies are the ones covering the hatch. The band has to be
 * fitted rather than rejected: the hatch inside a wall runs its full width, so
 * where the strokes stop is where the wall stops.
 */
export function shrinkToHatch(
  bodies: WallBody[],
  segments: VectorSegment[],
  options?: { minThicknessUnits?: number },
): WallBody[] {
  const points = extractHatchStrokes(segments);
  if (points.length === 0) return bodies;
  const minThickness = options?.minThicknessUnits ?? 3;

  return bodies.map((body) => {
    const r = bodyRect(body);
    let low = Infinity;
    let high = -Infinity;
    for (const p of points) {
      const along = body.orientation === "h" ? p.x : p.y;
      const across = body.orientation === "h" ? p.y : p.x;
      const from = body.orientation === "h" ? r.x : r.y;
      const to = body.orientation === "h" ? r.x + r.w : r.y + r.h;
      if (along < from || along > to) continue;
      const lowEdge = body.centre - body.thickness / 2;
      const highEdge = body.centre + body.thickness / 2;
      if (across < lowEdge || across > highEdge) continue;
      low = Math.min(low, across);
      high = Math.max(high, across);
    }
    if (!Number.isFinite(low) || high - low < minThickness) return body;
    return { ...body, centre: (low + high) / 2, thickness: high - low };
  });
}

/**
 * Splits a band whose hatch comes in two, which is two walls with a room between.
 *
 * Fitting a body to its hatch fixes its edges but not its middle: a pair that
 * brackets two walls shrinks to the outermost strokes of both and stays one
 * 50 cm slab. The hatch inside a real wall is continuous across it, so a gap
 * across the thickness is the room between two walls, and the band is cut there.
 */
export function splitAcrossGaps(
  bodies: WallBody[],
  segments: VectorSegment[],
  options?: { minGapUnits?: number; minThicknessUnits?: number },
): WallBody[] {
  const points = extractHatchStrokes(segments);
  if (points.length === 0) return bodies;
  // Wider than the hatch's own pitch. At 5 units every row of strokes came back
  // as its own band — the pitch across a wall is larger than that — so every
  // band measured zero thick, none survived the minimum, and the split silently
  // never fired. The gap that means "room" is tens of units, not five.
  const minGap = options?.minGapUnits ?? 24;
  const minThickness = options?.minThicknessUnits ?? 3;
  const out: WallBody[] = [];

  for (const body of bodies) {
    const r = bodyRect(body);
    const from = body.orientation === "h" ? r.x : r.y;
    const to = body.orientation === "h" ? r.x + r.w : r.y + r.h;
    const lowEdge = body.centre - body.thickness / 2;
    const highEdge = body.centre + body.thickness / 2;

    const across: number[] = [];
    for (const p of points) {
      const a = body.orientation === "h" ? p.x : p.y;
      const c = body.orientation === "h" ? p.y : p.x;
      if (a < from || a > to || c < lowEdge || c > highEdge) continue;
      across.push(c);
    }
    if (across.length < 4) {
      out.push(body);
      continue;
    }
    across.sort((a, b) => a - b);

    let start = across[0]!;
    let prev = across[0]!;
    const bands: Array<[number, number]> = [];
    for (let i = 1; i < across.length; i++) {
      const c = across[i]!;
      if (c - prev > minGap) {
        bands.push([start, prev]);
        start = c;
      }
      prev = c;
    }
    bands.push([start, prev]);

    const kept = bands.filter(([a, b]) => b - a >= minThickness);
    if (kept.length <= 1) {
      out.push(body);
      continue;
    }
    for (const [a, b] of kept) {
      out.push({ ...body, centre: (a + b) / 2, thickness: b - a });
    }
  }
  return out;
}

/**
 * Trims a wall back to where its hatch runs along it.
 *
 * shrinkToHatch fits a band across its thickness; nothing fitted it along its
 * length, and two steps stretch it there. bridgeOpenings joins pieces across a
 * doorway, which is right, and across anything else within the same gap, which
 * is not; closeCorners extends an end to the wall it crosses. Overlaid on the
 * sheet, those extensions are the pink: long stretches of drawn wall with no
 * hatch beneath them at all, running out into the living room.
 *
 * A doorway is a real gap in a real wall, so the trim keeps whatever lies
 * between the first and last stroke and only cuts the tails beyond them. The
 * margin allows the half-thickness a corner needs to close.
 */
export function trimToHatchAlong(
  bodies: WallBody[],
  segments: VectorSegment[],
  options?: { marginUnits?: number },
): WallBody[] {
  const points = extractHatchStrokes(segments);
  if (points.length === 0) return bodies;

  return bodies.map((body) => {
    const margin = options?.marginUnits ?? body.thickness;
    const lowEdge = body.centre - body.thickness / 2 - 1;
    const highEdge = body.centre + body.thickness / 2 + 1;
    let first = Infinity;
    let last = -Infinity;
    for (const p of points) {
      const along = body.orientation === "h" ? p.x : p.y;
      const across = body.orientation === "h" ? p.y : p.x;
      if (across < lowEdge || across > highEdge) continue;
      if (along < body.from || along > body.to) continue;
      first = Math.min(first, along);
      last = Math.max(last, along);
    }
    if (!Number.isFinite(first)) return body;
    return {
      ...body,
      from: Math.max(body.from, first - margin),
      to: Math.min(body.to, last + margin),
    };
  });
}

/**
 * The rectangle the flat's walls occupy, as opposed to the rectangle its sheet
 * occupies.
 *
 * wallBoundingBox measures every segment that survived the wall filters, and
 * those include dimension chains running well past the apartment: on דירה 14 it
 * returns y 218 to 1463 where the walls themselves stop at 331 and 1346. Used as
 * the flat's extent, that hands the scanline fill a 230-unit strip of sheet
 * above and below the flat — which is where the dimension chains and the
 * building's stair core are drawn, and how the stair came to be rendered as part
 * of the apartment.
 *
 * Hatched walls have no such tails, and the box they give is stable: 550 by 1015
 * units at 50, 53 and 56 units per metre alike.
 */
export function hatchedWallExtent(
  segments: VectorSegment[],
  sheet: { x: number; y: number; width: number; height: number },
  unitsPerMetre: number,
): { x: number; y: number; width: number; height: number } | null {
  const bodies = clipBodiesToBounds(
    wallBodiesFromHatch(segments, { unitsPerMetre }),
    sheet,
    8,
    { truncate: true },
  );
  if (bodies.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const body of bodies) {
    const r = bodyRect(body);
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  if (!(width > 0) || !(height > 0)) return null;
  return { x: minX, y: minY, width, height };
}
