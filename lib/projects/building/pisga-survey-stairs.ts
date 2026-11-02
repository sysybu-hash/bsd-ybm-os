import { insidePolygon } from "@/lib/projects/building/assemble";
import type { Primitive } from "@/lib/projects/building/model";
import { stairPrims, type TreadSet } from "@/lib/projects/building/pisga-stairs";
import { surveyGroundEverywhere, surveySegments, WALL_SPOT_LAYER, type PisgaSurvey } from "@/lib/projects/building/pisga-survey";

/**
 * The survey's stairs (layer M2412): every tread is a line the width of the flight, and a flight is a run of equal, parallel lines a going
 * apart. Their levels are the surveyed ground at either end: the landing spots the surveyor took beside each flight.
 */
export type SurveyFlight = {
  n: number;
  /** Tread length across the flight, metres. */
  width: number;
  /** Horizontal distance between treads' nosings, metres. */
  going: number;
  /** Centre of the lowest and the highest tread line. */
  low: [number, number];
  high: [number, number];
  /** Ground levels just beyond the lowest tread and the highest one. */
  lowLevel: number;
  highLevel: number;
  /** Unit plan direction up the flight. */
  up: [number, number];
};

type Seg = [[number, number], [number, number]];

export function surveyFlights(survey: PisgaSurvey, ground: (x: number, z: number) => number | null = surveyGroundEverywhere(survey)): SurveyFlight[] {
  const segs = surveySegments(survey, "M2412").filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.6);
  const info = segs.map(([a, b]: Seg) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    if (ang < 0) ang += Math.PI;
    return { mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as [number, number], len, ang };
  });
  // Two treads are neighbours in a flight when they lie parallel, equal, one going apart and side by side (not end to end).
  const parent = info.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < info.length; i++) {
    for (let j = i + 1; j < info.length; j++) {
      const a = info[i]!, b = info[j]!;
      let dAng = Math.abs(a.ang - b.ang);
      dAng = Math.min(dAng, Math.PI - dAng);
      if (dAng > 0.09 || Math.abs(a.len - b.len) > 0.2) continue;
      const dx = b.mid[0] - a.mid[0], dz = b.mid[1] - a.mid[1];
      const along = Math.abs(dx * Math.cos(a.ang) + dz * Math.sin(a.ang));
      const across = Math.abs(-dx * Math.sin(a.ang) + dz * Math.cos(a.ang));
      if (along < 0.25 && across > 0.18 && across < 0.42) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, number[]>();
  info.forEach((_, i) => (groups.get(find(i)) ?? groups.set(find(i), []).get(find(i))!).push(i));
  const out: SurveyFlight[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) { if (process.env.DEBUG_FLIGHTS) console.warn(`lone tread at ${info[members[0]!]!.mid.map((v) => v.toFixed(2))} len ${info[members[0]!]!.len.toFixed(2)}`); continue; }
    const ang = info[members[0]!]!.ang;
    const nx = -Math.sin(ang), nz = Math.cos(ang);
    const sorted = members.map((i) => info[i]!).sort((a, b) => a.mid[0] * nx + a.mid[1] * nz - (b.mid[0] * nx + b.mid[1] * nz));
    const first = sorted[0]!, last = sorted[sorted.length - 1]!;
    const span = Math.hypot(last.mid[0] - first.mid[0], last.mid[1] - first.mid[1]);
    const going = span / (sorted.length - 1);
    const width = sorted.reduce((t, s) => t + s.len, 0) / sorted.length;
    // The ground a going beyond each end: the landing it leads from and to.
    const beyond = (m: [number, number], s: number): number | null => ground(m[0] + nx * s * going, m[1] + nz * s * going);
    const g0 = beyond(first.mid, -1.5), g1 = beyond(last.mid, 1.5);
    if (g0 == null || g1 == null) { if (process.env.DEBUG_FLIGHTS) console.warn(`flight of ${sorted.length} at ${first.mid} has no ground at an end`); continue; }
    if (process.env.DEBUG_FLIGHTS) console.warn(`group ${sorted.length} ${first.mid.map((v) => v.toFixed(2))} → ${last.mid.map((v) => v.toFixed(2))} g ${g0.toFixed(2)} ${g1.toFixed(2)}`);
    const up = g1 >= g0;
    out.push({
      n: sorted.length,
      width,
      going,
      low: up ? first.mid : last.mid,
      high: up ? last.mid : first.mid,
      lowLevel: Math.min(g0, g1),
      highLevel: Math.max(g0, g1),
      up: up ? [nx, nz] : [-nx, -nz],
    });
  }
  return out.sort((a, b) => a.lowLevel - b.lowLevel);
}

/**
 * A stair of many flights as one path, bottom to top: its flights in order (each one's low end beside the last one's high end), and each
 * flight's levels by an even rise over all its treads between the surveyed ground at its foot and at its head. The landings' own spots
 * are reported beside the level the path gives them, so a stair whose risers differ from flight to flight shows.
 */
export type SurveyStair = { flights: SurveyFlight[]; rise: number; landings: Array<{ x: number; z: number; level: number; spot?: number }> };

export function surveyStairs(survey: PisgaSurvey): SurveyStair[] {
  const ground = surveyGroundEverywhere(survey);
  const flights = surveyFlights(survey, ground);
  // A stair is the flights within 4 m of each other, end to end.
  const groups: SurveyFlight[][] = [];
  for (const f of flights) {
    const near = groups.filter((g) => g.some((h) => Math.min(...[f.low, f.high].flatMap((a) => [h.low, h.high].map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])))) < 4));
    if (!near.length) groups.push([f]);
    else {
      const merged = near.flat().concat(f);
      for (const g of near) groups.splice(groups.indexOf(g), 1);
      groups.push(merged);
    }
  }
  // Landing levels are the surveyor's ground points (M1502) on them; M2651 is a wall's head and foot.
  const spots = survey.spots.filter((s) => s.layer === "M1502");
  return groups.filter((g) => g.length >= 3).map((g) => {
    // Order by the ground at each flight's middle, which climbs along the path.
    const mid = (f: SurveyFlight) => [(f.low[0] + f.high[0]) / 2, (f.low[1] + f.high[1]) / 2] as [number, number];
    const ordered = [...g].sort((a, b) => ground(...mid(a)) - ground(...mid(b)));
    const first = ordered[0]!, last = ordered[ordered.length - 1]!;
    const foot = ground(first.low[0] - first.up[0] * first.going, first.low[1] - first.up[1] * first.going);
    const head = ground(last.high[0] + last.up[0] * last.going, last.high[1] + last.up[1] * last.going);
    // Anchors: the foot, each landing's own spot where one lies on it and the rise to it from the last anchor is a stair's (10–20 cm), the head.
    const treadsBefore = ordered.map((_, i) => ordered.slice(0, i + 1).reduce((t, f) => t + f.n, 0));
    const landingAt = (i: number): [number, number] => [(ordered[i]!.high[0] + ordered[i + 1]!.low[0]) / 2, (ordered[i]!.high[1] + ordered[i + 1]!.low[1]) / 2];
    const anchors: Array<{ treads: number; level: number }> = [{ treads: 0, level: foot }];
    const landingSpot: Array<number | undefined> = [];
    for (let i = 0; i < ordered.length - 1; i++) {
      const at = landingAt(i);
      const spot = spots.filter((s) => Math.hypot(s.x - at[0], s.z - at[1]) < 1.5).sort((a, b) => Math.hypot(a.x - at[0], a.z - at[1]) - Math.hypot(b.x - at[0], b.z - at[1]))[0];
      landingSpot.push(spot?.level);
      const prev = anchors[anchors.length - 1]!;
      const r = spot ? (spot.level - prev.level) / (treadsBefore[i]! - prev.treads) : NaN;
      const rToHead = spot ? (head - spot.level) / (treadsBefore[ordered.length - 1]! - treadsBefore[i]!) : NaN;
      if (r >= 0.1 && r <= 0.2 && rToHead >= 0.1 && rToHead <= 0.2) anchors.push({ treads: treadsBefore[i]!, level: spot!.level });
    }
    anchors.push({ treads: treadsBefore[ordered.length - 1]!, level: head });
    const levelAt = (t: number) => {
      const k = Math.max(1, anchors.findIndex((a) => a.treads >= t));
      const a = anchors[k - 1]!, b = anchors[k]!;
      return a.level + ((b.level - a.level) * (t - a.treads)) / (b.treads - a.treads || 1);
    };
    const landings: SurveyStair["landings"] = [];
    const out = ordered.map((f, i) => {
      const lowLevel = levelAt(i ? treadsBefore[i - 1]! : 0);
      const highLevel = levelAt(treadsBefore[i]!);
      if (i < ordered.length - 1) landings.push({ x: landingAt(i)[0], z: landingAt(i)[1], level: highLevel, spot: landingSpot[i] });
      return { ...f, lowLevel, highLevel };
    });
    return { flights: out, rise: (head - foot) / treadsBefore[ordered.length - 1]!, landings };
  });
}

/**
 * A way between a side stair and the building that the sheets draw (an emergency exit's gate in the plot's wall, a path's end): a paved
 * plan ring at the level of the stair landing it meets. Guards, walls and railings stop at it; `guards` are the edges of it that stand over a
 * drop and get a guard of their own; `pave: false` where the building's own paving is already there.
 */
export type StairLink = { ring: Array<[number, number]>; level: number; pave?: boolean; guards?: Array<[[number, number], [number, number]]> };

/** Whether a plan point lies on a link or within `grow` metres of it. */
export function nearLink(links: StairLink[], x: number, z: number, grow: number): boolean {
  return links.some((l) => insidePolygon(l.ring, x, z) || l.ring.some((a, i) => {
    const b = l.ring[(i + 1) % l.ring.length]!;
    const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / l2));
    return Math.hypot(x - a[0] - (b[0] - a[0]) * t, z - a[1] - (b[1] - a[1]) * t) < grow;
  }));
}

/** The convex hull of plan points, anticlockwise from the lowest x. */
export const hull = (pts: Array<[number, number]>): Array<[number, number]> => {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [], upper: Array<[number, number]> = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
};

// The landing between two flights: a rectangle square to the arriving flight, from its head tread out to the far side of the next one's foot
// and across both flights' widths, at least as deep as the flight is wide. (The hull of the two flights' end corners was a triangle wherever
// the path turned a corner.)
function landingRing(f: SurveyFlight, next: SurveyFlight): Array<[number, number]> {
  const [ux, uz] = f.up, [vx, vz] = [-f.up[1], f.up[0]];
  const ends: Array<[number, number]> = [];
  for (const [g, at] of [[f, f.high], [next, next.low]] as const) {
    const [px, pz] = [-g.up[1] * (g.width / 2), g.up[0] * (g.width / 2)];
    ends.push([at[0] + px, at[1] + pz], [at[0] - px, at[1] - pz]);
  }
  const u = (q: [number, number]) => (q[0] - f.high[0]) * ux + (q[1] - f.high[1]) * uz;
  const v = (q: [number, number]) => (q[0] - f.high[0]) * vx + (q[1] - f.high[1]) * vz;
  const u0 = 0, u1 = Math.max(...ends.map(u), Math.max(f.width, next.width, 1.2));
  const v0 = Math.min(...ends.map(v)), v1 = Math.max(...ends.map(v));
  const at = (a: number, b: number): [number, number] => [f.high[0] + ux * a + vx * b, f.high[1] + uz * a + vz * b];
  return [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
}

// The paved step-off at a stair's foot and head: as wide as its flight, 1.5 m on along it, at the level it arrives at; it meets the street
// below and the upper road's walk above.
function endPads(st: SurveyStair): Array<{ ring: Array<[number, number]>; level: number }> {
  const first = st.flights[0]!, last = st.flights[st.flights.length - 1]!;
  const pad = (g: SurveyFlight, at: [number, number], dir: 1 | -1, level: number) => {
    const [ux, uz] = [g.up[0] * dir, g.up[1] * dir], [px, pz] = [-g.up[1] * (g.width / 2 + 0.25), g.up[0] * (g.width / 2 + 0.25)];
    const a: [number, number] = [at[0] + ux * g.going * 0.5, at[1] + uz * g.going * 0.5], b: [number, number] = [at[0] + ux * 1.5, at[1] + uz * 1.5];
    return { ring: [[a[0] + px, a[1] + pz], [b[0] + px, b[1] + pz], [b[0] - px, b[1] - pz], [a[0] - px, a[1] - pz]] as Array<[number, number]>, level };
  };
  return [pad(first, first.low, -1, first.lowLevel), pad(last, last.high, 1, last.highLevel)];
}

/**
 * The path's own level where a point lies on a flight or a landing (10 cm round it), else null: the ground is cut down to it there, so a
 * stair let into the slope is not buried by the TIN drawn over it between the surveyor's spots.
 */
export function surveyStairCarve(survey: PisgaSurvey, stairs = surveyStairs(survey), links: StairLink[] = []): (x: number, z: number) => number | null {
  const pads: Array<{ ring: Array<[number, number]>; level: (x: number, z: number) => number }> = links.map((l) => ({ ring: l.ring, level: () => l.level }));
  for (const st of stairs) {
    st.flights.forEach((f, i) => {
      // 10 cm inside the treads' ends: the quarter-metre ground grid draws the cut's edge as a slope a cell wide, and so it stays under the guard.
      const [px, pz] = [-f.up[1] * (f.width / 2 - 0.1), f.up[0] * (f.width / 2 - 0.1)];
      const a: [number, number] = [f.low[0] - f.up[0] * f.going, f.low[1] - f.up[1] * f.going];
      const b: [number, number] = [f.high[0] + f.up[0] * f.going * 0.5, f.high[1] + f.up[1] * f.going * 0.5];
      const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1;
      pads.push({
        ring: [[a[0] + px, a[1] + pz], [b[0] + px, b[1] + pz], [b[0] - px, b[1] - pz], [a[0] - px, a[1] - pz]],
        level: (x, z) => f.lowLevel + (f.highLevel - f.lowLevel) * Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / l2)),
      });
      const next = st.flights[i + 1];
      if (next) {
        const level = st.landings[i]!.level;
        pads.push({ ring: landingRing(f, next), level: () => level });
      }
    });
    for (const e of endPads(st)) pads.push({ ring: e.ring, level: () => e.level });
  }
  return (x, z) => {
    for (const p of pads) if (insidePolygon(p.ring, x, z)) return p.level(x, z);
    return null;
  };
}

/**
 * The ground of the side stairs' corridors as the survey builds it: level beds between the walls, not the TIN's slope drawn straight across
 * them. On a 20 cm grid over each stair (its flights and landings and 1 m round them) the walls (M2602) are barriers; every open cell takes
 * the level of the nearest thing measured in its own compartment, a tread, a landing or a spot the surveyor took in a bed, reached without
 * crossing a wall. Then a few rounds of averaging that never cross a wall (the path, the spots and the ground outside held) turn the fronts
 * between two measures in one open bed into a ramp, and join the edge without a wall to the slope beyond. A wall's cell takes the lower side: the wall
 * holds the higher, and the step of earth stays behind its stone (taking the higher, the step fell 20 cm in front of the wall's low face).
 * Returns the level, or null off the corridors.
 */
export function surveyStairTerraces(survey: PisgaSurvey, stairs = surveyStairs(survey), carve = surveyStairCarve(survey, stairs)): (x: number, z: number) => number | null {
  const base = surveyGroundEverywhere(survey);
  const walls = stairWalls(survey, stairs);
  const dx = 0.2;
  const grids = stairs.map((st) => {
    const pts: Array<[number, number]> = st.flights.flatMap((f) => {
      const [px, pz] = [-f.up[1] * (f.width / 2), f.up[0] * (f.width / 2)];
      return [[f.low[0] + px, f.low[1] + pz], [f.low[0] - px, f.low[1] - pz], [f.high[0] + px, f.high[1] + pz], [f.high[0] - px, f.high[1] - pz]] as Array<[number, number]>;
    });
    const h0 = hull(pts);
    const [cx, cz] = [h0.reduce((t, q) => t + q[0], 0) / h0.length, h0.reduce((t, q) => t + q[1], 0) / h0.length];
    const ring = h0.map(([x, z]): [number, number] => { const d = Math.hypot(x - cx, z - cz) || 1; return [x + ((x - cx) / d) * 1, z + ((z - cz) / d) * 1]; });
    // And the parcels it stands in, whose edges hold the terraces as walls do.
    const parcels = stairParcels(survey, st);
    const all = [...ring, ...parcels.flat()];
    const x0 = Math.min(...all.map((q) => q[0])) - 1, z0 = Math.min(...all.map((q) => q[1])) - 1;
    const nx = Math.ceil((Math.max(...all.map((q) => q[0])) + 1 - x0) / dx) + 1, nz = Math.ceil((Math.max(...all.map((q) => q[1])) + 1 - z0) / dx) + 1;
    const N = nx * nz;
    const at = (k: number): [number, number] => { const i = k % nx; return [x0 + i * dx, z0 + ((k - i) / nx) * dx]; };
    const inMask = new Uint8Array(N), blocked = new Uint8Array(N), fixed = new Uint8Array(N);
    const level = new Float64Array(N).fill(NaN);
    const mine = [...walls.filter(([a, b]) => [a, b].some(([x, z]) => x > x0 - 8 && x < x0 + nx * dx + 8 && z > z0 - 8 && z < z0 + nz * dx + 8)), ...parcels.flatMap(ringEdges)];
    const nearWall = (x: number, z: number) => mine.some(([q, r]) => {
      const l2 = (r[0] - q[0]) ** 2 + (r[1] - q[1]) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((x - q[0]) * (r[0] - q[0]) + (z - q[1]) * (r[1] - q[1])) / l2));
      // 30 cm: past the wall's high face by a ground cell, so the quarter-metre ground grid never draws the step in front of its low face.
      return Math.hypot(x - q[0] - (r[0] - q[0]) * t, z - q[1] - (r[1] - q[1]) * t) < 0.3;
    });
    for (let k = 0; k < N; k++) {
      const [x, z] = at(k);
      inMask[k] = insidePolygon(ring, x, z) || parcels.some((r) => insidePolygon(r, x, z)) ? 1 : 0;
      if (!inMask[k]) { level[k] = base(x, z); fixed[k] = 1; continue; }
      const c = carve(x, z);
      if (c != null) { level[k] = c; fixed[k] = 1; continue; }
      if (nearWall(x, z)) blocked[k] = 1;
    }
    // The spots the surveyor took in the beds: each holds its own cell.
    for (const sp of survey.spots) {
      if (sp.layer === WALL_SPOT_LAYER) continue;
      const i = Math.round((sp.x - x0) / dx), j = Math.round((sp.z - z0) / dx);
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const k = j * nx + i;
      if (!inMask[k] || blocked[k] || fixed[k]) continue;
      level[k] = sp.level;
      fixed[k] = 1;
    }
    const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    const around = (k: number) => {
      const i = k % nx, j = (k - i) / nx;
      return steps.map(([di, dj]) => [i + di, j + dj] as const).filter(([a, b]) => a >= 0 && b >= 0 && a < nx && b < nz).map(([a, b]) => b * nx + a);
    };
    // Nearest measure within the compartment: a breadth-first spread from every measured cell inside the corridor, never through a wall.
    // A measure holds its level 1.5 m round it and gives way to the slope by 4 m: a bed the walls leave open to the hillside runs down into
    // it rather than standing over it as a cliff of earth.
    let front: number[] = [];
    const reach = new Float64Array(N);
    for (let k = 0; k < N; k++) if (inMask[k] && fixed[k]) front.push(k);
    for (let step = 1; front.length; step++) {
      const next: number[] = [];
      for (const k of front) {
        for (const m of around(k)) {
          if (!inMask[m] || blocked[m] || !Number.isNaN(level[m]!)) continue;
          level[m] = level[k]!;
          reach[m] = step * dx;
          next.push(m);
        }
      }
      front = next;
    }
    for (let k = 0; k < N; k++) {
      if (!inMask[k] || blocked[k] || fixed[k]) continue;
      const slope = base(...at(k));
      const w = Number.isNaN(level[k]!) ? 0 : Math.max(0, Math.min(1, (4 - reach[k]!) / 2.5));
      level[k] = slope + ((Number.isNaN(level[k]!) ? slope : level[k]!) - slope) * w;
    }
    for (let round = 0; round < 8; round++) {
      const prev = Float64Array.from(level);
      for (let k = 0; k < N; k++) {
        if (fixed[k] || blocked[k]) continue;
        let t = prev[k]!, n = 1;
        for (const m of around(k)) {
          if (blocked[m]) continue;
          t += prev[m]!;
          n++;
        }
        level[k] = t / n;
      }
    }
    for (let k = 0; k < N; k++) {
      if (!blocked[k]) continue;
      const i = k % nx, j = (k - i) / nx;
      let low = Infinity;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const [a, b] = [i + di, j + dj];
        if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
        const m = b * nx + a;
        if (!blocked[m] && !Number.isNaN(level[m]!)) low = Math.min(low, level[m]!);
      }
      level[k] = Number.isFinite(low) ? low : base(...at(k));
    }
    return { x0, z0, nx, nz, inMask, level };
  });
  return (x, z) => {
    for (const g of grids) {
      const i = Math.round((x - g.x0) / dx), j = Math.round((z - g.z0) / dx);
      if (i < 0 || j < 0 || i >= g.nx || j >= g.nz || !g.inMask[j * g.nx + i]) continue;
      return g.level[j * g.nx + i]!;
    }
    return null;
  };
}

/**
 * The retaining wall along a stair parcel's edge where its terraces stand over the ground beside it (or under it) by more than 30 cm, as the
 * photographs show the corridor walled on both sides: 30 cm thick, its coping 15 cm over the higher side. Not within a metre of the path (a
 * parcel edge the stair crosses), and not where a surveyed wall already stands on the line.
 */
function parcelWalls(survey: PisgaSurvey, stairs: SurveyStair[], groundAt: (x: number, z: number) => number, links: StairLink[]): Primitive[] {
  const out: Primitive[] = [];
  const carve = surveyStairCarve(survey, stairs, links);
  const walls = stairWalls(survey, stairs);
  const offWall = (x: number, z: number) => Math.min(...walls.map(([q, r]) => {
    const l2 = (r[0] - q[0]) ** 2 + (r[1] - q[1]) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((x - q[0]) * (r[0] - q[0]) + (z - q[1]) * (r[1] - q[1])) / l2));
    return Math.hypot(x - q[0] - (r[0] - q[0]) * t, z - q[1] - (r[1] - q[1]) * t);
  }), Infinity);
  const nearPath = (x: number, z: number) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].some(([dx, dz]) => carve(x + dx!, z + dz!) != null);
  for (const st of stairs) {
    for (const [a, b] of stairParcels(survey, st).flatMap(ringEdges)) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const [nx, nz] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
      const n = Math.max(1, Math.ceil(len / 0.5));
      let runSt: Array<{ x: number; z: number; yTop: number; yFoot: number }> = [];
      const flush = () => { if (runSt.length >= 2) out.push({ type: "custom-mesh", stations: runSt, thick: 0.3, material: "stone", tag: "site:survey-wall" }); runSt = []; };
      for (let k = 0; k <= n; k++) {
        const [x, z] = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n];
        const [g1, g2] = [groundAt(x + nx * 0.45, z + nz * 0.45), groundAt(x - nx * 0.45, z - nz * 0.45)];
        if (Math.abs(g1 - g2) < 0.3 || nearPath(x, z) || offWall(x, z) < 0.35) { flush(); continue; }
        runSt.push({ x, z, yTop: Math.max(g1, g2) + 0.15, yFoot: Math.min(g1, g2) - 0.3 });
      }
      flush();
    }
  }
  return out;
}

/**
 * The guard along both sides of every flight and round every landing's open edges, as the photographs show it (11–12): a stone parapet
 * 50 cm over the treads, 25 cm thick, with a dark green railing of upright bars on it to 1.05 m. A landing's edge is open where no flight
 * of the stair meets it. Where a surveyed wall already runs along the guard's line (within 35 cm), the wall is the parapet and only the
 * railing stands on it.
 */
function stairGuards(survey: PisgaSurvey, stairs: SurveyStair[], groundAt: (x: number, z: number) => number, links: StairLink[]): Primitive[] {
  const out: Primitive[] = [];
  const walls = stairWalls(survey, stairs);
  const offWall = (x: number, z: number) => Math.min(...walls.map(([q, r]) => {
    const l2 = (r[0] - q[0]) ** 2 + (r[1] - q[1]) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((x - q[0]) * (r[0] - q[0]) + (z - q[1]) * (r[1] - q[1])) / l2));
    return Math.hypot(x - q[0] - (r[0] - q[0]) * t, z - q[1] - (r[1] - q[1]) * t);
  }), Infinity);
  // One straight guard from a to b, its walking level going from ya to yb; open where it crosses a link (within 25 cm of it).
  const run = (a: [number, number], b: [number, number], ya: number, yb: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05));
    const at = (t: number): [number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    let from: number | null = null;
    for (let k = 0; k <= n; k++) {
      const t = k / n, open = !nearLink(links, ...at(t), 0.25);
      if (open && from == null) from = t;
      if ((!open || k === n) && from != null) {
        const t1 = open ? t : (k - 1) / n;
        if (t1 > from) whole(at(from), at(t1), ya + (yb - ya) * from, ya + (yb - ya) * t1);
        from = null;
      }
    }
  };
  // Every guard's two ends, to close the gaps between them afterwards.
  const ends: Array<{ p: [number, number]; y: number; id: number }> = [];
  let runs = 0;
  const whole = (a: [number, number], b: [number, number], ya: number, yb: number, record = true) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < (record ? 0.2 : 0.05)) return;
    if (record) { ends.push({ p: a, y: ya, id: runs }, { p: b, y: yb, id: runs }); runs++; }
    const n = Math.max(1, Math.ceil(len / 0.15));
    const pts = Array.from({ length: n + 1 }, (_, k) => ({ x: a[0] + ((b[0] - a[0]) * k) / n, z: a[1] + ((b[1] - a[1]) * k) / n, y: ya + ((yb - ya) * k) / n }));
    const walled = pts.filter((p) => offWall(p.x, p.z) < 0.35).length > pts.length * 0.6;
    // Its foot goes under the lower ground within 45 cm either side: on its own line the ground is still the path's, and a bed below it
    // stood as a cliff of earth under the stone.
    const [nx, nz] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    if (!walled) {
      out.push({ type: "custom-mesh", stations: pts.filter((_, k) => k % 3 === 0 || k === n).map((p) => ({ x: p.x, z: p.z, yTop: p.y + 0.5, yFoot: Math.min(p.y, ...[0, 0.45, -0.45].map((d) => groundAt(p.x + nx * d, p.z + nz * d))) - 0.3 })), thick: 0.25, material: "stone", tag: "site:survey-parapet" });
    }
    // The railing: one handrail along the whole run, sloping with the flight (short level pieces read as a staircase of bars, the user's
    // complaint of 2026-11-01), a flat bar on the parapet the uprights stand in, and an upright every 15 cm.
    const band = (lift: number, depth: number) => out.push({ type: "custom-mesh", stations: [{ x: a[0], z: a[1], yTop: ya + lift, yFoot: ya + lift - depth }, { x: b[0], z: b[1], yTop: yb + lift, yFoot: yb + lift - depth }], thick: 0.05, material: "railGreen", tag: "site:survey-stair-rail" });
    band(1.08, 0.06);
    band(0.55, 0.04);
    for (const p of pts) out.push({ type: "box", centre: { x: p.x, y: p.y + 0.775, z: p.z }, size: { x: 0.025, y: 0.55, z: 0.025 }, material: "railGreen", tag: "site:survey-stair-rail" });
  };
  for (const st of stairs) {
    // Plan footprints of the stair's flights (a going beyond each end) and pads, where a landing's edge is not open.
    const foot = st.flights.map((f) => {
      const [px, pz] = [-f.up[1] * (f.width / 2 + 0.05), f.up[0] * (f.width / 2 + 0.05)];
      const a: [number, number] = [f.low[0] - f.up[0] * f.going, f.low[1] - f.up[1] * f.going], b: [number, number] = [f.high[0] + f.up[0] * f.going, f.high[1] + f.up[1] * f.going];
      return [[a[0] + px, a[1] + pz], [b[0] + px, b[1] + pz], [b[0] - px, b[1] - pz], [a[0] - px, a[1] - pz]] as Array<[number, number]>;
    });
    st.flights.forEach((f, i) => {
      const off = f.width / 2 + 0.125;
      const [px, pz] = [-f.up[1] * off, f.up[0] * off];
      const lo: [number, number] = [f.low[0] - f.up[0] * f.going * 0.5, f.low[1] - f.up[1] * f.going * 0.5];
      const hi: [number, number] = [f.high[0] + f.up[0] * f.going * 0.5, f.high[1] + f.up[1] * f.going * 0.5];
      for (const side of [1, -1]) run([lo[0] + px * side, lo[1] + pz * side], [hi[0] + px * side, hi[1] + pz * side], f.lowLevel, f.highLevel);
      const next = st.flights[i + 1];
      if (!next) return;
      // The landing's edges, inset a guard's half thickness: each in 15 cm steps, the open stretches guarded.
      const ring = landingRing(f, next), level = st.landings[i]!.level;
      const [cx, cz] = [ring.reduce((t, q) => t + q[0], 0) / 4, ring.reduce((t, q) => t + q[1], 0) / 4];
      const inset = ring.map(([x, z]): [number, number] => { const d = Math.hypot(x - cx, z - cz) || 1; return [x + ((cx - x) / d) * 0.18, z + ((cz - z) / d) * 0.18]; });
      for (let e = 0; e < 4; e++) {
        const [a, b] = [inset[e]!, inset[(e + 1) % 4]!];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(1, Math.round(len / 0.15));
        let from: number | null = null;
        for (let k = 0; k <= n; k++) {
          const t = k / n, [x, z] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          const open = !foot.some((r) => insidePolygon(r, x, z));
          if (open && from == null) from = t;
          if ((!open || k === n) && from != null) {
            const t1 = open ? t : (k - 1) / n;
            if (t1 > from) run([a[0] + (b[0] - a[0]) * from, a[1] + (b[1] - a[1]) * from], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1], level, level);
            from = null;
          }
        }
      }
    });
  }
  // The gaps between a flight's guard and its landing's (the flight's guard stops half a going past its end, the landing's starts where
  // the flight's footprint ends): up to a metre, bridged where the stretch between crosses no flight's treads and no link — a flight leaves a
  // landing through a gap as wide as itself, over a metre. The user saw the guards broken at every landing (jn-w-top, jn-e-kg).
  const treads = stairs.flatMap((st) => st.flights.map((f) => {
    const [px, pz] = [-f.up[1] * (f.width / 2 - 0.1), f.up[0] * (f.width / 2 - 0.1)];
    const [a, b] = [[f.low[0] - f.up[0] * f.going * 0.4, f.low[1] - f.up[1] * f.going * 0.4], [f.high[0] + f.up[0] * f.going * 0.4, f.high[1] + f.up[1] * f.going * 0.4]] as const;
    return [[a[0] + px, a[1] + pz], [b[0] + px, b[1] + pz], [b[0] - px, b[1] - pz], [a[0] - px, a[1] - pz]] as Array<[number, number]>;
  }));
  const done = new Set<string>();
  for (const e of ends) {
    let best: (typeof ends)[number] | null = null, bd = 1.0;
    for (const o of ends) {
      if (o.id === e.id || Math.abs(o.y - e.y) > 0.6) continue;
      const d = Math.hypot(o.p[0] - e.p[0], o.p[1] - e.p[1]);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best || bd < 0.08) continue;
    const key = [e.id, best.id].sort().join(":");
    if (done.has(key)) continue;
    const crosses = [0.25, 0.5, 0.75].some((t) => {
      const [x, z] = [e.p[0] + (best!.p[0] - e.p[0]) * t, e.p[1] + (best!.p[1] - e.p[1]) * t];
      return treads.some((r) => insidePolygon(r, x, z)) || nearLink(links, x, z, 0.25);
    });
    if (crosses) continue;
    done.add(key);
    whole(e.p, best.p, e.y, best.y, false);
  }
  // A link's own edges over a drop.
  for (const l of links) for (const [a, b] of l.guards ?? []) whole(a, b, l.level, l.level);
  return out;
}

/** A wall or parapet opened where a link passes it: its stations every 10 cm, the runs between the links' reach (30 cm round them) kept. */
function openAtLinks(p: Extract<Primitive, { type: "custom-mesh" }>, links: StairLink[]): Primitive[] {
  if (!p.stations.some((_, i) => i > 0 && [0, 0.5, 1].some((t) => { const [a, b] = [p.stations[i - 1]!, p.stations[i]!]; return nearLink(links, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0.4); }))) return [p];
  const dense: typeof p.stations = [];
  p.stations.forEach((b, i) => {
    const a = p.stations[i - 1];
    if (!a) { dense.push(b); return; }
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1));
    for (let k = 1; k <= n; k++) { const t = k / n; dense.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yTop: a.yTop + (b.yTop - a.yTop) * t, yFoot: a.yFoot + (b.yFoot - a.yFoot) * t }); }
  });
  const out: Primitive[] = [];
  let run: typeof p.stations = [];
  const flush = () => { if (run.length >= 2) out.push({ ...p, stations: run }); run = []; };
  for (const q of dense) { if (nearLink(links, q.x, q.z, 0.3)) flush(); else run.push(q); }
  flush();
  return out;
}

/** The closed parcels (M1803) a side stair stands in: each ring holding the foot of one of its flights. */
function stairParcels(survey: PisgaSurvey, st: SurveyStair): Array<Array<[number, number]>> {
  return survey.lines.filter((l) => l.layer === "M1803" && l.closed && l.pts.length >= 3 && st.flights.some((f) => insidePolygon(l.pts, f.low[0], f.low[1]))).map((l) => l.pts);
}

/** A parcel's edges as segments. */
const ringEdges = (r: Array<[number, number]>): Seg[] => r.map((p, i) => [p, r[(i + 1) % r.length]!] as Seg);

// The survey's walls (M2602) within 8 m of a side stair: each face a line, a wall two faces 20–30 cm apart.
function stairWalls(survey: PisgaSurvey, stairs: SurveyStair[]): Seg[] {
  const pts = stairs.flatMap((st) => st.flights.flatMap((f) => [f.low, f.high]));
  const near = (q: [number, number]) => pts.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 8);
  return surveySegments(survey, "M2602").filter(([a, b]) => near(a) || near(b));
}

/**
 * Both side stairs as the survey draws them: each flight's treads on a stone mass down to the ground, a landing between flights at the
 * level the surveyor took on it, the walls (M2602) that hold the slope along the path, shrubs in the beds where the surveyor took their
 * levels, and a handrail along each flight.
 */
export function surveyStairPrims(survey: PisgaSurvey, groundAt: (x: number, z: number) => number, stairs = surveyStairs(survey), links: StairLink[] = []): Primitive[] {
  const out: Primitive[] = [];
  const pathPts: Array<{ x: number; z: number; level: number }> = [];
  for (const st of stairs) {
    for (const f of st.flights) {
      for (let k = 0; k < f.n; k++) {
        const t = k / Math.max(1, f.n - 1);
        pathPts.push({ x: f.low[0] + (f.high[0] - f.low[0]) * t, z: f.low[1] + (f.high[1] - f.low[1]) * t, level: f.lowLevel + ((f.highLevel - f.lowLevel) * (k + 1)) / f.n });
      }
    }
    for (const l of st.landings) pathPts.push({ x: l.x, z: l.z, level: l.level });
  }
  // The level of the path nearest a point within `within` metres, else null.
  const pathLevel = (x: number, z: number, within: number) => {
    let best: { d: number; level: number } | null = null;
    for (const p of pathPts) { const d = Math.hypot(p.x - x, p.z - z); if (d < within && (!best || d < best.d)) best = { d, level: p.level }; }
    return best?.level ?? null;
  };

  for (const st of stairs) {
    st.flights.forEach((f, i) => {
      const set: TreadSet = { n: f.n, width: f.width, pitch: f.going, dir: [-f.up[0], -f.up[1]], first: f.high, last: f.low, layer: "M2412" };
      const under = Array.from({ length: 5 }, (_, k) => groundAt(f.low[0] + ((f.high[0] - f.low[0]) * k) / 4, f.low[1] + ((f.high[1] - f.low[1]) * k) / 4));
      const base = Math.min(f.lowLevel - 0.3, ...under.map((g) => g - 0.3));
      out.push(...stairPrims(set, f.highLevel, f.lowLevel, "site:survey-stair", "stone", base, true).filter((p) => !(p.tag ?? "").endsWith("-rail")));
      const next = st.flights[i + 1];
      if (!next) return;
      const ring = landingRing(f, next);
      const level = st.landings[i]!.level;
      const low = Math.min(level - 0.3, ...ring.map(([x, z]) => groundAt(x, z) - 0.3));
      out.push({ type: "prism", ring, y0: low, y1: level, material: "stone", tag: "site:survey-landing" });
    });
  }

  // The step-off pads at each stair's foot and head.
  for (const st of stairs) {
    for (const e of endPads(st)) {
      const low = Math.min(e.level - 0.3, ...e.ring.map(([x, z]) => groundAt(x, z) - 0.3));
      out.push({ type: "prism", ring: e.ring, y0: low, y1: e.level, material: "stone", tag: "site:survey-landing" });
    }
  }
  out.push(...stairGuards(survey, stairs, groundAt, links));
  out.push(...parcelWalls(survey, stairs, groundAt, links));
  // The links' paving, on fill down to the ground.
  for (const l of links) {
    if (l.pave === false) continue;
    const low = Math.min(l.level - 0.3, ...l.ring.map(([x, z]) => groundAt(x, z) - 0.3));
    out.push({ type: "prism", ring: l.ring, y0: low, y1: l.level, material: "stone", tag: "site:survey-landing" });
  }

  // Walls: every M2602 face beside the stairs. Where the surveyor measured a wall's head (M2651: a head and a foot spot together, the
  // head the higher) within a metre of the face, the coping is that head, interpolated between heads along the face. Elsewhere it stands
  // 15 cm over the ground on its higher side (a terrace, a bed) or 45 cm over the path within a metre, averaged over half a metre either
  // way; the foot goes under the ground and the path on both sides.
  const heads: Array<{ x: number; z: number; level: number }> = [];
  for (const sp of survey.spots.filter((q) => q.layer === WALL_SPOT_LAYER).sort((p, q) => q.level - p.level)) {
    if (!heads.some((h) => Math.hypot(h.x - sp.x, h.z - sp.z) < 0.3)) heads.push(sp);
  }
  let capped = 0;
  // A wall is two faces 20–30 cm apart: the shorter of a pair (every point within 40 cm of the other) goes, and the other stands 30 cm thick.
  const faces = stairWalls(survey, stairs).sort(([a, b], [c, d]) => Math.hypot(d[0] - c[0], d[1] - c[1]) - Math.hypot(b[0] - a[0], b[1] - a[1]));
  const offFace = (p: [number, number], [q, r]: Seg) => {
    const l2 = (r[0] - q[0]) ** 2 + (r[1] - q[1]) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - q[0]) * (r[0] - q[0]) + (p[1] - q[1]) * (r[1] - q[1])) / l2));
    return Math.hypot(p[0] - q[0] - (r[0] - q[0]) * t, p[1] - q[1] - (r[1] - q[1]) * t);
  };
  const single: Seg[] = [];
  for (const f of faces) if (!single.some((k) => offFace(f[0], k) < 0.4 && offFace(f[1], k) < 0.4)) single.push(f);
  for (const [a, b] of single) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / 0.5));
    const [nx, nz] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    // The measured heads beside this face, by their place along it.
    const own = heads
      .map((h) => ({ t: ((h.x - a[0]) * (b[0] - a[0]) + (h.z - a[1]) * (b[1] - a[1])) / len, off: Math.abs((h.x - a[0]) * nx + (h.z - a[1]) * nz), level: h.level }))
      .filter((h) => h.off < 1 && h.t > -0.5 && h.t < len + 0.5)
      .sort((p, q) => p.t - q.t);
    // A head reaches 1.5 m along the face; between two heads less than 4 m apart the coping runs straight from one to the other.
    const headAt = (t: number) => {
      for (let i = 1; i < own.length; i++) {
        const [p, q] = [own[i - 1]!, own[i]!];
        if (t >= p.t && t <= q.t && q.t - p.t < 4) return p.level + ((q.level - p.level) * (t - p.t)) / (q.t - p.t || 1);
      }
      const near = own.filter((h) => Math.abs(h.t - t) < 1.5).sort((p, q) => Math.abs(p.t - t) - Math.abs(q.t - t))[0];
      return near?.level ?? null;
    };
    const raw = Array.from({ length: n + 1 }, (_, k) => {
      const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n;
      const path = pathLevel(x, z, 1.2);
      const [g1, g2] = [groundAt(x + nx * 0.4, z + nz * 0.4), groundAt(x - nx * 0.4, z - nz * 0.4)];
      // A coping stands at most 1.1 m over the higher ground or the path beside it, unless the ground it retains comes up to it within 3 m
      // behind (the tall wall under the upper road at the east stair's head, photographs 15–16). A head measured higher with nothing behind it
      // has its terrace missing from the TIN, and a wall drawn to it would stand as a free fin over the slope.
      const behind = Math.max(...[1.5, 3].flatMap((d) => [groundAt(x + nx * d, z + nz * d), groundAt(x - nx * d, z - nz * d)]));
      const cap = Math.max(g1, g2, path ?? -Infinity, behind) + 1.1;
      const head = headAt((len * k) / n);
      if (head != null && head > cap) capped++;
      const top = Math.min(cap, head ?? Math.max(Math.max(g1, g2) + 0.15, path != null ? path + 0.45 : -Infinity));
      return { x, z, top, foot: Math.min(g1, g2, path ?? g1) - 0.3, measured: head != null };
    });
    // The coping runs smooth over a metre either way (a measured head moves by the few centimetres its neighbours differ), never under 15 cm
    // over the ground beside it.
    const stations = raw.map((r, k) => {
      const win = raw.slice(Math.max(0, k - 2), k + 3);
      return { x: r.x, z: r.z, yTop: Math.max(r.foot + 0.45, win.reduce((t, q) => t + q.top, 0) / win.length), yFoot: Math.min(...win.map((q) => q.foot)) };
    });
    out.push(...openAtLinks({ type: "custom-mesh", stations, thick: 0.3, material: "stone", tag: "site:survey-wall" }, links));
  }
  if (capped && process.env.DEBUG_WALLS) console.warn(`survey stairs: ${capped} wall stations held to 1.1 m over the ground under a higher measured head`);
  // Shrubs where the surveyor took a level in a bed beside the path (30 cm or more over it, within 3 m, off the path itself): the
  // photographs' planted terraces between the flights.
  for (const sp of survey.spots.filter((q) => q.layer === "M1502")) {
    const path = pathLevel(sp.x, sp.z, 3);
    if (path == null || sp.level < path + 0.3 || pathPts.some((p) => Math.hypot(p.x - sp.x, p.z - sp.z) < 0.9)) continue;
    out.push({ type: "tree", kind: "scrub", at: { x: sp.x, y: sp.level - 0.1, z: sp.z }, height: 1.1, crown: 0.9, tag: "site:survey-shrub" });
  }
  return out;
}
