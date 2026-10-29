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
  /**
   * What found it.
   *
   * A hatched band is a wall because the draughtsman filled it in, and the
   * hatch is there to be trimmed and tested against later. A plotted pair is a
   * wall because it is two heavy lines a wall apart, and there is no hatch
   * under it to find — testing one against hatch deletes every partition on
   * the sheet, which is what the flat builder was doing.
   */
  source?: "hatch" | "plotted";
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
 * Closes a wall across a window the sheet draws as glazing lines.
 *
 * A window is drawn as thin parallel lines inside the wall's band, not as
 * hatch, so the hatched pieces either side of it stop short and the room
 * behind it is open to the outside. bridgeOpenings closes gaps up to a door's
 * width between pieces of one line; a wider window, or one that runs up to a
 * perpendicular wall, stays open. דירה 14's ממ"ד has a 1.40 m sliding window
 * between its west wall and the start of its north wall, the flood came in
 * through it, and the whole room was read as outdoors — so the flat came
 * back one bedroom short and the measured route was refused.
 *
 * A gap is closed only where thin lines run inside the wall's own band across
 * most of it. An open-plan passage or a doorway has no such lines and stays
 * open; furniture is not drawn inside a wall.
 */
export function bridgeGlazedGaps(
  bodies: WallBody[],
  segments: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  unitsPerMetre: number,
  options?: {
    maxGapM?: number;
    minCover?: number;
    /**
     * The flat's floor. A window is in the envelope — floor on one side, none
     * on the other — and only there is a glazed gap closed: an inside wall has
     * floor on both sides, and closing thin lines there split bathrooms and
     * bedrooms on four of the ten reference sheets.
     */
    floor?: SpanRow[];
  },
): WallBody[] {
  const maxGap = unitsPerMetre * (options?.maxGapM ?? 3);
  const floor = options?.floor ?? [];
  const onFloor = (x: number, y: number): boolean => {
    if (floor.length === 0) return false;
    let row = floor[0]!;
    for (const candidate of floor) if (Math.abs(candidate.y - y) < Math.abs(row.y - y)) row = candidate;
    const pitch = floor.length > 1 ? Math.abs(floor[1]!.y - floor[0]!.y) : 1;
    if (Math.abs(row.y - y) > pitch * 1.5) return false;
    return row.spans.some(([a, b]) => x >= a && x <= b);
  };
  const inEnvelope = (body: WallBody, mid: number): boolean => {
    if (floor.length === 0) return true;
    const reach = body.thickness / 2 + unitsPerMetre * 0.3;
    const [a, b] =
      body.orientation === "h"
        ? [onFloor(mid, body.centre - reach), onFloor(mid, body.centre + reach)]
        : [onFloor(body.centre - reach, mid), onFloor(body.centre + reach, mid)];
    return a !== b;
  };
  const minCover = options?.minCover ?? 0.7;
  const tolerance = unitsPerMetre * 0.1;
  const along = (seg: { x1: number; y1: number; x2: number; y2: number }, orientation: "h" | "v") => {
    const flat = orientation === "h" ? Math.abs(seg.y2 - seg.y1) < 0.7 : Math.abs(seg.x2 - seg.x1) < 0.7;
    if (!flat) return null;
    return orientation === "h"
      ? { at: (seg.y1 + seg.y2) / 2, from: Math.min(seg.x1, seg.x2), to: Math.max(seg.x1, seg.x2) }
      : { at: (seg.x1 + seg.x2) / 2, from: Math.min(seg.y1, seg.y2), to: Math.max(seg.y1, seg.y2) };
  };
  const out: WallBody[] = [];
  for (const body of bodies) {
    const low = body.centre - body.thickness / 2 - tolerance;
    const high = body.centre + body.thickness / 2 + tolerance;
    for (const dir of [-1, 1] as const) {
      const end = dir < 0 ? body.from : body.to;
      // The next wall along this one's line: a piece of the same wall, or a
      // wall across it whose band the line runs into.
      let stop: number | null = null;
      for (const other of bodies) {
        if (other === body) continue;
        let at: number | null = null;
        if (other.orientation === body.orientation) {
          if (!overlapAcross(body, other, 0.5)) continue;
          at = dir > 0 ? other.from : other.to;
        } else if (other.from - tolerance <= high && other.to + tolerance >= low) {
          // A wall across this one's band, not only across its centre line: a
          // corner is drawn with one wall stopping at the other's inner face.
          at = other.centre - (dir * other.thickness) / 2;
        }
        if (at == null || (at - end) * dir <= 0) continue;
        if (stop == null || (at - end) * dir < (stop - end) * dir) stop = at;
      }
      if (stop == null) continue;
      const from = Math.min(end, stop);
      const to = Math.max(end, stop);
      const gap = to - from;
      if (gap <= 0 || gap > maxGap) continue;
      // Glazing: thin lines inside this wall's band, laid along it, over the gap
      // — at least two of them, apart across the band, each covering most of
      // it. A window is drawn as two or three such lines; a single line on the
      // envelope is a railing or the edge of paving, and closing that shut a
      // bathroom off on דירה 15.
      const lines = segments
        .map((seg) => along(seg, body.orientation))
        .filter((line): line is NonNullable<typeof line> => line != null)
        .filter((line) => line.at >= low && line.at <= high && line.to > from && line.from < to);
      const coverAt = new Map<number, Array<readonly [number, number]>>();
      for (const line of lines) {
        const key = Math.round(line.at / (unitsPerMetre * 0.02));
        const list = coverAt.get(key) ?? [];
        list.push([Math.max(line.from, from), Math.min(line.to, to)] as const);
        coverAt.set(key, list);
      }
      const coveredBy = (pieces: Array<readonly [number, number]>) => {
        let covered = 0;
        let reach = from;
        for (const [a, b] of [...pieces].sort((p, q) => p[0] - q[0])) {
          if (b <= reach) continue;
          covered += b - Math.max(a, reach);
          reach = b;
        }
        return covered;
      };
      const glazedLines = [...coverAt.values()].filter((pieces) => coveredBy(pieces) >= gap * minCover).length;
      if (glazedLines < 2) continue;
      if (!inEnvelope(body, (from + to) / 2)) continue;
      if (out.some((kept) => kept.orientation === body.orientation && kept.centre === body.centre && kept.from === from && kept.to === to)) continue;
      out.push({ orientation: body.orientation, centre: body.centre, thickness: body.thickness, from, to, source: body.source });
    }
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
/** A terrace slider, the widest opening these sheets draw. */
const MAX_OPENING_M = 2.15;
/** How far a corner may be left open and still count as closed. */
const CORNER_REACH_M = 1.07;

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
    /**
     * The sheet's scale, so the two constants below can be metres.
     *
     * maxOpeningUnits and cornerReachUnits were swept on sheets drawn at about
     * 56 units per metre, where 120 and 60 units are 2.1 m and 1.1 m. On a
     * sheet drawn at 28 they are 4.3 m and 2.1 m: the corner patches alone
     * then cover a bedroom, and the rooms come back as slivers. Given a scale,
     * both are taken in metres and mean the same thing on any sheet.
     */
    unitsPerMetre?: number;
  },
): SpanRow[] {
  let step = options?.resolution ?? 2;
  // A terrace slider is the widest opening on these sheets at about 2.4 m.
  const upm = options?.unitsPerMetre;
  const maxOpening =
    options?.maxOpeningUnits ?? (upm && upm > 0 ? MAX_OPENING_M * upm : 120);
  // Corner reach decides whether the flat closes, and it is sharper than it
  // looks. Swept on דירה 14 against the 132.19 m² the sheet prints: at 0.9 m the
  // living room is still outside and the region measures 93 m²; at 1.2 m the
  // living room comes in and it measures 134.2; at 1.4 m it breaks through into
  // the neighbouring flat and measures 145. Widening the opening bridge instead
  // does nothing at all — 2 m, 3 m and 4 m all give the same 93 m² — so what was
  // holding the living room out was unclosed corners, not unbridged doorways.
  const reach =
    options?.cornerReachUnits ?? (upm && upm > 0 ? CORNER_REACH_M * upm : maxOpening / 2);
  const sealed = bridgeOpenings(closeCorners(bodies, reach), maxOpening);
  let w = Math.ceil(bounds.width / step) + 2;
  let h = Math.ceil(bounds.height / step) + 2;
  // A drawing in millimetres is tens of thousands of units across. A cell per
  // two units is then most of a gigabyte, and the process is killed before the
  // flood starts. The step doubles until the plate fits. A sales sheet never
  // reaches this: its flat is a few hundred cells on a side.
  while (w > 2 && h > 2 && w * h > 8_000_000 && step < bounds.width) {
    step *= 2;
    w = Math.ceil(bounds.width / step) + 2;
    h = Math.ceil(bounds.height / step) + 2;
  }
  if (w <= 2 || h <= 2 || w * h > 8_000_000) return [];

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
    for (let gy = 0; gy < h; gy++) {
      const py = bounds.y + (gy - 1) * step;
      // One row for this scanline. Searching it again at every cell made a
      // millimetre drawing walk the mask millions of times.
      const row = floorMask.find((r) => py >= r.y && py < r.y + maskPitch);
      for (let gx = 0; gx < w; gx++) {
        const px = bounds.x + (gx - 1) * step;
        const inside = !!row && row.spans.some(([a, b]) => px >= a && px <= b);
        if (!inside) grid[gy * w + gx] = WALL;
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
  options: { unitsPerMetre: number; keepOpenings?: boolean; plottedWalls?: boolean },
): WallBody[] {
  const hatched = wallBodiesFromHatch(segments, options).map(
    (body): WallBody => ({ ...body, source: "hatch" }),
  );
  // Only where the hatch rule is the one that cannot work. A sales sheet draws
  // its walls as hatched bands and its annotation thinner, and the pen-weight
  // reader adds nothing there but noise: on the reference batch it gained a
  // kitchen on one sheet and cost a terrace on another. A plotted sheet draws
  // everything at one weight and hatches almost nothing, which is the case
  // this reader exists for. wallInkThreshold is that test.
  // A DXF names its walls by layer and draws them as pairs, while the furniture
  // stays thin. That looks like a sales sheet to the ink test, and the pairs
  // would be dropped. The caller that already knows which lines are walls asks
  // for them.
  if (!options.plottedWalls && wallInkThreshold(segments) <= WALL_MIN_LINE_WIDTH) return hatched;
  // Duplicates and all: dropping a plotted pair because a hatched band covers
  // the same wall looks tidy and loses the wall outright whenever that band
  // later fails a hatch test. The caller knows which bands survived, so the
  // caller dedupes. See sameWall.
  const plotted = plottedWallBodies(segments, options.unitsPerMetre);
  return [...hatched, ...plotted];
}

/** Two bodies that are the same wall, found once by each detector. */
export function sameWall(a: WallBody, b: WallBody): boolean {
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
          source: "plotted",
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
        if (!hatchAlongBand(field, body, upm)) {
          // Hatch to one side of the band: one face is the wall's, the other
          // a line past it. The wall is the band from that face to the far
          // side of its hatch's middle. Dropped instead, 22's entrance wall
          // was left a 12 cm sliver with a gap by the door, and the living
          // room flooded out of it.
          const fitted = wallOnOneSide(field, body);
          if (
            fitted &&
            fitted.thickness >= minThickness &&
            field.density(bodyRect(fitted)) >= minDensity &&
            hatchFillsMiddle(field, fitted, minDensity) &&
            hatchAlongBand(field, fitted, upm, false)
          ) {
            bodies.push(fitted);
          }
          continue;
        }
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
  return trimThinToFaces(merged, segments, upm).filter((b) => b.to - b.from >= minLength);
}

/**
 * A thin wall held to its drawn faces. Joined across what looked like a
 * doorway, דירה 17's 8 cm partition ran on a metre and a half past its end,
 * along the axis line and a dimension's ticks, into the bathroom. A
 * partition's two face lines run the length of it, doorways aside: one whose
 * faces cover under 60 % of it is cut back to the longest stretch they do.
 */
export function trimThinToFaces(bodies: WallBody[], segments: VectorSegment[], upm: number): WallBody[] {
  const thin = 0.12 * upm;
  return bodies.flatMap((body) => {
    if (body.thickness > thin) return [body];
    const faces = [body.centre - body.thickness / 2, body.centre + body.thickness / 2];
    const spans: Array<[number, number]> = [];
    for (const seg of segments) {
      const vertical = Math.abs(seg.x1 - seg.x2) < 0.5;
      const horizontal = Math.abs(seg.y1 - seg.y2) < 0.5;
      if (body.orientation === "v" ? !vertical : !horizontal) continue;
      // An axis line's dashes lie on a face too; a face is drawn in lengths.
      if (Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) < 0.2 * upm) continue;
      const at = body.orientation === "v" ? seg.x1 : seg.y1;
      if (!faces.some((f) => Math.abs(f - at) <= 1.5)) continue;
      const a = Math.max(body.from, Math.min(body.orientation === "v" ? seg.y1 : seg.x1, body.orientation === "v" ? seg.y2 : seg.x2));
      const b = Math.min(body.to, Math.max(body.orientation === "v" ? seg.y1 : seg.x1, body.orientation === "v" ? seg.y2 : seg.x2));
      if (b > a) spans.push([a, b]);
    }
    spans.sort((p, q) => p[0] - q[0]);
    const union: Array<[number, number]> = [];
    for (const span of spans) {
      const last = union[union.length - 1];
      if (last && span[0] <= last[1] + 1) last[1] = Math.max(last[1], span[1]);
      else union.push([span[0], span[1]]);
    }
    const covered = union.reduce((sum, [a, b]) => sum + (b - a), 0);
    if (covered >= 0.6 * (body.to - body.from)) return [body];
    const longest = union.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
    return longest ? [{ ...body, from: longest[0], to: longest[1] }] : [];
  });
}

/**
 * The stubs that lie wholly inside a wall running the other way.
 *
 * A shaft or a column is drawn inside a wall as a crossed box, and its short
 * faces pair into a stub of wall across the wall it sits in. Left where it is,
 * the stub is hidden in that wall and harmless; but bridgeOpenings joins it to
 * the wall on its line and takes its faces — on דירה 14 the thin wall under the
 * guest WC grew 28 units up into the room, over the pan, and the WC lost the
 * fixture that makes it a bathroom. So a stub is kept and not joined.
 *
 * Only a stub, thicker than it is long: a partition that meets a wall inside
 * the wall's band is a wall. Dropping the stubs outright was tried and cost
 * דירה 14 its kitchen partition and its north terrace.
 */
export function stubsInsideCrossingWalls(bodies: WallBody[], tolerance = 1): WallBody[] {
  const rects = bodies.map(bodyRect);
  return bodies.filter((body, index) => {
    if (body.to - body.from >= body.thickness) return false;
    const r = rects[index]!;
    return bodies.some((other, j) => {
      if (other.orientation === body.orientation) return false;
      const o = rects[j]!;
      return (
        r.x >= o.x - tolerance &&
        r.x + r.w <= o.x + o.w + tolerance &&
        r.y >= o.y - tolerance &&
        r.y + r.h <= o.y + o.h + tolerance
      );
    });
  });
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
/**
 * Hatch along the band, not in a few places of it. A thin band's area is
 * small, so a handful of strokes makes it dense: a dimension line beside a
 * bath, with its 45° end ticks and the "165" written along it, measured as an
 * 8 cm wall 3 m long through דירה 17's bathroom. A wall is hatched the length
 * of it; three slices in five will do.
 */
export function hatchAlongBand(field: HatchField, body: WallBody, upm: number, centred = true): boolean {
  const rect = bodyRect(body);
  const length = body.to - body.from;
  const step = 0.25 * upm;
  if (length < step * 2) return true;
  const slices = Math.floor(length / step);
  let hatched = 0;
  for (let i = 0; i < slices; i++) {
    const slice =
      body.orientation === "h"
        ? { x: body.from + i * step, y: rect.y, w: step, h: rect.h }
        : { x: rect.x, y: body.from + i * step, w: rect.w, h: step };
    if (field.count(slice) > 0) hatched++;
  }
  if (hatched < 0.6 * slices) return false;
  // And centred across it. A stroke crosses its wall face to face, so its
  // middle — what the field holds — lies on the wall's middle. A band
  // bracketing a wall and the axis line beside it (22's bathroom: 47 cm where
  // the wall is 10, the dimension's figures between) has its hatch to one
  // side. Over 12 cm thick, the middle third holds most of it, or both outer
  // thirds share it.
  // Judged slice by slice: a band can run from a thin wall into a thick one
  // hatched across, and the whole band's count then looks centred.
  if (!centred || body.thickness <= 0.12 * upm) return true;
  let judged = 0;
  let oneSided = 0;
  for (let i = 0; i < slices; i++) {
    const lane = (k: number) =>
      field.count(
        body.orientation === "h"
          ? { x: body.from + i * step, y: rect.y + (rect.h * k) / 3, w: step, h: rect.h / 3 }
          : { x: rect.x + (rect.w * k) / 3, y: body.from + i * step, w: rect.w / 3, h: step },
      );
    const [c0, c1, c2] = [lane(0), lane(1), lane(2)];
    if (c0 + c1 + c2 === 0) continue;
    judged++;
    const centred = c1 >= 0.4 * (c0 + c1 + c2) || (Math.min(c0, c2) > 0 && Math.min(c0, c2) >= 0.25 * Math.max(c0, c2));
    if (!centred) oneSided++;
  }
  return judged > 0 && oneSided <= 0.4 * judged;
}

/**
 * The wall inside a band whose hatch lies to one side of it: from the face
 * the hatch is nearer to, out to the same distance past the hatch's middle —
 * a stroke crosses its wall face to face, so its middle is the wall's.
 */
export function wallOnOneSide(field: HatchField, body: WallBody): WallBody | null {
  const rect = bodyRect(body);
  const LANES = 9;
  let total = 0;
  let moment = 0;
  for (let k = 0; k < LANES; k++) {
    const n = field.count(
      body.orientation === "h"
        ? { x: rect.x, y: rect.y + (rect.h * k) / LANES, w: rect.w, h: rect.h / LANES }
        : { x: rect.x + (rect.w * k) / LANES, y: rect.y, w: rect.w / LANES, h: rect.h },
    );
    total += n;
    moment += n * ((k + 0.5) / LANES);
  }
  if (total === 0) return null;
  const middle = moment / total;
  if (middle > 0.4 && middle < 0.6) return null;
  const near = middle <= 0.5 ? 0 : 1;
  const thickness = 2 * Math.abs(middle - near) * body.thickness;
  const low = body.centre - body.thickness / 2;
  const from = near === 0 ? low : low + body.thickness - thickness;
  return { ...body, centre: from + thickness / 2, thickness };
}

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
 * The thick hatched walls the stroke cap loses.
 *
 * extractHatchStrokes caps a stroke at 0.45 m because the terrace paving's
 * diagonals run just under that, but 45° hatch across a ממ"ד wall hatched
 * 32 cm deep is 0.45 m too. Where a sheet is cut at the shelter's outer wall —
 * דירה 15 on its east side, דירה 17 on its west — that wall is the only thing
 * closing the shelter, and without it the shelter was outside the flat. So a
 * band at least 0.3 m thick, bracketed by two faces on the wall pen, is judged
 * against longer strokes as well: paving lies between a terrace's edges,
 * metres apart, not in a band a wall's width across.
 */
export function thickHatchedWalls(
  segments: VectorSegment[],
  known: WallBody[],
  unitsPerMetre: number,
  options?: { minDensity?: number; minLengthM?: number },
): WallBody[] {
  const upm = unitsPerMetre;
  const minDensity = options?.minDensity ?? 0.4;
  const minLength = (options?.minLengthM ?? 0.2) * upm;
  const maxThickness = MAX_THICKNESS_M * upm;
  const wallPen = segments.filter(
    (s) => isAxisAligned(s) && segmentLength(s) >= 3 && (s.lineWidth ?? 0) >= WALL_MIN_LINE_WIDTH,
  );
  const longField = new HatchField(extractHatchStrokes(segments, { maxStrokeLength: upm * 0.6 }));
  const penRuns = buildWallRuns(wallPen);
  const out: WallBody[] = [];
  for (const orientation of ["h", "v"] as const) {
    const faces = penRuns
      .filter((r) => r.orientation === orientation && r.to - r.from >= minLength)
      .sort((a, b) => a.at - b.at);
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        const a = faces[i]!;
        const b = faces[j]!;
        const gap = b.at - a.at;
        if (gap < upm * 0.3) continue;
        if (gap > maxThickness) break;
        const from = Math.max(a.from, b.from);
        const to = Math.min(a.to, b.to);
        if (to - from < minLength) continue;
        const body: WallBody = { orientation, centre: (a.at + b.at) / 2, thickness: gap, from, to };
        // Already found, along most of its length. sameWall is too loose here:
        // it matches on a fraction of the shorter body, and a 20-unit stub at a
        // corner was enough to hide the whole of דירה 15's shelter wall.
        const found = [...known, ...out].some(
          (other) =>
            other.orientation === orientation &&
            Math.abs(other.centre - body.centre) < gap / 2 &&
            Math.min(other.to, to) - Math.max(other.from, from) > (to - from) * 0.5,
        );
        if (found) continue;
        if (longField.density(bodyRect(body)) < minDensity) continue;
        if (!hatchFillsMiddle(longField, body, minDensity)) continue;
        out.push({ ...body, source: "hatch" });
      }
    }
  }
  return out;
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
  options?: Parameters<typeof interiorSpans>[2] & {
    /**
     * Do not join two rows across a measured wall that lies between them. Only
     * the segmenter asks for it; without it rows are joined by their place in
     * the list, as they always were.
     */
    separateAcrossWalls?: boolean;
    /**
     * The measured walls, for that test — not the sealed doorways among the
     * barriers. A doorway's seal is padded past the opening, and where it
     * reached into the band a bath leaves, it cut a bathroom in two.
     */
    walls?: WallBody[];
  },
): SpanRow[][] {
  const rows = interiorSpans(bodies, bounds, options);
  if (rows.length === 0) return [];
  // The true row pitch: the smallest step between rows. rows[1] - rows[0] is
  // wrong whenever the first two rows straddle a wall.
  let pitch = Infinity;
  for (let r = 1; r < rows.length; r++) {
    const step = rows[r]!.y - rows[r - 1]!.y;
    if (step > 0 && step < pitch) pitch = step;
  }
  if (!Number.isFinite(pitch)) pitch = 1;

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

  // Spans that overlap on consecutive rows are the same region — consecutive
  // on the page, not in this array. A wall that runs the full width of a region
  // leaves no interior row at all while it passes, so the row above it and the
  // row below it sat next to each other here and were joined straight through
  // the wall: on דירה 14 the top bedroom, the bedroom beside it and the living
  // room below came back as one 41 m² "bedroom".
  //
  // But a gap in the rows is not always a wall. A bath drawn across the full
  // width of a bathroom leaves a band with no interior in it exactly as a wall
  // does, and splitting there cut דירה 16, 17 and 20's bathrooms into halves
  // too small to keep. So the question is the one the drawing answers: is
  // there a measured wall in the gap, across the part the two spans share? A
  // wall separates two rooms; a bath does not.
  const separateRooms = options?.separateAcrossWalls === true;
  const horizontal = (options?.walls ?? bodies).filter((body) => body.orientation === "h");
  // Across most of where the two rows meet: a short wall in the gap — a
  // jamb, a wardrobe's end read as one — cut 21's twin bedroom along the
  // whole width of its beds, and its lower metre became a corridor.
  const wallBetween = (yAbove: number, yBelow: number, lo: number, hi: number) => {
    const pieces = horizontal
      .filter((body) => body.centre > yAbove && body.centre < yBelow && body.from < hi && body.to > lo)
      .map((body) => [Math.max(lo, body.from), Math.min(hi, body.to)] as const)
      .sort((p, q) => p[0] - q[0]);
    let covered = 0;
    let reach = lo;
    for (const [p0, p1] of pieces) {
      if (p1 <= reach) continue;
      covered += p1 - Math.max(p0, reach);
      reach = p1;
    }
    return covered >= (hi - lo) * 0.6;
  };
  for (let r = 1; r < rows.length; r++) {
    const gapped = separateRooms && rows[r]!.y - rows[r - 1]!.y > pitch * 1.5;
    for (const a of index.get(r - 1) ?? []) {
      for (const b of index.get(r) ?? []) {
        const [a0, a1] = nodes[a]!.span;
        const [b0, b1] = nodes[b]!.span;
        const lo = Math.max(a0, b0);
        const hi = Math.min(a1, b1);
        if (hi - lo <= 0) continue;
        if (gapped && wallBetween(rows[r - 1]!.y, rows[r]!.y + pitch, lo, hi)) continue;
        union(a, b);
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
  /** A door's leaf as the sheet draws it open, hinge to tip, page units. */
  leaf?: { x: number; y: number; dx: number; dy: number };
  /** A hatch gap a door swing is drawn round: a doorway whatever its floor says. */
  swung?: boolean;
};

/**
 * Openings taken from the drawing's own hatch.
 *
 * A wall on these sheets is two faces with hatch strokes between them, and a
 * door or a window is drawn by stopping the hatch and leaving the faces. The
 * gap-between-bodies rule cannot see that: the builder pairs the faces and the
 * body runs straight through. On דירה 14 it returned six openings for a flat
 * with nine doors and eight windows, the flood ran through what it missed, and
 * nine rooms came back as four.
 *
 * So the hatch is read directly. The strokes are the diagonal ink inside the
 * wall — dimension chains and furniture are drawn on the axes, faces run the
 * length of the wall — and a run of the wall with no stroke in it is an
 * opening. Only walls that are hatched in the first place are asked.
 */
export function findHatchGaps(
  bodies: WallBody[],
  segments: VectorSegment[],
  unitsPerMetre: number,
  options?: { minWidthM?: number; maxWidthM?: number; curves?: VectorSegment[] },
): Opening[] {
  if (bodies.length === 0) return [];
  const minWidth = (options?.minWidthM ?? 0.55) * unitsPerMetre;
  const curves = options?.curves ?? [];
  const maxWidth = (options?.maxWidthM ?? 3.2) * unitsPerMetre;
  const step = 0.08 * unitsPerMetre;

  const strokes = segments.filter((s) => {
    const length = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (!(length > 1 && length < unitsPerMetre * 0.9)) return false;
    const deg = Math.abs((Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI) % 180;
    return (deg > 25 && deg < 65) || (deg > 115 && deg < 155);
  });
  if (strokes.length === 0) return [];

  const out: Opening[] = [];
  for (const body of bodies) {
    const half = body.thickness / 2;
    const steps = Math.max(1, Math.ceil((body.to - body.from) / step));
    const hatched = new Array<boolean>(steps).fill(false);
    for (const stroke of strokes) {
      const mx = (stroke.x1 + stroke.x2) / 2;
      const my = (stroke.y1 + stroke.y2) / 2;
      const across = body.orientation === "h" ? my : mx;
      const along = body.orientation === "h" ? mx : my;
      if (across < body.centre - half || across > body.centre + half) continue;
      if (along < body.from || along > body.to) continue;
      hatched[Math.min(steps - 1, Math.max(0, Math.floor((along - body.from) / step)))] = true;
    }
    // A wall that is barely hatched is not hatched: its blank runs say nothing.
    if (hatched.filter(Boolean).length < steps * 0.25) continue;
    // A lone hatched cell in a blank run is a door frame's stroke, not wall:
    // one cut 22's front door to a 56 cm gap the rules then set aside.
    const lone = hatched.map((h, i) => h && !hatched[i - 1] && !hatched[i + 1] && !hatched[i - 2] && !hatched[i + 2]);
    lone.forEach((l, i) => { if (l) hatched[i] = false; });

    let run = 0;
    for (let i = 0; i <= steps; i++) {
      if (i < steps && !hatched[i]) {
        run++;
        continue;
      }
      if (run > 0) {
        const width = run * step;
        const to = body.from + i * step;
        // A blank run at either end of the wall is where the wall stops, not a
        // hole in it.
        const atStart = to - width <= body.from + step;
        const atEnd = to >= body.to - step;
        // Unless a door swings from it: the wall measured on through a door
        // at its end — 22's front door, the wall run on past it to the fire
        // cabinet on the landing — has its blank run there, and the arc.
        const from = to - width;
        const swung =
          (atStart || atEnd) &&
          width >= minWidth &&
          width <= unitsPerMetre * 1.3 &&
          [from, to].some((end) => {
            const hx = body.orientation === "h" ? end : body.centre;
            const hy = body.orientation === "h" ? body.centre : end;
            return (
              curves.filter((c) => Math.abs(Math.hypot((c.x1 + c.x2) / 2 - hx, (c.y1 + c.y2) / 2 - hy) - width) <= width * 0.2).length >= 4
            );
          });
        if (width >= minWidth && width <= maxWidth && ((!atStart && !atEnd) || swung)) {
          out.push({
            orientation: body.orientation,
            centre: body.centre,
            thickness: body.thickness,
            from: to - width,
            to,
            ...(swung ? { swung: true } : {}),
          });
        }
        run = 0;
      }
    }
  }
  return out;
}

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

  type Swing = { x: number; y: number; width: number; arcs: number; body: WallBody; side: number; tip: { x: number; y: number } };
  const swings: Swing[] = [];
  // Short strokes by grid cell, for the dashed swings below: scanned whole
  // for every leaf-length line, they made a sheet take minutes to measure.
  const cell = maxWidth;
  const dashCells = new Map<string, VectorSegment[]>();
  for (const d of segments) {
    const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
    if (len > maxWidth * 0.22 || len < unitsPerMetre * 0.02) continue;
    const key = `${Math.floor((d.x1 + d.x2) / 2 / cell)}:${Math.floor((d.y1 + d.y2) / 2 / cell)}`;
    const list = dashCells.get(key);
    if (list) list.push(d);
    else dashCells.set(key, [d]);
  }
  const dashesNear = (x: number, y: number): VectorSegment[] => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    const out: VectorSegment[] = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) out.push(...(dashCells.get(`${cx + i}:${cy + j}`) ?? []));
    return out;
  };
  for (const s of segments) {
    const width = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (width < minWidth || width > maxWidth) continue;
    const a = onWall(s.x1, s.y1);
    const b = onWall(s.x2, s.y2);
    // Exactly one end hinged: a line with both ends on walls is a wall, and one
    // with neither is furniture standing in the room.
    if ((a && b) || (!a && !b)) continue;
    const hinge = a ? { x: s.x1, y: s.y1 } : { x: s.x2, y: s.y2 };
    const tip = a ? { x: s.x2, y: s.y2 } : { x: s.x1, y: s.y1 };
    // A leaf ends free, or in its own thin end: a furniture edge runs on
    // round a corner. 17's beds, a line 70 cm from the wall to a corner with
    // the pillow's rounded corners at that radius, came out doors in the
    // outer walls. A stroke more than 12 cm long leaving the tip square to the
    // leaf is the next side of a piece, not a door.
    {
      const lx = (tip.x - (a ? s.x1 : s.x2)) / width;
      const ly = (tip.y - (a ? s.y1 : s.y2)) / width;
      const turns = segments.some((o) => {
        if (o === s) return false;
        const len = Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
        if (len < unitsPerMetre * 0.12) return false;
        const atTip = Math.hypot(o.x1 - tip.x, o.y1 - tip.y) < 2 || Math.hypot(o.x2 - tip.x, o.y2 - tip.y) < 2;
        if (!atTip) return false;
        const dot = Math.abs(((o.x2 - o.x1) * lx + (o.y2 - o.y1) * ly) / len);
        return dot < 0.3;
      });
      if (turns) continue;
    }
    const body = (a ?? b)!.body;
    // Which way along the wall the arc sweeps: the doorway runs from the
    // hinge that way, a door's width.
    // A leaf stands out from its wall, not along it: a line lying along the
    // wall is the wall's own face or a sill, and 17 got a door that way in the
    // wall between two bedrooms.
    {
      const ux = Math.abs(tip.x - hinge.x) / width;
      const uy = Math.abs(tip.y - hinge.y) / width;
      const alongWall = body.orientation === "h" ? ux : uy;
      if (alongWall > 0.85) continue;
    }
    let alongSum = 0;
    const alongOf = (mx: number, my: number) => (body.orientation === "h" ? mx - hinge.x : my - hinge.y);
    /**
     * The arc is measured at the middle of each chord, and stays that way.
     *
     * The midpoint of a long chord sits inside the radius — at 0.707 of it for
     * a quarter arc drawn as one segment — so a swing drawn that way is missed,
     * and on דירה 14 the detector returns two doors where the sheet draws nine.
     * Measuring the segment ENDS instead fixes that case and was tried on all
     * ten reference sheets: it finds more doors and they are the wrong ones.
     * Rooms fell from 8 to 6 on דירה 15, 10 to 6 on דירה 16, 5 to 2 on
     * דירה 21 — thirteen rooms lost across the set, because every false door
     * is sealed as a barrier and shreds a room into slivers that fall under the
     * minimum and vanish. Precision here is worth more than recall, and the
     * missing doors are better found from the hatch (findHatchGaps).
     */
    const angles: number[] = [];
    for (const c of curves) {
      const mx = (c.x1 + c.x2) / 2;
      const my = (c.y1 + c.y2) / 2;
      const d = Math.hypot(mx - hinge.x, my - hinge.y);
      if (Math.abs(d - width) > width * 0.18) continue;
      angles.push((Math.atan2(my - hinge.y, mx - hinge.x) * 180) / Math.PI);
      alongSum += alongOf(mx, my);
    }
    // A swing drawn dashed is short segments, not curves: 21's bottom
    // bedroom and 14's corridor had their doors drawn so, and came out
    // sealed. Dashes on the radius, off every wall, running along the arc,
    // count as it — the wall's own hatch at the radius lies in the wall.
    if (angles.length < minArc) {
      const dashes: number[] = [];
      let dashAlong = 0;
      for (const d of dashesNear(hinge.x, hinge.y)) {
        const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
        if (len > width * 0.22 || len < unitsPerMetre * 0.02) continue;
        const mx = (d.x1 + d.x2) / 2;
        const my = (d.y1 + d.y2) / 2;
        const dist = Math.hypot(mx - hinge.x, my - hinge.y);
        if (Math.abs(dist - width) > width * 0.12) continue;
        if (pointHitsBody(mx, my, bodies)) continue;
        const radial = Math.abs(((mx - hinge.x) * (d.x2 - d.x1) + (my - hinge.y) * (d.y2 - d.y1)) / (dist * len));
        if (radial > 0.5) continue;
        dashes.push((Math.atan2(my - hinge.y, mx - hinge.x) * 180) / Math.PI);
        dashAlong += alongOf(mx, my);
      }
      if (dashes.length >= 6) {
        angles.push(...dashes);
        alongSum += dashAlong;
      }
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
    swings.push({ ...hinge, width, arcs, body, side: Math.sign(alongSum), tip });
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
    // The leaf hinges at one edge of the doorway and the door fills its width
    // toward where its arc meets the wall. Centred on the hinge, the doorway
    // stood half a door off; where the arc does not say, it still is.
    const near = swing.side === 0 ? at - swing.width / 2 : at;
    const far = swing.side === 0 ? at + swing.width / 2 : at + swing.side * swing.width;
    const from = Math.max(swing.body.from, Math.min(near, far));
    const to = Math.min(swing.body.to, Math.max(near, far));
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
        // The leaf as the sheet draws it open, hinge to tip.
        leaf: { x: swing.x, y: swing.y, dx: swing.tip.x - swing.x, dy: swing.tip.y - swing.y },
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
  let w = Math.ceil((bounds.width + pad * 2) / step);
  let h = Math.ceil((bounds.height + pad * 2) / step);
  // A drawing in millimetres is tens of thousands of units across. A cell per
  // two units is then a multi-gigabyte grid, so the step doubles until the
  // plate fits. A sales sheet never reaches this.
  let used = step;
  while (w > 0 && h > 0 && w * h > 40_000_000 && used < bounds.width) {
    used *= 2;
    w = Math.ceil((bounds.width + pad * 2) / used);
    h = Math.ceil((bounds.height + pad * 2) / used);
  }
  if (w <= 0 || h <= 0 || w * h > 40_000_000) return [];
  const originX = bounds.x - pad;
  const originY = bounds.y - pad;
  const gx = (x: number) => Math.floor((x - originX) / used);
  const gy = (y: number) => Math.floor((y - originY) / used);

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
        spans.push([originX + start * used, originX + x * used]);
        start = -1;
      }
    }
    if (spans.length > 0) rows.push({ y: originY + y * used, spans });
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
  options?: {
    marginUnits?: number;
    unitsPerMetre?: number;
    /**
     * The flat's floor. A blank tail is only cut where it borders none of it.
     *
     * The longest-run rule alone cut real partitions whose hatch thins out at
     * one end: on דירה 19 and דירה 23 the last three metres of the wall
     * between two bedrooms went, and the two bedrooms came back as one. A wall
     * with floor on either side of it is a wall of this flat whatever its
     * hatch looks like; the grid line that made דירה 14's slab runs where the
     * flat has no floor at all.
     */
    floor?: SpanRow[];
  },
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
    // First-to-last is not enough. A band that starts on a real hatched wall
    // and runs on down the sheet only needs one stray diagonal near its far
    // end to keep its whole length: on דירה 14 a 2.5 m wall at the top of the
    // page became a 15.5 m slab 49 cm thick, standing in the render as a wall
    // of the flat and stretching the frame until the apartment sat small in
    // the middle of an empty picture. What the wall is, is its longest run of
    // hatch — with doorway-sized breaks bridged, because a doorway is a hole
    // in a wall and not the end of one.
    const along = points
      .filter((p) => {
        const across = body.orientation === "h" ? p.y : p.x;
        const at = body.orientation === "h" ? p.x : p.y;
        return across >= lowEdge && across <= highEdge && at >= body.from && at <= body.to;
      })
      .map((p) => (body.orientation === "h" ? p.x : p.y))
      .sort((a, b) => a - b);
    // How long a blank stretch has to be before it means the wall has ended
    // rather than that something is drawn through it.
    //
    // Measured on the ten reference sheets: at 1.4 m this cut real walls whose
    // hatch is sparse or interrupted by a wide opening, the floor flowed round
    // what was cut, and rooms merged — 58 rooms became 49, with דירה 16 losing
    // four. At 3 m every opening is bridged and what is still blank is the
    // sheet's grid: the 13 m of it that turned a 2.5 m wall into a 15.5 m slab.
    const bridge = (options?.unitsPerMetre ?? 0) > 0 ? (options!.unitsPerMetre as number) * 3 : Infinity;
    let runFrom = along[0]!;
    let runTo = along[0]!;
    let bestFrom = runFrom;
    let bestTo = runTo;
    for (let i = 1; i < along.length; i++) {
      const at = along[i]!;
      if (at - runTo <= bridge) {
        runTo = at;
      } else {
        if (runTo - runFrom > bestTo - bestFrom) {
          bestFrom = runFrom;
          bestTo = runTo;
        }
        runFrom = at;
        runTo = at;
      }
    }
    if (runTo - runFrom > bestTo - bestFrom) {
      bestFrom = runFrom;
      bestTo = runTo;
    }
    let from = Math.max(body.from, bestFrom - margin);
    let to = Math.min(body.to, bestTo + margin);
    const floor = options?.floor;
    const upm = options?.unitsPerMetre ?? 0;
    if (floor && floor.length > 1 && upm > 0) {
      const pitch = Math.abs(floor[1]!.y - floor[0]!.y) || 1;
      const reach = body.thickness / 2 + upm * 0.3;
      const floorBeside = (at: number) => {
        const probes =
          body.orientation === "h"
            ? [
                [at, body.centre - reach],
                [at, body.centre + reach],
              ]
            : [
                [body.centre - reach, at],
                [body.centre + reach, at],
              ];
        return probes.some(([x, y]) =>
          floor.some(
            (row) => y! >= row.y - pitch && y! <= row.y + pitch && row.spans.some(([a, b]) => x! >= a && x! <= b),
          ),
        );
      };
      const bordersFloor = (a: number, b: number) => {
        const step = upm * 0.25;
        for (let at = a; at <= b; at += step) if (floorBeside(at)) return true;
        return false;
      };
      // Keep a tail the flat's floor runs beside; cut only what borders none.
      if (from > body.from && bordersFloor(body.from, from)) from = body.from;
      if (to < body.to && bordersFloor(to, body.to)) to = body.to;
    }
    return { ...body, from, to };
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

/**
 * The flat's floor without the landing outside its front door.
 *
 * The scanline footprint fills whatever lies between a row's outermost walls,
 * and on a sheet cut close to the flat that includes the stair hall: on
 * דירה 15 and 17 it added the landing to the floor and put the area error at
 * 10% and 7% once the ממ"ד was read. The sheet marks the landing itself — its
 * entrance arrow stands on it, outside the door — so the floor is flooded from
 * the arrow with the walls and every opening, the front door included, as
 * barriers. What that reaches is the landing, and it is taken off.
 *
 * Only a small piece: a flood that reaches more than a fifth of the floor has
 * come in through an opening that was not found, and nothing is taken off.
 */
export function floorWithoutLanding(
  floor: SpanRow[],
  barriers: WallBody[],
  markers: Array<{ x: number; y: number }>,
  unitsPerMetre: number,
  options?: { maxShare?: number },
): SpanRow[] {
  if (floor.length < 2 || markers.length === 0) return floor;
  const maxShare = options?.maxShare ?? 0.2;
  const step = Math.max(1, floor[1]!.y - floor[0]!.y);
  const rowAt = (y: number) => {
    const index = Math.round((y - floor[0]!.y) / step);
    return index >= 0 && index < floor.length ? index : -1;
  };
  const open = (x: number, y: number) => {
    const index = rowAt(y);
    if (index < 0) return false;
    return floor[index]!.spans.some(([a, b]) => x >= a && x <= b) && !pointHitsBody(x, y, barriers);
  };
  const total = spanArea(floor) / (step * step);
  // The seed is on the arrow's side of the door: reached from the arrow with
  // no wall or opening crossed. 22's arrow stands over its front door, and the
  // nearest floor was the hall inside it — which was taken off as the landing.
  const inReach = (from: { x: number; y: number }, x: number, y: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / (step / 2)));
    for (let k = 0; k <= n; k++) {
      if (pointHitsBody(from.x + ((x - from.x) * k) / n, from.y + ((y - from.y) * k) / n, barriers)) return false;
    }
    return true;
  };
  const removed = new Set<string>();
  for (const marker of markers) {
    let seed: { x: number; y: number } | null = null;
    const search = Math.round((unitsPerMetre * 0.4) / step);
    for (let r = 0; r <= search && !seed; r++) {
      for (let a = -r; a <= r && !seed; a++) {
        for (let b = -r; b <= r && !seed; b++) {
          const x = marker.x + a * step;
          const y = marker.y + b * step;
          if (open(x, y) && inReach(marker, x, y)) seed = { x: Math.round(x / step) * step, y: floor[rowAt(y)]!.y };
        }
      }
    }
    if (!seed) continue;
    const seen = new Set<string>();
    const key = (x: number, y: number) => `${Math.round(x / step)}:${Math.round(y / step)}`;
    const stack = [seed];
    seen.add(key(seed.x, seed.y));
    let leaked = false;
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.size > total * maxShare) {
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
        const k = key(x, y);
        if (seen.has(k) || !open(x, y)) continue;
        seen.add(k);
        stack.push({ x, y });
      }
    }
    if (!leaked) for (const k of seen) removed.add(k);
  }
  if (removed.size === 0) return floor;
  return floor
    .map((row) => {
      const yi = Math.round(row.y / step);
      const spans: Array<[number, number]> = [];
      for (const [a, b] of row.spans) {
        let start: number | null = null;
        for (let xi = Math.ceil(a / step); xi <= Math.floor(b / step) + 1; xi++) {
          const inside = xi * step <= b && !removed.has(`${xi}:${yi}`);
          if (inside && start == null) start = Math.max(a, xi * step);
          if (!inside && start != null) {
            spans.push([start, Math.min(b, xi * step)]);
            start = null;
          }
        }
      }
      return { y: row.y, spans };
    })
    .filter((row) => row.spans.length > 0);
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
 * Where the sheet marks a terrace's level: a circle with two quarters hatched.
 *
 * Every terrace on these sheets carries one beside its "+9.64", and it is the
 * one seed a terrace has when its area is drawn as outlines rather than text —
 * דירה 14's 6.4 m² west terrace has no figure the text layer can read, so it
 * was never looked for. The circle is drawn as four quarter arcs, each reaching
 * the curve list as one chord; the hatch is short diagonal strokes inside it.
 *
 * The flat's own level mark, in the box with its number and gross area, is the
 * same symbol drawn smaller — about 10 cm across the radius where a terrace's
 * is 14 to 20 — and is left out by size.
 */
export function findLevelMarks(
  curves: VectorSegment[],
  segments: VectorSegment[],
  unitsPerMetre: number,
  options?: { minRadiusM?: number; maxRadiusM?: number; minHatch?: number },
): Array<{ x: number; y: number; r: number; strokes: VectorSegment[] }> {
  const minR = (options?.minRadiusM ?? 0.12) * unitsPerMetre;
  const maxR = (options?.maxRadiusM ?? 0.25) * unitsPerMetre;
  const minHatch = options?.minHatch ?? 6;
  // A quarter chord runs from one cardinal point to the next, so its centre is
  // the corner of its box on the far side of the arc: one of two candidates.
  // A circle is where four chords vote for the same centre.
  const votes = new Map<string, { x: number; y: number; r: number; n: number }>();
  for (const c of curves) {
    const dx = Math.abs(c.x2 - c.x1);
    const dy = Math.abs(c.y2 - c.y1);
    if (dx < minR || dx > maxR || Math.abs(dx - dy) > 0.6) continue;
    for (const [x, y] of [
      [c.x1, c.y2],
      [c.x2, c.y1],
    ] as const) {
      const key = `${Math.round(x)}:${Math.round(y)}`;
      const vote = votes.get(key) ?? { x, y, r: dx, n: 0 };
      vote.n++;
      votes.set(key, vote);
    }
  }
  const out: Array<{ x: number; y: number; r: number; strokes: VectorSegment[] }> = [];
  for (const vote of votes.values()) {
    if (vote.n < 4) continue;
    const hatch = segments.filter((s) => {
      const dx = Math.abs(s.x2 - s.x1);
      const dy = Math.abs(s.y2 - s.y1);
      if (dx < 0.5 || Math.abs(dx - dy) > 0.3 * Math.max(dx, dy)) return false;
      return Math.hypot((s.x1 + s.x2) / 2 - vote.x, (s.y1 + s.y2) / 2 - vote.y) < vote.r;
    });
    if (hatch.length >= minHatch) out.push({ x: vote.x, y: vote.y, r: vote.r, strokes: hatch });
  }
  return out;
}

/** A level figure's strokes, scaled to a text height of one. */
export type LevelText = { segs: Array<[number, number, number, number]>; width: number };

/**
 * The level printed beside a ⊕ mark, as strokes.
 *
 * The figure is drawn in outlines, not text, so it cannot be read — but it
 * does not have to be. Every level on a sheet is set in the same CAD font, so
 * "+11.42" beside a terrace is the same strokes as "+11.42" in the flat's
 * label, whatever size each is set at. דירה 18 and 22 are one drawing at two
 * storeys: the same terraces, the flat's own on 18 (+11.42 beside +11.42) and
 * the roofs of the storey below 22's (+14.36 beside +11.42).
 *
 * The figure is the line of strokes sitting on the mark's own line, to the
 * right of the circle; a line above it (the label's "59.01 מ״ר") is another
 * line and is left out.
 */
export function levelTextAt(
  mark: { x: number; y: number; r: number },
  segments: VectorSegment[],
  curves: VectorSegment[],
): LevelText | null {
  const r = mark.r;
  const near = [...segments, ...curves].filter((s) => {
    const cx = (s.x1 + s.x2) / 2;
    const cy = (s.y1 + s.y2) / 2;
    return (
      cx > mark.x + r * 0.9 &&
      cx < mark.x + r * 9 &&
      cy < mark.y - r * 0.15 &&
      cy > mark.y - r * 2.6 &&
      Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < r * 2
    );
  });
  // The figure is set in one pen, heavier than the paving's joints — which
  // outnumber it on a paved terrace. Each pen is tried, heaviest first.
  const pens = [...new Set(near.map((s) => s.lineWidth))].sort((a, b) => b - a);
  for (const pen of pens) {
    const text = figureIn(near.filter((s) => s.lineWidth === pen), r);
    if (text) return text;
  }
  return null;
}

function figureIn(inPen: VectorSegment[], r: number): LevelText | null {
  if (inPen.length < 8) return null;
  // Lines of text, by their vertical extent; the lowest is the figure.
  const spans = inPen
    .map((s) => ({ s, lo: Math.min(s.y1, s.y2), hi: Math.max(s.y1, s.y2) }))
    .sort((a, b) => b.hi - a.hi);
  const lineOf: typeof spans = [];
  let top = Infinity;
  // A figure stands about its mark's radius tall; lettering just above it
  // ("מ"ר" over 21's "+15.94") is not taken into the line.
  const bottom = spans[0]?.hi ?? 0;
  for (const span of spans) {
    if (lineOf.length > 0 && span.hi < top - r * 0.25) break;
    if (span.lo < bottom - r * 1.5) continue;
    lineOf.push(span);
    top = Math.min(top, span.lo);
  }
  const strokes = lineOf.map((span) => span.s);
  if (strokes.length < 8) return null;
  const xs = strokes.flatMap((s) => [s.x1, s.x2]);
  const ys = strokes.flatMap((s) => [s.y1, s.y2]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const h = Math.max(...ys) - y0;
  if (!(h > 0)) return null;
  const width = (Math.max(...xs) - x0) / h;
  // A level is a sign, digits and a point: several characters wide.
  if (width < 3 || width > 6.5) return null;
  return {
    width,
    segs: strokes.map((s) => [(s.x1 - x0) / h, (s.y1 - y0) / h, (s.x2 - x0) / h, (s.y2 - y0) / h]),
  };
}

/** Whether two level figures are the same figure: stroke for stroke. */
export function sameLevelText(a: LevelText, b: LevelText): boolean {
  const d = (p: readonly number[], q: readonly number[]) =>
    Math.min(
      Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!) + Math.hypot(p[2]! - q[2]!, p[3]! - q[3]!),
      Math.hypot(p[0]! - q[2]!, p[1]! - q[3]!) + Math.hypot(p[2]! - q[0]!, p[3]! - q[1]!),
    );
  const found = (from: LevelText["segs"], into: LevelText["segs"]) =>
    from.filter((p) => into.some((q) => d(p, q) < 0.15)).length / Math.max(1, from.length);
  return Math.min(found(a.segs, b.segs), found(b.segs, a.segs)) >= 0.85;
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
  options?: {
    tolerance?: number;
    /** What an unlabelled seed's region may measure; see findTerraces. */
    unlabelledM2?: { min: number; max: number };
    /**
     * Give an unlabelled region its rim back too. Only for a seed known to be
     * a terrace by other means — its level is the flat's; grown blind, a
     * roof's region reached the size window.
     */
    growRim?: boolean;
  },
): Terrace[] {
  if (floor.length === 0 || areas.length === 0 || !(unitsPerMetre > 0)) return [];
  const tolerance = options?.tolerance ?? 0.25;
  const unlabelled = options?.unlabelledM2 ?? { min: 2.5, max: 16 };
  const pitch = floor.length > 1 ? floor[1]!.y - floor[0]!.y : 2;
  const step = Math.max(1, pitch);
  const onFloor = (x: number, y: number) => spansContain(floor, x, y);
  // Open ground, with floor on every side of it. The footprint is closed by a
  // third of a metre, which leaves a hairline of "floor" along the outside of
  // a wall; on דירה 14 the 3.16 m² roof terrace walked up that line to the
  // west terrace, measured 5.9 m² and was dropped.
  const open = (x: number, y: number) =>
    onFloor(x, y) &&
    onFloor(x + step, y) &&
    onFloor(x - step, y) &&
    onFloor(x, y + step) &&
    onFloor(x, y - step) &&
    !pointHitsBody(x, y, bodies);
  const out: Terrace[] = [];

  for (const area of areas) {
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
      ((area.value ?? unlabelled.max) * (1 + tolerance) * 1.5 * unitsPerMetre * unitsPerMetre) /
        (step * step),
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
        if (seen.has(key) || !open(x, y)) continue;
        seen.add(key);
        stack.push({ x, y });
      }
    }
    if (leaked) continue;
    // Given back the rim the "open" test held it off: the floor the flood
    // passed by along each edge is the terrace's too, and without it a 3.16 m²
    // roof terrace measured 2.19 and failed its own printed figure. Only where
    // there is a figure to check it against: grown, an unlabelled region from a
    // level mark reached the size window on דירה 22's roof below the flat, and
    // made two terraces the flat does not have.
    for (const cell of area.value != null || options?.growRim ? [...cells] : []) {
      for (const [dx, dy] of [
        [step, 0],
        [-step, 0],
        [0, step],
        [0, -step],
      ] as const) {
        const x = cell.x + dx;
        const y = cell.y + dy;
        const key = `${Math.round(x / step)}:${Math.round(y / step)}`;
        if (seen.has(key) || !onFloor(x, y) || pointHitsBody(x, y, bodies)) continue;
        seen.add(key);
        cells.push({ x, y });
      }
    }
    // A terrace known by its level is paved and lettered, and every joint in
    // the paving, every outlined letter of "שטח המרפסת" and the ⊕ itself stop
    // the flood: דירה 18's 8 m² terrace flooded to 2.9. Inside the box the
    // flood already spans, everything but wall is filled back, and nothing
    // past the box is touched.
    if (options?.growRim) {
      let bx0 = Infinity;
      let bx1 = -Infinity;
      let by0 = Infinity;
      let by1 = -Infinity;
      for (const cell of cells) {
        bx0 = Math.min(bx0, cell.x);
        bx1 = Math.max(bx1, cell.x);
        by0 = Math.min(by0, cell.y);
        by1 = Math.max(by1, cell.y);
      }
      const has = (x: number, y: number) => seen.has(`${Math.round(x / step)}:${Math.round(y / step)}`);
      for (let round = 0; round < 400; round++) {
        let grew = false;
        for (const cell of [...cells]) {
          for (const [dx, dy] of [
            [step, 0],
            [-step, 0],
            [0, step],
            [0, -step],
          ] as const) {
            const x = cell.x + dx;
            const y = cell.y + dy;
            if (x < bx0 || x > bx1 || y < by0 || y > by1 || has(x, y) || pointHitsBody(x, y, bodies)) continue;
            seen.add(`${Math.round(x / step)}:${Math.round(y / step)}`);
            cells.push({ x, y });
            grew = true;
          }
        }
        if (!grew) break;
      }
    }
    const floodedM2 = (cells.length * step * step) / (unitsPerMetre * unitsPerMetre);
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
      ...(area.value != null ? { printedM2: area.value } : {}),
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
  const hatched = wallBodiesFromHatch(segments, { unitsPerMetre });
  // With the thick walls the stroke cap loses: דירה 15 and 17 are cut at a
  // ממ"ד's outer wall, and an extent that stops short of it leaves the shelter
  // outside everything measured from it.
  const bodies = clipBodiesToBounds(
    [...hatched, ...thickHatchedWalls(segments, hatched, unitsPerMetre, { minLengthM: 1.2 })],
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

/**
 * A paved terrace taken from its paving. The flood runs on the flat's
 * footprint and stops only at wall: it ran past a terrace's thin edge line
 * (18's 4.6 m², down to the bedroom wall below it), was cut where the
 * footprint ends (18's and 22's 8 m², at the sheet's flat extent) and was
 * split by a level mark's leader (22's). The joints say where the terrace is:
 * strokes of the joints' own weight, square to the sheet, touching one
 * another, grown from the ones the flood holds. The region is their extent,
 * less wall.
 *
 * Left as flooded where there is no paving, where the paving reaches a piece
 * of furniture — then it is not a terrace's joints it found — or where it
 * comes out more than three times the flood or past what a terrace measures.
 */
export function terraceFromPaving(
  rows: SpanRow[],
  segments: ReadonlyArray<VectorSegment>,
  bodies: WallBody[],
  furniture: ReadonlyArray<{ x: number; y: number; w: number; h: number }>,
  unitsPerMetre: number,
  /** Whether the region found may stand; see the caller's level check. */
  accept: (region: SpanRow[]) => boolean = () => true,
  /**
   * Seed from every stroke that crosses the rows, not only those whose middle
   * lies in them: a small square round a level mark holds few joints' middles.
   */
  seedByCrossing = false,
): SpanRow[] {
  if (rows.length === 0) return rows;
  const pitch = rows.length > 1 ? Math.abs(rows[1]!.y - rows[0]!.y) || 1 : 1;
  const area = (list: SpanRow[]) => list.reduce((t, r) => t + r.spans.reduce((u, [a, b]) => u + (b - a), 0), 0) * pitch;
  const square = (s: VectorSegment) => {
    const length = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    return (
      // A joint runs a tile's side at least; the outlined letters of
      // "שטח המרפסת", strokes of a hand's length, are not paving, and on
      // דירה 22 they spilled the terrace past its edge.
      length >= unitsPerMetre * 0.25 &&
      length <= unitsPerMetre * 8 &&
      Math.min(Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1)) <= length * 0.02
    );
  };
  const inRows = (s: VectorSegment) => {
    if (spansContain(rows, (s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2)) return true;
    if (!seedByCrossing) return false;
    const n = Math.max(2, Math.ceil(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / 2));
    for (let k = 0; k <= n; k++) {
      if (spansContain(rows, s.x1 + ((s.x2 - s.x1) * k) / n, s.y1 + ((s.y2 - s.y1) * k) / n)) return true;
    }
    return false;
  };
  const held = segments.filter((s) => square(s) && inRows(s));
  // Six will do: the cluster grows from them, and 22's 3.3 m² terrace
  // flooded only the lower half of its paving, eleven joints of it.
  if (held.length < 6) return rows;
  // The joints' weights: those of the strokes the flood holds. One will not
  // do — 22's 3.3 m² terrace is paved in 2 and 4 and edged in 5, and the
  // edge is what joins its rows.
  const weights = new Set(held.map((s) => s.lineWidth));
  // A stroke along a wall is the wall's: 18's facade, drawn in the terrace
  // edge's own pen, carried the joints past the wall into the terrace of the
  // storey above. A joint that only ends on a wall is still a joint.
  const margin = unitsPerMetre * 0.03;
  const alongWall = (s: VectorSegment) => {
    const n = Math.max(2, Math.ceil(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / (unitsPerMetre * 0.1)));
    let on = 0;
    for (let k = 0; k <= n; k++) {
      const x = s.x1 + ((s.x2 - s.x1) * k) / n;
      const y = s.y1 + ((s.y2 - s.y1) * k) / n;
      if (
        bodies.some((body) => {
          const r = bodyRect(body);
          return x >= r.x - margin && x <= r.x + r.w + margin && y >= r.y - margin && y <= r.y + r.h + margin;
        })
      ) {
        on++;
      }
    }
    return on >= 0.3 * (n + 1);
  };
  const ys = rows.map((r) => r.y);
  const xs = rows.flatMap((r) => r.spans.flat());
  // First with a reach of three metres round the flood; where that runs on
  // into what is not this terrace, again with half a metre: on דירה 18 the
  // sheet's edge line, four metres long, joined its terrace's paving to the
  // +12.79 terrace of the storey above.
  const attempt = (reachM: number): SpanRow[] | null => {
    const reach = unitsPerMetre * reachM;
    const box = {
      x0: Math.min(...xs) - reach,
      x1: Math.max(...xs) + reach,
      y0: Math.min(...ys) - reach,
      y1: Math.max(...ys) + reach,
    };
    // Clipped to the reach, not dropped at it: a terrace's paving is joined
    // by its edge lines, and those run on past it.
    const clip = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const pool = segments
      .filter(
        (s) =>
          weights.has(s.lineWidth) &&
          square(s) &&
          Math.max(s.x1, s.x2) >= box.x0 &&
          Math.min(s.x1, s.x2) <= box.x1 &&
          Math.max(s.y1, s.y2) >= box.y0 &&
          Math.min(s.y1, s.y2) <= box.y1 &&
          !alongWall(s),
      )
      .map((s) => ({
        ...s,
        x1: clip(s.x1, box.x0, box.x1),
        x2: clip(s.x2, box.x0, box.x1),
        y1: clip(s.y1, box.y0, box.y1),
        y2: clip(s.y2, box.y0, box.y1),
      }));
    const touch = unitsPerMetre * 0.02;
    const near = (p: { x: number; y: number }, s: VectorSegment) => {
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / len2));
      return Math.hypot(p.x - (s.x1 + t * dx), p.y - (s.y1 + t * dy)) <= touch;
    };
    const touches = (a: VectorSegment, b: VectorSegment) =>
      near({ x: a.x1, y: a.y1 }, b) ||
      near({ x: a.x2, y: a.y2 }, b) ||
      near({ x: b.x1, y: b.y1 }, a) ||
      near({ x: b.x2, y: b.y2 }, a);
    const inCluster = new Set<number>();
    const queue: number[] = [];
    // Seeded from strokes of a grid: each touches another the flood holds. A
    // stroke alone is not paving — 22's "191" dimension line, in a flood that
    // had leaked past its terrace, carried the terrace down to it.
    const inFlood = pool.filter(inRows);
    pool.forEach((s, i) => {
      if (inFlood.includes(s) && pool.some((o) => o !== s && touches(s, o))) {
        inCluster.add(i);
        queue.push(i);
      }
    });
    if (queue.length === 0) return null;
    while (queue.length > 0) {
      const a = pool[queue.pop()!]!;
      pool.forEach((b, j) => {
        if (inCluster.has(j) || !touches(a, b)) return;
        inCluster.add(j);
        queue.push(j);
      });
    }
    const joints = [...inCluster].map((i) => pool[i]!);
    let x0 = Math.min(...joints.flatMap((s) => [s.x1, s.x2]));
    let x1 = Math.max(...joints.flatMap((s) => [s.x1, s.x2]));
    let y0 = Math.min(...joints.flatMap((s) => [s.y1, s.y2]));
    let y1 = Math.max(...joints.flatMap((s) => [s.y1, s.y2]));
    // Out to the terrace's edge: the paving stops short of its railing, and
    // the printed area is to the railing — 22's 8 m² measured 5.4 to the last
    // joint. Each side moves out to the line along it within 45 cm that runs
    // most of its length.
    const out45 = unitsPerMetre * 0.45;
    // A dimension line is no edge: it carries its ticks — at 45°, or square
    // across it — where its extension lines meet it: 22's "191" under its
    // terrace.
    const ticks = segments.filter((t) => {
      const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
      if (len > unitsPerMetre * 0.2 || len < unitsPerMetre * 0.02) return false;
      const deg = ((Math.atan2(t.y2 - t.y1, t.x2 - t.x1) * 180) / Math.PI + 180) % 90;
      return Math.abs(deg - 45) < 10;
    });
    const shortSquare = segments.filter((t) => {
      const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
      return len <= unitsPerMetre * 0.2 && len >= unitsPerMetre * 0.04 && (Math.abs(t.x2 - t.x1) <= 1 || Math.abs(t.y2 - t.y1) <= 1);
    });
    const isDimensionLine = (s: VectorSegment) => {
      const horizontal = Math.abs(s.y2 - s.y1) <= 1;
      const pos = horizontal ? (s.y1 + s.y2) / 2 : (s.x1 + s.x2) / 2;
      const a = horizontal ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2);
      const b = horizontal ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2);
      // Where a short stroke crosses the line, end to end on both sides.
      const crossAt = (t: VectorSegment): number | null => {
        const [p, q] = horizontal ? [t.y1 - pos, t.y2 - pos] : [t.x1 - pos, t.x2 - pos];
        if (!(p * q < 0)) return null;
        const f = p / (p - q);
        return horizontal ? t.x1 + (t.x2 - t.x1) * f : t.y1 + (t.y2 - t.y1) * f;
      };
      const marks = [...ticks, ...shortSquare].map(crossAt).filter((v): v is number => v != null);
      // One at each end: the hatch of the wall a railing starts from crosses
      // it at that end only.
      const reachEnd = unitsPerMetre * 0.12;
      return marks.some((m) => Math.abs(m - a) <= reachEnd) && marks.some((m) => Math.abs(m - b) <= reachEnd);
    };
    const edgeOut = (side: "x0" | "x1" | "y0" | "y1"): number => {
      const horizontal = side === "y0" || side === "y1";
      const at = side === "x0" ? x0 : side === "x1" ? x1 : side === "y0" ? y0 : y1;
      const sign = side === "x0" || side === "y0" ? -1 : 1;
      const [lo, hi] = horizontal ? [x0, x1] : [y0, y1];
      // Collinear pieces together: an edge is often drawn in several, split
      // where a diagonal or a railing post meets it.
      const cover = new Map<number, Array<[number, number]>>();
      for (const s of segments) {
        if (horizontal ? Math.abs(s.y2 - s.y1) > 1 : Math.abs(s.x2 - s.x1) > 1) continue;
        const d = Math.round(((horizontal ? (s.y1 + s.y2) / 2 : (s.x1 + s.x2) / 2) - at) * sign);
        if (d <= 0 || d > out45 || isDimensionLine(s)) continue;
        const a = Math.max(lo, horizontal ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2));
        const b = Math.min(hi, horizontal ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2));
        if (b > a) cover.set(d, [...(cover.get(d) ?? []), [a, b]]);
      }
      const covered = (spans: Array<[number, number]>) => {
        let total = 0;
        let end = -Infinity;
        for (const [a, b] of [...spans].sort((p, q) => p[0] - q[0])) {
          if (b <= end) continue;
          total += b - Math.max(a, end);
          end = b;
        }
        return total;
      };
      const lines = [...cover.entries()]
        .filter(([, spans]) => covered(spans) >= 0.6 * (hi - lo))
        .map(([d]) => d)
        .sort((p, q) => p - q);
      // The nearest, and on only to a line hard by it — a railing drawn
      // double. Past that is the next thing: 22's "191" dimension line.
      let reached = 0;
      for (const d of lines) {
        if (reached > 0 && d - reached > unitsPerMetre * 0.12) break;
        reached = d;
      }
      return at + reached * sign;
    };
    [x0, x1, y0, y1] = [edgeOut("x0"), edgeOut("x1"), edgeOut("y0"), edgeOut("y1")];
    if (furniture.some((p) => {
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      return cx > x0 && cx < x1 && cy > y0 && cy < y1;
    })) {
      return null;
    }
    // A short wall standing mostly inside the paving is the sheet's ink, not
    // a wall: 22's level mark's leader and lettering, read as stubs into its
    // terrace, cut it in two.
    const standing = bodies.filter((body) => {
      const r = bodyRect(body);
      const ox = Math.min(r.x + r.w, x1) - Math.max(r.x, x0);
      const oy = Math.min(r.y + r.h, y1) - Math.max(r.y, y0);
      const inside = ox > 0 && oy > 0 ? (ox * oy) / (r.w * r.h) : 0;
      if (inside >= 0.5 && body.to - body.from <= unitsPerMetre * 1.5) return false;
      // Nor one that ends out on the paving, a stub into it: a divider runs
      // the terrace's depth, and 22's bathroom wall, run on past the facade,
      // cut its terrace in two.
      const end = unitsPerMetre * 0.15;
      const endsInside =
        body.orientation === "v"
          ? (body.to > y0 + end && body.to < y1 - end) || (body.from > y0 + end && body.from < y1 - end)
          : (body.to > x0 + end && body.to < x1 - end) || (body.from > x0 + end && body.from < x1 - end);
      const across = body.orientation === "v" ? r.x + r.w / 2 > x0 && r.x + r.w / 2 < x1 : r.y + r.h / 2 > y0 && r.y + r.h / 2 < y1;
      if (endsInside && across) return false;
      // Nor one the joints run straight across: a real wall stops the paving.
      const crossed = joints.some((j) =>
        body.orientation === "v"
          ? Math.abs(j.y2 - j.y1) < 1 &&
            Math.min(j.x1, j.x2) < r.x &&
            Math.max(j.x1, j.x2) > r.x + r.w &&
            j.y1 > r.y &&
            j.y1 < r.y + r.h
          : Math.abs(j.x2 - j.x1) < 1 &&
            Math.min(j.y1, j.y2) < r.y &&
            Math.max(j.y1, j.y2) > r.y + r.h &&
            j.x1 > r.x &&
            j.x1 < r.x + r.w,
      );
      return !crossed;
    });
    const out: SpanRow[] = [];
    const step = pitch;
    for (let y = y0 + step / 2; y < y1; y += step) {
      const spans: Array<[number, number]> = [];
      let start: number | null = null;
      for (let x = x0; x <= x1 + step / 2; x += step) {
        const on = x <= x1 && !pointHitsBody(x, y, standing);
        if (on && start == null) start = x;
        if (!on && start != null) {
          spans.push([start, x]);
          start = null;
        }
      }
      if (start != null) spans.push([start, x1]);
      if (spans.length > 0) out.push({ y, spans });
    }
    const grown = area(out);
    if (grown > unitsPerMetre * unitsPerMetre * 20 || !accept(out)) return null;
    return out;
  };
  return attempt(3) ?? attempt(0.5) ?? rows;
}

/** A door's swing as the sheet draws it: a quarter circle round its hinge. */
export type SwingArc = { cx: number; cy: number; r: number; a0: number; a1: number; strokes: number };

/**
 * Every door swing on the sheet, found as the circle it is.
 *
 * Each short stroke — a chord of a curve, a dash of a dashed arc — votes for
 * the centres it could be on: along its normal, at every door's radius. A
 * swing's strokes agree on one centre and one radius; a pillow's corners, a
 * WC's rim, a legend box's corners and a level mark's circle do not, or do at
 * a radius no door has, or sweep a whole circle. Kept: a circle fitted
 * through them that its strokes all lie on, a quarter turn of it (70 to 110
 * degrees) with both ends square to the sheet — a door opens square to its
 * wall — inked along a third of it at least and with no gap wider than 15
 * degrees. Letters and a crossing swing's dashes line up at a radius by
 * chance; they leave the gaps.
 *
 * Some sheets draw a swing as one or two Bézier curves, which reach here as
 * their chords: those are read as the polyline they are, see chordSwings.
 */
export function findSwingArcs(
  segments: VectorSegment[],
  curves: VectorSegment[],
  unitsPerMetre: number,
  options?: {
    /** Only swings round a hinge in this box, page units. */
    extent?: { x: number; y: number; width: number; height: number };
    /** Door radii, page units, when the scale is not yet known. */
    radius?: { min: number; max: number };
  },
): SwingArc[] {
  const rMin = options?.radius?.min ?? unitsPerMetre * 0.55;
  const rMax = options?.radius?.max ?? unitsPerMetre * 1.15;
  const box = options?.extent;
  const inBox = (s: VectorSegment) =>
    !box ||
    (Math.max(s.x1, s.x2) >= box.x - rMax &&
      Math.min(s.x1, s.x2) <= box.x + box.width + rMax &&
      Math.max(s.y1, s.y2) >= box.y - rMax &&
      Math.min(s.y1, s.y2) <= box.y + box.height + rMax);
  const strokes = [
    ...curves.filter((s) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1) <= unitsPerMetre * 0.35),
    ...segments.filter((s) => {
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      return len >= unitsPerMetre * 0.008 && len <= unitsPerMetre * 0.15;
    }),
  ].filter(inBox);
  // The strokes by where they are, to ask a centre for its circle's.
  const gridCell = unitsPerMetre * 0.25;
  const grid = new Map<string, VectorSegment[]>();
  for (const s of strokes) {
    const k = `${Math.floor((s.x1 + s.x2) / 2 / gridCell)}:${Math.floor((s.y1 + s.y2) / 2 / gridCell)}`;
    const list = grid.get(k);
    if (list) list.push(s);
    else grid.set(k, [s]);
  }
  const near = (cx: number, cy: number, reach: number) => {
    const found: VectorSegment[] = [];
    const i0 = Math.floor((cx - reach) / gridCell);
    const i1 = Math.floor((cx + reach) / gridCell);
    const j0 = Math.floor((cy - reach) / gridCell);
    const j1 = Math.floor((cy + reach) / gridCell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) found.push(...(grid.get(`${i}:${j}`) ?? []));
    return found;
  };

  const cell = unitsPerMetre * 0.06;
  const rStep = unitsPerMetre * 0.04;
  // Numeric keys: a string per vote was most of the time on a 30 000-stroke sheet.
  const K = 1 << 14;
  const keyOf = (i: number, j: number, k: number) => ((i + K / 2) * K + (j + K / 2)) * 64 + k;
  const votes = new Map<number, number>();
  for (const s of strokes) {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    const mx = (s.x1 + s.x2) / 2;
    const my = (s.y1 + s.y2) / 2;
    const nx = -(s.y2 - s.y1) / len;
    const ny = (s.x2 - s.x1) / len;
    for (let r = rMin; r <= rMax; r += rStep) {
      for (const sg of [1, -1]) {
        const key = keyOf(Math.round((mx + sg * nx * r) / cell), Math.round((my + sg * ny * r) / cell), Math.round(r / rStep));
        votes.set(key, (votes.get(key) ?? 0) + 1);
      }
    }
  }
  const peaks = [...votes.entries()].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1]);
  const out: SwingArc[] = [];
  const taken: Array<Set<VectorSegment>> = [];
  // Each neighbourhood is asked once, at its strongest peak.
  const asked = new Set<number>();
  for (const [key] of peaks) {
    const ir = key % 64;
    const iy = (Math.floor(key / 64) % K) - K / 2;
    const ix = Math.floor(key / 64 / K) - K / 2;
    let near1 = false;
    for (let a = -1; a <= 1 && !near1; a++) for (let b = -1; b <= 1 && !near1; b++) for (let c = -1; c <= 1 && !near1; c++) near1 = asked.has(keyOf(ix + a, iy + b, ir + c));
    asked.add(key);
    if (near1) continue;
    const cx = ix * cell;
    const cy = iy * cell;
    const r0 = ir * rStep;
    if (out.some((a) => Math.hypot(a.cx - cx, a.cy - cy) < unitsPerMetre * 0.15 && Math.abs(a.r - r0) < unitsPerMetre * 0.1)) continue;
    const on = near(cx, cy, r0 * 1.15).filter((s) => {
      const mx = (s.x1 + s.x2) / 2;
      const my = (s.y1 + s.y2) / 2;
      const d = Math.hypot(mx - cx, my - cy);
      if (Math.abs(d - r0) > r0 * 0.1) return false;
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1;
      return Math.abs(((mx - cx) * (s.x2 - s.x1) + (my - cy) * (s.y2 - s.y1)) / (d * len)) < 0.4;
    });
    if (on.length < 5) continue;
    // The run of strokes round the centre with no gap wider than 15 degrees
    // that holds the most: other ink at the same radius — a cabinet's edge
    // beside 22's front door — is a run of its own, and does not widen it.
    const withAngle = on
      .map((st) => ({ st, a: (Math.atan2((st.y1 + st.y2) / 2 - cy, (st.x1 + st.x2) / 2 - cx) * 180) / Math.PI }))
      .sort((p, q) => p.a - q.a);
    const n = withAngle.length;
    let bestRun: typeof withAngle = [];
    for (let k0 = 0; k0 < n; k0++) {
      const run = [withAngle[k0]!];
      for (let k = 1; k < n; k++) {
        const cur = withAngle[(k0 + k) % n]!;
        let g = cur.a - run[run.length - 1]!.a;
        if (g < 0) g += 360;
        if (g > 15) break;
        run.push(cur);
      }
      if (run.length > bestRun.length) bestRun = run;
    }
    if (bestRun.length < 5) continue;
    const fit = fitSwing(
      bestRun.map((q) => q.st),
      rMin,
      rMax,
    );
    if (!fit) continue;
    const used = new Set(bestRun.map((q) => q.st));
    if (taken.some((t) => [...used].filter((st) => t.has(st)).length > used.size * 0.4)) continue;
    taken.push(used);
    out.push({ ...fit, strokes: bestRun.length });
  }
  const hingeIn = (a: SwingArc) => !box || (a.cx >= box.x - rMax * 0.5 && a.cx <= box.x + box.width + rMax * 0.5 && a.cy >= box.y - rMax * 0.5 && a.cy <= box.y + box.height + rMax * 0.5);
  for (const a of chordSwings(curves.filter(inBox), segments.filter(inBox), unitsPerMetre, rMin, rMax)) {
    if (out.some((b) => Math.hypot(a.cx - b.cx, a.cy - b.cy) < unitsPerMetre * 0.15 && Math.abs(a.r - b.r) < unitsPerMetre * 0.1)) continue;
    out.push(a);
  }
  return out.filter(hingeIn);
}

/** Unwrapped angles (degrees) of points round a centre, about their middle one. */
function sweepOf(pts: Array<{ x: number; y: number }>, cx: number, cy: number) {
  const angs = pts.map((q) => (Math.atan2(q.y - cy, q.x - cx) * 180) / Math.PI);
  const midA = angs[Math.floor(angs.length / 2)]!;
  const rel = angs.map((x) => {
    let d = x - midA;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  });
  return { rel, lo: midA + Math.min(...rel), hi: midA + Math.max(...rel) };
}

const offAxis = (deg: number) => {
  const m = ((deg % 90) + 90) % 90;
  return Math.min(m, 90 - m);
};

/**
 * The swing through a run of strokes, or null when they are not one: the
 * circle fitted through them (Kasa) — the vote's cell is coarse — that every
 * stroke lies on to within 8% of its radius, a quarter turn whose two ends lie
 * square to the sheet, inked along at least a third of it.
 */
function fitSwing(run: VectorSegment[], rMin: number, rMax: number): Omit<SwingArc, "strokes"> | null {
  const pts = run.flatMap((st) => [
    { x: st.x1, y: st.y1 },
    { x: st.x2, y: st.y2 },
  ]);
  let ux = 0;
  let uy = 0;
  for (const q of pts) {
    ux += q.x;
    uy += q.y;
  }
  ux /= pts.length;
  uy /= pts.length;
  let suu = 0;
  let svv = 0;
  let suv = 0;
  let suuu = 0;
  let svvv = 0;
  let suvv = 0;
  let svuu = 0;
  for (const q of pts) {
    const u = q.x - ux;
    const v = q.y - uy;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const bu = (suuu + suvv) / 2;
  const bv = (svvv + svuu) / 2;
  const cx = ux + (bu * svv - bv * suv) / det;
  const cy = uy + (bv * suu - bu * suv) / det;
  const r = pts.reduce((t, q) => t + Math.hypot(q.x - cx, q.y - cy), 0) / pts.length;
  if (r < rMin * 0.95 || r > rMax * 1.05) return null;
  if (pts.some((q) => Math.abs(Math.hypot(q.x - cx, q.y - cy) - r) > r * 0.08)) return null;
  const { rel, lo, hi } = sweepOf(pts, cx, cy);
  const span = hi - lo;
  if (span < 70 || span > 110) return null;
  if (offAxis(lo) > 12 || offAxis(hi) > 12) return null;
  // Inked: the union of the strokes' own angular spans.
  const spans = run
    .map((_, k) => [Math.min(rel[2 * k]!, rel[2 * k + 1]!), Math.max(rel[2 * k]!, rel[2 * k + 1]!)] as const)
    .sort((p, q) => p[0] - q[0]);
  let inked = 0;
  let reach = -Infinity;
  for (const [a, b] of spans) {
    if (b <= reach) continue;
    inked += b - Math.max(a, reach);
    reach = b;
  }
  if (inked < span / 3) return null;
  return { cx, cy, r, a0: lo, a1: hi };
}

/**
 * Swings drawn as one or two Bézier curves: the reader keeps each curve as its
 * chord, so the swing reaches here as a polyline of a few long chords end to
 * end. Two or more chords fix the circle; one does not — its hinge is one of
 * the two corners square to it — and is kept only with the leaf drawn from
 * that corner.
 */
function chordSwings(curves: VectorSegment[], segments: VectorSegment[], unitsPerMetre: number, rMin: number, rMax: number): SwingArc[] {
  const long = curves.filter((s) => {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    return len > unitsPerMetre * 0.3 && len < rMax * 1.5;
  });
  const join = unitsPerMetre * 0.02;
  const meets = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y) <= join;
  // Chains, end to end, each chord in one.
  const used = new Set<VectorSegment>();
  const chains: Array<Array<{ x: number; y: number }>> = [];
  for (const s of long) {
    if (used.has(s)) continue;
    used.add(s);
    const pts = [
      { x: s.x1, y: s.y1 },
      { x: s.x2, y: s.y2 },
    ];
    for (let grew = true; grew && pts.length < 6; ) {
      grew = false;
      for (const t of long) {
        if (used.has(t)) continue;
        const a = { x: t.x1, y: t.y1 };
        const b = { x: t.x2, y: t.y2 };
        const head = pts[0]!;
        const tail = pts[pts.length - 1]!;
        if (meets(tail, a)) pts.push(b);
        else if (meets(tail, b)) pts.push(a);
        else if (meets(head, a)) pts.unshift(b);
        else if (meets(head, b)) pts.unshift(a);
        else continue;
        used.add(t);
        grew = true;
      }
    }
    chains.push(pts);
  }
  const out: SwingArc[] = [];
  for (const pts of chains) {
    const p0 = pts[0]!;
    const pn = pts[pts.length - 1]!;
    let centres: Array<{ x: number; y: number }>;
    if (pts.length >= 3) {
      const pm = pts[Math.floor(pts.length / 2)]!;
      const d = 2 * (p0.x * (pm.y - pn.y) + pm.x * (pn.y - p0.y) + pn.x * (p0.y - pm.y));
      if (Math.abs(d) < 1e-9) continue;
      const q0 = p0.x * p0.x + p0.y * p0.y;
      const qm = pm.x * pm.x + pm.y * pm.y;
      const qn = pn.x * pn.x + pn.y * pn.y;
      centres = [
        {
          x: (q0 * (pm.y - pn.y) + qm * (pn.y - p0.y) + qn * (p0.y - pm.y)) / d,
          y: (q0 * (pn.x - pm.x) + qm * (p0.x - pn.x) + qn * (pm.x - p0.x)) / d,
        },
      ];
    } else {
      // One chord: square to the sheet both ways, |dx| ≈ |dy|.
      const dx = Math.abs(pn.x - p0.x);
      const dy = Math.abs(pn.y - p0.y);
      if (Math.abs(dx - dy) > Math.max(dx, dy) * 0.15) continue;
      centres = [
        { x: p0.x, y: pn.y },
        { x: pn.x, y: p0.y },
      ].filter((c) =>
        // The leaf: a straight stroke from the corner to one end, a radius long.
        [p0, pn].some((e) => {
          const r = Math.hypot(e.x - c.x, e.y - c.y);
          return segments.some((s) => {
            const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
            if (Math.abs(len - r) > r * 0.15) return false;
            const fromC = Math.hypot(s.x1 - c.x, s.y1 - c.y) <= join * 3 || Math.hypot(s.x2 - c.x, s.y2 - c.y) <= join * 3;
            const toE = Math.hypot(s.x1 - e.x, s.y1 - e.y) <= join * 3 || Math.hypot(s.x2 - e.x, s.y2 - e.y) <= join * 3;
            return fromC && toE;
          });
        }),
      );
    }
    for (const c of centres) {
      const r = pts.reduce((t, q) => t + Math.hypot(q.x - c.x, q.y - c.y), 0) / pts.length;
      if (r < rMin || r > rMax) continue;
      if (pts.some((q) => Math.abs(Math.hypot(q.x - c.x, q.y - c.y) - r) > r * 0.1)) continue;
      const { lo, hi } = sweepOf(pts, c.x, c.y);
      const span = hi - lo;
      if (span < 70 || span > 110) continue;
      if (offAxis(lo) > 12 || offAxis(hi) > 12) continue;
      out.push({ cx: c.x, cy: c.y, r, a0: lo, a1: hi, strokes: pts.length - 1 });
    }
  }
  return out;
}

/**
 * The flat's doors, from the swings the sheet draws (findSwingArcs).
 *
 * A swing is the whole door: its centre is the hinge, one end of the quarter
 * lies on the wall at the far jamb and the other at the leaf's tip. Each
 * detector before this found doors by a part of that — a leaf with arcs near
 * it, arcs round a hatch gap's end — and both took a bed's pillow corners, a
 * WC pan, a legend box or a level mark for one, while missing doors whose
 * leaf or gap they could not see. So the swings decide:
 *
 * - An opening a swing's doorway lies in is that door, its leaf open toward
 *   the tip. A window under a swing is a door: the floor test called a
 *   terrace door a window.
 * - A swing on a wall no opening was found in makes the opening: the hatch
 *   ran on across the doorway, and the wall was built straight over it.
 * - A door no swing is drawn for is a doorway with no leaf, which is what the
 *   sheet shows there.
 *
 * Which end is the jamb: the one an opening lies along, else the one a wall
 * runs in line with, ending at the jamb or the hinge — a hinge often stands
 * where a cross wall meets, so the run may carry on from one end only. A
 * swing with neither is not on a wall — furniture, a legend, a stair hall's
 * door drawn off the flat — and is left.
 */
export function doorsFromSwings<T extends Opening & { kind?: string }>(
  openings: T[],
  arcs: SwingArc[],
  bodies: WallBody[],
  segments: VectorSegment[],
  unitsPerMetre: number,
  /** Whether a doorway has the flat's floor on at least one side of it. */
  servesTheFlat: (o: Opening) => boolean,
): Array<T | (Opening & { kind: "door" })> {
  const out: Array<T | (Opening & { kind: "door" })> = openings.map((o) =>
    o.kind === "door" ? { ...o, kind: "opening", leaf: undefined } : o,
  );
  const claimed = new Set<number>();
  // Hatch across a wall: three strokes at least, one way, each the wall's
  // depth or more. A dimension's tick is a diamond of four short ones.
  const diagonals = segments.filter((s) => {
    const deg = Math.abs((Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI) % 90;
    return deg >= 30 && deg <= 60 && Math.hypot(s.x2 - s.x1, s.y2 - s.y1) <= unitsPerMetre * 0.8;
  });
  const hatchedAcross = (r: { x: number; y: number; w: number; h: number }, thickness: number) => {
    const ways = [0, 0];
    for (const s of diagonals) {
      const mx = (s.x1 + s.x2) / 2;
      const my = (s.y1 + s.y2) / 2;
      if (mx < r.x || mx > r.x + r.w || my < r.y || my > r.y + r.h) continue;
      if (Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < thickness * 0.8) continue;
      ways[(s.x2 - s.x1) * (s.y2 - s.y1) > 0 ? 0 : 1]!++;
    }
    return Math.max(ways[0]!, ways[1]!) >= 3;
  };
  for (const arc of arcs) {
    const end = (deg: number) => ({
      x: arc.cx + arc.r * Math.cos((deg * Math.PI) / 180),
      y: arc.cy + arc.r * Math.sin((deg * Math.PI) / 180),
    });
    // Each end tried as the jamb, the other as the tip.
    const tries = [
      { jamb: end(arc.a0), tip: end(arc.a1) },
      { jamb: end(arc.a1), tip: end(arc.a0) },
    ].map(({ jamb, tip }) => {
      const orientation: "h" | "v" = Math.abs(jamb.x - arc.cx) >= Math.abs(jamb.y - arc.cy) ? "h" : "v";
      const line = orientation === "h" ? arc.cy : arc.cx;
      const a = orientation === "h" ? arc.cx : arc.cy;
      const b = orientation === "h" ? jamb.x : jamb.y;
      const from = Math.min(a, b);
      const to = Math.max(a, b);
      // An opening along this doorway: same wall line, overlapping half of it.
      const index = out.findIndex(
        (o, i) =>
          !claimed.has(i) &&
          o.orientation === orientation &&
          Math.abs(o.centre - line) <= o.thickness / 2 + unitsPerMetre * 0.1 &&
          Math.min(o.to, to) - Math.max(o.from, from) >= (to - from) * 0.5,
      );
      // The walls in line with the doorway that end at its hinge or its
      // jamb: the doorway is the wall's gap. The hinge often stands where a
      // cross wall meets, so the run may carry on from the jamb only. A wall
      // running on across the doorway's middle, hatched there, says the
      // doorway is not on this line: 17's middle bedroom door has its jamb on
      // the bedroom's side wall and its leaf along the hatched wall below. One
      // with no hatch there was built over the doorway (22's bathroom).
      const reach = unitsPerMetre * 0.25;
      const onLine = bodies.filter(
        (w) => w.orientation === orientation && Math.abs(w.centre - line) <= w.thickness / 2 + unitsPerMetre * 0.08,
      );
      const mid = (from + to) / 2;
      const spanning = onLine.filter((w) => w.from < mid - reach / 2 && w.to > mid + reach / 2);
      const hatchedAtMid = (w: WallBody) => {
        const r = bodyRect(w);
        const slice =
          orientation === "h"
            ? { x: mid - reach / 2, y: r.y, w: reach, h: r.h }
            : { x: r.x, y: mid - reach / 2, w: r.w, h: reach };
        return hatchedAcross(slice, w.thickness);
      };
      const across = spanning.some(hatchedAtMid);
      const over = spanning.filter((w) => !hatchedAtMid(w));
      // A wall ending where the doorway does, beyond it: at the jamb is the
      // surer sign — the frame stands there — while the hinge often sits on a
      // cross wall's face.
      const endingAt = (at: number) =>
        onLine.filter((w) => (at === from ? Math.abs(w.to - from) <= reach : Math.abs(w.from - to) <= reach));
      const atJamb = endingAt(b < a ? from : to);
      const atHinge = endingAt(b < a ? to : from);
      const inLine = [...atJamb, ...atHinge, ...over];
      const wallBehind = !across && inLine.length > 0 ? inLine.reduce((p, q) => (q.thickness > p.thickness ? q : p)) : undefined;
      // No wall on the doorway's line, but a cross wall at each end of it: a
      // front door set between two walls that run away from it. The Gotlib
      // sheet's entrance stands so, between the stair-hall wall and the flat's
      // own, and unsealed it let the living room out onto the landing.
      const crossAt = (at: number) => {
        const p = orientation === "h" ? { x: at, y: line } : { x: line, y: at };
        const near = unitsPerMetre * 0.15;
        return bodies.some((w) => {
          if (w.orientation === orientation) return false;
          const r = bodyRect(w);
          return p.x >= r.x - near && p.x <= r.x + r.w + near && p.y >= r.y - near && p.y <= r.y + r.h + near;
        });
      };
      const framed = !across && inLine.length === 0 && crossAt(from) && crossAt(to);
      return { orientation, line, from, to, tip, index, wallBehind, framed, ends: 2 * Number(atJamb.length > 0) + Number(atHinge.length > 0) + Number(over.length > 0) };
    });
    const pick =
      tries.find((t) => t.index >= 0) ??
      [...tries].filter((t) => t.wallBehind).sort((p, q) => q.ends - p.ends)[0] ??
      tries.find((t) => t.framed);
    if (!pick) continue;
    const leaf = { x: arc.cx, y: arc.cy, dx: pick.tip.x - arc.cx, dy: pick.tip.y - arc.cy };
    if (pick.index >= 0) {
      const o = out[pick.index]!;
      // The opening's own extent when it is the door's width; the swing's
      // when the gap ran wider or narrower than the leaf.
      const width = o.to - o.from;
      const fits = Math.abs(width - (pick.to - pick.from)) <= unitsPerMetre * 0.2;
      const door = {
        ...o,
        kind: "door" as const,
        from: fits ? o.from : pick.from,
        to: fits ? o.to : pick.to,
        leaf,
      };
      if (!servesTheFlat(door)) continue;
      out[pick.index] = door;
      claimed.add(pick.index);
      continue;
    }
    const wall = pick.wallBehind;
    const door = {
      orientation: pick.orientation,
      centre: wall ? wall.centre : pick.line,
      thickness: wall ? wall.thickness : unitsPerMetre * 0.1,
      from: pick.from,
      to: pick.to,
      kind: "door" as const,
      leaf,
    };
    if (!servesTheFlat(door)) continue;
    out.push(door);
    claimed.add(out.length - 1);
  }
  return out;
}

/**
 * The openings that stand in a wall: each end of it meets one — the wall it
 * cuts, carrying on in line, or a cross wall at a corner. A gap in the hatch
 * or between two bodies can be read where no wall is, and 17's top bedroom
 * got a window standing in the room off its corner, along the bed's head.
 * Doors are the swings' (see doorsFromSwings) and are kept.
 */
export function openingsInWalls<T extends Opening & { kind?: string }>(
  openings: T[],
  bodies: WallBody[],
  unitsPerMetre: number,
  options?: {
    segments?: VectorSegment[];
    /** Whether an opening has the flat's floor on both sides. */
    betweenRooms?: (o: Opening) => boolean;
  },
): T[] {
  const reach = unitsPerMetre * 0.25;
  const near = unitsPerMetre * 0.1;
  const inLine = (o: Opening, w: WallBody) =>
    w.orientation === o.orientation && Math.abs(w.centre - o.centre) <= Math.max(w.thickness, o.thickness) / 2 + unitsPerMetre * 0.08;
  const meets = (o: Opening, at: number) => {
    const p = o.orientation === "h" ? { x: at, y: o.centre } : { x: o.centre, y: at };
    return bodies.some((w) => {
      if (w.orientation === o.orientation) {
        if (!inLine(o, w)) return false;
        return Math.abs(w.to - at) <= reach || Math.abs(w.from - at) <= reach || (w.from <= at && w.to >= at);
      }
      const r = bodyRect(w);
      return p.x >= r.x - near && p.x <= r.x + r.w + near && p.y >= r.y - near && p.y <= r.y + r.h + near;
    });
  };
  // Both faces drawn on across the gap: the wall goes on there unhatched — a
  // wardrobe's back, a stretch the draughtsman left blank — and no one walks
  // through it. 18's bedroom got a 1.6 m hole into the kitchen there.
  const axis = (options?.segments ?? []).filter((s) => Math.abs(s.x2 - s.x1) < 0.5 || Math.abs(s.y2 - s.y1) < 0.5);
  const faceDrawn = (o: Opening, line: number) => {
    const spans: Array<[number, number]> = [];
    for (const s of axis) {
      const h = Math.abs(s.y2 - s.y1) < 0.5;
      if (h !== (o.orientation === "h")) continue;
      const at = h ? s.y1 : s.x1;
      if (Math.abs(at - line) > unitsPerMetre * 0.02) continue;
      const a = h ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2);
      const b = h ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2);
      if (b > o.from && a < o.to) spans.push([Math.max(a, o.from), Math.min(b, o.to)]);
    }
    spans.sort((p, q) => p[0] - q[0]);
    let covered = 0;
    let reachTo = o.from;
    for (const [a, b] of spans) {
      if (b <= reachTo) continue;
      covered += b - Math.max(a, reachTo);
      reachTo = b;
    }
    return covered >= (o.to - o.from) * 0.9;
  };
  const walledOver = (o: Opening) =>
    o.thickness > 0 && faceDrawn(o, o.centre - o.thickness / 2) && faceDrawn(o, o.centre + o.thickness / 2);
  return openings.flatMap((o) => {
    if (o.kind !== "door") {
      if (!(meets(o, o.from) && meets(o, o.to))) return [];
      if (options?.betweenRooms?.(o) && walledOver(o)) return [];
    }
    // Held to the wall it stands in, as that wall was finally measured: a
    // wall narrowed to its hatch takes its doorways with it.
    const wall = bodies.find(
      (w) => inLine(o, w) && (Math.abs(w.to - o.from) <= reach || Math.abs(w.from - o.to) <= reach || (w.from <= o.from && w.to >= o.to)),
    );
    if (wall && wall.thickness < o.thickness * 0.8) return [{ ...o, centre: wall.centre, thickness: wall.thickness }];
    return [o];
  });
}

/** The sheet's wall hatch as solid cells: its strokes drawn into a grid and closed across their pitch. */
function hatchRaster(
  segments: VectorSegment[],
  unitsPerMetre: number,
  extent: { x: number; y: number; width: number; height: number },
) {
  const g = unitsPerMetre * 0.025;
  const pad = unitsPerMetre * 0.5;
  const x0 = extent.x - pad;
  const y0 = extent.y - pad;
  const W = Math.ceil((extent.width + 2 * pad) / g);
  const H = Math.ceil((extent.height + 2 * pad) / g);
  if (W <= 0 || H <= 0 || W * H > 8_000_000) return null;
  const strokes = segments.filter((s) => {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
    if (len < unitsPerMetre * 0.04 || len > unitsPerMetre * 0.8) return false;
    const deg = Math.abs((Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI) % 90;
    if (deg < 35 || deg > 55) return false;
    const mx = (s.x1 + s.x2) / 2;
    const my = (s.y1 + s.y2) / 2;
    return mx >= x0 && my >= y0 && mx < x0 + W * g && my < y0 + H * g;
  });
  const ink = new Uint8Array(W * H);
  for (const s of strokes) {
    const n = Math.ceil(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / (g / 2));
    for (let k = 0; k <= n; k++) {
      const i = Math.floor((s.x1 + ((s.x2 - s.x1) * k) / n - x0) / g);
      const j = Math.floor((s.y1 + ((s.y2 - s.y1) * k) / n - y0) / g);
      if (i >= 0 && j >= 0 && i < W && j < H) ink[j * W + i] = 1;
    }
  }
  const grow = (m: Uint8Array, r: number, keep: 0 | 1): Uint8Array => {
    // keep 1: dilate (any set in the square), keep 0: erode (all set).
    const out = new Uint8Array(m.length);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        let hit = keep === 0;
        for (let dj = -r; dj <= r && hit === (keep === 0); dj++) {
          for (let di = -r; di <= r; di++) {
            const ii = i + di;
            const jj = j + dj;
            const v = ii >= 0 && jj >= 0 && ii < W && jj < H ? m[jj * W + ii]! : 0;
            if (keep === 1 && v) {
              hit = true;
              break;
            }
            if (keep === 0 && !v) {
              hit = false;
              break;
            }
          }
        }
        if (hit) out[j * W + i] = 1;
      }
    }
    return out;
  };
  // Closed across the pitch: a hatch is drawn every 4 to 7 cm.
  const r = Math.max(1, Math.round((unitsPerMetre * 0.04) / g));
  const solid = grow(grow(ink, r, 1), r, 0);
  return { g, x0, y0, W, H, strokes, solid };
}

/**
 * Walls the sheet hatches that no body was built for.
 *
 * The bodies come from paired faces, and a short hatched piece between a
 * corner and a doorway pairs wrong or not at all: 17's front door had the
 * jamb on its left drawn as a hatched band 57 cm long and measured as a 9 cm
 * sliver, which the hatch test then dropped — the door had no wall to stand
 * in, and the envelope a hole beside it. So the hatch is read as area: its
 * strokes drawn into a grid and closed across their pitch, what the bodies
 * already cover taken off, and each piece left that is a wall's shape —
 * a solid band at least 6 cm thick and 25 cm long, hatched with four strokes
 * or more, against a wall already found — becomes one. A level mark's
 * hatched quarter, a hatched symbol in a legend, stands clear of every wall
 * and is left.
 */
export function hatchedWallsMissed(
  bodies: WallBody[],
  segments: VectorSegment[],
  unitsPerMetre: number,
  extent: { x: number; y: number; width: number; height: number },
  /** Told of every uncovered hatched piece and what was decided; for debugging. */
  onPiece?: (rect: { x: number; y: number; w: number; h: number }, verdict: string) => void,
): WallBody[] {
  const raster = hatchRaster(segments, unitsPerMetre, extent);
  if (!raster) return [];
  const { g, x0, y0, W, H, strokes, solid } = raster;
  const covered = new Uint8Array(W * H);
  for (const b of bodies) {
    const rc = bodyRect(b);
    const i0 = Math.max(0, Math.floor((rc.x - x0) / g) - 1);
    const i1 = Math.min(W - 1, Math.ceil((rc.x + rc.w - x0) / g) + 1);
    const j0 = Math.max(0, Math.floor((rc.y - y0) / g) - 1);
    const j1 = Math.min(H - 1, Math.ceil((rc.y + rc.h - y0) / g) + 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) covered[j * W + i] = 1;
  }
  const seen = new Uint8Array(W * H);
  const out: WallBody[] = [];
  const minThin = Math.max(3 * g, unitsPerMetre * 0.06);
  // A door's jamb is a hatched post 20 cm square: 21's front door stood in
  // nothing without it.
  const minLong = unitsPerMetre * 0.2;
  for (let start = 0; start < W * H; start++) {
    if (!solid[start] || covered[start] || seen[start]) continue;
    const cells: number[] = [];
    const stack = [start];
    seen[start] = 1;
    let ci0 = W, ci1 = 0, cj0 = H, cj1 = 0;
    while (stack.length) {
      const c = stack.pop()!;
      cells.push(c);
      const i = c % W;
      const j = (c - i) / W;
      ci0 = Math.min(ci0, i);
      ci1 = Math.max(ci1, i);
      cj0 = Math.min(cj0, j);
      cj1 = Math.max(cj1, j);
      for (const n of [c - 1, c + 1, c - W, c + W]) {
        if (n < 0 || n >= W * H || seen[n] || !solid[n] || covered[n]) continue;
        if ((n === c - 1 && i === 0) || (n === c + 1 && i === W - 1)) continue;
        seen[n] = 1;
        stack.push(n);
      }
    }
    // Split into rectangles: the piece left beside a body is often an L or a
    // step, and a wall is a band. Greedy, the longest run first, grown across
    // the rows that carry all of it.
    const left = new Set(cells);
    while (left.size > 0) {
      let best = { j: -1, a: 0, b: -1 };
      for (let j = cj0; j <= cj1; j++) {
        let runA = -1;
        for (let i = ci0; i <= ci1 + 1; i++) {
          const on = i <= ci1 && left.has(j * W + i);
          if (on && runA < 0) runA = i;
          if (!on && runA >= 0) {
            if (i - runA > best.b - best.a + 1) best = { j, a: runA, b: i - 1 };
            runA = -1;
          }
        }
      }
      // And the tallest column, so a vertical band is not cut into rows.
      let bestV = { i: -1, a: 0, b: -1 };
      for (let i = ci0; i <= ci1; i++) {
        let runA = -1;
        for (let j = cj0; j <= cj1 + 1; j++) {
          const on = j <= cj1 && left.has(j * W + i);
          if (on && runA < 0) runA = j;
          if (!on && runA >= 0) {
            if (j - runA > bestV.b - bestV.a + 1) bestV = { i, a: runA, b: j - 1 };
            runA = -1;
          }
        }
      }
      let ri0: number, ri1: number, rj0: number, rj1: number;
      // Grown across a row or column that carries most of the run: the
      // closed hatch is ragged by a cell or two at a band's ends.
      const full = (i0: number, i1: number, j0: number, j1: number) => {
        let on = 0;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (left.has(j * W + i)) on++;
        return on >= 0.85 * (i1 - i0 + 1) * (j1 - j0 + 1);
      };
      if (best.b - best.a >= bestV.b - bestV.a) {
        ri0 = best.a;
        ri1 = best.b;
        rj0 = best.j;
        rj1 = best.j;
        while (rj0 > cj0 && full(ri0, ri1, rj0 - 1, rj0 - 1)) rj0--;
        while (rj1 < cj1 && full(ri0, ri1, rj1 + 1, rj1 + 1)) rj1++;
      } else {
        rj0 = bestV.a;
        rj1 = bestV.b;
        ri0 = bestV.i;
        ri1 = bestV.i;
        while (ri0 > ci0 && full(ri0 - 1, ri0 - 1, rj0, rj1)) ri0--;
        while (ri1 < ci1 && full(ri1 + 1, ri1 + 1, rj0, rj1)) ri1++;
      }
      for (let j = rj0; j <= rj1; j++) for (let i = ri0; i <= ri1; i++) left.delete(j * W + i);
      const bw = (ri1 - ri0 + 1) * g;
      const bh = (rj1 - rj0 + 1) * g;
      const rect = { x: x0 + ri0 * g, y: y0 + rj0 * g, w: bw, h: bh };
      if (Math.min(bw, bh) < minThin || Math.max(bw, bh) < minLong) {
        if ((ri1 - ri0 + 1) * (rj1 - rj0 + 1) > 20) onPiece?.(rect, "size");
        continue;
      }
      const hatched = strokes.filter((st) => {
        const mx = (st.x1 + st.x2) / 2;
        const my = (st.y1 + st.y2) / 2;
        return mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h;
      }).length;
      if (hatched < 4) {
        onPiece?.(rect, "strokes");
        continue;
      }
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      if (cx < extent.x || cx > extent.x + extent.width || cy < extent.y || cy > extent.y + extent.height) {
        onPiece?.(rect, "outside");
        continue;
      }
      const near = unitsPerMetre * 0.1;
      // A strip along a wall already found is that wall's own hatch, wider
      // than its faces were read: not a second wall beside it.
      const h = bw >= bh;
      const alongside = bodies.some((b) => {
        if (b.orientation !== (h ? "h" : "v")) return false;
        const rc = bodyRect(b);
        const overlap = h ? Math.min(rc.x + rc.w, rect.x + rect.w) - Math.max(rc.x, rect.x) : Math.min(rc.y + rc.h, rect.y + rect.h) - Math.max(rc.y, rect.y);
        const gap = h ? Math.max(rc.y - (rect.y + rect.h), rect.y - (rc.y + rc.h)) : Math.max(rc.x - (rect.x + rect.w), rect.x - (rc.x + rc.w));
        return overlap >= 0.5 * (h ? rect.w : rect.h) && gap <= near;
      });
      if (alongside) {
        onPiece?.(rect, "alongside");
        continue;
      }
      const touches = [...bodies, ...out].some((b) => {
        const rc = bodyRect(b);
        return rc.x <= rect.x + rect.w + near && rc.x + rc.w >= rect.x - near && rc.y <= rect.y + rect.h + near && rc.y + rc.h >= rect.y - near;
      });
      if (!touches) {
        onPiece?.(rect, "alone");
        continue;
      }
      onPiece?.(rect, "wall");
      out.push(
        bw >= bh
          ? { orientation: "h", source: "hatch", centre: rect.y + bh / 2, thickness: bh, from: rect.x, to: rect.x + bw }
          : { orientation: "v", source: "hatch", centre: rect.x + bw / 2, thickness: bw, from: rect.y, to: rect.y + bh },
      );
    }
  }
  return out;
}

/**
 * Walls held to their hatch where a door's leaf was read into them.
 *
 * A leaf standing open along a wall is drawn as a thin rectangle against its
 * face, and the faces pair across it: 22's bathroom wall came out 48 cm where
 * the sheet draws 10, and the bathroom lost the strip. Where a leaf (from
 * doorsFromSwings) lies inside a body along it, the body is narrowed to its
 * hatch: a stroke runs face to face, so the strokes' middles give the wall's
 * line and their depth across it the wall's thickness — 22's leaf and
 * wardrobe stood either side of a 10 cm wall's hatch, and no side of the
 * band was the wall.
 */
export function narrowWallsAroundLeaves(
  bodies: WallBody[],
  doors: Array<Opening & { kind?: string }>,
  segments: VectorSegment[],
  unitsPerMetre: number,
): WallBody[] {
  const leaves = doors.flatMap((o) => (o.kind === "door" && o.leaf ? [o.leaf] : []));
  if (leaves.length === 0) return bodies;
  const diagonals = segments.filter((s) => {
    const deg = Math.abs((Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI) % 90;
    return deg >= 30 && deg <= 60 && Math.hypot(s.x2 - s.x1, s.y2 - s.y1) <= unitsPerMetre * 0.8;
  });
  const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;
  return bodies.map((body) => {
    if (body.thickness <= unitsPerMetre * 0.15) return body;
    const r = bodyRect(body);
    const holds = leaves.some((leaf) => {
      const along = body.orientation === "h" ? Math.abs(leaf.dx) > Math.abs(leaf.dy) * 3 : Math.abs(leaf.dy) > Math.abs(leaf.dx) * 3;
      if (!along) return false;
      const mx = leaf.x + leaf.dx / 2;
      const my = leaf.y + leaf.dy / 2;
      return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
    });
    if (!holds) return body;
    const inside = diagonals.filter((s) => {
      const mx = (s.x1 + s.x2) / 2;
      const my = (s.y1 + s.y2) / 2;
      return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
    });
    if (inside.length < 5) return body;
    const h = body.orientation === "h";
    const centre = median(inside.map((s) => (h ? (s.y1 + s.y2) / 2 : (s.x1 + s.x2) / 2)));
    const thickness = median(inside.map((s) => (h ? Math.abs(s.y2 - s.y1) : Math.abs(s.x2 - s.x1))));
    if (thickness < unitsPerMetre * 0.05 || thickness > body.thickness * 0.8) return body;
    // One hatched band, not two: 18's outer wall is hatched in two rows a
    // cavity apart, and the median kept one of them.
    const onLine = inside.filter((s) => Math.abs((h ? (s.y1 + s.y2) / 2 : (s.x1 + s.x2) / 2) - centre) <= thickness / 2 + unitsPerMetre * 0.03).length;
    if (onLine < inside.length * 0.75) return body;
    return { ...body, centre, thickness };
  });
}

/**
 * The crossed boxes on the sheet: a rectangle with both its diagonals drawn,
 * the draughtsman's mark for a void — a shaft, a fire-hose cabinet, a duct.
 * Neither floor nor room, and a wall framing one is the box's, not a room's.
 */
export function findCrossedBoxes(
  segments: VectorSegment[],
  unitsPerMetre: number,
): Array<{ x: number; y: number; w: number; h: number }> {
  const min = unitsPerMetre * 0.2;
  const max = unitsPerMetre * 2.5;
  const e = unitsPerMetre * 0.03;
  const diagonals = segments.filter((s) => {
    const dx = Math.abs(s.x2 - s.x1);
    const dy = Math.abs(s.y2 - s.y1);
    return dx >= min && dy >= min && dx <= max && dy <= max;
  });
  const out: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let i = 0; i < diagonals.length; i++) {
    const a = diagonals[i]!;
    const x0 = Math.min(a.x1, a.x2);
    const x1 = Math.max(a.x1, a.x2);
    const y0 = Math.min(a.y1, a.y2);
    const y1 = Math.max(a.y1, a.y2);
    const down = (a.x2 - a.x1) * (a.y2 - a.y1) > 0;
    const other = diagonals.find((b, j) => {
      if (j === i || ((b.x2 - b.x1) * (b.y2 - b.y1) > 0) === down) return false;
      return (
        Math.abs(Math.min(b.x1, b.x2) - x0) <= e &&
        Math.abs(Math.max(b.x1, b.x2) - x1) <= e &&
        Math.abs(Math.min(b.y1, b.y2) - y0) <= e &&
        Math.abs(Math.max(b.y1, b.y2) - y1) <= e
      );
    });
    if (!other || !down) continue;
    if (out.some((r) => Math.abs(r.x - x0) <= e && Math.abs(r.y - y0) <= e)) continue;
    out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return out;
}

/**
 * The walls with floor beside them: off one face or another, the flat's floor
 * or its terrace, outside every crossed box. A crossed box's frame faces the
 * box and the stair hall — 22's fire-hose cabinet stood at its front door as
 * four columns, its frame read as walls — and is not the flat's.
 */
export function wallsBesideFlatFloor(
  bodies: WallBody[],
  floor: { room: (x: number, y: number) => boolean; terrace: (x: number, y: number) => boolean },
  voids: Array<{ x: number; y: number; w: number; h: number }>,
  segments: VectorSegment[],
  unitsPerMetre: number,
  /** Level marks: their hatched quarters are not a wall's hatch. */
  marks: Array<{ x: number; y: number; r: number }> = [],
): WallBody[] {
  const inVoid = (x: number, y: number) => voids.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  const clear = (x: number, y: number) =>
    !inVoid(x, y) && !bodies.some((b) => {
      const r = bodyRect(b);
      return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    });
  // Beside a terrace only, a wall must be hatched there: a terrace's paving
  // pairs into bands like a wall's faces, and 18's two terraces got two walls
  // across them where the sheet draws a strip of paving between them.
  const diagonals = segments.filter((sg) => {
    const deg = Math.abs((Math.atan2(sg.y2 - sg.y1, sg.x2 - sg.x1) * 180) / Math.PI) % 90;
    if (!(deg >= 30 && deg <= 60 && Math.hypot(sg.x2 - sg.x1, sg.y2 - sg.y1) <= unitsPerMetre * 0.8)) return false;
    const mx = (sg.x1 + sg.x2) / 2;
    const my = (sg.y1 + sg.y2) / 2;
    return !marks.some((m) => Math.hypot(mx - m.x, my - m.y) <= m.r * 1.3);
  });
  const hatchedAt = (b: WallBody, t: number) => {
    const r = bodyRect(b);
    const half = unitsPerMetre * 0.15;
    // Three strokes one way, each across most of the band: a level figure's
    // "4" and "2" have a diagonal each, and stood a wall on 18's terrace.
    const ways = [0, 0];
    for (const sg of diagonals) {
      const mx = (sg.x1 + sg.x2) / 2;
      const my = (sg.y1 + sg.y2) / 2;
      const along = b.orientation === "h" ? mx : my;
      if (Math.abs(along - t) > half) continue;
      if (mx < r.x - 1 || mx > r.x + r.w + 1 || my < r.y - 1 || my > r.y + r.h + 1) continue;
      const across = b.orientation === "h" ? Math.abs(sg.y2 - sg.y1) : Math.abs(sg.x2 - sg.x1);
      // Across a real wall's depth, not the band's: a band read wider than
      // its wall (a leaf, a frame beside it) holds strokes shorter than itself.
      if (across < Math.min(b.thickness * 0.6, unitsPerMetre * 0.05)) continue;
      const k = (sg.x2 - sg.x1) * (sg.y2 - sg.y1) > 0 ? 0 : 1;
      if (++ways[k]! >= 3) return true;
    }
    return false;
  };
  const free = (b: WallBody, t: number, x: number, y: number) =>
    clear(x, y) && (floor.room(x, y) || (floor.terrace(x, y) && hatchedAt(b, t)));
  // Off its long faces; off its ends too only for a stub, which is all ends
  // — a band over 18's terrace had the living room past its end, through
  // the wall it ran out of.
  const kept = bodies.filter((b) => {
    const r = bodyRect(b);
    const stub = b.to - b.from < b.thickness * 2;
    // Out to 40 cm: a window's frame lines can stand between an outer wall
    // and the floor (21's twin bedroom), and the opened floor stops short.
    for (const d of [0.1, 0.25, 0.4].map((m) => m * unitsPerMetre)) {
      for (const f of [0.15, 0.5, 0.85]) {
        const px = r.x + r.w * f;
        const py = r.y + r.h * f;
        const t = b.orientation === "h" ? px : py;
        const faces = b.orientation === "h" ? free(b, t, px, r.y - d) || free(b, t, px, r.y + r.h + d) : free(b, t, r.x - d, py) || free(b, t, r.x + r.w + d, py);
        const ends = b.orientation === "h" ? free(b, t, r.x - d, py) || free(b, t, r.x + r.w + d, py) : free(b, t, px, r.y - d) || free(b, t, px, r.y + r.h + d);
        if (faces || (stub && ends)) return true;
      }
    }
    return false;
  });
  // And each cut back to where it has floor beside it, through the cross wall
  // at its end: the party walls ran on 46 cm past 22's west wall into the
  // neighbour's flat.
  const step = unitsPerMetre * 0.05;
  const out: WallBody[] = [];
  for (const b of kept) {
    const h = b.orientation === "h";
    const reachSide = b.thickness / 2 + unitsPerMetre * 0.1;
    const beside = (t: number) =>
      [reachSide, reachSide + unitsPerMetre * 0.15, reachSide + unitsPerMetre * 0.3].some((d) =>
        h ? free(b, t, t, b.centre - d) || free(b, t, t, b.centre + d) : free(b, t, b.centre - d, t) || free(b, t, b.centre + d, t),
      );
    let tA: number | null = null;
    let tB: number | null = null;
    for (let t = b.from; t <= b.to; t += step) {
      if (!beside(t)) continue;
      if (tA == null) tA = t;
      tB = t;
    }
    if (tA == null || tB == null) {
      out.push(b);
      continue;
    }
    const inCross = (t: number) =>
      kept.some((o) => {
        if (o === b || o.orientation === b.orientation) return false;
        const r = bodyRect(o);
        const [x, y] = h ? [t, b.centre] : [b.centre, t];
        return x >= r.x - step && x <= r.x + r.w + step && y >= r.y - step && y <= r.y + r.h + step;
      });
    let from = Math.max(b.from, tA - step);
    let to = Math.min(b.to, tB + step);
    while (from - step >= b.from && inCross(from - step)) from -= step;
    while (to + step <= b.to && inCross(to + step)) to += step;
    // Within a step of the end, the end as drawn.
    if (from - b.from <= step * 1.5) from = b.from;
    if (b.to - to <= step * 1.5) to = b.to;
    // And a hatched wall's unhatched end that stands in the open — room
    // floor off both faces — is not wall: 21's WC wall ran on 1.5 m across
    // the hall into the flat's legend box, with two "openings" in it.
    const sliceStep = unitsPerMetre * 0.1;
    const hatchedSlice = (t: number) => hatchedAt(b, t);
    const openBoth = (t: number) => {
      const d = b.thickness / 2 + unitsPerMetre * 0.15;
      return h
        ? clear(t, b.centre - d) && floor.room(t, b.centre - d) && clear(t, b.centre + d) && floor.room(t, b.centre + d)
        : clear(b.centre - d, t) && floor.room(b.centre - d, t) && clear(b.centre + d, t) && floor.room(b.centre + d, t);
    };
    let hatchedCount = 0;
    let total = 0;
    for (let t = from; t < to; t += sliceStep) {
      total++;
      if (hatchedSlice(t)) hatchedCount++;
    }
    if (total > 0 && hatchedCount >= total * 0.4) {
      while (to - from > unitsPerMetre * 0.3 && !hatchedSlice(to - sliceStep / 2) && openBoth(to - sliceStep / 2)) to -= sliceStep;
      while (to - from > unitsPerMetre * 0.3 && !hatchedSlice(from + sliceStep / 2) && openBoth(from + sliceStep / 2)) from += sliceStep;
    }
    if (to - from < unitsPerMetre * 0.1) continue;
    out.push(from === b.from && to === b.to ? b : { ...b, from, to });
  }
  // A band lying half in a wall found beside it, its other half unhatched:
  // 18's bathroom window, sill and rescue hatch read as a 50 cm wall reaching
  // out onto the terrace from inside the outer wall.
  const strokesIn = (r: { x: number; y: number; w: number; h: number }, thickness: number) => {
    const ways = [0, 0];
    for (const sg of diagonals) {
      const mx = (sg.x1 + sg.x2) / 2;
      const my = (sg.y1 + sg.y2) / 2;
      if (mx < r.x || mx > r.x + r.w || my < r.y || my > r.y + r.h) continue;
      if (Math.max(Math.abs(sg.x2 - sg.x1), Math.abs(sg.y2 - sg.y1)) < Math.min(thickness * 0.6, unitsPerMetre * 0.05)) continue;
      ways[(sg.x2 - sg.x1) * (sg.y2 - sg.y1) > 0 ? 0 : 1]!++;
    }
    return Math.max(ways[0]!, ways[1]!);
  };
  return out.filter((b) => {
    const r = bodyRect(b);
    const h = b.orientation === "h";
    return !out.some((o) => {
      if (o === b || o.orientation !== b.orientation) return false;
      const along = Math.min(b.to, o.to) - Math.max(b.from, o.from);
      if (along < (b.to - b.from) * 0.8) return false;
      const lo = Math.max(b.centre - b.thickness / 2, o.centre - o.thickness / 2);
      const hi = Math.min(b.centre + b.thickness / 2, o.centre + o.thickness / 2);
      if (hi - lo < b.thickness * 0.3 || o.thickness < b.thickness * 0.5) return false;
      // The part of b beyond o, on whichever side it lies.
      const below = o.centre - o.thickness / 2 - (b.centre - b.thickness / 2);
      const above = b.centre + b.thickness / 2 - (o.centre + o.thickness / 2);
      const strip = above >= below ? { a: o.centre + o.thickness / 2, d: above } : { a: b.centre - b.thickness / 2, d: below };
      if (strip.d < unitsPerMetre * 0.05) return false;
      const rect = h ? { x: r.x, y: strip.a, w: r.w, h: strip.d } : { x: strip.a, y: r.y, w: strip.d, h: r.h };
      const metres = (b.to - b.from) / unitsPerMetre;
      return strokesIn(rect, strip.d) < Math.max(3, metres * 4);
    });
  });
}

/**
 * The flat's open floor as a lookup, with what is too narrow to stand in
 * taken off: floor between the walls, opened by a disc of the given radius.
 * The scanline footprint runs on past the envelope where a neighbour's wall
 * or a cabinet's frame closes a sliver beyond it — 22 had 28 cm of "floor"
 * outside its west wall — and a wall standing on that sliver is not the
 * flat's.
 */
export function openFloorLookup(
  floor: SpanRow[],
  bodies: WallBody[],
  unitsPerMetre: number,
  radiusM = 0.15,
  /** Floor that is not the rooms' — the terraces, another flat's — taken off before opening. */
  exclude?: (x: number, y: number) => boolean,
): (x: number, y: number) => boolean {
  if (floor.length === 0) return () => false;
  const g = unitsPerMetre * 0.05;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const row of floor) for (const [a, b] of row.spans) {
    minX = Math.min(minX, a);
    maxX = Math.max(maxX, b);
  }
  const pitch = floor.length > 1 ? floor[1]!.y - floor[0]!.y : 1;
  const minY = floor[0]!.y;
  const maxY = floor[floor.length - 1]!.y + pitch;
  const W = Math.ceil((maxX - minX) / g) + 2;
  const H = Math.ceil((maxY - minY) / g) + 2;
  const at = (i: number, j: number) => ({ x: minX + (i + 0.5) * g, y: minY + (j + 0.5) * g });
  const rects = bodies.map(bodyRect);
  const m = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const p = at(i, j);
      if (!spansContain(floor, p.x, p.y)) continue;
      if (exclude?.(p.x, p.y)) continue;
      if (rects.some((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)) continue;
      m[j * W + i] = 1;
    }
  }
  const r = Math.max(1, Math.round((radiusM * unitsPerMetre) / g));
  const pass = (src: Uint8Array, erode: boolean) => {
    const out = new Uint8Array(src.length);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        let v = erode;
        for (let dj = -r; dj <= r && v === erode; dj++) {
          for (let di = -r; di <= r; di++) {
            if (di * di + dj * dj > r * r) continue;
            const ii = i + di;
            const jj = j + dj;
            const s = ii >= 0 && jj >= 0 && ii < W && jj < H ? src[jj * W + ii]! : 0;
            if (erode && !s) {
              v = false;
              break;
            }
            if (!erode && s) {
              v = true;
              break;
            }
          }
        }
        if (v) out[j * W + i] = 1;
      }
    }
    return out;
  };
  const opened = pass(pass(m, true), false);
  return (x, y) => {
    const i = Math.floor((x - minX) / g);
    const j = Math.floor((y - minY) / g);
    return i >= 0 && j >= 0 && i < W && j < H && opened[j * W + i] === 1;
  };
}

/**
 * Each wall widened to its hatch, face by face.
 *
 * The faces are paired before the hatch is read, and a pair can be the wrong
 * one: 17's shelter wall is hatched 40 cm deep and was built 21 cm, and the
 * scene, finding no floor a step past its inner face (a bed and a wardrobe
 * stand there), took it down. A face is moved out a cell at a time while the
 * cells along the wall's length past it are hatch — most of them, so a
 * doorway or a window in the run does not stop it — up to 30 cm. A strip
 * another wall already holds is not taken twice.
 */
export function widenToHatch(
  bodies: WallBody[],
  segments: VectorSegment[],
  unitsPerMetre: number,
  extent: { x: number; y: number; width: number; height: number },
): WallBody[] {
  const raster = hatchRaster(segments, unitsPerMetre, extent);
  if (!raster) return bodies;
  const { g, x0, y0, W, H, solid } = raster;
  const cell = (x: number, y: number) => {
    const i = Math.floor((x - x0) / g);
    const j = Math.floor((y - y0) / g);
    return i >= 0 && j >= 0 && i < W && j < H && solid[j * W + i] === 1;
  };
  const maxGrow = unitsPerMetre * 0.3;
  return bodies.map((b, index) => {
    // A wall, not a stub: a stub's "length" is a wall's depth, and widened it
    // grows along the wall it sits in.
    if (b.to - b.from < b.thickness * 3) return b;
    const h = b.orientation === "h";
    const others = bodies.filter((_, k) => k !== index).map(bodyRect);
    const inOther = (x: number, y: number) => others.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    // The share of the wall's length hatched on the line `at` across it.
    const hatchedAlong = (at: number) => {
      let on = 0;
      let n = 0;
      let all = 0;
      for (let t = b.from + g / 2; t < b.to; t += g) {
        all++;
        const [x, y] = h ? [t, at] : [at, t];
        if (inOther(x, y)) continue;
        n++;
        if (cell(x, y)) on++;
      }
      // Along most of the wall's own length, not the end left between the
      // walls it meets.
      return n >= all * 0.6 ? on / n : 0;
    };
    let lo = b.centre - b.thickness / 2;
    let hi = b.centre + b.thickness / 2;
    // And held in from a face its hatch does not reach, where the wall is
    // hatched at all: 21's west bedroom wall paired its outer face with the
    // wardrobe's edge, 8 cm into the room.
    if (hatchedAlong(b.centre) >= 0.7) {
      const minThickness = unitsPerMetre * 0.06;
      while (hi - lo > minThickness && hatchedAlong(lo + g / 2) < 0.3) lo += g;
      while (hi - lo > minThickness && hatchedAlong(hi - g / 2) < 0.3) hi -= g;
    }
    const fromLo = lo;
    const fromHi = hi;
    while (fromHi - lo < b.thickness + maxGrow && hatchedAlong(lo - g / 2) >= 0.7) lo -= g;
    while (hi - fromLo < b.thickness + maxGrow && hatchedAlong(hi + g / 2) >= 0.7) hi += g;
    if (Math.abs(hi - lo - b.thickness) <= g / 2 && Math.abs((lo + hi) / 2 - b.centre) <= g / 2) return b;
    return { ...b, centre: (lo + hi) / 2, thickness: hi - lo };
  });
}
