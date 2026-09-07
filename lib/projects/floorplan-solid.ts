import { buildWallRuns, type WallRun } from "@/lib/projects/floorplan-rooms";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

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

/** Israeli walls are 10-35 cm; at 33-44 units/m that is 3-16 units, with slack. */
const MIN_THICKNESS = 2.5;
const MAX_THICKNESS = 18;
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
export function buildWallBodies(runs: WallRun[]): WallBody[] {
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
        if (gap < MIN_THICKNESS) continue;
        if (gap > MAX_THICKNESS) break; // sorted: nothing further is closer
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
  return dropCombs(dedupe(dropGridLines(bodies)));
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
function dropCombs(bodies: WallBody[], minTeeth = 3, maxPitch = 26): WallBody[] {
  const drop = new Set<WallBody>();
  for (const orientation of ["h", "v"] as const) {
    const line = bodies
      .filter((b) => b.orientation === orientation)
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
    const covered = out.some(
      (o) =>
        o.orientation === b.orientation &&
        Math.abs(o.centre - b.centre) <= (o.thickness + b.thickness) / 2 &&
        Math.min(o.to, b.to) - Math.max(o.from, b.from) > (b.to - b.from) * 0.6,
    );
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
  const bodies = buildWallBodies(buildWallRuns(walls));
  const upm = options?.unitsPerMetre;
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
