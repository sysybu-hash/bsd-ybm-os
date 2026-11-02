import { insidePolygon } from "@/lib/projects/building/assemble";
import type { BuildingMaterial, Primitive } from "@/lib/projects/building/model";
import { slopedWall, stairPath } from "@/lib/projects/building/pisga-stairs";
import { entitiesWithin, flattenDxf, type DxfDrawing, type Pt } from "@/lib/projects/dxf-drawing";

/**
 * מרכז פסג"ה — the stairs and the street, as the sheets draw them.
 *
 * Every figure here is read off a sheet, in the floor −1 sheet's metres:
 * the flights from their treads (findFlights on sheets 5 and 6, their
 * direction from which flight floor −2's cut shows), the street from the
 * plot's south line on the site plan and the bay lines drawn along it.
 */
type Levels = { floorMinus2: number; floorMinus1: number; roof: number; street: number };

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, material: BuildingMaterial, tag: string): Primitive => ({
  type: "box",
  centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 },
  size: { x: Math.abs(x1 - x0), y: Math.abs(y1 - y0), z: Math.abs(z1 - z0) },
  material,
  tag,
});

/**
 * A straight flight as solid steps: `n` treads from `from` to `to` along one
 * axis, rising from `bottom` by `rise` each, each step a block down to `base`.
 */
function flight(opts: {
  along: "x" | "z";
  from: number;
  to: number;
  across: [number, number];
  n: number;
  bottom: number;
  rise: number;
  base: number;
  material: BuildingMaterial;
  tag: string;
}): Primitive[] {
  const out: Primitive[] = [];
  const run = (opts.to - opts.from) / opts.n;
  for (let k = 0; k < opts.n; k++) {
    const a = opts.from + k * run;
    const b = a + run;
    const top = opts.bottom + (k + 1) * opts.rise;
    out.push(
      opts.along === "x"
        ? box(a, b, opts.base, top, opts.across[0], opts.across[1], opts.material, opts.tag)
        : box(opts.across[0], opts.across[1], opts.base, top, a, b, opts.material, opts.tag),
    );
  }
  return out;
}

export function pisgaStairs(L: Levels): Primitive[] {
  const out: Primitive[] = [];

  // The lobby's open stair (sheets 5, 6): two flights of 13 treads, 30 cm,
  // between x 22.18 and 26.09. Floor −2's cut shows the north flight, so it
  // is the lower: it climbs west from the lobby to a landing, and the south
  // flight climbs back east onto floor −1.
  const lobbyRise = (L.floorMinus1 - L.floorMinus2) / 28;
  out.push(
    ...flight({ along: "x", from: 26.09, to: 22.18, across: [4.65, 6.05], n: 13, bottom: L.floorMinus2, rise: lobbyRise, base: L.floorMinus2, material: "stone", tag: "floor-2:inside:stair" }),
  );
  out.push(box(20.55, 22.18, L.floorMinus2 + 14 * lobbyRise - 0.3, L.floorMinus2 + 14 * lobbyRise, 4.65, 7.65, "stone", "floor-2:inside:stair"));
  // The upper flight on a folded plate, open beneath.
  for (let k = 0; k < 13; k++) {
    const a = 22.18 + (k * (26.09 - 22.18)) / 13;
    const top = L.floorMinus2 + (15 + k) * lobbyRise;
    out.push(box(a, a + (26.09 - 22.18) / 13, top - 0.28, top, 6.25, 7.65, "stone", "floor-2:inside:stair"));
  }
  // Glass balustrades, each one pane cut on the flight's slope a metre over the tread nosings (the user's mark, 2026-11-01: a pane from
  // floor −2 to over floor −1 read as a dark block, a stepped one as untidy): outside the lower flight (z 4.6), between the flights and
  // outside the upper one (6.15, 7.7, on the upper flight's slope); and 1.05 m on floor −1 along the void's north edge over the lower flight.
  const pane = (z: number, yWest: number, yEast: number, foot: number) => ({
    type: "custom-mesh" as const,
    stations: [{ x: 22.18, z, yFoot: yWest - foot, yTop: yWest + 1 }, { x: 26.09, z, yFoot: yEast - foot, yTop: yEast + 1 }],
    thick: 0.02, material: "glass" as const, tag: "floor-2:inside:stair",
  });
  out.push(pane(4.6, L.floorMinus2 + 14 * lobbyRise, L.floorMinus2 + lobbyRise, 0.3));
  for (const z of [6.15, 7.7]) out.push(pane(z, L.floorMinus2 + 15 * lobbyRise, L.floorMinus1, 0.3));
  out.push(box(22.18, 26.09, L.floorMinus1, L.floorMinus1 + 1.05, 4.59, 4.61, "glass", "floor-2:inside:stair"));

  // The stair core (sheet 5): one flight six metres wide, 14 treads of 31 cm,
  // from floor −1 at +12.77 up south to the entrance landing at +15.01.
  const coreRise = (15.01 - L.floorMinus1) / 14;
  out.push(...flight({ along: "z", from: 11.77, to: 16.12, across: [24.42, 30.43], n: 14, bottom: L.floorMinus1, rise: coreRise, base: L.floorMinus1, material: "stone", tag: "floor-1:inside:stair" }));
  out.push(box(24.42, 30.43, 14.7, 15.01, 16.12, 16.74, "stone", "floor-1:inside:stair"));

  // The main entrance from the street (sheets 3, 5): 14 treads of 31 cm the
  // same six metres wide, from the landing at +15.01 up to the street.
  const entryRise = (L.street + 0.05 - 15.01) / 14;
  out.push(...flight({ along: "z", from: 16.74, to: 21.1, across: [24.42, 30.43], n: 14, bottom: 15.01, rise: entryRise, base: 14.6, material: "stone", tag: "site:entry-stair" }));
  // Its side walls, stone, and the slab it stands on over the courtyard.
  for (const x of [24.22, 30.43]) out.push(box(x, x + 0.2, 8.2, L.street + 1.0, 16.58, 21.1, "stone", "site:entry-stair"));
  out.push(box(24.42, 30.43, 8.2, 14.6, 16.58, 21.1, "concrete", "site:entry-stair"));

  // The existing emergency stair on the west (sheet 5, "מדרגות חרום קיימות"):
  // 11 treads climbing south, a landing, 13 climbing north to floor −1's exit.
  const westBottom = L.floorMinus1 - 24 * 0.18;
  out.push(...flight({ along: "z", from: 12.18, to: 15.05, across: [-1.57, -0.36], n: 11, bottom: westBottom, rise: 0.18, base: westBottom - 0.4, material: "concrete", tag: "site:west-stair" }));
  out.push(box(-1.57, 0.93, westBottom - 0.4, westBottom + 12 * 0.18, 15.05, 16.6, "concrete", "site:west-stair"));
  out.push(...flight({ along: "z", from: 15.31, to: 11.92, across: [-0.37, 0.93], n: 13, bottom: westBottom + 11 * 0.18, rise: 0.18, base: westBottom - 0.4, material: "concrete", tag: "site:west-stair" }));
  out.push(box(-1.57, 0.93, westBottom - 0.4, L.floorMinus1, 10.4, 11.92, "concrete", "site:west-stair"));
  for (const x of [-1.62, 0.93]) out.push(box(x, x + 0.05, westBottom, L.floorMinus1 + 1.05, 10.4, 16.6, "metal", "site:west-stair"));
  return out;
}

/**
 * The plot's south line, west to east: the street runs along it.
 * From x −11 to x 61 the vertices are the survey (layer M2602 on floor −1), one shot apiece,
 * shifted south so the line still meets the coarse edge it replaces (about 0.7 m at the west
 * shots, about 1.6 m at x 61). The old six chords of 15–20 m were the blocky kerb.
 * Past the survey the line runs on, so a view never cuts the street short.
 */
const PLOT_SOUTH: Array<[number, number]> = [
  [-160, 24.9],
  [-16, 21.4],
  [-10.89, 21.24],
  [-10.52, 21.23],
  [-7.76, 21.1],
  [-3.81, 20.94],
  [-3.08, 20.91],
  [-0.85, 20.81],
  [-0.47, 20.82],
  [1.0, 20.88],
  [3.97, 21.01],
  [7.57, 21.15],
  [9.35, 21.22],
  [10.78, 21.33],
  [14.0, 21.58],
  [19.55, 22.0],
  [23.78, 22.45],
  [28.17, 22.91],
  [30.33, 23.15],
  [34.35, 23.75],
  [38.48, 24.37],
  [40.59, 24.7],
  [43.95, 25.4],
  [47.36, 26.13],
  [49.6, 26.62],
  [52.59, 27.31],
  [55.18, 27.9],
  [57.99, 28.55],
  [61.31, 29.44],
  // Past the survey the road turns south-east with the blocks the aerial draws along it (26.6°, pisga-neighbours.ts) and runs clear of
  // their south faces; held at 13° it ran through the red-roofed row (aerial-ne, the user's mark, 2026-11-01).
  [70, 35],
  [80, 40.5],
  [200, 100.5],
];

/** Catmull-Rom through the plot line, a point every `step` metres, so a kerb follows the survey instead of one chord per shot. */
function fairPlot(line: Array<[number, number]>, step: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const n = line.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = line[Math.max(0, i - 1)]!;
    const p1 = line[i]!;
    const p2 = line[i + 1]!;
    const p3 = line[Math.min(n - 1, i + 2)]!;
    const seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.ceil(seg / step));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      const prev = out[out.length - 1];
      if (!prev || x > prev[0] + 1e-3) out.push([x, z]);
    }
  }
  const last = line[n - 1]!;
  const prev = out[out.length - 1];
  if (!prev || last[0] > prev[0] + 1e-3) out.push(last);
  return out;
}

let plotCache: Array<[number, number]> | null = null;
function plotLine(): Array<[number, number]> {
  plotCache ??= fairPlot(PLOT_SOUTH, 0.7);
  return plotCache;
}

/** A band beside a polyline: between offsets a and b (metres, positive to the south), over x in [x0, x1]. */
function band(line: Array<[number, number]>, a: number, b: number, x0: number, x1: number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const at = (x: number): [number, number, number, number] => {
    for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1]!;
      const [bx, bz] = line[i]!;
      if (x >= ax && x <= bx) {
        const t = (x - ax) / (bx - ax);
        const len = Math.hypot(bx - ax, bz - az);
        // South normal of the segment.
        return [x, az + t * (bz - az), -(bz - az) / len, (bx - ax) / len];
      }
    }
    const [, lz] = line[line.length - 1]!;
    return [x, lz, 0, 1];
  };
  const xs = [x0, ...line.map(([x]) => x).filter((x) => x > x0 && x < x1), x1];
  const top = xs.map((x) => {
    const [px, pz, nx, nz] = at(x);
    return [px + nx * a, pz + nz * a] as [number, number];
  });
  const bottom = xs.map((x) => {
    const [px, pz, nx, nz] = at(x);
    return [px + nx * b, pz + nz * b] as [number, number];
  });
  pts.push(...top, ...bottom.reverse());
  return pts;
}

/** The plot's south line at x (z, metres): the street's band lies from here out to 13.5 m. */
export function pisgaPlotSouthZ(x: number): number {
  const line = plotLine();
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1]!;
    const [bx, bz] = line[i]!;
    if (x >= ax && x <= bx) return az + ((x - ax) / (bx - ax)) * (bz - az);
  }
  return line[line.length - 1]![1];
}

type Walk = { ring: Array<[number, number]> };
type SheetStreet = { walks: Walk[]; stripes: Array<[[number, number], [number, number]]>; kerb: Array<[number, number]> | null; returns: Array<Array<[number, number]>> };

/** The site sheet ("חישובי שטחים") in the same plan frame the terrain check uses. */
const SITE_X0 = 258575;
const SITE_Y0 = 644784;
const sitePlan = (p: Pt): [number, number] => [(p.x - SITE_X0) / 100, (SITE_Y0 - p.y) / 100];

const ringArea = (r: Array<[number, number]>) => {
  let a = 0;
  for (let i = 0; i < r.length; i++) a += r[i]![0] * r[(i + 1) % r.length]![1] - r[(i + 1) % r.length]![0] * r[i]![1];
  return Math.abs(a) / 2;
};

/** Keep the part of a ring south of the parking deck (z 19.2); the hatch also runs up the drive onto the deck. */
function clipSouth(ring: Array<[number, number]>, zMin: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const ain = a[1] >= zMin - 1e-6;
    const bin = b[1] >= zMin - 1e-6;
    const hit = (): [number, number] => {
      const t = (zMin - a[1]) / (b[1] - a[1] || 1);
      return [a[0] + (b[0] - a[0]) * t, zMin];
    };
    if (ain && bin) out.push(b);
    else if (ain && !bin) out.push(hit());
    else if (!ain && bin) out.push(hit(), b);
  }
  const clean: Array<[number, number]> = [];
  for (const p of out) {
    const prev = clean[clean.length - 1];
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 0.05) clean.push(p);
  }
  if (clean.length > 2 && Math.hypot(clean[0]![0] - clean[clean.length - 1]![0], clean[0]![1] - clean[clean.length - 1]![1]) < 0.05) clean.pop();
  return clean;
}

/** z of a polyline at x. The kerb line (M2404) rises to the east, so x is enough. */
function alongZ(line: Array<[number, number]>, x: number): number {
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    if (x >= a[0] && x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1);
  }
  return x < line[0]![0] ? line[0]![1] : line[line.length - 1]![1];
}

/** Keep the part of a ring on the building side of the kerb line. The hatch runs a little past it at the drive return. */
function clipNorthOf(ring: Array<[number, number]>, limit: (x: number) => number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const north = (p: [number, number]) => p[1] <= limit(p[0]) + 0.04;
  const hit = (a: [number, number], b: [number, number]): [number, number] => {
    let t = 0.5;
    for (let k = 0; k < 10; k++) {
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      t += (limit(x) - z) / (b[1] - a[1] || 1);
      t = Math.min(1, Math.max(0, t));
    }
    const x = a[0] + (b[0] - a[0]) * t;
    return [x, limit(x)];
  };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const ain = north(a);
    const bin = north(b);
    if (ain && bin) out.push(b);
    else if (ain && !bin) out.push(hit(a, b));
    else if (!ain && bin) out.push(hit(a, b), b);
  }
  const clean: Array<[number, number]> = [];
  for (const p of out) {
    const prev = clean[clean.length - 1];
    if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 0.04) clean.push(p);
  }
  if (clean.length > 2 && Math.hypot(clean[0]![0] - clean[clean.length - 1]![0], clean[0]![1] - clean[clean.length - 1]![1]) < 0.04) clean.pop();
  return clean;
}

/**
 * The sidewalks the site sheet hatches (layer design-e.safa, herringbone), the kerb (M2404, the line the
 * stripes are drawn across), and the crossing's stripes (the 3 m TNUA lines, one metre apart).
 */
function sheetStreet(drawing: DxfDrawing): SheetStreet {
  const pieces = flattenDxf(drawing, entitiesWithin(drawing, { centre: { x: 262200, y: 643700 }, width: 14000, height: 10000 }));
  let kerbRaw: Array<[number, number]> | null = null;
  let kerbZ0 = Infinity;
  for (const p of pieces) {
    if (p.layer !== "M2404" || !p.pts || p.pts.length < 30) continue;
    const line = p.pts.map(sitePlan);
    if (line[line.length - 1]![0] < line[0]![0]) line.reverse();
    let rising = true;
    for (let i = 1; i < line.length; i++) if (line[i]![0] <= line[i - 1]![0] + 1e-3) rising = false;
    if (!rising) continue;
    if (line[0]![1] < kerbZ0) {
      kerbZ0 = line[0]![1];
      kerbRaw = line;
    }
  }
  const kerb = kerbRaw ? fairPlot(kerbRaw, 0.35) : null;
  const limit = kerb ? (x: number) => alongZ(kerb, x) : () => Infinity;
  const rings: Array<{ ring: Array<[number, number]>; area: number }> = [];
  const rawRings: Array<Array<[number, number]>> = [];
  for (const p of pieces) {
    if (p.layer !== "design-e.safa" || p.pattern !== "AR-HBONE" || !p.rings) continue;
    for (const raw of p.rings) {
      const full = clipSouth(raw.map(sitePlan), 21);
      if (full.length >= 4) rawRings.push(full);
      const ring = clipNorthOf(full, limit);
      const area = ringArea(ring);
      const minZ = ring.length ? Math.min(...ring.map((q) => q[1])) : 0;
      // The thin copies and the arm that runs up the drive onto the deck are not the street sidewalk.
      if (ring.length >= 3 && area > 9 && minZ > 20.5) rings.push({ ring, area });
    }
  }
  rings.sort((a, b) => b.area - a.area);
  const walks: Walk[] = [];
  for (const r of rings) {
    const inside = r.ring.filter((p) => walks.some((w) => insidePolygon(w.ring, p[0], p[1]))).length;
    const x0 = Math.min(...r.ring.map((p) => p[0]));
    const x1 = Math.max(...r.ring.map((p) => p[0]));
    const covered = walks.some((w) => Math.min(...w.ring.map((p) => p[0])) - 0.6 <= x0 && Math.max(...w.ring.map((p) => p[0])) + 0.6 >= x1);
    // A ring that only repeats a sidewalk already taken is a copy. One that reaches past it (the piece by the drive) stays.
    if (inside > r.ring.length * 0.55 && covered) continue;
    walks.push({ ring: r.ring });
  }
  const stripes: Array<[[number, number], [number, number]]> = [];
  const seen = new Set<string>();
  for (const p of pieces) {
    if (p.layer !== "TNUA" || !p.pts || p.pts.length < 2) continue;
    const a = sitePlan(p.pts[0]!);
    const b = sitePlan(p.pts[p.pts.length - 1]!);
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 2.2 || len > 3.3 || Math.abs(dz) < 2 * Math.abs(dx)) continue;
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    if (mx < 33 || mx > 42 || mz < 23 || mz > 31) continue;
    const key = `${mx.toFixed(1)}|${mz.toFixed(1)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    stripes.push(dz > 0 ? [b, a] : [a, b]);
  }
  // The hatch's street edge rounds past the kerb line at the two ends of the crossing. The kerb's own
  // chords cut those rounds off, so the sidewalk there follows the hatch.
  const outerChain = (x0: number, x1: number): Array<[number, number]> | null => {
    if (!kerb) return null;
    const runs: Array<Array<[number, number]>> = [];
    for (const ring of rawRings) {
      let run: Array<[number, number]> = [];
      const consider = () => {
        if (run.some((p) => p[1] > alongZ(kerb, p[0]) + 0.35)) runs.push(run);
        run = [];
      };
      for (const p of ring) {
        if (p[0] >= x0 && p[0] <= x1) run.push(p);
        else consider();
      }
      consider();
    }
    if (!runs.length) return null;
    const xLo = Math.min(...runs.flat().map((p) => p[0]));
    const xHi = Math.max(...runs.flat().map((p) => p[0]));
    const xs = [xLo];
    for (let x = xLo + 0.28; x < xHi - 0.04; x += 0.28) xs.push(x);
    if (xHi - xs[xs.length - 1]! > 0.04) xs.push(xHi);
    const out: Array<[number, number]> = [];
    for (const x of xs) {
      let z = -Infinity;
      for (const run of runs) {
        for (let i = 1; i < run.length; i++) {
          const a = run[i - 1]!;
          const b = run[i]!;
          const lo = Math.min(a[0], b[0]);
          const hi = Math.max(a[0], b[0]);
          if (x < lo - 0.02 || x > hi + 0.02 || Math.abs(b[0] - a[0]) < 1e-6) continue;
          const t = (x - a[0]) / (b[0] - a[0]);
          if (t < -0.02 || t > 1.02) continue;
          z = Math.max(z, a[1] + (b[1] - a[1]) * t);
        }
      }
      if (z > -Infinity) out.push([x, z]);
    }
    // The east hatch's inner edge folds back north of the kerb. The sidewalk stays on the outer curve, then the kerb.
    if (x0 > 38) {
      while (out.length > 3 && out[out.length - 1]![1] < alongZ(kerb, out[out.length - 1]![0]) - 0.4) out.pop();
    }
    return out.length >= 4 ? out : null;
  };
  const returns = [outerChain(30.55, 34.75), outerChain(40.7, 46.9)].filter((c): c is Array<[number, number]> => c != null);
  return { walks, stripes, kerb, returns };
}

/** Northernmost z where a ring crosses x. */
function ringNorth(ring: Array<[number, number]>, x: number): number | null {
  let z = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    if ((a[0] <= x && b[0] > x) || (b[0] <= x && a[0] > x)) z = Math.min(z, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1));
  }
  return z < Infinity ? z : null;
}

/**
 * One sidewalk: the hatch's building edge on the north, `southAt` on the south.
 * A single ring, so the paving is not a stack of overlapping slabs.
 * `extra` are the rounded return's own x values, so the curve is not chorded between kerb points.
 */
function sidewalkSpan(kerb: Array<[number, number]>, walks: Walk[], x0: number, x1: number, southAt: (x: number) => number, extra: number[] = []): Array<[number, number]> | null {
  const north: Array<[number, number]> = [];
  const south: Array<[number, number]> = [];
  const xsRaw = [x0, ...kerb.map((p) => p[0]).filter((x) => x > x0 && x < x1), ...extra.filter((x) => x > x0 && x < x1), x1].sort((a, b) => a - b);
  const xs: number[] = [];
  for (const x of xsRaw) if (!xs.length || x - xs[xs.length - 1]! > 0.04) xs.push(x);
  for (const x of xs) {
    const sz = southAt(x);
    let nz = pisgaPlotSouthZ(x);
    for (const w of walks) {
      const hit = ringNorth(w.ring, x);
      if (hit != null) nz = Math.min(nz, hit);
    }
    // Up to the stair cheeks, the drive wall and the east retaining face. The hatch starts south of those, and the strip in between was a trench and a grass wedge.
    if (x > 24.1 && x < 30.6) nz = Math.min(nz, 21.65);
    if (x > 30.6 && x < 35.4) nz = Math.min(nz, 19.5);
    // East of the drive the hatch starts south of the retaining face. Without this pull the span is thinner than the plot line and is dropped.
    if (x > 39.8 && x < 54) nz = Math.min(nz, 19.45);
    if (sz < nz + 0.25) continue;
    north.push([x, nz - 0.05]);
    south.push([x, sz]);
  }
  if (north.length < 2) return null;
  return [...north, ...south.reverse()];
}

/** Where a stripe's axis crosses the kerb. The drawn line runs from the road up onto the pavement; the visible bar starts at the kerb. */
function stripeAtKerb(north: [number, number], south: [number, number], kerb: Array<[number, number]>): [number, number] {
  const rx = south[0] - north[0];
  const rz = south[1] - north[1];
  let bestT = Infinity;
  let hit: [number, number] | null = null;
  for (let i = 1; i < kerb.length; i++) {
    const c = kerb[i - 1]!;
    const d = kerb[i]!;
    const sx = d[0] - c[0];
    const sz = d[1] - c[1];
    const den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-8) continue;
    const t = ((c[0] - north[0]) * sz - (c[1] - north[1]) * sx) / den;
    const u = ((c[0] - north[0]) * rz - (c[1] - north[1]) * rx) / den;
    if (t < -0.05 || t > 0.92 || u < -0.02 || u > 1.02 || t >= bestT) continue;
    bestT = t;
    hit = [north[0] + t * rx, north[1] + t * rz];
  }
  return hit ?? north;
}

/** A 45 cm stripe centred on a line: half a metre of the drawing's 1 m stripe pitch. */
function stripeRing(a: [number, number], b: [number, number]): Array<[number, number]> {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  const nx = (-dz / len) * 0.225;
  const nz = (dx / len) * 0.225;
  return [
    [a[0] + nx, a[1] + nz],
    [b[0] + nx, b[1] + nz],
    [b[0] - nx, b[1] - nz],
    [a[0] - nx, a[1] - nz],
  ];
}

export function pisgaStreet(L: Levels, drawing?: DxfDrawing | null): Primitive[] {
  const out: Primitive[] = [];
  const s = L.street;
  // The drive in, x 35.3 to 41.3: the car-park fill the roof sheet draws runs straight down between them to the street.
  const DRIVE: [number, number] = [35.3, 41.3];
  const prism = (ring: Array<[number, number]>, y0: number, y1: number, material: BuildingMaterial, tag: string): Primitive => ({ type: "prism", ring, y0, y1, material, tag });
  const plot = plotLine();
  const drawn = drawing ? sheetStreet(drawing) : { walks: [], stripes: [], kerb: null, returns: [] };
  const span: [number, number] | null = drawn.walks.length
    ? [
        Math.min(...drawn.walks.map((w) => Math.min(...w.ring.map((p) => p[0])))),
        Math.max(...drawn.walks.map((w) => Math.max(...w.ring.map((p) => p[0])))),
      ]
    : null;
  // One sidewalk on each side of the drive. The two ends of the crossing follow the hatch's
  // rounded returns, not the kerb line's straight chords.
  const kerbLine = drawn.kerb;
  const mouth: [number, number] = [34.05, 41.05];
  const southAt = (x: number) => {
    if (!kerbLine) return pisgaPlotSouthZ(x) + 2;
    for (const line of drawn.returns) {
      if (line.length > 1 && x >= line[0]![0] - 0.02 && x <= line[line.length - 1]![0] + 0.02) return alongZ(line, x);
    }
    return alongZ(kerbLine, x);
  };
  const returnXs = drawn.returns.flatMap((line) => line.map((p) => p[0]));
  if (span && kerbLine && kerbLine.length > 2) {
    out.push(prism(band(plot, 0, 2.0, -160, span[0]), s - 1, s + 0.15, "paving", "site:sidewalk"));
    out.push(prism(band(plot, 0, 2.0, span[1], 200), s - 1, s + 0.15, "paving", "site:sidewalk"));
    const westReturn = drawn.returns.find((line) => line[0]![0] < 38);
    const eastReturn = drawn.returns.find((line) => line[0]![0] >= 38);
    const westEnd = westReturn ? westReturn[westReturn.length - 1]![0] : 34.6;
    const eastStart = eastReturn ? eastReturn[0]![0] : 40.8;
    const parts: Array<[number, number]> = [
      [span[0], westEnd],
      [eastStart, span[1]],
    ];
    for (const [x0, x1] of parts) {
      const ring = sidewalkSpan(kerbLine, drawn.walks, x0, x1, southAt, returnXs);
      if (ring) out.push(prism(ring, s - 1, s + 0.15, "paving", "site:sidewalk"));
    }
  } else if (span) {
    out.push(prism(band(plot, 0, 2.0, -160, span[0]), s - 1, s + 0.15, "paving", "site:sidewalk"));
    out.push(prism(band(plot, 0, 2.0, span[1], 200), s - 1, s + 0.15, "paving", "site:sidewalk"));
    for (const w of drawn.walks) out.push(prism(w.ring, s - 1, s + 0.15, "paving", "site:sidewalk"));
  } else {
    out.push(prism(band(plot, 0, 2.0, -160, DRIVE[0]), s - 1, s + 0.15, "paving", "site:sidewalk"));
    out.push(prism(band(plot, 0, 2.0, DRIVE[1], 200), s - 1, s + 0.15, "paving", "site:sidewalk"));
  }
  // Stone on the road side of the kerb line, one quad per segment so a kink cannot fold into the pavement.
  // Dropped across the crossing, where the stripes run over the line.
  if (kerbLine && kerbLine.length > 2) {
    const xK0 = kerbLine[0]![0];
    const xK1 = kerbLine[kerbLine.length - 1]![0];
    out.push(prism(band(plot, 1.85, 2.0, -160, xK0), s - 1, s + 0.16, "stone", "site:kerb"));
    out.push(prism(band(plot, 1.85, 2.0, xK1, 200), s - 1, s + 0.16, "stone", "site:kerb"));
    for (let i = 1; i < kerbLine.length; i++) {
      const a = kerbLine[i - 1]!;
      const b = kerbLine[i]!;
      const mid = (a[0] + b[0]) / 2;
      if (mid > mouth[0] - 0.05 && mid < mouth[1] + 0.05) continue;
      if (drawn.returns.some((line) => mid > line[0]![0] - 0.05 && mid < line[line.length - 1]![0] + 0.05)) continue;
      if (span && (mid < span[0] || mid > span[1])) continue;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 0.04) continue;
      let nx = -dz / len;
      let nz = dx / len;
      if (nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      const w = 0.15;
      out.push(prism([[a[0], a[1]], [b[0], b[1]], [b[0] + nx * w, b[1] + nz * w], [a[0] + nx * w, a[1] + nz * w]], s - 1, s + 0.17, "stone", "site:kerb"));
      const roadA = pisgaPlotSouthZ(a[0]) + 2;
      const roadB = pisgaPlotSouthZ(b[0]) + 2;
      if (a[1] < roadA - 0.08 && b[1] < roadB - 0.08) {
        out.push(prism([[a[0], a[1]], [b[0], b[1]], [b[0], roadB], [a[0], roadA]], s - 1, s, "asphalt", "site:street"));
      }
    }
    // Stone on the hatch's rounded returns. Left off across the stripes, where the paving meets the road.
    for (const line of drawn.returns) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1]!;
        const b = line[i]!;
        const mid = (a[0] + b[0]) / 2;
        if (mid > mouth[0] && mid < mouth[1]) continue;
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const len = Math.hypot(dx, dz);
        if (len < 0.04) continue;
        let nx = -dz / len;
        let nz = dx / len;
        if (nz < 0) {
          nx = -nx;
          nz = -nz;
        }
        const w = 0.15;
        out.push(prism([[a[0], a[1]], [b[0], b[1]], [b[0] + nx * w, b[1] + nz * w], [a[0] + nx * w, a[1] + nz * w]], s - 1, s + 0.17, "stone", "site:kerb"));
      }
    }
  } else {
    const kerbSpan = span ?? [DRIVE[0] - 1.5, DRIVE[1] + 1.5];
    out.push(prism(band(plot, 1.85, 2.0, -160, kerbSpan[0]), s - 1, s + 0.16, "stone", "site:kerb"));
    out.push(prism(band(plot, 1.85, 2.0, kerbSpan[1], 200), s - 1, s + 0.16, "stone", "site:kerb"));
  }
  // The road: parking bays along the kerb, two lanes, the far pavement.
  out.push(prism(band(plot, 2.0, 11.0, -160, 200), s - 1, s, "asphalt", "site:street"));
  out.push(prism(band(plot, 11.0, 13.5, -160, 200), s - 1, s + 0.15, "paving", "site:sidewalk-far"));
  // The drive in, flush with the road.
  // Straight from the car park's south edge (the roof sheet's fill, z 18.15) to the road's kerb line, its width the fill's: one asphalt
  // run from the deck to the street, over a footing so nothing is hollow under it.
  const kerb = (x: number) => pisgaPlotSouthZ(x) + 2.0;
  if (kerbLine && kerbLine.length > 2) {
    const xs = [DRIVE[0]];
    for (let x = DRIVE[0] + 0.7; x < DRIVE[1] - 0.05; x += 0.7) xs.push(x);
    xs.push(DRIVE[1]);
    const south = xs.map((x): [number, number] => [x, Math.min(kerb(x), southAt(x))]);
    out.push(prism([...xs.map((x): [number, number] => [x, 18.0]), ...south.reverse()], s - 1.6, s + 0.02, "asphalt", "site:entrance"));
  } else {
    out.push(prism([[DRIVE[0], 18.0], [DRIVE[1], 18.0], [DRIVE[1], kerb(DRIVE[1])], [DRIVE[0], kerb(DRIVE[0])]], s - 1.6, s + 0.02, "asphalt", "site:entrance"));
  }
  // Lines: the bays' outer edge and separators (13–16, the accessible bay, 17–18),
  // the centre line, the crossing at the drive.
  const mark = (ring: Array<[number, number]>) => out.push(prism(ring, s, s + 0.012, "parkingLine", "site:lines"));
  mark(band(plot, 4.35, 4.47, -12, 24.3));
  mark(band(plot, 4.35, 4.47, 45.9, 56.3));
  for (const x of [-5.3, 0.5, 6.1, 11.5, 17.0, 19.9, 21.3, 24.1, 45.9, 51.3, 56.2]) mark(band(plot, 2.0, 4.4, x - 0.06, x + 0.06));
  for (let x = -15; x < 74; x += 6) mark(band(plot, 7.64, 7.76, x, x + 3));
  // The crossing is the sheet's own stripes: the 3 m TNUA lines across the drive, one metre apart.
  if (drawn.stripes.length && kerbLine) {
    // Each stored axis is [road end, pavement end]. The bar runs from the sidewalk's edge to the road end.
    const edge: Array<[number, number]> = [];
    for (let x = 30; x <= 48; x += 0.2) edge.push([x, southAt(x)]);
    for (const axis of drawn.stripes) {
      const roadEnd = axis[0];
      const walkEnd = axis[1];
      const atEdge = stripeAtKerb(walkEnd, roadEnd, edge);
      const len = Math.hypot(walkEnd[0] - roadEnd[0], walkEnd[1] - roadEnd[1]) || 1;
      const onto: [number, number] = [atEdge[0] + ((walkEnd[0] - roadEnd[0]) / len) * 0.35, atEdge[1] + ((walkEnd[1] - roadEnd[1]) / len) * 0.35];
      out.push(prism(stripeRing(onto, roadEnd), s, s + 0.04, "parkingLine", "site:lines"));
    }
  } else if (drawn.stripes.length) {
    for (const [a, b] of drawn.stripes) out.push(prism(stripeRing(a, b), s, s + 0.035, "parkingLine", "site:lines"));
  } else {
    const zWest = kerb(DRIVE[0]);
    const zEast = kerb(DRIVE[1]);
    const mouthZ = (x: number) => zWest + ((x - DRIVE[0]) / (DRIVE[1] - DRIVE[0])) * (zEast - zWest);
    for (let x = DRIVE[0] + 0.35; x < DRIVE[1] - 0.55; x += 0.85) {
      const x1 = x + 0.45;
      const za = mouthZ(x);
      const zb = mouthZ(x1);
      mark([
        [x, za],
        [x1, zb],
        [x1, zb + 3.4],
        [x, za + 3.4],
      ]);
    }
  }
  // The barrier at the car park's gate, and its arm.
  out.push(box(DRIVE[0] - 0.3, DRIVE[0], s, s + 1.1, 19.2, 19.5, "frame", "site:gate"));
  out.push(box(DRIVE[0], DRIVE[1], s + 0.95, s + 1.0, 19.3, 19.36, "parkingLine", "site:gate"));
  return out;
}

/**
 * Paving from the courtyard wall's street face to the sidewalk, and from the entrance stair to the drive.
 * The sidewalk's inner edge sits south of that wall and of the stair, so a trench shows along the facade and a grass wedge at the stair's east cheek.
 * `wall` is the street face, west to east. The stair figures are the DXF entrance: cheeks to z 21.71, head paving to z 22.31, opening x 24.15–30.55.
 */
export function entranceGapPaving(wall: Array<[number, number]>, street: number): Primitive[] {
  if (wall.length < 2) return [];
  const zOn = (x: number): number | undefined => {
    for (let i = 1; i < wall.length; i++) {
      const [ax, az] = wall[i - 1]!;
      const [bx, bz] = wall[i]!;
      if (x + 1e-6 >= Math.min(ax, bx) && x - 1e-6 <= Math.max(ax, bx)) return az + ((bz - az) * (x - ax)) / (bx - ax || 1);
    }
    return undefined;
  };
  const xL = 24.15;
  const xR = 30.55;
  const cheek = 21.72;
  const xDrive = 35.25;
  const x0 = Math.max(wall[0]![0], -12);
  const prism = (xStart: number, xEnd: number, northAt: (x: number) => number): Primitive | null => {
    const north: Array<[number, number]> = [];
    const south: Array<[number, number]> = [];
    const xs = [xStart];
    for (let x = xStart + 0.4; x < xEnd - 1e-3; x += 0.4) xs.push(x);
    xs.push(xEnd);
    for (const xx of xs) {
      const zn = northAt(xx);
      const zs = pisgaPlotSouthZ(xx);
      if (!(zs > zn + 0.05)) continue;
      north.push([xx, zn]);
      south.push([xx, zs + 0.04]);
    }
    if (north.length < 2) return null;
    return { type: "prism", ring: [...north, ...south.reverse()], y0: street - 0.85, y1: street + 0.14, material: "paving", tag: "site:sidewalk" };
  };
  const out: Primitive[] = [];
  const alongWall = prism(x0, xL, (x) => (zOn(Math.min(x, xL - 0.05)) ?? cheek) - 0.08);
  if (alongWall) out.push(alongWall);
  // Up to the cheeks. The head slab, raised to the sidewalk, covers the middle; the flanks in front of the cheeks stay paved.
  const mouth = prism(xL, xR, () => cheek);
  if (mouth) out.push(mouth);
  // East of the stair the retaining wall's street face is z 19.4; paving from there to the sidewalk closes the grass wedge up to the drive.
  const wedge = prism(xR, xDrive, () => 19.55);
  if (wedge) out.push(wedge);
  return out;
}

/** The low road and its sidewalk are one terrace, at the kindergarten's north datum (±0.00), not a drape of the hillside. */
export const PISGA_LOWER_ROAD = 0.28;
export const PISGA_LOWER_WALK = 0.36;

// The bend sits just west of the kindergarten, so a view of the north facade shows it on the right, as in the street photo.
const LOWER_RC = { x: -18, z: -24, r: 11 };
const LOWER_JOIN = 8;
const PLAZA = { x: 24, z: -25.6, r: 5.2 };

/** Centreline: straight along the facade, then a bend west into the roundabout. */
const lowerRoadZ = (x: number) => {
  const xEast = LOWER_RC.x + LOWER_RC.r - 0.6;
  if (x <= xEast) return LOWER_RC.z;
  if (x >= LOWER_JOIN) {
    const u = Math.max(0, Math.min(1, (x - LOWER_JOIN) / (124 - LOWER_JOIN)));
    return -15.2 + Math.sin(u * Math.PI) * 0.9;
  }
  const t = (x - xEast) / (LOWER_JOIN - xEast);
  const s = t * t * (3 - 2 * t);
  return LOWER_RC.z + (-15.2 - LOWER_RC.z) * s;
};

/** Slab top where a hand-placed hardscape covers the cell, otherwise null. The south street is the surveyed band in `groundAt`, already at +17.25. The east plaza is the sheet's +8.27, level until the ramp. */
export function pisgaHardscapeBed(x: number, z: number): number | null {
  // East plaza (54.6, 14.3 is +8.27). Level pad only; the ramp south of z 14.5 stays the formula in groundAt. Keeps (59.6, 14.7) outside.
  if (x >= 54 && x <= 65.6 && z >= 12.05 && z <= 14.5) return 8.27;
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) <= PLAZA.r + 0.3) return PISGA_LOWER_WALK;
  // Disk plus the cut shoulder, so the hill cannot lip over the roundabout.
  if (Math.hypot(x - LOWER_RC.x, z - LOWER_RC.z) <= LOWER_RC.r + 2.6) return PISGA_LOWER_ROAD;
  const half = 3.8;
  if (x >= -108 && x <= LOWER_RC.x - LOWER_RC.r + 0.8) {
    if (Math.abs(z - LOWER_RC.z) <= half) return PISGA_LOWER_ROAD;
    if (Math.abs(z - (LOWER_RC.z + half + 0.7)) <= 0.8) return PISGA_LOWER_WALK;
    if (z < LOWER_RC.z - half && z > LOWER_RC.z - half - 2.8) return PISGA_LOWER_ROAD;
  }
  if (x >= LOWER_RC.x + LOWER_RC.r - 0.8 && x <= 124) {
    const cz = lowerRoadZ(x);
    if (Math.abs(z - cz) <= half) return PISGA_LOWER_ROAD;
    if (Math.abs(z - (cz + half + 0.7)) <= 0.8) return PISGA_LOWER_WALK;
    if (x >= -2 && x <= 55 && Math.abs(z - (cz - half - 1.05)) <= 1.15) return PISGA_LOWER_WALK;
    // Uphill shoulder, north of the curb, cut to the road. The retaining wall stands at its outer edge.
    if (z < cz - half && z > cz - half - 2.8) return PISGA_LOWER_ROAD;
  }
  if (Math.abs(x - LOWER_RC.x) <= 4.2 && z >= -42 && z <= LOWER_RC.z - LOWER_RC.r + 1) return PISGA_LOWER_ROAD;
  return null;
}

/** Where the street's cars park: bay centres along the kerb, and their heading. */
export function pisgaStreetBays(): Array<{ x: number; z: number; rotY: number }> {
  const centreAt = (x: number) => {
    const line = plotLine();
    for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1]!;
      const [bx, bz] = line[i]!;
      if (x >= ax && x <= bx) {
        const len = Math.hypot(bx - ax, bz - az);
        const z = az + ((x - ax) / (bx - ax)) * (bz - az);
        return { x: x - ((bz - az) / len) * 3.2, z: z + ((bx - ax) / len) * 3.2, rotY: Math.PI / 2 - Math.atan2(bz - az, bx - ax) };
      }
    }
    return { x, z: 25, rotY: Math.PI / 2 };
  };
  return [-2.4, 3.3, 8.8, 14.2, 48.6, 53.7].map(centreAt);
}

const handBox = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, material: BuildingMaterial, tag: string): Primitive => ({
  type: "box",
  centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 },
  size: { x: Math.abs(x1 - x0), y: Math.abs(y1 - y0), z: Math.abs(z1 - z0) },
  material,
  tag,
});

const disk = (cx: number, cz: number, r: number, y0: number, y1: number, material: BuildingMaterial, tag: string, n = 72): Primitive => {
  const ring: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    ring.push([cx + Math.cos(t) * r, cz + Math.sin(t) * r]);
  }
  return { type: "prism", ring, y0, y1, material, tag };
};

/**
 * Hand-placed from the site photos (2026-10-29) and the aerial המגרש.png.
 * Nothing here is a surveyed line. The DXF stairs stay where they are.
 * The hand stairs are switchbacks: each flight reverses, west of the kindergarten
 * and east of x 62, and they stop short of the surveyed flights.
 * The metal bars are the fence along the kindergarten's low front, with one opening onto the road.
 * Their rails are 10 cm deep so the fence check keeps judging the surveyed guards only.
 */
export function pisgaHandContext(groundAt: (x: number, z: number) => number): Primitive[] {
  const out: Primitive[] = [];
  const upper = 17.25;
  // Wide north road. The kindergarten's north wall is z −7.22; the asphalt stays north of it.
  // The west bend is the curve in the street photo, just off the facade's west end. The paved circle north of the straight run is the brick plaza with the palms.
  const rcx = LOWER_RC.x;
  const rcz = LOWER_RC.z;
  const rOut = LOWER_RC.r;
  const rIn = 6.2;
  const road = PISGA_LOWER_ROAD;
  const walk = PISGA_LOWER_WALK;
  // A flat slab. The plan curve stays; the surface does not follow the hillside.
  const pad = (pts: Array<[number, number]>, width: number, y1: number, thick: number, material: BuildingMaterial, tag: string, closed = false) => {
    const src = closed && pts.length > 2 ? pts.slice(0, -1) : pts;
    const n = src.length;
    if (n < 2) return;
    const at = (i: number) => src[((i % n) + n) % n]!;
    const left: Array<[number, number]> = [];
    const right: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const [px, pz] = closed ? at(i - 1) : src[Math.max(0, i - 1)]!;
      const [qx, qz] = closed ? at(i + 1) : src[Math.min(n - 1, i + 1)]!;
      const dx = qx - px;
      const dz = qz - pz;
      const len = Math.hypot(dx, dz) || 1;
      const ox = (-dz / len) * (width / 2);
      const oz = (dx / len) * (width / 2);
      const [x, z] = src[i]!;
      left.push([x + ox, z + oz]);
      right.push([x - ox, z - oz]);
    }
    out.push({ type: "prism", ring: [...left, ...right.slice().reverse()], y0: y1 - thick, y1, material, tag });
  };
  out.push(disk(rcx, rcz, rOut, road - 0.5, road, "asphalt", "site:hand-lower-road"));
  out.push(disk(rcx, rcz, rIn, road, road + 0.32, "soil", "site:hand-lower-road"));
  const half = 3.8;
  const westRun: Array<[number, number]> = [];
  for (let x = -108; x <= rcx - rOut + 0.6; x += 3) westRun.push([x, rcz]);
  pad(westRun, half * 2, road, 0.5, "asphalt", "site:hand-lower-road");
  pad(westRun.map(([x, z]) => [x, z + half + 0.7] as [number, number]), 1.5, walk, 0.4, "paving", "site:hand-lower-road");
  const stations: Array<[number, number]> = [];
  const xEast = rcx + rOut - 0.6;
  for (let x = xEast; x <= 124; x += 3) stations.push([x, lowerRoadZ(x)]);
  pad(stations, half * 2, road, 0.5, "asphalt", "site:hand-lower-road");
  pad(stations.map(([x, z]) => [x, z + half + 0.7] as [number, number]), 1.5, walk, 0.4, "paving", "site:hand-lower-road");
  pad(stations.filter(([x]) => x >= -2 && x <= 55).map(([x, z]) => [x, z - half - 1.05] as [number, number]), 2.2, walk, 0.4, "paving", "site:hand-lower-road");
  const arm: Array<[number, number]> = [];
  for (let z = -42; z <= rcz - rOut + 0.6; z += 3) arm.push([rcx, z]);
  pad(arm, 8.4, road, 0.5, "asphalt", "site:hand-lower-road");
  // Crosswalk on the straight run, just east of the bend.
  for (let i = 0; i < 7; i++) {
    const x = 9.2 + i * 0.72;
    const cz = lowerRoadZ(x);
    out.push(handBox(x, x + 0.36, road + 0.02, road + 0.045, cz - 3.2, cz + 3.2, "parkingLine", "site:hand-crossing"));
  }
  // The brick circle north of the street: concentric rings, two palms, beds and lamps. Flat, at the sidewalk terrace.
  const px = PLAZA.x;
  const pz = PLAZA.z;
  out.push(disk(px, pz, PLAZA.r, walk - 0.4, walk, "paving", "site:hand-plaza", 48));
  out.push(disk(px, pz, 4.05, walk, walk + 0.05, "stone", "site:hand-plaza", 40));
  out.push(disk(px, pz, 3.05, walk + 0.05, walk + 0.1, "paving", "site:hand-plaza", 36));
  out.push(disk(px, pz, 1.95, walk + 0.1, walk + 0.15, "stone", "site:hand-plaza", 32));
  out.push(disk(px, pz, 0.9, walk + 0.15, walk + 0.2, "paving", "site:hand-plaza", 24));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    out.push(disk(px + Math.cos(a) * 4.15, pz + Math.sin(a) * 4.15, 0.7, walk, walk + 0.22, "soil", "site:hand-plaza", 16));
    out.push({ type: "plant", at: { x: px + Math.cos(a) * 4.15, y: walk + 0.22, z: pz + Math.sin(a) * 4.15 }, height: 0.55, spread: 0.7, tag: "site:hand-plaza" });
  }
  const palm = (x: number, z: number) => {
    out.push({ type: "cylinder", centre: { x, y: walk + 2.7, z }, radius: 0.17, height: 5.4, material: "timber", tag: "site:hand-palm" });
    // Each frond points out from the crown: a box's long side is its local z, which rotY = π/2 − a turns to the plan direction a; rotX then
    // tips its outer end down (positive) or up. Twelve arch out and droop, six younger ones rise in the middle (photographs 1–10, the date palms).
    const frond = (a: number, reach: number, tilt: number, width: number) => out.push({
      type: "box",
      centre: { x: x + Math.cos(a) * (reach / 2) * Math.cos(tilt), y: walk + 5.4 - (reach / 2) * Math.sin(tilt), z: z + Math.sin(a) * (reach / 2) * Math.cos(tilt) },
      size: { x: width, y: 0.04, z: reach },
      rotY: Math.PI / 2 - a,
      rotX: tilt,
      material: "grass",
      tag: "site:hand-palm",
    });
    for (let i = 0; i < 12; i++) frond((i / 12) * Math.PI * 2, 2.6, 0.35, 0.42);
    for (let i = 0; i < 6; i++) frond((i / 6) * Math.PI * 2 + 0.5, 1.8, -0.75, 0.3);
  };
  palm(px - 1.7, pz + 0.9);
  palm(px + 2.1, pz - 0.6);
  for (const [lx, lz] of [[px - 4.2, pz - 3.4], [px + 3.6, pz + 3.8], [px + 5.2, pz - 2.2]] as const) {
    out.push({ type: "cylinder", centre: { x: lx, y: walk + 1.65, z: lz }, radius: 0.045, height: 3.3, material: "darkSteel", tag: "site:hand-lamp" });
    out.push({ type: "cylinder", centre: { x: lx, y: walk + 3.35, z: lz }, radius: 0.16, height: 0.1, material: "signage", tag: "site:hand-lamp" });
  }
  // One retaining wall per run. Both edges are horizontal: the foot is the road terrace, the coping is one hillside sample for that run, not a point every half metre.
  const terraceWall = (pts: Array<[number, number]>, yOther: number) => {
    if (pts.length < 2) return;
    const yFoot = Math.min(road, yOther);
    const yTop = Math.min(Math.max(road, yOther), road + 3.5);
    if (yTop < yFoot + 0.45) return;
    out.push({
      type: "custom-mesh",
      stations: pts.map(([x, z]) => ({ x, z, yTop, yFoot })),
      thick: 0.35,
      material: "stone",
      tag: "site:hand-retain",
    });
  };
  const northEdge = (x: number) => lowerRoadZ(x) - half - 2.6;
  const retainRun = (x0: number, x1: number) => {
    const mid = (x0 + x1) / 2;
    const yTop = groundAt(mid, northEdge(mid) - 4);
    const pts: Array<[number, number]> = [];
    for (let x = x0; x <= x1 + 0.01; x += 8) pts.push([x, northEdge(x)]);
    terraceWall(pts, yTop);
  };
  retainRun(-100, -32);
  retainRun(8, 16);
  retainRun(32, 70);
  retainRun(70, 112);
  const arc = (a0: number, a1: number) => {
    const pts: Array<[number, number]> = [];
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      pts.push([rcx + Math.cos(a) * (rOut + 2.5), rcz + Math.sin(a) * (rOut + 2.5)]);
    }
    const mid = pts[Math.floor(pts.length / 2)]!;
    terraceWall(pts, groundAt(mid[0], mid[1] - 3));
  };
  // North-west and north-east rims. Gaps at the west road, the north arm and the east road.
  arc(Math.PI * 1.08, Math.PI * 1.42);
  arc(Math.PI * 1.58, Math.PI * 1.92);
  // Stone lip where the flat road meets the slope. One mesh, both edges horizontal, not a row of boxes.
  const curbLine = (pts: Array<[number, number]>) => {
    if (pts.length < 2) return;
    out.push({
      type: "custom-mesh",
      stations: pts.map(([x, z]) => ({ x, z, yTop: road + 0.16, yFoot: road - 0.04 })),
      thick: 0.16,
      material: "stone",
      tag: "site:hand-curb",
    });
  };
  const along = (x0: number, x1: number, zAt: (x: number) => number) => {
    const pts: Array<[number, number]> = [];
    for (let x = x0; x <= x1 + 0.01; x += 4) pts.push([x, zAt(x)]);
    curbLine(pts);
  };
  along(-100, -32, (x) => lowerRoadZ(x) + half);
  along(-6, 124, (x) => lowerRoadZ(x) + half);
  // Parked along the east of the street, on the near side, as in the photo.
  for (const [cx, colour] of [[40, 0xd8d8d8], [46.5, 0x8a939c], [53, 0xc4b8a4]] as const) {
    const cz = lowerRoadZ(cx) - 2.15;
    out.push({ type: "car", at: { x: cx, y: road, z: cz }, rotY: Math.PI / 2, colour, tag: "car" });
  }

  // Fence along the whole low front, from west of the kindergarten to east of it. Opening at x 23.2–28.4 is the entrance from the road.
  const fz = -8.05;
  const fx0 = -10;
  const fx1 = 72;
  const gap0 = 23.2;
  const gap1 = 28.4;
  const fh = 1.7;
  // The fence stands on the sidewalk terrace, one level, not on the raw hillside.
  const yFront = PISGA_LOWER_WALK;
  for (let x = fx0; x <= fx1; x += 0.15) {
    if (x > gap0 && x < gap1) continue;
    const y = yFront;
    out.push(handBox(x, x + 0.028, y, y + fh, fz - 0.02, fz + 0.02, "frame", "site:hand-front-bars"));
  }
  for (const [a, b] of [[fx0, gap0], [gap1, fx1]] as const) {
    for (let x = a; x < b - 0.05; x += 6) {
      const x2 = Math.min(b, x + 6.2);
      const y = yFront;
      out.push(handBox(x, x2, y + fh - 0.1, y + fh, fz - 0.035, fz + 0.035, "frame", "site:hand-front-bars"));
      out.push(handBox(x, x2, y + 0.12, y + 0.22, fz - 0.03, fz + 0.03, "frame", "site:hand-front-bars"));
    }
  }
  for (const x of [gap0, gap1]) {
    const y = yFront;
    out.push(handBox(x - 0.09, x + 0.09, y, y + fh + 0.2, fz - 0.07, fz + 0.07, "frame", "site:hand-front-bars"));
  }
  // Gate leaves, swung open toward the building.
  const gy = yFront;
  out.push({ type: "box", centre: { x: gap0 + 1.15, y: gy + fh / 2, z: fz + 0.7 }, size: { x: 2.2, y: fh - 0.15, z: 0.05 }, rotY: 0.85, material: "frame", tag: "site:hand-front-bars" });
  out.push({ type: "box", centre: { x: gap1 - 1.15, y: gy + fh / 2, z: fz + 0.7 }, size: { x: 2.2, y: fh - 0.15, z: 0.05 }, rotY: -0.85, material: "frame", tag: "site:hand-front-bars" });

  // One zigzag each side: lower sidewalk (0.36) up to the upper road (17.2).
  // Landings meet the building at the kindergarten decks, the west terrace (+9.15), floor −1 (+12.77) and the east plaza (+8.27).
  // West of the link stair and of the emergency stair. East of x 70 except short landings that stop clear of (63.9, 12.2) and (59.6, 14.7).
  const yW = PISGA_LOWER_WALK;
  const yE = PISGA_LOWER_WALK;
  const zig = (nodes: { x: number; z: number; y: number; landing?: number }[], width: number, tag: string) => {
    out.push(...stairPath(nodes, width, tag));
    const cheekTag = tag.includes("west") ? "site:hand-cheek-west" : "site:hand-cheek-east";
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i]!;
      const b = nodes[i + 1]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.3 || Math.abs(b.y - a.y) < 0.12) continue;
      const ang = Math.atan2(dz, dx);
      const px = -dz / len;
      const pz = dx / len;
      // Glass on both sides of the flight. The stone cheek is the downhill (north) face, one level per flight.
      const yLo = Math.min(a.y, b.y);
      const yHi = Math.max(a.y, b.y) + 1.15;
      for (const s of [1, -1]) {
        out.push({
          type: "box",
          centre: { x: (a.x + b.x) / 2 + px * s * (width / 2 + 0.03), y: (yLo + yHi) / 2, z: (a.z + b.z) / 2 + pz * s * (width / 2 + 0.03) },
          size: { x: len, y: yHi - yLo, z: 0.04 },
          rotY: -ang,
          material: "railGlass",
          tag,
        });
      }
      const north = pz >= 0 ? -1 : 1;
      out.push(...slopedWall(
        [
          { x: a.x + px * north * (width / 2 + 0.28), z: a.z + pz * north * (width / 2 + 0.28), y: a.y + 1 },
          { x: b.x + px * north * (width / 2 + 0.28), z: b.z + pz * north * (width / 2 + 0.28), y: b.y + 1 },
        ],
        cheekTag,
        "cheek",
      ));
    }
  };
  zig([
    { x: -9.2, z: -7.1, y: yW, landing: 1.2 },
    { x: -6.2, z: -7.1, y: 1.42 },
    { x: -6.2, z: -5.5, y: 1.42 },
    { x: -9.2, z: -5.5, y: 2.48 },
    { x: -9.2, z: -3.9, y: 2.48 },
    { x: -6.2, z: -3.9, y: 3.54 },
    { x: -6.2, z: -2.3, y: 3.54 },
    { x: -8.4, z: -2.3, y: 4.52, landing: 1.35 },
    { x: -8.4, z: -0.45, y: 4.52 },
  ], 1.2, "site:stair-hand-west");
  // Beside the west wing, clear of the railing at (−3.2, 4.2). The roof landing is the kindergarten roof.
  zig([
    { x: -7.0, z: 4.55, y: 4.52, landing: 1.15 },
    { x: -4.2, z: 4.55, y: 5.72 },
    { x: -4.2, z: 6.05, y: 5.72 },
    { x: -7.0, z: 6.05, y: 6.86 },
    { x: -7.0, z: 7.5, y: 6.86 },
    { x: -3.7, z: 7.5, y: 7.99, landing: 1.3 },
  ], 1.2, "site:stair-hand-west");
  // East is one polyline. Pads meet at the turns, so no second slab is drawn on top of them.
  // The run stays north of the DXF flight (z 2.7) until it is east of x 70.
  const east: { x: number; z: number; y: number; landing: number }[] = [];
  const addE = (x: number, z: number, y: number) => east.push({ x, z, y, landing: 1.25 });
  const fold = (x0: number, x1: number, z0: number, zStep: number, y0: number, y1: number, n: number) => {
    const last = east[east.length - 1];
    if (!last || Math.hypot(last.x - x0, last.z - z0) > 0.05 || Math.abs(last.y - y0) > 0.02) addE(x0, z0, y0);
    let z = z0;
    let y = y0;
    const rise = (y1 - y0) / n;
    for (let i = 0; i < n; i++) {
      y += rise;
      const x = i % 2 === 0 ? x1 : x0;
      addE(x, z, y);
      if (i < n - 1) {
        z += zStep;
        addE(x, z, y);
      }
    }
  };
  fold(62.6, 65.8, -7.0, 2.2, yE, 4.52, 4);
  // Step south of the lower shaft before going east, so the walk does not pass over its last landing.
  const lowEnd = east[east.length - 1]!;
  const clearZ = lowEnd.z + 1.6;
  addE(lowEnd.x, clearZ, 4.52);
  addE(71.2, clearZ, 4.52);
  addE(71.2, Math.max(3.2, clearZ + 1.6), 4.52);
  fold(71.2, 74.4, east[east.length - 1]!.z, 2.2, 4.52, 8.27, 4);
  fold(74.4, 71.2, east[east.length - 1]!.z, 2.2, 8.27, 12.77, 4);
  // Step the landing south before the next flight, so the spur west does not lie on that flight.
  addE(74.4, east[east.length - 1]!.z + 1.8, 12.77);
  fold(74.4, 71.2, east[east.length - 1]!.z, 3.6, 12.77, 17.2, 5);
  const top = east[east.length - 1]!;
  const roadZ = pisgaPlotSouthZ(top.x) + 2.4;
  addE(top.x, Math.max(roadZ, top.z + 1.6), 17.2);
  out.push(...stairPath(east, 1.2, "site:stair-hand-east"));
  // Both sides of every run. The foot follows the walking line, so the wall is a band beside the
  // flight. slopedWall's horizontal foot made a triangle that cut across the steps.
  // custom-mesh, so the fence check does not read the tag.
  {
    const off = 0.86;
    for (let i = 0; i < east.length - 1; i++) {
      const a = east[i]!;
      const b = east[i + 1]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (a.y > 17.05 && b.y > 17.05) continue;
      // Stop short of the node so a landing's cheek does not run into the flight that meets it.
      const inset = Math.min(0.95, len * 0.45);
      if (len - inset * 2 < 0.35) continue;
      const ux = dx / len;
      const uz = dz / len;
      const px = -uz;
      const pz = ux;
      const ax = a.x + ux * inset;
      const az = a.z + uz * inset;
      const bx = b.x - ux * inset;
      const bz = b.z - uz * inset;
      const y0 = a.y + (b.y - a.y) * (inset / len);
      const y1 = b.y - (b.y - a.y) * (inset / len);
      for (const s of [1, -1]) {
        out.push({
          type: "custom-mesh",
          stations: [
            { x: ax + px * off * s, z: az + pz * off * s, yTop: y0 + 0.95, yFoot: y0 - 0.28 },
            { x: bx + px * off * s, z: bz + pz * off * s, yTop: y1 + 0.95, yFoot: y1 - 0.28 },
          ],
          thick: 0.22,
          material: "stone",
          tag: "site:stair-cheek-east",
        });
      }
    }
  }
  // Short landings onto the building, starting at the pad edge so they do not sit on the flight.
  const spur = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    out.push(...stairPath([
      { x: x0, z: z0, y },
      { x: x1, z: z1, y, landing: 1.4 },
    ], 1.2, "site:stair-hand-east"));
  };
  const westMost = (y: number) => east.filter((p) => Math.abs(p.y - y) < 0.04).sort((a, b) => a.x - b.x)[0];
  const plaza = westMost(8.27);
  const floor1 = westMost(12.77);
  if (plaza) spur(plaza.x - 0.95, plaza.z, 68.2, plaza.z, 8.27);
  if (floor1) spur(floor1.x - 0.95, floor1.z, 67.4, floor1.z, 12.77);
  const link = (nodes: { x: number; z: number; y: number; landing?: number }[], tag: string) => {
    out.push(...stairPath(nodes, 1.2, tag));
  };
  link([
    { x: -8.4, z: -0.45, y: 4.52 },
    { x: -7.0, z: 4.55, y: 4.52 },
  ], "site:stair-hand-west");
  // West: kindergarten roof onto the +9.15 terrace, then switchbacks south of the link platform to the upper road.
  // The spine stays at x ≤ −8.8 so it does not cover the surveyed edge that ends at (−7.1, 18.3).
  link([
    { x: -3.7, z: 7.5, y: 7.99 },
    { x: -4.8, z: 7.6, y: 7.99 },
  ], "site:stair-hand-west");
  zig([
    { x: -4.8, z: 7.6, y: 7.99, landing: 1.1 },
    { x: -7.2, z: 8.2, y: 9.15, landing: 1.35 },
  ], 1.2, "site:stair-hand-west");
  link([
    { x: -7.2, z: 8.2, y: 9.15 },
    { x: -8.8, z: 8.2, y: 9.15 },
    { x: -8.8, z: 12.2, y: 9.15 },
    { x: -11.2, z: 12.2, y: 9.15 },
  ], "site:stair-hand-west");
  zig([
    { x: -11.2, z: 12.2, y: 9.15, landing: 1.2 },
    { x: -8.8, z: 12.2, y: 10.36 },
    { x: -8.8, z: 13.9, y: 10.36 },
    { x: -11.2, z: 13.9, y: 11.56 },
    { x: -11.2, z: 15.6, y: 11.56 },
    { x: -8.8, z: 15.6, y: 12.77, landing: 1.35 },
  ], 1.2, "site:stair-hand-west");
  // Floor −1, west of the emergency stair (x −1.6…0.9, z 10.4…16.6).
  link([
    { x: -8.8, z: 15.6, y: 12.77 },
    { x: -2.4, z: 15.6, y: 12.77, landing: 1.5 },
  ], "site:stair-hand-west");
  zig([
    { x: -8.8, z: 15.6, y: 12.77 },
    { x: -8.8, z: 19.8, y: 12.77 },
    { x: -11.2, z: 19.8, y: 14.24 },
    { x: -11.2, z: 21.6, y: 14.24 },
    { x: -8.8, z: 21.6, y: 15.72 },
    { x: -8.8, z: 23.5, y: 15.72 },
    { x: -11.2, z: 23.5, y: 17.2, landing: 1.6 },
  ], 1.2, "site:stair-hand-west");

  // House row south of the upper road, clear of the street band (plot line + 13.5 m). Heights vary the way the aerial row does.
  const heights = [11.2, 14.6, 12.4, 15.2, 11.8, 13.4];
  let hi = 0;
  for (let x = -46; x < 118; x += 15) {
    const z0 = pisgaPlotSouthZ(x + 5) + 16;
    const h = heights[hi++ % heights.length]!;
    out.push(handBox(x, x + 12, upper, upper + h, z0, z0 + 11, "stone", "site:hand-neighbor"));
  }
  // House row north of the wide road, on the local ground, skipping the roundabout.
  for (let x = -24; x < 116; x += 16) {
    if (x > -86 && x < -36) continue;
    const z0 = -44;
    const g = groundAt(x + 5, z0 + 5);
    const h = heights[hi++ % heights.length]!;
    out.push(handBox(x, x + 12, g, g + h * 0.72, z0, z0 + 10, "stone", "site:hand-neighbor"));
  }

  // One flat ledge per run, at the survey height of its middle. The coping does not follow the hillside cell by cell.
  for (const [x0, x1, z] of [[40, 96, -31], [48, 102, -36], [86, 122, 6], [90, 124, 22]] as const) {
    const y = groundAt((x0 + x1) / 2, z);
    out.push(...slopedWall([{ x: x0, z, y }, { x: x1, z, y }], "site:hand-rock", "rock"));
  }
  for (const [x, z] of [[-40, -38], [14, -38], [40, -34], [70, -34], [96, -18], [108, 4], [112, 18], [98, 28]] as const) {
    const y = groundAt(x + 1.2, z);
    out.push(...slopedWall([{ x, z, y }, { x: x + 2.4, z, y }], "site:hand-rock", "rock"));
  }
  let olive = 17;
  const orand = () => ((olive = (olive * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let k = 0; k < 22; k++) {
    const north = k < 14;
    const x = north ? -12 + orand() * 100 : 88 + orand() * 28;
    const z = north ? -58 + orand() * 10 : -6 + orand() * 36;
    out.push({ type: "tree", at: { x, y: groundAt(x, z), z }, height: 3.2 + orand() * 1.4, crown: 1.8 + orand() * 0.7, tag: "tree" });
  }
  return out;
}
