/** Linear ground from spot heights: a Delaunay triangulation (Bowyer–Watson), heights interpolated inside each triangle.
 *  Outside the hull the nearest spot's height holds (no extrapolated slopes). */
import type { Pt } from "@/lib/projects/dxf-drawing";

type Tri = [number, number, number];
export function makeTin(pts: Array<{ at: Pt; h: number }>) {
  const P = pts.map((p) => p.at);
  const xs = P.map((p) => p.x), ys = P.map((p) => p.y);
  const mx = Math.min(...xs), my = Math.min(...ys), d = Math.max(Math.max(...xs) - mx, Math.max(...ys) - my) * 20;
  const V = [...P, { x: mx - d, y: my - d }, { x: mx + 2 * d, y: my - d }, { x: mx - d, y: my + 2 * d }];
  const n = P.length;
  let tris: Tri[] = [[n, n + 1, n + 2]];
  const circ = (t: Tri, p: Pt) => {
    const [a, b, c] = t.map((i) => V[i]!) as [Pt, Pt, Pt];
    const ax = a.x - p.x, ay = a.y - p.y, bx = b.x - p.x, by = b.y - p.y, cx = c.x - p.x, cy = c.y - p.y;
    const det = (ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay) + (cx * cx + cy * cy) * (ax * by - bx * ay);
    const orient = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    return orient > 0 ? det > 0 : det < 0;
  };
  for (let i = 0; i < n; i++) {
    const p = V[i]!;
    const bad = tris.filter((t) => circ(t, p));
    const edges = new Map<string, [number, number]>();
    for (const t of bad) for (const [u, v] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]] as Array<[number, number]>) {
      const k = u < v ? `${u},${v}` : `${v},${u}`;
      if (edges.has(k)) edges.delete(k); else edges.set(k, [u, v]);
    }
    tris = tris.filter((t) => !bad.includes(t));
    for (const [u, v] of edges.values()) tris.push([u, v, i]);
  }
  tris = tris.filter((t) => t.every((i) => i < n));
  return (q: Pt) => {
    for (const t of tris) {
      const [a, b, c] = t.map((i) => P[i]!) as [Pt, Pt, Pt];
      const den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      const l1 = ((b.y - c.y) * (q.x - c.x) + (c.x - b.x) * (q.y - c.y)) / den;
      const l2 = ((c.y - a.y) * (q.x - c.x) + (a.x - c.x) * (q.y - c.y)) / den;
      const l3 = 1 - l1 - l2;
      if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) return l1 * pts[t[0]]!.h + l2 * pts[t[1]]!.h + l3 * pts[t[2]]!.h;
    }
    // outside the hull: the height of the nearest point on the hull's edges, so the ground runs on level with no steps
    let bh = 0, bd = Infinity;
    for (const t of tris) for (const [u, v] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]] as Array<[number, number]>) {
      const a = P[u]!, b = P[v]!; const dx = b.x - a.x, dy = b.y - a.y; const L2 = dx * dx + dy * dy || 1;
      const s = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2));
      const dd = Math.hypot(a.x + s * dx - q.x, a.y + s * dy - q.y);
      if (dd < bd) { bd = dd; bh = pts[u]!.h + s * (pts[v]!.h - pts[u]!.h); }
    }
    return bh;
  };
}
