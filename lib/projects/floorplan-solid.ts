import { buildWallRuns, type WallRun } from "@/lib/projects/floorplan-rooms";
import {
  WALL_MIN_LINE_WIDTH,
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

/**
 * The lintels over the windows, which close a room the hatch leaves open.
 *
 * A wall is a band of hatch, and that rule found every wall on דירה 14. It also
 * means a window is nothing: the sheet draws a window as the wall's two faces
 * carrying straight on with the frame between them and no fill, because there
 * is nothing solid there to fill. Correct, and it cost the flat a room.
 *
 * The ממ"ד's north side is one window nearly the full width of the room — the
 * sheet labels it חלון ממ"ד הזזה. Measured, that span holds 9.3 hatch strokes
 * per 1000 square units where the three walls around it hold 48, 55 and 68, so
 * no body is built there and the scanline finds no wall above those columns.
 * The footprint came back with a 68-unit hole exactly the size of the room, the
 * bed drawn inside it was dropped for being outside the flat, and the render put
 * three beds in the stack below and none in the ממ"ד.
 *
 * A window is still enclosure. There is a lintel over it and the wall line runs
 * through. So a band bracketed by two parallel faces at a wall's thickness is
 * taken as enclosure when it continues a wall that is really there — same line,
 * comparable thickness, and close enough along to be the same wall. That last
 * condition is what keeps this narrow: dropping the hatch test on its own admits
 * every pair of furniture edges on the sheet.
 *
 * Mask only. Nothing here is drawn — the opening belongs to findOpenings, and a
 * lintel rendered as wall would brick up the window.
 */
export function lintelBands(
  segments: VectorSegment[],
  bodies: WallBody[],
  unitsPerMetre: number,
  options?: { reachM?: number; minLengthM?: number },
): WallBody[] {
  const minThickness = MIN_THICKNESS_M * unitsPerMetre;
  const maxThickness = MAX_THICKNESS_M * unitsPerMetre;
  const minLength = (options?.minLengthM ?? 0.2) * unitsPerMetre;
  const reach = (options?.reachM ?? 1.2) * unitsPerMetre;

  const runs = buildWallRuns(
    segments.filter((s) => isAxisAligned(s) && segmentLength(s) >= 3),
  );
  const out: WallBody[] = [];
  for (const orientation of ["h", "v"] as const) {
    const faces = runs
      .filter((r) => r.orientation === orientation && r.to - r.from >= minLength)
      .sort((a, b) => a.at - b.at);
    const walls = bodies.filter((b) => b.orientation === orientation);

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
        const centre = (a.at + b.at) / 2;

        const continues = walls.some((w) => {
          if (Math.abs(w.centre - centre) > Math.min(w.thickness, gap) / 2) {
            return false;
          }
          const thicker = Math.max(w.thickness, gap);
          if (Math.abs(w.thickness - gap) > thicker * 0.5) return false;
          // Overlapping, or stopping within reach along the same line.
          return from - w.to <= reach && w.from - to <= reach;
        });
        if (!continues) continue;
        out.push({ orientation, centre, thickness: gap, from, to });
      }
    }
  }
  return dedupe(out);
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
    /**
     * The flat itself, when the caller already knows where it is.
     *
     * The border flood decides inside from outside by trying to reach in, and
     * it only works on a sheet whose envelope is watertight ink. 28-8-23-2
     * draws part of its outer wall in the same thin pen as its dimension
     * chains, so the flood walked in through the kitchen and three quarters of
     * the flat came back as outdoors. The footprint does not have that
     * problem — it is built from the hatch and the lintels, and it closed this
     * flat correctly — so where it is given, everything outside it is sealed
     * before the flood starts and the only question left is which walls cut
     * the inside into rooms.
     */
    floorMask?: SpanRow[];
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

  const floorMask = options?.floorMask;
  if (floorMask && floorMask.length > 1) {
    const maskPitch = floorMask[1]!.y - floorMask[0]!.y;
    const covered = (px: number, py: number) => {
      const row = floorMask.find((r) => py >= r.y && py < r.y + maskPitch);
      return !!row && row.spans.some(([a, b]) => px >= a && px <= b);
    };
    for (let gy = 0; gy < h; gy++) {
      const py = bounds.y + (gy - 1) * step;
      for (let gx = 0; gx < w; gx++) {
        const px = bounds.x + (gx - 1) * step;
        if (!covered(px, py)) grid[gy * w + gx] = WALL;
      }
    }
  }

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

/**
 * The cap is scale-relative because a stroke inside a wall is bounded by the
 * wall: hatch at 45° crossing a band of thickness t is t·√2 long, so 0.45 m of
 * stroke already implies a 32 cm wall. Longer strokes are drawn across open
 * ground, and on דירה 14 that is the terrace paving — the west terrace's
 * diagonals run to a median of 24 units where the wall hatch in the flat's core
 * runs to 8. Capping there drops 61% of the paving and 0% of the core hatch,
 * which is what stopped the terrace being fitted into a pair of 35 and 49 cm
 * "walls" and dragging every scanline row out of the flat with it.
 */
export function extractHatchStrokes(
  segments: VectorSegment[],
  options?: { maxStrokeLength?: number; unitsPerMetre?: number },
): HatchPoint[] {
  const maxLength =
    options?.maxStrokeLength ??
    (options?.unitsPerMetre ? options.unitsPerMetre * 0.45 : 40);
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
/**
 * Wall bodies from a sheet, however that sheet draws its walls.
 *
 * wallBodiesFromHatch asks for hatch between two faces, because on a sales
 * sheet a wall is a hatched band and a kitchen counter is not. A plotted CAD
 * drawing hatches only what the office chose to — on 28-8-23-2 the envelope
 * and the ממ"ד are hatched and every internal partition is a bare pair of
 * lines 10 cm apart — so the hatch rule found the envelope, missed every
 * partition, and the flat came back as one open floor with no shelter room.
 *
 * So both: the hatched bands, plus the pairs that a plotter drew as walls and
 * that are not already one of those bands.
 */
export function wallBodiesForSheet(
  segments: VectorSegment[],
  options: { unitsPerMetre: number; keepOpenings?: boolean },
): WallBody[] {
  const hatched = wallBodiesFromHatch(segments, options);
  const plotted = plottedWallBodies(segments, options.unitsPerMetre);
  const extra = plotted.filter((body) => !hatched.some((seen) => sameWall(seen, body)));
  return [...hatched, ...extra];
}

/** Two bodies that are the same wall, found once by each detector. */
function sameWall(a: WallBody, b: WallBody): boolean {
  if (a.orientation !== b.orientation) return false;
  if (Math.abs(a.centre - b.centre) > Math.max(a.thickness, b.thickness) * 0.75) return false;
  const overlap = Math.min(a.to, b.to) - Math.max(a.from, b.from);
  return overlap > Math.min(a.to - a.from, b.to - b.from) * 0.4;
}

/**
 * Walls as a plotter draws them: two heavy parallel lines a wall apart.
 *
 * The weight is the whole signal, and it is per sheet rather than absolute.
 * On 28-8-23-2 the wall lines are plotted at pen weights 12 and 14 while the
 * dimension chains, the furniture and the grid sit at 4 to 6 — so a pair of
 * heavy lines 10 cm apart is a partition, and a pair of thin ones the same
 * distance apart is a counter, a stair tread or a dimension chain. Without
 * the weight test every one of those became a wall.
 *
 * Sheets that do not plot their walls heavier than everything else produce no
 * heavy population at all, and this returns nothing rather than a guess: the
 * hatch detector is the answer for those.
 */
function plottedWallBodies(segments: VectorSegment[], unitsPerMetre: number): WallBody[] {
  if (!(unitsPerMetre > 0)) return [];
  const axis = segments.filter(
    (s) => isAxisAligned(s) && segmentLength(s) >= 0.25 * unitsPerMetre,
  );
  const cut = heavyLineCut(axis);
  if (cut == null) return [];
  const heavy = axis.filter((s) => (s.lineWidth ?? 0) >= cut);
  if (heavy.length < 20) return [];

  const runs = buildWallRuns(heavy);
  const minThickness = MIN_THICKNESS_M * unitsPerMetre;
  const maxThickness = MAX_THICKNESS_M * unitsPerMetre;
  const minOverlap = Math.max(0.3 * unitsPerMetre, MIN_WALL_LENGTH);

  const bodies: WallBody[] = [];
  for (const orientation of ["h", "v"] as const) {
    const faces = runs
      .filter((r) => r.orientation === orientation)
      .sort((a, b) => a.at - b.at);
    const used = new Set<number>();
    for (let i = 0; i < faces.length; i++) {
      if (used.has(i)) continue;
      const a = faces[i]!;
      for (let j = i + 1; j < faces.length; j++) {
        if (used.has(j)) continue;
        const b = faces[j]!;
        const gap = b.at - a.at;
        if (gap < minThickness) continue;
        if (gap > maxThickness) break;
        const overlap = Math.min(a.to, b.to) - Math.max(a.from, b.from);
        if (overlap < minOverlap) continue;
        if (overlap < Math.min(a.to - a.from, b.to - b.from) * 0.5) continue;
        used.add(i);
        used.add(j);
        bodies.push({
          orientation,
          centre: (a.at + b.at) / 2,
          thickness: gap,
          from: Math.max(a.from, b.from),
          to: Math.min(a.to, b.to),
        });
        break;
      }
    }
  }
  return bodies;
}

/**
 * The pen weight at or above which this sheet's lines are structure.
 *
 * WALL_MIN_LINE_WIDTH is a floor, not an answer. A sales sheet draws its walls
 * heavier than its furniture and 3 separates them; a plotted CAD sheet draws
 * everything at 4 and up, walls at 12 and 14, and taking 3 there treats every
 * dimension chain and wardrobe edge as a wall — which is how 28-8-23-2 came
 * out of the segmenter as fifteen pockets of two square metres.
 */
export function wallInkThreshold(segments: VectorSegment[]): number {
  const widths = segments
    .filter((s) => isAxisAligned(s))
    .map((s) => s.lineWidth ?? 0)
    .filter((w) => w > 0);
  if (widths.length < 40) return WALL_MIN_LINE_WIDTH;
  // Measured over the ten reference sheets and this one: a sales sheet draws
  // 28 to 34 per cent of its lines at wall weight or above, so the constant
  // separates walls from furniture there and must be left alone. A plotted CAD
  // sheet draws 100 per cent of them at 4 and up, where the constant separates
  // nothing at all — that is the only case this replaces.
  const heavyShare = widths.filter((w) => w >= WALL_MIN_LINE_WIDTH).length / widths.length;
  if (heavyShare < 0.9) return WALL_MIN_LINE_WIDTH;
  return heavyLineCut(segments.filter((s) => isAxisAligned(s))) ?? WALL_MIN_LINE_WIDTH;
}

/**
 * The pen weight at which this sheet's lines stop being annotation.
 *
 * Null when the drawing has no heavy class — a scan, or a sheet plotted at one
 * weight throughout, where this test would pass everything.
 */
function heavyLineCut(segments: VectorSegment[]): number | null {
  const widths = segments
    .map((s) => s.lineWidth ?? 0)
    .filter((w) => w > 0)
    .sort((a, b) => a - b);
  if (widths.length < 40) return null;
  const median = widths[Math.floor(widths.length / 2)]!;
  const top = widths[widths.length - 1]!;
  if (top < median * 1.8) return null;
  return Math.max(median * 1.8, top * 0.7);
}

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
  const field = new HatchField(extractHatchStrokes(segments, { unitsPerMetre: upm }));
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

/**
 * The angle a set of directions covers, in degrees, ignoring where it starts.
 *
 * The widest gap between neighbouring angles is the part that is NOT covered, so
 * the sweep is what is left of the circle once that gap is taken out. This works
 * across the -180/180 seam, which a plain max-minus-min does not.
 */
function angularSweep(angles: number[]): number {
  if (angles.length < 2) return 0;
  const sorted = [...angles].sort((a, b) => a - b);
  let widest = sorted[0]! + 360 - sorted[sorted.length - 1]!;
  for (let i = 1; i < sorted.length; i++) {
    widest = Math.max(widest, sorted[i]! - sorted[i - 1]!);
  }
  return 360 - widest;
}

/**
 * The doors, from the way a CAD draws one: a leaf and the arc it sweeps.
 *
 * findOpenings takes a doorway to be a gap between two pieces of the same wall,
 * which is true and not sufficient. A gap is also what a window is, and what the
 * end of a wall at a corner is, so on דירה 14 that rule returned six openings of
 * which the widest was 208 cm and most sat on windows — while the front door and
 * the doors onto the terrace, which the sheet marks plainly, were not among them.
 *
 * A door is drawn as its leaf, a straight line the width of the door standing
 * open, hinged on the wall; and as the quarter circle the leaf sweeps, dashed.
 * Neither on its own is safe — a 90 cm line touching a wall is also a piece of
 * furniture, and the dashed arc breaks into chords too far apart to cluster — so
 * both are required: a leaf of door width with exactly one end on a wall, and
 * curve chords lying at the leaf's own radius around that end.
 *
 * The two together are specific. On דירה 14 they return seven doors at 74, 77,
 * 84, 94, 94, 94 and 105 cm, which is the range an Israeli internal door is made
 * in, and each one sits where the sheet draws a swing.
 */
export function findDoorSwings(
  segments: VectorSegment[],
  curves: VectorSegment[],
  bodies: WallBody[],
  unitsPerMetre: number,
  options?: {
    minArcChords?: number;
    minWidthM?: number;
    maxWidthM?: number;
    /** The flat, so the landing's and the neighbour's doors are not taken. */
    extent?: { x: number; y: number; width: number; height: number };
  },
): Opening[] {
  if (bodies.length === 0) return [];
  const extent = options?.extent;
  // Four chords still describe a quarter-circle on these sheets; six was
  // dropping real doors whose dashed swing is drawn with a short polyline.
  // דירה 23 came back with two doors because its swings are sparse.
  const minArc = options?.minArcChords ?? 4;
  const minWidth = (options?.minWidthM ?? 0.68) * unitsPerMetre;
  const maxWidth = (options?.maxWidthM ?? 1.15) * unitsPerMetre;
  const rects = bodies.map((b) => ({ body: b, rect: bodyRect(b) }));
  const onWall = (x: number, y: number) =>
    rects.find(
      ({ rect }) =>
        x >= rect.x - 3 &&
        x <= rect.x + rect.w + 3 &&
        y >= rect.y - 3 &&
        y <= rect.y + rect.h + 3,
    );

  type Swing = { x: number; y: number; width: number; arcs: number; body: WallBody };
  const swings: Swing[] = [];
  for (const s of segments) {
    const width = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (width < minWidth || width > maxWidth) continue;
    const a = onWall(s.x1, s.y1);
    const b = onWall(s.x2, s.y2);
    // Exactly one end hinged: a line with both ends on walls is a wall, and one
    // with neither is furniture standing in the room.
    if ((a && b) || (!a && !b)) continue;
    const hinge = a ? { x: s.x1, y: s.y1 } : { x: s.x2, y: s.y2 };
    const body = (a ?? b)!.body;
    const angles: number[] = [];
    for (const c of curves) {
      const mx = (c.x1 + c.x2) / 2;
      const my = (c.y1 + c.y2) / 2;
      const d = Math.hypot(mx - hinge.x, my - hinge.y);
      if (Math.abs(d - width) > width * 0.18) continue;
      angles.push((Math.atan2(my - hinge.y, mx - hinge.x) * 180) / Math.PI);
    }
    const arcs = angles.length;
    if (arcs < minArc) continue;
    // A door sweeps a quarter circle. Distance alone let a bath through: its rim
    // puts plenty of chords at 80 cm from a point on the wall beside it, and six
    // of those looked exactly like a swing. A rim closes all the way round and a
    // swing does not, so the angle they cover tells them apart.
    const sweep = angularSweep(angles);
    if (sweep < 55 || sweep > 140) continue;
    if (
      extent &&
      (hinge.x < extent.x ||
        hinge.x > extent.x + extent.width ||
        hinge.y < extent.y ||
        hinge.y > extent.y + extent.height)
    ) {
      continue;
    }
    swings.push({ ...hinge, width, arcs, body });
  }

  // One door is drawn with several strokes — the leaf, its frame, its stop — so
  // the same door comes back many times over, hinged a few centimetres apart
  // each time. Merged by the hole they describe rather than by how far apart
  // the hinges are: two doorways that overlap along the same wall are one, and
  // a plain distance cannot say that, because a bathroom and a WC door really
  // do stand a metre apart.
  swings.sort((p, q) => q.arcs - p.arcs);
  const along = (s: Swing) => (s.body.orientation === "h" ? s.x : s.y);
  const kept: Swing[] = [];
  for (const swing of swings) {
    const overlaps = kept.some((k) => {
      if (k.body.orientation !== swing.body.orientation) return false;
      if (Math.abs(k.body.centre - swing.body.centre) > swing.body.thickness) {
        return false;
      }
      return (
        Math.abs(along(k) - along(swing)) < Math.max(k.width, swing.width) * 0.9
      );
    });
    if (!overlaps) kept.push(swing);
  }

  return kept.flatMap((swing) => {
    const at = along(swing);
    // The leaf hinges at one edge of the doorway and the door fills its width,
    // but which side is not known from the leaf alone. Centring on the hinge
    // keeps the error to half a door either way and never lands off the wall.
    const from = Math.max(swing.body.from, at - swing.width / 2);
    const to = Math.min(swing.body.to, at + swing.width / 2);
    // Clipped to nothing where the swing sits at the very end of its wall, which
    // is a door into the next room drawn against this one's corner.
    if (to - from < minWidth * 0.7) return [];
    return [
      {
        orientation: swing.body.orientation,
        centre: swing.body.centre,
        thickness: swing.body.thickness,
        from,
        to,
      },
    ];
  });
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

  // The extent over the wall's whole length, not slice by slice.
  //
  // Slicing is the better idea on paper and measured worse. A thin partition
  // that meets a thick wall at one end inherits the thick wall's hatch here and
  // comes back too fat — 45 cm on a 10 cm wall, which is real and visible. But
  // strokes are indexed by their midpoints, so a slice always reads narrower
  // than the band it sits in, and fitting per slice starved every other wall:
  // IoU against the sheet fell from 51.8% to between 43% and 45% at every
  // percentile from the median to the maximum. The few fat walls cost less than
  // the many thin ones.
  return bodies.map((body) => {
    const from = body.orientation === "h" ? body.from : body.from;
    const to = body.orientation === "h" ? body.to : body.to;
    const lowEdge = body.centre - body.thickness / 2;
    const highEdge = body.centre + body.thickness / 2;
    let low = Infinity;
    let high = -Infinity;
    for (const p of points) {
      const along = body.orientation === "h" ? p.x : p.y;
      const across = body.orientation === "h" ? p.y : p.x;
      if (along < from || along > to) continue;
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
  options?: { marginUnits?: number; unitsPerMetre?: number },
): WallBody[] {
  const points = extractHatchStrokes(segments, {
    unitsPerMetre: options?.unitsPerMetre,
  });
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
 * Drops bodies that have hatch at their ends and none along their run.
 *
 * hatchFillsMiddle asks whether a band's middle carries hatch, which a
 * dimension chain crossing two walls passes: it inherits a cluster at each end
 * and one more wherever it cuts a partition, and those are enough to look
 * filled at three sample points. Measured along the whole run instead, the sheet
 * separates cleanly — on דירה 14 every real wall carries 11 to 94 hatch strokes
 * per 100 cm and the seven survivors carry 3.3 to 6.6, a gap of nearly two to
 * one with nothing inside it. They are the thin verticals running the height of
 * the drawing in the geometry pass, and the flat's own dimension chains are
 * exactly where they lie.
 *
 * Density is measured per unit length rather than per unit area on purpose.
 * Hatch fills a wall's full width, so a thick wall does hold more of it, but the
 * discrimination here does not come from thickness: the densest thin body on the
 * sheet is a 10 cm partition at 32 strokes per 100 cm, well clear of a 28 cm
 * dimension chain at 6.6.
 */
export function dropUnhatchedBodies(
  bodies: WallBody[],
  segments: VectorSegment[],
  unitsPerMetre: number,
  options?: { minPer100cm?: number },
): WallBody[] {
  const points = extractHatchStrokes(segments, { unitsPerMetre });
  if (points.length === 0) return bodies;
  const minimum = options?.minPer100cm ?? 10;
  const cm = unitsPerMetre / 100;

  return bodies.filter((body) => {
    const rect = bodyRect(body);
    let n = 0;
    for (const p of points) {
      if (
        p.x >= rect.x - 1 &&
        p.x <= rect.x + rect.w + 1 &&
        p.y >= rect.y - 1 &&
        p.y <= rect.y + rect.h + 1
      ) {
        n++;
      }
    }
    const lengthCm = Math.max(rect.w, rect.h) / cm;
    if (lengthCm < 1) return true;
    return (n / lengthCm) * 100 >= minimum;
  });
}

/**
 * The mark an Israeli sheet draws across a terrace: one long diagonal.
 *
 * A terrace is anchored by the area printed inside it, and three of these ten
 * sheets print no terrace area at all — דירה 19, 22 and 23 carry none in the
 * text layer — so no seed exists and none of their terraces can be found. The
 * diagonal is the other mark, and it is drawn on the heavy pen where the
 * paving inside the terrace is drawn light.
 *
 * Two things had to be separated from it. The hatch that fills a wall is also
 * diagonal, and is short — bounded by the wall's own thickness. And each sheet
 * carries a section line running its whole height, 1400 units and more, on the
 * thin pen. The terrace marks measure 69 to 261 units, which sits cleanly
 * between them.
 *
 * It marks one terrace per sheet rather than every one, so it supplements the
 * printed areas rather than replacing them.
 */
export function terraceDiagonalSeeds(
  segments: VectorSegment[],
  unitsPerMetre: number,
  options?: { minLineWidth?: number; minM?: number; maxM?: number },
): Array<{ x: number; y: number }> {
  const minLineWidth = options?.minLineWidth ?? 4;
  const min = (options?.minM ?? 0.9) * unitsPerMetre;
  const max = (options?.maxM ?? 6) * unitsPerMetre;
  const out: Array<{ x: number; y: number }> = [];
  for (const segment of segments) {
    if (segment.lineWidth < minLineWidth) continue;
    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const length = Math.hypot(dx, dy);
    if (length < min || length > max) continue;
    const degrees = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI) % 180;
    const angle = degrees > 90 ? 180 - degrees : degrees;
    if (angle < 12 || angle > 78) continue;
    out.push({
      x: (segment.x1 + segment.x2) / 2,
      y: (segment.y1 + segment.y2) / 2,
    });
  }
  return out;
}

/** A terrace: the region a printed area label sits in, and the area it claims. */
export type Terrace = {
  rows: SpanRow[];
  bounds: { x: number; y: number; width: number; height: number };
  /** What the sheet prints, in m² — absent when the seed was a diagonal mark. */
  printedM2?: number;
  /** What the region actually measures, in m². */
  floodedM2: number;
};

/**
 * The terraces, grown from the areas the sheet prints inside them.
 *
 * Six general detectors were tried against דירה 14 and none of them closed both
 * terraces. Long 45° strokes are not paving — the biggest cluster of them is the
 * ממ"ד's concrete hatch. Paving combs find two regions and one is off the sheet.
 * Flooding over every drawn line traps in a single paving brick, because the
 * brick pattern partitions the terrace into closed cells. Adding the wall bodies
 * as barriers makes it worse, since they overlap the terrace. Asking which floor
 * cells are enclosed on all four sides classifies nearly everything as inside,
 * because the neighbour's walls close the terraces too.
 *
 * What is certain is what the sheet prints. Most figures on this CAD are drawn
 * as outlines, but the terrace areas are real text, and each sits inside the
 * terrace it measures. So the label seeds a flood over the heavy line work only
 * — paving is drawn light, parapets and walls heavy — and the printed area is
 * the acceptance test rather than a result to be trusted.
 *
 * A region within tolerance of its label is a terrace. Anything else is dropped,
 * so a leak omits a terrace and can never invent one. On דירה 14 that accepts
 * the 4.10 (it floods to 3.59 m², the shortfall being the barrier's own width)
 * and rejects the 3.16, which leaks across the sheet to 253 m².
 *
 * KNOWN LIMIT, measured across all ten sheets: this finds four of the eleven
 * terraces that sit on a flat's own level. The flood measures the open ground
 * between the heavy lines, and against the printed figure that comes out
 * anywhere from 17% to 71% short — not a constant to correct for, because on
 * some sheets the paving inside the terrace is drawn on the heavy pen too and
 * traps the seed in a single bay. Widening the tolerance far enough to admit
 * the 71% cases would admit the leaks as well, and the leaks are what stop a
 * terrace being invented.
 *
 * Three other anchors were measured and none did better. The long 45° strokes
 * are the ממ"ד's concrete hatch, not paving. The paving's own brick courses
 * cluster into fragments of 1.5 to 3 m² where a terrace is 4 to 13. And the
 * single diagonal an Israeli sheet draws across a terrace does exist on the
 * heavy pen at 69 to 261 units — cleanly between the wall hatch below it and
 * the sheet-long section lines above — but it marks one terrace per sheet, and
 * flooding from it leaks on every sheet that has no printed figure to check
 * against. Raising the flood's resolution from 2 to 5 cells per unit gained
 * 0.4 m² on one plan and made another leak.
 *
 * So the count is reported rather than quietly wrong: assessFloorplanRun is
 * given the number of terraces the sheet prints a figure for, and says how
 * many of them were found.
 */
export function findTerraces(
  segments: VectorSegment[],
  areas: Array<{ x: number; y: number; value?: number }>,
  unitsPerMetre: number,
  options?: {
    minLineWidth?: number;
    tolerance?: number;
    /**
     * What an unlabelled seed's region may measure and still be a terrace.
     *
     * A seed from a printed area is checked against that area, which is what
     * makes a leak impossible to mistake for a room. A diagonal carries no
     * figure, so the window does that work instead: anything outside it is
     * either a leak or something that is not a terrace, and is dropped. The
     * eleven same-level terraces across these sheets run 3.16 to 13.2 m².
     */
    unlabelledM2?: { min: number; max: number };
  },
): Terrace[] {
  if (areas.length === 0) return [];
  const minLineWidth = options?.minLineWidth ?? 4;
  const tolerance = options?.tolerance ?? 0.25;
  const unlabelled = options?.unlabelledM2 ?? { min: 2.5, max: 16 };
  const heavy = segments.filter((s) => s.lineWidth >= minLineWidth);
  if (heavy.length === 0) return [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of heavy) {
    minX = Math.min(minX, s.x1, s.x2);
    maxX = Math.max(maxX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }
  const scale = 2;
  const pad = 4;
  const originX = minX - pad;
  const originY = minY - pad;
  const w = Math.ceil((maxX - minX + pad * 2) * scale);
  const h = Math.ceil((maxY - minY + pad * 2) * scale);
  if (w <= 0 || h <= 0 || w * h > 40_000_000) return [];

  const blocked = new Uint8Array(w * h);
  const gx = (x: number) => Math.round((x - originX) * scale);
  const gy = (y: number) => Math.round((y - originY) * scale);
  for (const s of heavy) {
    const steps = Math.ceil(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * scale) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = gx(s.x1 + (s.x2 - s.x1) * t);
      const y = gy(s.y1 + (s.y2 - s.y1) * t);
      if (x >= 0 && y >= 0 && x < w && y < h) blocked[y * w + x] = 1;
    }
  }

  const perCell = 1 / (scale * scale * unitsPerMetre * unitsPerMetre);
  const out: Terrace[] = [];
  for (const area of areas) {
    // The label's own glyphs are drawn, so step off them to open ground.
    let seed = -1;
    const sx = gx(area.x);
    const sy = gy(area.y);
    for (let r = 0; r < 60 && seed < 0; r++) {
      for (let a = -r; a <= r && seed < 0; a++) {
        for (let b = -r; b <= r && seed < 0; b++) {
          const x = sx + a;
          const y = sy + b;
          if (x >= 0 && y >= 0 && x < w && y < h && !blocked[y * w + x]) {
            seed = y * w + x;
          }
        }
      }
    }
    if (seed < 0) continue;

    // Budgeted, so a leak stops early instead of walking the sheet.
    const ceiling = area.value ?? unlabelled.max;
    const budget = Math.ceil((ceiling * (1 + tolerance) * 1.5) / perCell);
    const seen = new Uint8Array(w * h);
    const stack = [seed];
    seen[seed] = 1;
    let filled = 0;
    let leaked = false;
    const cells: number[] = [];
    while (stack.length) {
      const cur = stack.pop()!;
      filled++;
      if (filled > budget) {
        leaked = true;
        break;
      }
      cells.push(cur);
      const cx = cur % w;
      const cy = (cur - cx) / w;
      const neighbours = [
        cx + 1 < w ? cur + 1 : -1,
        cx - 1 >= 0 ? cur - 1 : -1,
        cy + 1 < h ? cur + w : -1,
        cy - 1 >= 0 ? cur - w : -1,
      ];
      for (const n of neighbours) {
        if (n < 0 || seen[n] || blocked[n]) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    if (leaked) continue;
    const floodedM2 = filled * perCell;
    if (area.value != null) {
      if (Math.abs(floodedM2 - area.value) / area.value > tolerance) continue;
    } else if (floodedM2 < unlabelled.min || floodedM2 > unlabelled.max) {
      continue;
    }

    const byRow = new Map<number, number[]>();
    let bx0 = Infinity;
    let bx1 = -Infinity;
    let by0 = Infinity;
    let by1 = -Infinity;
    for (const c of cells) {
      const cx = c % w;
      const cy = (c - cx) / w;
      if (!byRow.has(cy)) byRow.set(cy, []);
      byRow.get(cy)!.push(cx);
      bx0 = Math.min(bx0, cx);
      bx1 = Math.max(bx1, cx);
      by0 = Math.min(by0, cy);
      by1 = Math.max(by1, cy);
    }
    const rows: SpanRow[] = [];
    for (const [cy, xs] of [...byRow].sort((a, b) => a[0] - b[0])) {
      xs.sort((a, b) => a - b);
      const spans: Array<[number, number]> = [];
      let runStart = xs[0]!;
      let prev = xs[0]!;
      for (let i = 1; i < xs.length; i++) {
        const x = xs[i]!;
        if (x !== prev + 1) {
          spans.push([runStart / scale + originX, prev / scale + originX]);
          runStart = x;
        }
        prev = x;
      }
      spans.push([runStart / scale + originX, prev / scale + originX]);
      rows.push({ y: cy / scale + originY, spans });
    }
    out.push({
      rows,
      bounds: {
        x: bx0 / scale + originX,
        y: by0 / scale + originY,
        width: (bx1 - bx0) / scale,
        height: (by1 - by0) / scale,
      },
      ...(area.value != null ? { printedM2: area.value } : {}),
      floodedM2,
    });
  }
  return out;
}

function pointHitsBody(x: number, y: number, bodies: WallBody[]): boolean {
  for (const body of bodies) {
    const r = bodyRect(body);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

export function spansContain(rows: SpanRow[], x: number, y: number): boolean {
  if (rows.length === 0) return false;
  const pitch = rows.length > 1 ? rows[1]!.y - rows[0]!.y : 2;
  const row = rows.find((r) => y >= r.y && y < r.y + pitch);
  return !!row && row.spans.some(([a, b]) => x >= a && x <= b);
}

/**
 * A printed terrace figure whose ink flood was trapped in paving: walk the
 * already-locked floor slab and stop at wall bodies. Paving is not a barrier
 * here, so a label sitting in one brick can still grow the terrace the sheet
 * measures. A leak into the rooms fails the printed-area check and is dropped.
 */
export function findTerracesOnFloor(
  floor: SpanRow[],
  bodies: WallBody[],
  areas: Array<{ x: number; y: number; value?: number }>,
  unitsPerMetre: number,
  options?: { tolerance?: number },
): Terrace[] {
  if (floor.length === 0 || areas.length === 0 || !(unitsPerMetre > 0)) return [];
  const tolerance = options?.tolerance ?? 0.25;
  const pitch = floor.length > 1 ? floor[1]!.y - floor[0]!.y : 2;
  const step = Math.max(1, pitch);
  const onFloor = (x: number, y: number) => spansContain(floor, x, y);
  const out: Terrace[] = [];

  for (const area of areas) {
    if (area.value == null) continue;
    let sx = area.x;
    let sy = area.y;
    if (!onFloor(sx, sy) || pointHitsBody(sx, sy, bodies)) {
      let found = false;
      for (let r = step; r <= unitsPerMetre * 3 && !found; r += step) {
        for (let a = -r; a <= r && !found; a += step) {
          for (let b = -r; b <= r && !found; b += step) {
            const x = area.x + a;
            const y = area.y + b;
            if (!onFloor(x, y) || pointHitsBody(x, y, bodies)) continue;
            sx = x;
            sy = y;
            found = true;
          }
        }
      }
      if (!found) continue;
    }

    const seen = new Set<string>();
    const stack = [{ x: sx, y: sy }];
    seen.add(`${Math.round(sx / step)}:${Math.round(sy / step)}`);
    const cells: Array<{ x: number; y: number }> = [];
    const budget = Math.ceil(
      (area.value * (1 + tolerance) * 1.5 * unitsPerMetre * unitsPerMetre) / (step * step),
    );
    let leaked = false;
    while (stack.length) {
      const cur = stack.pop()!;
      cells.push(cur);
      if (cells.length > budget) {
        leaked = true;
        break;
      }
      for (const [dx, dy] of [
        [step, 0],
        [-step, 0],
        [0, step],
        [0, -step],
      ] as const) {
        const x = cur.x + dx;
        const y = cur.y + dy;
        const key = `${Math.round(x / step)}:${Math.round(y / step)}`;
        if (seen.has(key) || !onFloor(x, y) || pointHitsBody(x, y, bodies)) continue;
        seen.add(key);
        stack.push({ x, y });
      }
    }
    if (leaked) continue;
    const floodedM2 = (cells.length * step * step) / (unitsPerMetre * unitsPerMetre);
    if (Math.abs(floodedM2 - area.value) / area.value > tolerance) continue;

    const byRow = new Map<number, number[]>();
    let bx0 = Infinity;
    let bx1 = -Infinity;
    let by0 = Infinity;
    let by1 = -Infinity;
    for (const cell of cells) {
      const yi = Math.round(cell.y / step);
      const list = byRow.get(yi) ?? [];
      list.push(cell.x);
      byRow.set(yi, list);
      bx0 = Math.min(bx0, cell.x);
      bx1 = Math.max(bx1, cell.x);
      by0 = Math.min(by0, cell.y);
      by1 = Math.max(by1, cell.y);
    }
    const rows: SpanRow[] = [];
    for (const [yi, xs] of [...byRow].sort((a, b) => a[0] - b[0])) {
      xs.sort((a, b) => a - b);
      const spans: Array<[number, number]> = [];
      let runStart = xs[0]!;
      let prev = xs[0]!;
      for (let i = 1; i < xs.length; i++) {
        const x = xs[i]!;
        if (x - prev > step * 1.5) {
          spans.push([runStart, prev + step]);
          runStart = x;
        }
        prev = x;
      }
      spans.push([runStart, prev + step]);
      rows.push({ y: yi * step, spans });
    }
    out.push({
      rows,
      bounds: { x: bx0, y: by0, width: bx1 - bx0, height: by1 - by0 },
      printedM2: area.value,
      floodedM2,
    });
  }
  return out;
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

/**
 * Closes the notches a scanline fill leaves in the flat's outline.
 *
 * footprintByScanFill is exact and cannot leak, and it pays for that with its
 * edges: a row is bounded by its own outermost walls, so wherever walls are
 * sparse the outline steps in and out by a few units at a time and the flat
 * comes out with a staircase edge all the way round. Rendered, that reads as a
 * ragged, broken shape rather than an apartment, and the model draws faithfully
 * what it is shown.
 *
 * A closing — grow, then shrink by the same amount — fills any notch narrower
 * than the radius and leaves everything wider untouched. Real steps in an
 * apartment's outline are metres across; the notches are centimetres.
 */
export function smoothFootprint(
  rows: SpanRow[],
  radiusUnits: number,
  options?: { resolution?: number },
): SpanRow[] {
  if (rows.length === 0) return rows;
  const step = options?.resolution ?? (rows.length > 1 ? rows[1]!.y - rows[0]!.y : 2);
  const radius = Math.max(1, Math.round(radiusUnits / step));

  let minX = Infinity;
  let maxX = -Infinity;
  for (const row of rows) {
    for (const [a, b] of row.spans) {
      minX = Math.min(minX, a);
      maxX = Math.max(maxX, b);
    }
  }
  const pad = radius + 2;
  const originX = minX - pad * step;
  const originY = rows[0]!.y - pad * step;
  const w = Math.ceil((maxX - minX) / step) + pad * 2 + 2;
  const h = rows.length + pad * 2 + 2;

  const grid = new Uint8Array(w * h);
  rows.forEach((row, r) => {
    const y = r + pad;
    for (const [a, b] of row.spans) {
      const x0 = Math.max(0, Math.round((a - originX) / step));
      const x1 = Math.min(w - 1, Math.round((b - originX) / step));
      for (let x = x0; x <= x1; x++) grid[y * w + x] = 1;
    }
  });

  const grow = (src: Uint8Array) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!src[y * w + x]) continue;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) out[ny * w + nx] = 1;
          }
        }
      }
    }
    return out;
  };
  const shrink = (src: Uint8Array) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let keep = 1;
        for (let dy = -radius; dy <= radius && keep; dy++) {
          for (let dx = -radius; dx <= radius && keep; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h || !src[ny * w + nx]) keep = 0;
          }
        }
        out[y * w + x] = keep;
      }
    }
    return out;
  };

  const closed = shrink(grow(grid));
  const out: SpanRow[] = [];
  for (let y = 0; y < h; y++) {
    const spans: Array<[number, number]> = [];
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && closed[y * w + x] === 1;
      if (on && start < 0) start = x;
      else if (!on && start >= 0) {
        spans.push([originX + start * step, originX + x * step]);
        start = -1;
      }
    }
    if (spans.length > 0) out.push({ y: originY + y * step, spans });
  }
  return out;
}
