import type { PdfPage } from "@/lib/projects/building/pdf-paths";

/**
 * The flights of stairs a plan draws: runs of parallel treads, evenly spaced.
 *
 * A stair on a plan is its treads — a row of equal lines, 22 to 36 cm apart,
 * each as long as the flight is wide. Nothing else on a plan repeats that
 * way: a grid of paving is square, a dimension chain is one line, a row of
 * seats is boxes. So a flight is found wherever five treads or more line up.
 *
 * Coordinates in and out are page points in the plan frame the caller maps to
 * metres with `toMetres`.
 */
export type Flight = {
  /** The flight's footprint, metres: x, z of its corner and its size. */
  x: number;
  z: number;
  w: number;
  d: number;
  /** Which way the treads run: "x" when each tread is a line along x (the flight climbs in z). */
  treads: "x" | "z";
  count: number;
  spacingM: number;
};

type Seg = { a: number; b: number; at: number };

export function findFlights(
  page: PdfPage,
  toMetres: (x: number, y: number) => [number, number],
  options?: { minTreads?: number; region?: { x0: number; z0: number; x1: number; z1: number } },
): Flight[] {
  const minTreads = options?.minTreads ?? 5;
  const lines: { x: Seg[]; z: Seg[] } = { x: [], z: [] };
  for (const p of page.paths) {
    if (!p.stroked) continue;
    for (const r of p.rings) {
      for (let i = 1; i < r.length; i++) {
        const [ax, az] = toMetres(r[i - 1]![0], r[i - 1]![1]);
        const [bx, bz] = toMetres(r[i]![0], r[i]![1]);
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.8 || len > 7) continue;
        const reg = options?.region;
        if (reg && ((ax + bx) / 2 < reg.x0 || (ax + bx) / 2 > reg.x1 || (az + bz) / 2 < reg.z0 || (az + bz) / 2 > reg.z1)) continue;
        if (Math.abs(bz - az) < 0.02) lines.x.push({ a: Math.min(ax, bx), b: Math.max(ax, bx), at: (az + bz) / 2 });
        else if (Math.abs(bx - ax) < 0.02) lines.z.push({ a: Math.min(az, bz), b: Math.max(az, bz), at: (ax + bx) / 2 });
      }
    }
  }
  const out: Flight[] = [];
  for (const dir of ["x", "z"] as const) {
    // Group lines that span the same interval, then look for even runs in `at`.
    const segs = lines[dir].sort((p, q) => p.a - q.a || p.at - q.at);
    const used = new Set<Seg>();
    for (const s of segs) {
      if (used.has(s)) continue;
      const same = segs
        .filter((t) => !used.has(t) && Math.abs(t.a - s.a) < 0.06 && Math.abs(t.b - s.b) < 0.06)
        .sort((p, q) => p.at - q.at);
      // Distinct positions.
      const ats: Seg[] = [];
      for (const t of same) if (!ats.length || t.at - ats[ats.length - 1]!.at > 0.05) ats.push(t);
      // The longest run of steady spacing between 0.22 and 0.36 m.
      let best: Seg[] = [];
      for (let i = 0; i < ats.length; i++) {
        const run = [ats[i]!];
        for (let j = i + 1; j < ats.length; j++) {
          const gap = ats[j]!.at - run[run.length - 1]!.at;
          const first = run.length > 1 ? run[1]!.at - run[0]!.at : gap;
          if (gap < 0.22 || gap > 0.36 || Math.abs(gap - first) > 0.03) break;
          run.push(ats[j]!);
        }
        if (run.length > best.length) best = run;
      }
      if (best.length < minTreads) continue;
      for (const t of same) used.add(t);
      const at0 = best[0]!.at;
      const at1 = best[best.length - 1]!.at;
      const spacing = (at1 - at0) / (best.length - 1);
      out.push(
        dir === "x"
          ? { x: s.a, z: at0, w: s.b - s.a, d: at1 - at0 + spacing, treads: "x", count: best.length, spacingM: spacing }
          : { x: at0, z: s.a, w: at1 - at0 + spacing, d: s.b - s.a, treads: "z", count: best.length, spacingM: spacing },
      );
    }
  }
  return out;
}
