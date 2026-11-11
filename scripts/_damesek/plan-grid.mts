// Scratch (Damesek Eliezer dedicated builder): each plan's walls as a grid, the storey's outline from it. Delete when done.
import fs from "node:fs";
import type { DxfPiece, Pt } from "@/lib/projects/dxf-drawing";
const { readDxfDrawing, flattenDxf } = await import("@/lib/projects/dxf-drawing");

export const CELL = 5; // cm
export type Grid = { x0: number; y0: number; nx: number; ny: number; a: Uint8Array };
export const WALL_LAYERS = /^(A-WALL-PATT|S-COLS)$/;
export const OPENING = /חלון|Window|BW |Door|Mullion|Panel|mamad win|Tovna_Mamad_Window/i;

export function readPieces(file: string): DxfPiece[] {
  const d = readDxfDrawing(fs.readFileSync(file))!;
  return flattenDxf(d);
}
export const wallRings = (ps: DxfPiece[]) => ps.filter((p) => p.rings && WALL_LAYERS.test(p.layer)).flatMap((p) => p.rings!);

export function makeGrid(x0: number, y0: number, x1: number, y1: number): Grid {
  const nx = Math.ceil((x1 - x0) / CELL), ny = Math.ceil((y1 - y0) / CELL);
  return { x0, y0, nx, ny, a: new Uint8Array(nx * ny) };
}
/** Even-odd fill of rings (one hatch's rings together, so holes stay holes). */
export function fillRings(g: Grid, rings: Pt[][], v = 1) {
  for (let j = 0; j < g.ny; j++) {
    const y = g.y0 + (j + 0.5) * CELL;
    const xs: number[] = [];
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const a = r[i]!, b = r[(i + 1) % r.length]!;
      if ((a.y <= y) !== (b.y <= y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k]! - g.x0) / CELL - 0.5)), i1 = Math.min(g.nx - 1, Math.floor((xs[k + 1]! - g.x0) / CELL - 0.5));
      for (let i = i0; i <= i1; i++) g.a[j * g.nx + i] = v;
    }
  }
}
export function drawLine(g: Grid, a: Pt, b: Pt, v = 1) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (CELL / 2)) + 1;
  for (let k = 0; k <= n; k++) {
    const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n;
    const i = Math.floor((x - g.x0) / CELL), j = Math.floor((y - g.y0) / CELL);
    if (i >= 0 && j >= 0 && i < g.nx && j < g.ny) g.a[j * g.nx + i] = v;
  }
}
/** Chamfer distance (cells) to the nearest set cell. */
export function distance(g: Grid, set: (v: number) => boolean): Float32Array {
  const { nx, ny } = g, d = new Float32Array(nx * ny).fill(1e9);
  for (let k = 0; k < nx * ny; k++) if (set(g.a[k]!)) d[k] = 0;
  const S = Math.SQRT2;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; let v = d[k]!;
    if (i > 0) v = Math.min(v, d[k - 1]! + 1);
    if (j > 0) { v = Math.min(v, d[k - nx]! + 1); if (i > 0) v = Math.min(v, d[k - nx - 1]! + S); if (i < nx - 1) v = Math.min(v, d[k - nx + 1]! + S); }
    d[k] = v;
  }
  for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
    const k = j * nx + i; let v = d[k]!;
    if (i < nx - 1) v = Math.min(v, d[k + 1]! + 1);
    if (j < ny - 1) { v = Math.min(v, d[k + nx]! + 1); if (i < nx - 1) v = Math.min(v, d[k + nx + 1]! + S); if (i > 0) v = Math.min(v, d[k + nx - 1]! + S); }
    d[k] = v;
  }
  return d;
}
/** The storey's floor: what the walls (and the openings' own lines) close, the gaps up to 2·rCm bridged. */
export function footprint(g: Grid, rCm: number): Uint8Array {
  const { nx, ny } = g, r = rCm / CELL;
  const dw = distance(g, (v) => v > 0);
  const blocked = (k: number) => dw[k]! <= r;
  const out = new Uint8Array(nx * ny); // 1 = outside
  const q: number[] = [];
  for (let i = 0; i < nx; i++) for (const j of [0, ny - 1]) { const k = j * nx + i; if (!blocked(k) && !out[k]) { out[k] = 1; q.push(k); } }
  for (let j = 0; j < ny; j++) for (const i of [0, nx - 1]) { const k = j * nx + i; if (!blocked(k) && !out[k]) { out[k] = 1; q.push(k); } }
  while (q.length) {
    const k = q.pop()!, i = k % nx, j = (k - i) / nx;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const kk = jj * nx + ii; if (!out[kk] && !blocked(kk)) { out[kk] = 1; q.push(kk); }
    }
  }
  // Grow the outside back by r: the closing's erosion.
  const og: Grid = { ...g, a: out };
  const dOut = distance(og, (v) => v === 1);
  const fp = new Uint8Array(nx * ny);
  for (let k = 0; k < nx * ny; k++) fp[k] = dOut[k]! > r || g.a[k]! === 1 ? 1 : 0;
  return fp;
}
/** Rectangles covering a mask: row runs merged down while identical. */
export function rects(g: Grid, m: Uint8Array): Array<{ x0: number; y0: number; x1: number; y1: number }> {
  const out: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  let open = new Map<string, { i0: number; i1: number; j0: number }>();
  for (let j = 0; j <= g.ny; j++) {
    const runs: Array<[number, number]> = [];
    if (j < g.ny) for (let i = 0; i < g.nx; ) { if (m[j * g.nx + i]) { const s = i; while (i < g.nx && m[j * g.nx + i]) i++; runs.push([s, i - 1]); } else i++; }
    const next = new Map<string, { i0: number; i1: number; j0: number }>();
    for (const [a, b] of runs) { const key = `${a},${b}`; next.set(key, open.get(key) ?? { i0: a, i1: b, j0: j }); }
    for (const [key, r] of open) if (!next.has(key) || next.get(key) !== r) out.push({ x0: g.x0 + r.i0 * CELL, x1: g.x0 + (r.i1 + 1) * CELL, y0: g.y0 + r.j0 * CELL, y1: g.y0 + j * CELL });
    open = next;
  }
  return out;
}
