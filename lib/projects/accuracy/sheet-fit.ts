/**
 * Model against sheet: lay the model's plan lines on the sheet's ink and
 * measure, in metres, how far each sampled point of the model is from the
 * nearest drawn line. The registration searches scale too (live research
 * 1.32: never take a scale by eye — 1:250 by eye found a false minimum,
 * the search found 1:200).
 *
 * This is the generalisation of scripts/_factory/overlay.mts (5.37).
 */

import { distanceAt, type DistanceMap } from "./distance-map";
import { deviationStats, SHEET_BOUNDS_M, type Bounds, type DeviationStats } from "./stats";

export type P2 = [number, number];
export type KindPoint = { p: P2; kind: string };

/** image = s·R(θ)·(p − c) + t, in sheet pixels. */
export type SheetFit = { s: number; th: number; tx: number; ty: number; cx: number; cz: number };

export type SheetFitOptions = {
  /** Pixels per metre the given scale implies (DPI and 1:N). */
  pxPerM: number;
  /** Scale multipliers tried around `pxPerM` (default 0.8–1.2). */
  scaleTries?: number[];
  /** Distances are capped here (px) while fitting, so far-off lines do not pull. */
  capPx?: number;
  /** Coarse translation step (px). */
  coarseStep?: number;
  /** At most this many points in the coarse search. */
  coarsePoints?: number;
};

export type KindDeviation = { kind: string } & DeviationStats;

export type SheetAccuracy = {
  fit: SheetFit;
  /** The fitted scale denominator (1:N) for a given DPI. */
  scaleDenominator: (dpi: number) => number;
  /** Rotation in degrees. */
  rotationDeg: number;
  /** Every point's distance to ink, metres. */
  distancesM: number[];
  all: DeviationStats;
  byKind: KindDeviation[];
  /** The coarse score for each tried scale multiplier (mean metres), to show the scale search was decisive. */
  scaleTrials: Array<{ multiplier: number; meanM: number }>;
};

/** Points every `step` metres along a polyline (closed when `closed`). */
export function samplePolyline(pts: P2[], kind: string, step = 0.2, closed = true): KindPoint[] {
  const out: KindPoint[] = [];
  const segs = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(L / step));
    for (let j = 0; j < n; j++) out.push({ p: [a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n], kind });
  }
  if (!closed && pts.length) out.push({ p: pts[pts.length - 1]!, kind });
  return out;
}

export function projectToSheet(f: SheetFit, p: P2): P2 {
  const x = p[0] - f.cx;
  const z = p[1] - f.cz;
  const co = Math.cos(f.th);
  const si = Math.sin(f.th);
  return [f.s * (co * x - si * z) + f.tx, f.s * (si * x + co * z) + f.ty];
}

function meanPx(f: SheetFit, pts: KindPoint[], map: DistanceMap, cap: number): number {
  let a = 0;
  for (const q of pts) {
    const [x, y] = projectToSheet(f, q.p);
    a += distanceAt(map, x, y, cap);
  }
  return pts.length ? a / pts.length : Infinity;
}

/** Coordinate descent on (tx, ty, scale[, rotation]) with shrinking steps. */
function polish(start: SheetFit, pts: KindPoint[], map: DistanceMap, cap: number, steps: number[], rotate: boolean): { fit: SheetFit; score: number } {
  let best = start;
  let bs = meanPx(best, pts, map, cap);
  const dirs: Array<[number, number, number, number]> = [
    [1, 0, 0, 0], [-1, 0, 0, 0], [0, 1, 0, 0], [0, -1, 0, 0], [0, 0, 1, 0], [0, 0, -1, 0],
  ];
  if (rotate) dirs.push([0, 0, 0, 1], [0, 0, 0, -1]);
  for (const step of steps) {
    let moved = true;
    let guard = 0;
    while (moved && guard++ < 500) {
      moved = false;
      for (const d of dirs) {
        const f: SheetFit = {
          ...best,
          tx: best.tx + d[0] * step,
          ty: best.ty + d[1] * step,
          s: best.s * (1 + d[2] * 0.002 * step),
          th: best.th + d[3] * 0.001 * step,
        };
        const v = meanPx(f, pts, map, cap);
        if (v < bs - 1e-6) {
          bs = v;
          best = f;
          moved = true;
        }
      }
    }
  }
  return { fit: best, score: bs };
}

/**
 * Registers the model points to the sheet and measures each one. The model's
 * x runs right on the sheet and its z runs down, as the plan is drawn.
 */
export function fitModelToSheet(points: KindPoint[], map: DistanceMap, opts: SheetFitOptions, bounds: Bounds = SHEET_BOUNDS_M): SheetAccuracy {
  if (!points.length) throw new Error("fitModelToSheet: no model points");
  const cap = opts.capPx ?? 12;
  const coarseStep = opts.coarseStep ?? 4;
  const cx = points.reduce((a, q) => a + q.p[0], 0) / points.length;
  const cz = points.reduce((a, q) => a + q.p[1], 0) / points.length;
  const every = Math.max(1, Math.floor(points.length / (opts.coarsePoints ?? 600)));
  const sub = points.filter((_, i) => i % every === 0);

  let best: SheetFit | null = null;
  let bestMetres = Infinity;
  const scaleTrials: SheetAccuracy["scaleTrials"] = [];
  for (const mult of opts.scaleTries ?? [0.8, 0.9, 1, 1.1, 1.2]) {
    const s0 = opts.pxPerM / mult;
    let lf: SheetFit = { s: s0, th: 0, tx: map.w / 2, ty: map.h / 2, cx, cz };
    let lb = Infinity;
    for (let ty = 0; ty < map.h; ty += coarseStep) {
      for (let tx = 0; tx < map.w; tx += coarseStep) {
        const f: SheetFit = { s: s0, th: 0, tx, ty, cx, cz };
        const v = meanPx(f, sub, map, cap);
        if (v < lb) {
          lb = v;
          lf = f;
        }
      }
    }
    const p = polish(lf, sub, map, cap, [2, 1], false);
    // compared in metres: a smaller scale shrinks pixel distances by itself
    const metres = p.score / p.fit.s;
    scaleTrials.push({ multiplier: mult, meanM: metres });
    if (metres < bestMetres) {
      bestMetres = metres;
      best = p.fit;
    }
  }
  const fine = polish(best!, points, map, cap, [3, 1, 0.5, 0.25], true);
  const fit = fine.fit;

  const byKindValues = new Map<string, number[]>();
  const distancesM: number[] = [];
  for (const q of points) {
    const [x, y] = projectToSheet(fit, q.p);
    // measured uncapped up to a generous bound, so a far point reads as far
    const m = distanceAt(map, x, y, cap * 8) / fit.s;
    distancesM.push(m);
    const list = byKindValues.get(q.kind) ?? [];
    list.push(m);
    byKindValues.set(q.kind, list);
  }
  return {
    fit,
    scaleDenominator: (dpi: number) => ((1000 / 25.4) * dpi) / fit.s,
    rotationDeg: (fit.th * 180) / Math.PI,
    distancesM,
    all: deviationStats(distancesM, bounds),
    byKind: [...byKindValues].map(([kind, v]) => ({ kind, ...deviationStats(v, bounds) })),
    scaleTrials,
  };
}
