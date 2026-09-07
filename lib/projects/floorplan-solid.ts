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
      const prev = group[group.length - 1];
      // Same line, within a wall's own thickness.
      if (prev && Math.abs(b.centre - prev.centre) > Math.max(prev.thickness, 4)) flush();
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
  },
): SpanRow[] {
  const step = options?.resolution ?? 2;
  // A terrace slider is the widest opening on these sheets at about 2.4 m.
  const maxOpening = options?.maxOpeningUnits ?? 120;
  const reach = options?.cornerReachUnits ?? maxOpening / 4;
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

  for (const b of sealed) {
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
      // Wall cells count as floor too: a wall stands on the slab, and leaving
      // them out draws a hairline of background along every wall.
      const inside = x < w - 1 && grid[y * w + x] !== OUTSIDE;
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
  },
): WallBody[] {
  const upm = options.unitsPerMetre;
  const minDensity = options.minDensity ?? 0.7;
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
        // Sampled a little inside the faces, so a band that merely runs beside
        // a hatched wall cannot borrow its strokes.
        const rect = bodyRect(body);
        // Only a token inset: a thin partition has little width to give away.
        const inset = Math.min(gap * 0.15, 1);
        if (
          field.density({
            x: rect.x + (orientation === "v" ? inset : 0),
            y: rect.y + (orientation === "h" ? inset : 0),
            w: rect.w - (orientation === "v" ? inset * 2 : 0),
            h: rect.h - (orientation === "h" ? inset * 2 : 0),
          }) < minDensity
        ) {
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
  const merged = bridgeOpenings(dedupe(bodies), (options.mergeGapM ?? 1.2) * upm);
  return merged.filter((b) => b.to - b.from >= minLength);
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
): WallBody[] {
  return bodies.filter((b) => {
    const r = bodyRect(b);
    return (
      r.x >= bounds.x - margin &&
      r.y >= bounds.y - margin &&
      r.x + r.w <= bounds.x + bounds.width + margin &&
      r.y + r.h <= bounds.y + bounds.height + margin
    );
  });
}
