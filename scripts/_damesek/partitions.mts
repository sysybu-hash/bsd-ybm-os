// Scratch (Damesek Eliezer dedicated builder): the plans' light walls. Revit exports a gypsum partition (A_WALL_PRTN) as its two
// faces' lines, with no hatch: two parallel lines a wall's thickness apart, running together, are one wall — the quad over the
// stretch they share. Delete when done.
import type { DxfPiece, Pt } from "@/lib/projects/dxf-drawing";

type Seg = { a: Pt; b: Pt; len: number; ux: number; uy: number };
export type Quad = { ring: Pt[]; thick: number; len: number; lone?: boolean };

export function partitionQuads(ps: DxfPiece[], layer = /^A_WALL_PRTN$/, tMin = 1.5, tMax = 30): Quad[] {
  const segs: Seg[] = [];
  for (const p of ps) {
    if (!layer.test(p.layer) || !p.pts || p.rings) continue;
    for (let i = 0; i + 1 < p.pts.length; i++) {
      const a = p.pts[i]!, b = p.pts[i + 1]!, len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 5) continue;
      segs.push({ a, b, len, ux: (b.x - a.x) / len, uy: (b.y - a.y) / len });
    }
  }
  const out: Quad[] = [];
  const used = new Set<string>();
  segs.forEach((s, i) => {
    let best: { j: number; d: number; t0: number; t1: number } | null = null;
    segs.forEach((q, j) => {
      if (j === i) return;
      if (Math.abs(s.ux * q.uy - s.uy * q.ux) > 0.02) return; // parallel
      // q's ends in s's frame: along t, across d
      const tA = (q.a.x - s.a.x) * s.ux + (q.a.y - s.a.y) * s.uy, tB = (q.b.x - s.a.x) * s.ux + (q.b.y - s.a.y) * s.uy;
      const dA = -(q.a.x - s.a.x) * s.uy + (q.a.y - s.a.y) * s.ux, dB = -(q.b.x - s.a.x) * s.uy + (q.b.y - s.a.y) * s.ux;
      if (Math.abs(dA - dB) > 1) return;
      const d = (dA + dB) / 2;
      if (Math.abs(d) < tMin || Math.abs(d) > tMax) return;
      const t0 = Math.max(0, Math.min(tA, tB)), t1 = Math.min(s.len, Math.max(tA, tB));
      if (t1 - t0 < Math.min(s.len, q.len) * 0.5 || t1 - t0 < 4) return;
      if (!best || Math.abs(d) < Math.abs(best.d)) best = { j, d, t0, t1 };
    });
    if (!best) return;
    const { j, d, t0, t1 } = best as { j: number; d: number; t0: number; t1: number };
    const key = `${Math.min(i, j)}:${Math.max(i, j)}`;
    if (used.has(key)) return;
    used.add(key);
    const P0 = { x: s.a.x + s.ux * t0, y: s.a.y + s.uy * t0 }, P1 = { x: s.a.x + s.ux * t1, y: s.a.y + s.uy * t1 };
    const nx = -s.uy * d, ny = s.ux * d;
    out.push({ ring: [P0, P1, { x: P1.x + nx, y: P1.y + ny }, { x: P0.x + nx, y: P0.y + ny }], thick: Math.abs(d), len: t1 - t0 });
  });
  // a quad with no other parallel quad beside it (within 25 cm across, overlapping along) is a panel on its own — a toilet
  // cubicle's; a gypsum wall's board layers always come with the layer on its other face
  const axis = (q: Quad) => { const a = q.ring[0]!, b = q.ring[1]!, l = Math.hypot(b.x - a.x, b.y - a.y); return { a, ux: (b.x - a.x) / l, uy: (b.y - a.y) / l, l }; };
  for (const q of out) {
    const A = axis(q);
    q.lone = !out.some((o) => {
      if (o === q) return false;
      const B = axis(o);
      if (Math.abs(A.ux * B.uy - A.uy * B.ux) > 0.02) return false;
      const ts = o.ring.map((v) => (v.x - A.a.x) * A.ux + (v.y - A.a.y) * A.uy), ds = o.ring.map((v) => -(v.x - A.a.x) * A.uy + (v.y - A.a.y) * A.ux);
      return Math.min(...ts) < A.l - 2 && Math.max(...ts) > 2 && Math.min(...ds.map(Math.abs)) < 25;
    });
  }
  return out;
}
