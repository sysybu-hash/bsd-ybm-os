/**
 * A storey's plan on a 5 cm grid (storey-local cm): which cells are drawn wall lines, which are outside (flooded from the edge),
 * and which enclosed regions are thin (a wall's core between its two faces) rather than rooms.
 */
import type { DxfPiece, Pt } from "@/lib/projects/dxf-drawing";

export const CELL = 5; // cm

export type Grid = {
  x0: number; y0: number; nx: number; ny: number;
  /** 1 = drawn line, 0 = free */
  line: Uint8Array;
  /** 1 = reached from the edge without crossing a line */
  outside: Uint8Array;
  /** region id per free inside cell (0 = none) */
  region: Int32Array;
  /** per region: largest distance (cells) to a blocked cell, cell count */
  regionDepth: number[];
  regionSize: number[];
};

export const idx = (g: Grid, i: number, j: number) => j * g.nx + i;
export const cellOf = (g: Grid, p: Pt): [number, number] => [Math.floor((p.x - g.x0) / CELL), Math.floor((p.y - g.y0) / CELL)];
export const centreOf = (g: Grid, i: number, j: number): Pt => ({ x: g.x0 + (i + 0.5) * CELL, y: g.y0 + (j + 0.5) * CELL });

export function segmentsOf(p: DxfPiece): Array<[Pt, Pt]> {
  const out: Array<[Pt, Pt]> = [];
  if (p.pts) {
    for (let k = 1; k < p.pts.length; k++) out.push([p.pts[k - 1]!, p.pts[k]!]);
    if (p.closed && p.pts.length > 2) out.push([p.pts[p.pts.length - 1]!, p.pts[0]!]);
  } else if (p.arc) {
    let { start, end } = p.arc;
    while (end < start) end += 2 * Math.PI;
    const n = Math.max(4, Math.ceil(((end - start) * p.arc.r) / 10));
    for (let k = 0; k < n; k++) {
      const a = start + ((end - start) * k) / n, b = start + ((end - start) * (k + 1)) / n;
      out.push([{ x: p.arc.c.x + p.arc.r * Math.cos(a), y: p.arc.c.y + p.arc.r * Math.sin(a) }, { x: p.arc.c.x + p.arc.r * Math.cos(b), y: p.arc.c.y + p.arc.r * Math.sin(b) }]);
    }
  } else if (p.circle) {
    const n = Math.max(8, Math.ceil((2 * Math.PI * p.circle.r) / 10));
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k) / n, b = (2 * Math.PI * (k + 1)) / n;
      out.push([{ x: p.circle.c.x + p.circle.r * Math.cos(a), y: p.circle.c.y + p.circle.r * Math.sin(a) }, { x: p.circle.c.x + p.circle.r * Math.cos(b), y: p.circle.c.y + p.circle.r * Math.sin(b) }]);
    }
  }
  return out;
}

export function buildGrid(segs: Array<[Pt, Pt]>, bounds: { x0: number; y0: number; x1: number; y1: number }): Grid {
  const x0 = Math.floor(bounds.x0 / CELL) * CELL - 4 * CELL, y0 = Math.floor(bounds.y0 / CELL) * CELL - 4 * CELL;
  const nx = Math.ceil((bounds.x1 - x0) / CELL) + 8, ny = Math.ceil((bounds.y1 - y0) / CELL) + 8;
  const line = new Uint8Array(nx * ny);
  const g: Grid = { x0, y0, nx, ny, line, outside: new Uint8Array(nx * ny), region: new Int32Array(nx * ny), regionDepth: [0], regionSize: [0] };
  // 4-connected rasterisation: a line never lets a 4-way flood through its diagonal steps.
  for (const [a, b] of segs) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / (CELL / 3)));
    let pi = -1, pj = -1;
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n;
      const i = Math.floor((x - x0) / CELL), j = Math.floor((y - y0) / CELL);
      if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
      if (pi >= 0 && i !== pi && j !== pj) line[j * nx + pi] = 1;
      line[j * nx + i] = 1;
      pi = i; pj = j;
    }
  }
  // outside flood
  const q: number[] = [];
  const push = (i: number, j: number, arr: Uint8Array) => { const k = j * nx + i; if (!line[k] && !arr[k]) { arr[k] = 1; q.push(k); } };
  for (let i = 0; i < nx; i++) { push(i, 0, g.outside); push(i, ny - 1, g.outside); }
  for (let j = 0; j < ny; j++) { push(0, j, g.outside); push(nx - 1, j, g.outside); }
  while (q.length) {
    const k = q.pop()!; const i = k % nx, j = (k - i) / nx;
    if (i > 0) push(i - 1, j, g.outside); if (i < nx - 1) push(i + 1, j, g.outside);
    if (j > 0) push(i, j - 1, g.outside); if (j < ny - 1) push(i, j + 1, g.outside);
  }
  // distance to the nearest blocked cell (line or outside), chessboard
  const INF = 1e9;
  const dt = new Float64Array(nx * ny);
  for (let k = 0; k < nx * ny; k++) dt[k] = line[k] || g.outside[k] ? 0 : INF;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (!dt[k]) continue;
    let v = dt[k]!;
    if (i > 0) v = Math.min(v, dt[k - 1]! + 1);
    if (j > 0) { v = Math.min(v, dt[k - nx]! + 1); if (i > 0) v = Math.min(v, dt[k - nx - 1]! + 1); if (i < nx - 1) v = Math.min(v, dt[k - nx + 1]! + 1); }
    dt[k] = v;
  }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i; if (!dt[k]) continue;
    let v = dt[k]!;
    if (i < nx - 1) v = Math.min(v, dt[k + 1]! + 1);
    if (j < ny - 1) { v = Math.min(v, dt[k + nx]! + 1); if (i < nx - 1) v = Math.min(v, dt[k + nx + 1]! + 1); if (i > 0) v = Math.min(v, dt[k + nx - 1]! + 1); }
    dt[k] = v;
  }
  // regions
  let id = 0;
  for (let k0 = 0; k0 < nx * ny; k0++) {
    if (line[k0] || g.outside[k0] || g.region[k0]) continue;
    id++;
    let depth = 0, size = 0;
    const st = [k0]; g.region[k0] = id;
    while (st.length) {
      const k = st.pop()!; size++; depth = Math.max(depth, dt[k]!);
      const i = k % nx, j = (k - i) / nx;
      for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]] as const) {
        if (a < 0 || b < 0 || a >= nx || b >= ny) continue;
        const kk = b * nx + a;
        if (!line[kk] && !g.outside[kk] && !g.region[kk]) { g.region[kk] = id; st.push(kk); }
      }
    }
    g.regionDepth.push(depth); g.regionSize.push(size);
  }
  return g;
}

/** Greedy rectangles over cells where `on(k)` holds and `key(k)` is the same. Returns [i0, j0, i1, j1) per rect with its key. */
export function rects(g: Grid, on: (k: number) => boolean, key: (k: number) => number = () => 0): Array<{ i0: number; j0: number; i1: number; j1: number; key: number }> {
  const used = new Uint8Array(g.nx * g.ny);
  const out: Array<{ i0: number; j0: number; i1: number; j1: number; key: number }> = [];
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const k = j * g.nx + i;
    if (used[k] || !on(k)) continue;
    const kk = key(k);
    let i1 = i + 1;
    while (i1 < g.nx && !used[j * g.nx + i1] && on(j * g.nx + i1) && key(j * g.nx + i1) === kk) i1++;
    let j1 = j + 1;
    grow: while (j1 < g.ny) {
      for (let a = i; a < i1; a++) { const q = j1 * g.nx + a; if (used[q] || !on(q) || key(q) !== kk) break grow; }
      j1++;
    }
    for (let b = j; b < j1; b++) for (let a = i; a < i1; a++) used[b * g.nx + a] = 1;
    out.push({ i0: i, j0: j, i1, j1, key: kk });
  }
  return out;
}
