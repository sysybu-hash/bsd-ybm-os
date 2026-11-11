// Scratch (Damesek Eliezer dedicated builder): a wall band round its openings as true outlines, not stacks of slices. An opening
// is, along the wall, a span of heights at each place u (an arch: sill to spring + √(r² − d²)); the wall is the band minus those
// spans, the glass each opening's span, the surround the ring between the opening and its outer arc. Between two places where
// what stands changes (a jamb, a circle's end) the pieces are the same, each bounded by the same two curves: sampled densely
// where a curve runs, they close into one polygon per piece. Delete when done.

export type Fn = (u: number) => number;
export type Edge = { id: string; f: Fn };
export type Piece = [Edge, Edge];
export type Outline = { kind: "arch" | "round" | "rect"; cA: number; w: number; bottom: number; top: number; spring: number; r: number; rOuter: number; cy: number };

const root = (r: number, d: number) => Math.sqrt(Math.max(0, r * r - d * d));
export const flat = (id: string, v: number): Edge => ({ id, f: () => v });

/** The opening's lower and upper curve (each defined, clamped, a little past its ends) and where along the wall it reaches. */
export function openingEdges(p: Outline, key: string): { u0: number; u1: number; lo: Edge; hi: Edge; curved: boolean } {
  if (p.kind === "round") return { u0: p.cA - p.r, u1: p.cA + p.r, curved: true, lo: { id: `${key}:lo`, f: (u) => p.cy - root(p.r, u - p.cA) }, hi: { id: `${key}:hi`, f: (u) => p.cy + root(p.r, u - p.cA) } };
  if (p.kind === "arch") return { u0: p.cA - p.w / 2, u1: p.cA + p.w / 2, curved: true, lo: flat(`${key}:lo`, p.bottom), hi: { id: `${key}:hi`, f: (u) => p.spring + root(p.r, u - p.cA) } };
  return { u0: p.cA - p.w / 2, u1: p.cA + p.w / 2, curved: false, lo: flat(`${key}:lo`, p.bottom), hi: flat(`${key}:hi`, p.top) };
}
/** The surround's outer curve (its sill is the opening's), or null when the elevation draws none. */
export function surroundEdges(p: Outline, key: string): { u0: number; u1: number; lo: Edge; hi: Edge } | null {
  const R = p.rOuter;
  if (!(R > p.r + 2)) return null;
  if (p.kind === "round") return { u0: p.cA - R, u1: p.cA + R, lo: { id: `${key}:slo`, f: (u) => p.cy - root(R, u - p.cA) }, hi: { id: `${key}:shi`, f: (u) => p.cy + root(R, u - p.cA) } };
  return { u0: p.cA - R, u1: p.cA + R, lo: flat(`${key}:slo`, p.bottom), hi: { id: `${key}:shi`, f: (u) => p.spring + root(R, u - p.cA) } };
}

export function minusE(pieces: Piece[], holes: Piece[], u: number): Piece[] {
  let cur = pieces;
  for (const [hl, hh] of holes) {
    const l = hl.f(u), h = hh.f(u);
    cur = cur.flatMap(([a, b]): Piece[] => {
      const va = a.f(u), vb = b.f(u);
      if (h <= va + 0.01 || l >= vb - 0.01) return [[a, b]];
      const out: Piece[] = [];
      if (l > va + 0.01) out.push([a, hl]);
      if (h < vb - 0.01) out.push([hh, b]);
      return out;
    });
  }
  return cur;
}
export function intersectE(pieces: Piece[], [il, ih]: Piece, u: number): Piece[] {
  return pieces.flatMap(([a, b]): Piece[] => {
    const lo = a.f(u) >= il.f(u) ? a : il, hi = b.f(u) <= ih.f(u) ? b : ih;
    return hi.f(u) - lo.f(u) > 0.01 ? [[lo, hi]] : [];
  });
}

/**
 * Polygons (u, y) covering, between consecutive critical places, the pieces `region` gives at the span's middle — each bounded
 * by its two curves sampled every `step` along a span `curved` says a curve runs through.
 */
export function sweep(crits: number[], curved: (u: number) => boolean, region: (u: number) => Piece[], step = 1): Array<Array<[number, number]>> {
  const cs = crits.filter((c) => Number.isFinite(c)).sort((a, b) => a - b).filter((c, i, arr) => i === 0 || c - arr[i - 1]! > 0.05);
  const polys: Array<Array<[number, number]>> = [];
  for (let i = 0; i + 1 < cs.length; i++) {
    const c0 = cs[i]!, c1 = cs[i + 1]!, mid = (c0 + c1) / 2;
    const n = curved(mid) ? Math.min(400, Math.max(2, Math.ceil((c1 - c0) / step))) : 1;
    const us = Array.from({ length: n + 1 }, (_, k) => c0 + ((c1 - c0) * k) / n);
    for (const [lo, hi] of region(mid)) {
      const top = us.map((u): [number, number] => [u, Math.max(lo.f(u), hi.f(u))]);
      const bot = us.map((u): [number, number] => [u, lo.f(u)]).reverse();
      const ring = [...top, ...bot].filter((q, k, arr) => k === 0 || Math.hypot(q[0] - arr[k - 1]![0], q[1] - arr[k - 1]![1]) > 0.02);
      if (ring.length > 2 && Math.hypot(ring[0]![0] - ring.at(-1)![0], ring[0]![1] - ring.at(-1)![1]) < 0.02) ring.pop();
      let a = 0;
      for (let k = 0; k < ring.length; k++) { const p = ring[k]!, q = ring[(k + 1) % ring.length]!; a += p[0] * q[1] - q[0] * p[1]; }
      if (ring.length >= 3 && Math.abs(a) / 2 > 0.5) polys.push(ring);
    }
  }
  return polys;
}
