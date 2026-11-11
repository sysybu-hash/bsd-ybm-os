/**
 * Isolates apartment 14 on the Weinberg sale sheet.
 *
 * Door and window holes are sealed first (see sealDxfWallsForFlood). A seal
 * that joins two apartment numbers is taken back out: that hole is the wall
 * between flats, not a room door. The polygon is kept only when it holds
 * apartment 14, misses 15 and 11, stays off the sheet edge, and measures
 * near the printed 111.11 m².
 */
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import sharp from "sharp";

import { sealDxfWallsForFlood, type OpeningBridge } from "../lib/projects/dxf-seal-openings";
import { bodyRect, type WallBody } from "../lib/projects/floorplan-solid";
import type { VectorSegment } from "../lib/projects/floorplan-vector";

const DXF = path.join(
  "C:\\Users\\User\\Desktop\\BSD-YBM-OS",
  "מערכת הדמיות",
  "ויינברג",
  "מכר סופי 29.10.26.dxf",
);
const OUT_DIR = path.dirname(DXF);
const UPM = 100;
const CELL = 5;
const BOX = { x0: 54000, y0: 30600, x1: 56800, y1: 33800 };
const TARGET_M2 = 111.11;

const SEEDS = {
  apt14: { x: 54833, y: 33008 },
  apt15: { x: 55820, y: 32886 },
  apt11: { x: 55149, y: 31609 },
  label14: { x: 55181.5, y: 32530 },
  label15: { x: 55362, y: 32530 },
  area14: { x: 55208, y: 32501 },
};

type Seg = VectorSegment;

// A-EL continues the balcony outline where a-wl stops. On this sheet those
// lines are the rail and the shaft, not a symbol.
const wallLayer = (layer: string) => /^(a-wl|a-wall|00-wl|a-el)$/i.test(layer);
const glazeLayer = (layer: string) => /^(00-win|חלון|חלונות)$/i.test(layer) || /window|a-glaz/i.test(layer);
const markLayer = (layer: string) => glazeLayer(layer) || /^(00-dor|a-dr|door|doors|פתחים)$/i.test(layer);
const keepLayer = (layer: string) => !/^(a-ht|00-mabat|dim|above)$/i.test(layer);

type Entity = {
  type: string;
  layer: string;
  xs: number[];
  ys: number[];
};

async function readEntities(): Promise<{ walls: Seg[]; glazing: Seg[]; marks: Array<{ x: number; y: number }> }> {
  const walls: Seg[] = [];
  const glazing: Seg[] = [];
  const marks: Array<{ x: number; y: number }> = [];
  const pairs = pairsOf(DXF);
  let section = "";
  let expectName = false;
  let cur: Entity | null = null;
  let poly: { layer: string; xs: number[]; ys: number[] } | null = null;

  const flush = (ent: Entity | null) => {
    if (!ent) return;
    if (ent.type === "POLYLINE") {
      poly = { layer: ent.layer, xs: [], ys: [] };
      return;
    }
    if (ent.type === "VERTEX" && poly) {
      const x = ent.xs[0];
      const y = ent.ys[0];
      if (x != null && y != null) {
        poly.xs.push(x);
        poly.ys.push(y);
      }
      return;
    }
    if (ent.type === "SEQEND" && poly) {
      takeChain(poly.layer, poly.xs, poly.ys);
      poly = null;
      return;
    }
    if (ent.type === "LINE" && ent.xs.length >= 2 && ent.ys.length >= 2) {
      takeChain(ent.layer, ent.xs, ent.ys);
    } else if (ent.type === "LWPOLYLINE") {
      takeChain(ent.layer, ent.xs, ent.ys);
    } else if ((ent.type === "INSERT" || ent.type === "ARC" || ent.type === "CIRCLE") && markLayer(ent.layer)) {
      const x = ent.xs[0];
      const y = ent.ys[0];
      if (x != null && y != null && inBox(x, y, 400)) marks.push({ x, y });
    }
  };

  for await (const { code, value } of pairs) {
    if (code === "0" && value === "SECTION") {
      expectName = true;
      continue;
    }
    if (expectName && code === "2") {
      section = value;
      expectName = false;
      continue;
    }
    if (code === "0" && value === "ENDSEC") {
      flush(cur);
      cur = null;
      section = "";
      continue;
    }
    if (section !== "ENTITIES") continue;
    if (code === "0") {
      flush(cur);
      cur = { type: value, layer: "0", xs: [], ys: [] };
      continue;
    }
    if (!cur) continue;
    if (code === "8") cur.layer = value;
    else if (code === "10") cur.xs.push(Number(value));
    else if (code === "20") cur.ys.push(Number(value));
    else if (code === "11") cur.xs.push(Number(value));
    else if (code === "21") cur.ys.push(Number(value));
  }
  flush(cur);
  return { walls, glazing, marks };

  function inBox(x: number, y: number, pad = 0) {
    return x >= BOX.x0 - pad && x <= BOX.x1 + pad && y >= BOX.y0 - pad && y <= BOX.y1 + pad;
  }
  function takeChain(layer: string, xs: number[], ys: number[]) {
    const n = Math.min(xs.length, ys.length);
    for (let i = 1; i < n; i++) {
      const seg = axis(xs[i - 1]!, ys[i - 1]!, xs[i]!, ys[i]!);
      if (!seg) continue;
      if (!inBox(seg.x1, seg.y1) && !inBox(seg.x2, seg.y2)) continue;
      if (wallLayer(layer)) walls.push(seg);
      else if (glazeLayer(layer)) glazing.push(seg);
    }
  }
}

function axis(x1: number, y1: number, x2: number, y2: number): Seg | null {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  if (dx < 20 && dy < 20) return null;
  if (dy <= 4 || dy < dx * 0.02) {
    const y = (y1 + y2) / 2;
    return { x1, y1: y, x2, y2: y, lineWidth: 1 };
  }
  if (dx <= 4 || dx < dy * 0.02) {
    const x = (x1 + x2) / 2;
    return { x1: x, y1, x2: x, y2, lineWidth: 1 };
  }
  return null;
}

type Grid = {
  cols: number;
  rows: number;
  ox: number;
  oy: number;
  wall: Uint8Array;
};

function paint(grid: Grid, x: number, y: number, w: number, h: number) {
  let { x: rx, y: ry, w: rw, h: rh } = { x, y, w, h };
  if (rw < CELL) {
    rx -= (CELL - rw) / 2;
    rw = CELL;
  }
  if (rh < CELL) {
    ry -= (CELL - rh) / 2;
    rh = CELL;
  }
  const c0 = Math.max(0, Math.floor((rx - grid.ox) / CELL));
  const r0 = Math.max(0, Math.floor((ry - grid.oy) / CELL));
  const c1 = Math.min(grid.cols, Math.ceil((rx + rw - grid.ox) / CELL));
  const r1 = Math.min(grid.rows, Math.ceil((ry + rh - grid.oy) / CELL));
  for (let r = r0; r < r1; r++) {
    const row = r * grid.cols;
    for (let c = c0; c < c1; c++) grid.wall[row + c] = 1;
  }
}

function dilate(grid: Grid) {
  const src = grid.wall;
  const out = new Uint8Array(src);
  const { cols, rows } = grid;
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const i = r * cols + c;
      if (src[i]) continue;
      if (src[i - 1] || src[i + 1] || src[i - cols] || src[i + cols]) out[i] = 1;
    }
  }
  grid.wall = out;
}

function sealBorder(grid: Grid) {
  const { cols, rows, wall } = grid;
  for (let c = 0; c < cols; c++) {
    wall[c] = 1;
    wall[(rows - 1) * cols + c] = 1;
  }
  for (let r = 0; r < rows; r++) {
    wall[r * cols] = 1;
    wall[r * cols + cols - 1] = 1;
  }
}

function buildGrid(origin: { ox: number; oy: number; cols: number; rows: number }, barriers: WallBody[], patches: Array<{ x: number; y: number; w: number; h: number }>): Grid {
  const grid: Grid = { ...origin, wall: new Uint8Array(origin.cols * origin.rows) };
  for (const b of barriers) {
    const r = bodyRect(b);
    paint(grid, r.x, r.y, r.w, r.h);
  }
  for (const p of patches) paint(grid, p.x, p.y, p.w, p.h);
  dilate(grid);
  sealBorder(grid);
  return grid;
}

function locate(grid: Grid, x: number, y: number): number | null {
  const c = Math.round((x - grid.ox) / CELL);
  const r = Math.round((y - grid.oy) / CELL);
  const rad = Math.ceil(120 / CELL);
  let best = -1;
  let bestD = 1e9;
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      const cc = c + dx;
      const rr = r + dy;
      if (cc <= 1 || rr <= 1 || cc >= grid.cols - 2 || rr >= grid.rows - 2) continue;
      const i = rr * grid.cols + cc;
      if (grid.wall[i]) continue;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  }
  return best >= 0 ? best : null;
}

function flood(grid: Grid, start: number): Uint8Array {
  const seen = new Uint8Array(grid.wall.length);
  if (grid.wall[start]) return seen;
  const q = [start];
  seen[start] = 1;
  let qi = 0;
  const { cols, rows, wall } = grid;
  while (qi < q.length) {
    const i = q[qi++]!;
    const r = (i / cols) | 0;
    const c = i - r * cols;
    const step = (j: number) => {
      if (!seen[j] && !wall[j]) {
        seen[j] = 1;
        q.push(j);
      }
    };
    if (c > 0) step(i - 1);
    if (c < cols - 1) step(i + 1);
    if (r > 0) step(i - cols);
    if (r < rows - 1) step(i + cols);
  }
  return seen;
}

function touchesBorder(grid: Grid, region: Uint8Array): boolean {
  const { cols, rows } = grid;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!region[r * cols + c]) continue;
      if (c <= 2 || r <= 2 || c >= cols - 3 || r >= rows - 3) return true;
    }
  }
  return false;
}

function areaM2(region: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < region.length; i++) if (region[i]) n++;
  return (n * CELL * CELL) / 1e4;
}

function holds(grid: Grid, region: Uint8Array, p: { x: number; y: number }): boolean {
  const i = locate(grid, p.x, p.y);
  return i != null && region[i] === 1;
}

function leakPath(grid: Grid, region: Uint8Array, start: number): Array<{ x: number; y: number }> {
  const { cols, rows } = grid;
  const dist = new Int32Array(region.length);
  dist.fill(-1);
  const prev = new Int32Array(region.length);
  prev.fill(-1);
  const q = [start];
  dist[start] = 0;
  let qi = 0;
  let exit = -1;
  while (qi < q.length) {
    const i = q[qi++]!;
    const r = (i / cols) | 0;
    const c = i - r * cols;
    if (c <= 2 || r <= 2 || c >= cols - 3 || r >= rows - 3) {
      exit = i;
      break;
    }
    const step = (j: number) => {
      if (dist[j] !== -1 || !region[j]) return;
      dist[j] = dist[i]! + 1;
      prev[j] = i;
      q.push(j);
    };
    if (c > 0) step(i - 1);
    if (c + 1 < cols) step(i + 1);
    if (r > 0) step(i - cols);
    if (r + 1 < rows) step(i + cols);
  }
  if (exit < 0) return [];
  const chain: number[] = [];
  for (let i = exit; i !== -1; i = prev[i]!) chain.push(i);
  chain.reverse();
  const step = Math.max(1, Math.floor(chain.length / 10));
  const out: Array<{ x: number; y: number }> = [];
  for (let k = 0; k < chain.length; k += step) {
    const i = chain[k]!;
    const r = (i / cols) | 0;
    const c = i - r * cols;
    out.push({ x: grid.ox + c * CELL, y: grid.oy + r * CELL });
  }
  const i = chain[chain.length - 1]!;
  const r = (i / cols) | 0;
  const c = i - r * cols;
  out.push({ x: grid.ox + c * CELL, y: grid.oy + r * CELL });
  return out;
}

async function dumpGrid(grid: Grid, region: Uint8Array, file: string) {
  const { cols, rows } = grid;
  const buf = Buffer.alloc(cols * rows * 3);
  for (let r = 0; r < rows; r++) {
    const src = rows - 1 - r;
    for (let c = 0; c < cols; c++) {
      const i = src * cols + c;
      const o = (r * cols + c) * 3;
      if (grid.wall[i]) {
        buf[o] = 25;
        buf[o + 1] = 25;
        buf[o + 2] = 25;
      } else if (region[i]) {
        buf[o] = 60;
        buf[o + 1] = 120;
        buf[o + 2] = 190;
      } else {
        buf[o] = 245;
        buf[o + 1] = 236;
        buf[o + 2] = 220;
      }
    }
  }
  await sharp(buf, { raw: { width: cols, height: rows, channels: 3 } }).resize(cols * 2, rows * 2, { kernel: "nearest" }).png().toFile(file);
}

function labelSpaces(grid: Grid): { id: Int32Array; outside: Set<number>; has15: Set<number>; has11: Set<number> } {
  const id = new Int32Array(grid.wall.length);
  const outside = new Set<number>();
  const has15 = new Set<number>();
  const has11 = new Set<number>();
  const { cols, rows, wall } = grid;
  let next = 1;
  for (let s = 0; s < wall.length; s++) {
    if (wall[s] || id[s]) continue;
    const q = [s];
    id[s] = next;
    let qi = 0;
    let edge = false;
    while (qi < q.length) {
      const i = q[qi++]!;
      const r = (i / cols) | 0;
      const c = i - r * cols;
      if (c <= 2 || r <= 2 || c >= cols - 3 || r >= rows - 3) edge = true;
      const step = (j: number) => {
        if (!id[j] && !wall[j]) {
          id[j] = next;
          q.push(j);
        }
      };
      if (c > 0) step(i - 1);
      if (c + 1 < cols) step(i + 1);
      if (r > 0) step(i - cols);
      if (r + 1 < rows) step(i + cols);
    }
    if (edge) outside.add(next);
    next++;
  }
  const mark = (p: { x: number; y: number }, set: Set<number>) => {
    const i = locate(grid, p.x, p.y);
    if (i != null && id[i]) set.add(id[i]!);
  };
  mark(SEEDS.apt15, has15);
  mark(SEEDS.label15, has15);
  mark(SEEDS.apt11, has11);
  return { id, outside, has15, has11 };
}

function bridgeSides(grid: Grid, ids: Int32Array, bridge: WallBody): number[] {
  const mid = (bridge.from + bridge.to) / 2;
  const found = new Set<number>();
  for (const dist of [30, 60, 100]) {
    const pts =
      bridge.orientation === "h"
        ? [
            { x: mid, y: bridge.centre - dist },
            { x: mid, y: bridge.centre + dist },
          ]
        : [
            { x: bridge.centre - dist, y: mid },
            { x: bridge.centre + dist, y: mid },
          ];
    for (const p of pts) {
      const c = Math.floor((p.x - grid.ox) / CELL);
      const r = Math.floor((p.y - grid.oy) / CELL);
      if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) continue;
      const id = ids[r * grid.cols + c] ?? 0;
      if (id) found.add(id);
    }
    if (found.size >= 2) break;
  }
  return [...found];
}

function gapLine(g: WallBody): string {
  const lengthM = (g.to - g.from) / UPM;
  if (g.orientation === "h") {
    return `horizontal gap y=${g.centre.toFixed(0)} cm, x=${g.from.toFixed(0)}–${g.to.toFixed(0)} cm, ${lengthM.toFixed(2)} m`;
  }
  return `vertical gap x=${g.centre.toFixed(0)} cm, y=${g.from.toFixed(0)}–${g.to.toFixed(0)} cm, ${lengthM.toFixed(2)} m`;
}

async function writeClippedDxf(region: Uint8Array, grid: Grid, file: string) {
  const grown = grow(region, grid.cols, grid.rows, Math.ceil(40 / CELL));
  const inside = (x: number, y: number) => {
    const c = Math.floor((x - grid.ox) / CELL);
    const r = Math.floor((y - grid.oy) / CELL);
    if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return false;
    return grown[r * grid.cols + c] === 1;
  };

  const pairs = pairsOf(DXF);
  const out: string[] = [
    "0", "SECTION", "2", "HEADER",
    "9", "$ACADVER", "1", "AC1021",
    "9", "$INSUNITS", "70", "5",
    "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
  ];
  let section = "";
  let expectName = false;
  let raw: string[] = [];
  let ent: Entity | null = null;
  let kept = 0;

  const consider = () => {
    if (!ent || !keepLayer(ent.layer)) return;
    const pts = Math.min(ent.xs.length, ent.ys.length);
    if (pts === 0) return;
    let hit = false;
    for (let i = 0; i < pts; i++) if (inside(ent.xs[i]!, ent.ys[i]!)) hit = true;
    if (!hit && pts >= 2) {
      const x = ent.xs.reduce((s, v) => s + v, 0) / ent.xs.length;
      const y = ent.ys.reduce((s, v) => s + v, 0) / ent.ys.length;
      hit = inside(x, y);
    }
    if (hit) {
      out.push(...raw);
      kept++;
    }
  };

  for await (const { code, value } of pairs) {
    if (code === "0" && value.trim() === "SECTION") {
      expectName = true;
      continue;
    }
    if (expectName && code === "2") {
      section = value.trim();
      expectName = false;
      continue;
    }
    if (code === "0" && value.trim() === "ENDSEC") {
      consider();
      ent = null;
      section = "";
      continue;
    }
    if (section !== "ENTITIES") continue;
    if (code === "0") {
      consider();
      ent = { type: value.trim(), layer: "0", xs: [], ys: [] };
      raw = [code, value.trim()];
      continue;
    }
    if (!ent) continue;
    raw.push(code, value.trim());
    if (code === "8") ent.layer = value.trim();
    else if (code === "10" || code === "11") ent.xs.push(Number(value));
    else if (code === "20" || code === "21") ent.ys.push(Number(value));
  }
  out.push("0", "ENDSEC", "0", "EOF");
  writeFileSync(file, out.join("\n"));
  return kept;
}

function grow(region: Uint8Array, cols: number, rows: number, rad: number): Uint8Array {
  const dist = new Int16Array(region.length);
  dist.fill(-1);
  const q: number[] = [];
  const out = new Uint8Array(region);
  for (let i = 0; i < region.length; i++) {
    if (!region[i]) continue;
    dist[i] = 0;
    q.push(i);
  }
  let qi = 0;
  while (qi < q.length) {
    const i = q[qi++]!;
    if (dist[i]! >= rad) continue;
    const r = (i / cols) | 0;
    const c = i - r * cols;
    const step = (j: number) => {
      if (dist[j] !== -1) return;
      dist[j] = dist[i]! + 1;
      out[j] = 1;
      q.push(j);
    };
    if (c > 0) step(i - 1);
    if (c + 1 < cols) step(i + 1);
    if (r > 0) step(i - cols);
    if (r + 1 < rows) step(i + cols);
  }
  return out;
}

async function* pairsOf(file: string): AsyncGenerator<{ code: string; value: string }> {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  const it = rl[Symbol.asyncIterator]();
  for (;;) {
    const a = await it.next();
    if (a.done) return;
    const b = await it.next();
    if (b.done) return;
    yield { code: String(a.value).trim(), value: String(b.value).trim() };
  }
}

async function render(grid: Grid, region: Uint8Array, walls: WallBody[], bridges: OpeningBridge[], file: string) {
  const { cols } = grid;
  let minC = cols;
  let maxC = 0;
  let minR = grid.rows;
  let maxR = 0;
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!region[r * cols + c]) continue;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
  }
  const spans: Array<{ x: number; y: number; w: number }> = [];
  for (let r = minR; r <= maxR; r++) {
    let c = minC;
    while (c <= maxC) {
      while (c <= maxC && !region[r * cols + c]) c++;
      const start = c;
      while (c <= maxC && region[r * cols + c]) c++;
      if (c > start) {
        spans.push({
          x: grid.ox + start * CELL,
          y: grid.oy + r * CELL,
          w: (c - start) * CELL,
        });
      }
    }
  }
  const H = 270;
  const project = (x: number, y: number, z: number) => ({
    X: (x - y) * 0.86,
    Y: (x + y) * 0.42 - z * 1.15,
  });
  const pts: Array<{ X: number; Y: number }> = [];
  const track = (x: number, y: number, z: number) => {
    pts.push(project(x, y, z));
  };
  const x0 = grid.ox + minC * CELL;
  const y0 = grid.oy + minR * CELL;
  const x1 = grid.ox + (maxC + 1) * CELL;
  const y1 = grid.oy + (maxR + 1) * CELL;
  track(x0, y0, 0);
  track(x1, y1, H);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.X);
    minY = Math.min(minY, p.Y);
    maxX = Math.max(maxX, p.X);
    maxY = Math.max(maxY, p.Y);
  }
  const pad = 80;
  const poly = (coords: Array<[number, number, number]>, fill: string) => {
    const d = coords
      .map(([x, y, z], i) => {
        const p = project(x, y, z);
        return `${i === 0 ? "M" : "L"}${p.X.toFixed(1)},${p.Y.toFixed(1)}`;
      })
      .join(" ");
    return `<path d="${d} Z" fill="${fill}"/>`;
  };
  const parts: string[] = [];
  const yOf = (r: number) => grid.oy + r * CELL;
  for (const s of spans) {
    const y = s.y;
    parts.push(poly(
      [
        [s.x, y, 0],
        [s.x + s.w, y, 0],
        [s.x + s.w, y + CELL, 0],
        [s.x, y + CELL, 0],
      ],
      "#c9a36b",
    ));
  }
  const hitsRegion = (b: WallBody) => {
    const rect = bodyRect(b);
    const c0 = Math.floor((rect.x - grid.ox) / CELL);
    const r0 = Math.floor((rect.y - grid.oy) / CELL);
    const c1 = Math.ceil((rect.x + rect.w - grid.ox) / CELL);
    const r1 = Math.ceil((rect.y + rect.h - grid.oy) / CELL);
    for (let r = Math.max(0, r0 - 2); r < Math.min(grid.rows, r1 + 2); r++) {
      for (let c = Math.max(0, c0 - 2); c < Math.min(cols, c1 + 2); c++) {
        if (region[r * cols + c]) return true;
      }
    }
    return false;
  };
  for (const b of walls) {
    if (!hitsRegion(b)) continue;
    const rect = bodyRect(b);
    const sun = b.orientation === "v";
    parts.push(poly(
      [
        [rect.x, rect.y, 0],
        [rect.x + rect.w, rect.y, 0],
        [rect.x + rect.w, rect.y, H],
        [rect.x, rect.y, H],
      ],
      sun ? "#f0c48a" : "#6e5340",
    ));
    parts.push(poly(
      [
        [rect.x, rect.y + rect.h, 0],
        [rect.x + rect.w, rect.y + rect.h, 0],
        [rect.x + rect.w, rect.y + rect.h, H],
        [rect.x, rect.y + rect.h, H],
      ],
      sun ? "#a8845c" : "#3f3228",
    ));
    parts.push(poly(
      [
        [rect.x, rect.y, H],
        [rect.x + rect.w, rect.y, H],
        [rect.x + rect.w, rect.y + rect.h, H],
        [rect.x, rect.y + rect.h, H],
      ],
      "#f3ddb8",
    ));
  }
  for (const b of bridges) {
    if (b.reason === "draft" || !hitsRegion(b)) continue;
    const rect = bodyRect(b);
    parts.push(poly(
      [
        [rect.x, rect.y, 90],
        [rect.x + rect.w, rect.y, 90],
        [rect.x + rect.w, rect.y + rect.h, 90],
        [rect.x, rect.y + rect.h, 90],
      ],
      "rgba(255,196,120,0.55)",
    ));
  }
  const label = project((x0 + x1) / 2, y0 - 80, H + 40);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1100" viewBox="${(minX - pad).toFixed(0)} ${(minY - pad).toFixed(0)} ${(maxX - minX + pad * 2).toFixed(0)} ${(maxY - minY + pad * 2).toFixed(0)}">
  <defs>
    <linearGradient id="sky" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#f6d7a8"/>
      <stop offset="0.45" stop-color="#e0a15a"/>
      <stop offset="1" stop-color="#a85a32"/>
    </linearGradient>
    <radialGradient id="sun" cx="78%" cy="72%" r="55%">
      <stop offset="0" stop-color="#ffe1a8" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#e0a15a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="${(minX - pad).toFixed(0)}" y="${(minY - pad).toFixed(0)}" width="100%" height="100%" fill="url(#sky)"/>
  <rect x="${(minX - pad).toFixed(0)}" y="${(minY - pad).toFixed(0)}" width="100%" height="100%" fill="url(#sun)"/>
  ${parts.join("\n")}
  <text x="${label.X.toFixed(0)}" y="${label.Y.toFixed(0)}" fill="#3a2414" font-family="Arial, sans-serif" font-size="42" text-anchor="middle">דירה 14 · שעת הזהב</text>
</svg>`;
  void yOf;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

async function main() {
  console.log("reading", DXF);
  const { walls: wallSegs, glazing, marks } = await readEntities();
  console.log(`walls ${wallSegs.length} glazing ${glazing.length} marks ${marks.length}`);
  const seal = sealDxfWallsForFlood(wallSegs, glazing, marks, UPM);
  console.log(`bodies ${seal.walls.length} bridges ${seal.bridges.length} open ${seal.openGaps.length}`);
  const counts = { draft: 0, door: 0, glazing: 0, block: 0 };
  for (const b of seal.bridges) counts[b.reason]++;
  console.log(counts);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of wallSegs) {
    minX = Math.min(minX, s.x1, s.x2);
    maxX = Math.max(maxX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxY = Math.max(maxY, s.y1, s.y2);
  }
  const pad = 150;
  const ox = minX - pad;
  const oy = minY - pad;
  const cols = Math.ceil((maxX - minX + pad * 2) / CELL) + 2;
  const rows = Math.ceil((maxY - minY + pad * 2) / CELL) + 2;
  const origin = { ox, oy, cols, rows };
  console.log(`grid ${cols}x${rows}`);

  const draft = seal.bridges.filter((b) => b.reason === "draft");
  const optional = seal.bridges.filter((b) => b.reason !== "draft");
  const evaluate = (extra: OpeningBridge[]) => {
    const grid = buildGrid(origin, [...seal.walls, ...draft, ...extra], seal.patches);
    const start = locate(grid, SEEDS.apt14.x, SEEDS.apt14.y);
    if (start == null) return null;
    const region = flood(grid, start);
    return {
      grid,
      region,
      start,
      area: areaM2(region),
      border: touchesBorder(grid, region),
      has15: holds(grid, region, SEEDS.apt15) || holds(grid, region, SEEDS.label15),
      has11: holds(grid, region, SEEDS.apt11),
      hasLabel: holds(grid, region, SEEDS.label14),
      hasAreaText: holds(grid, region, SEEDS.area14),
    };
  };
  // Seal every opening, see which side of each door is the outside, then
  // open the doors that have rooms on both sides so the flat becomes one
  // polygon. A door onto the sheet edge, or onto apartment 15 or 11, stays shut.
  const sealed = buildGrid(origin, [...seal.walls, ...draft, ...optional], seal.patches);
  const comp = labelSpaces(sealed);
  const refused: OpeningBridge[] = [];
  const kept: OpeningBridge[] = [];
  const uncertain: OpeningBridge[] = [];
  for (const bridge of optional) {
    const sides = bridgeSides(sealed, comp.id, bridge);
    const hitsNeighbour = sides.some((id) => comp.has15.has(id) || comp.has11.has(id));
    const hitsOutside = sides.some((id) => comp.outside.has(id));
    if (hitsOutside || hitsNeighbour || sides.length === 0) refused.push(bridge);
    else if (sides.length === 1) uncertain.push(bridge);
    else kept.push(bridge);
  }
  // A door whose far side landed on the wall stays shut unless opening it
  // grows this flat without reaching the sheet edge or the next apartment.
  let shut = [...refused, ...uncertain];
  for (const bridge of uncertain) {
    const trialShut = shut.filter((b) => b !== bridge);
    const gridTry = buildGrid(origin, [...seal.walls, ...draft, ...trialShut], seal.patches);
    const startTry = locate(gridTry, SEEDS.apt14.x, SEEDS.apt14.y);
    const base = buildGrid(origin, [...seal.walls, ...draft, ...shut], seal.patches);
    const baseStart = locate(base, SEEDS.apt14.x, SEEDS.apt14.y);
    if (startTry == null || baseStart == null) continue;
    const regionTry = flood(gridTry, startTry);
    const grew = areaM2(regionTry) > areaM2(flood(base, baseStart)) + 0.4;
    const leak =
      touchesBorder(gridTry, regionTry) ||
      holds(gridTry, regionTry, SEEDS.apt15) ||
      holds(gridTry, regionTry, SEEDS.label15) ||
      holds(gridTry, regionTry, SEEDS.apt11);
    if (grew && !leak) {
      shut = trialShut;
      kept.push(bridge);
    }
  }
  refused.splice(0, refused.length, ...shut);
  const grid = buildGrid(origin, [...seal.walls, ...draft, ...refused], seal.patches);
  const start = locate(grid, SEEDS.apt14.x, SEEDS.apt14.y);
  const lines: string[] = [];
  lines.push(`wall segments ${wallSegs.length}, glazing ${glazing.length}, door/window marks ${marks.length}`);
  lines.push(`wall bodies ${seal.walls.length}`);
  lines.push(`bridges draft ${counts.draft}, door ${counts.door}, glazing ${counts.glazing}, block ${counts.block}`);
  lines.push(`interior openings left open ${kept.length}, shell openings kept shut ${refused.length}`);
  if (start == null) {
    lines.push("Apartment 14's living-room seed sits on a wall or outside the sheet window. No polygon.");
    writeFileSync(path.join(OUT_DIR, "דירה-14-report.txt"), lines.join("\n"), "utf8");
    console.log(lines.join("\n"));
    return;
  }
  const region = flood(grid, start);
  const area = areaM2(region);
  const border = touchesBorder(grid, region);
  const has15 = holds(grid, region, SEEDS.apt15) || holds(grid, region, SEEDS.label15);
  const has11 = holds(grid, region, SEEDS.apt11);
  const hasLabel = holds(grid, region, SEEDS.label14);
  const hasAreaText = holds(grid, region, SEEDS.area14);
  lines.push(`region ${area.toFixed(2)} m² (printed ${TARGET_M2})`);
  lines.push(`contains label 14: ${hasLabel}; contains 111.11 text: ${hasAreaText}`);
  lines.push(`contains apartment 15: ${has15}; contains apartment 11: ${has11}; touches sheet edge: ${border}`);
  const near = seal.openGaps
    .filter((g) => {
      const x = g.orientation === "v" ? g.centre : (g.from + g.to) / 2;
      const y = g.orientation === "h" ? g.centre : (g.from + g.to) / 2;
      return x > 54200 && x < 56600 && y > 30800 && y < 33600;
    })
    .sort((a, b) => b.to - b.from - (a.to - a.from));
  const seedOnSealed = locate(sealed, SEEDS.apt14.x, SEEDS.apt14.y);
  const seedId = seedOnSealed == null ? 0 : comp.id[seedOnSealed]!;
  const pieces = new Map<number, { n: number; sx: number; sy: number }>();
  for (let i = 0; i < comp.id.length; i++) {
    const id = comp.id[i]!;
    if (!id || comp.outside.has(id)) continue;
    const r = (i / sealed.cols) | 0;
    const c = i - r * sealed.cols;
    const row = pieces.get(id) ?? { n: 0, sx: 0, sy: 0 };
    row.n++;
    row.sx += sealed.ox + c * CELL;
    row.sy += sealed.oy + r * CELL;
    pieces.set(id, row);
  }
  const ranked = [...pieces.entries()]
    .map(([id, row]) => ({ id, m2: (row.n * CELL * CELL) / 1e4, x: row.sx / row.n, y: row.sy / row.n }))
    .filter((row) => row.m2 >= 2)
    .sort((a, b) => b.m2 - a.m2);
  lines.push("closed rooms, not the outside:");
  for (const row of ranked.slice(0, 16)) {
    lines.push(`  room ${row.id} ${row.m2.toFixed(1)} m² at x=${row.x.toFixed(0)} y=${row.y.toFixed(0)}`);
  }
  lines.push(`living-room component ${seedId}, counted as outside: ${comp.outside.has(seedId)}`);
  for (const bridge of optional) {
    const sides = bridgeSides(sealed, comp.id, bridge);
    if (!sides.includes(seedId)) continue;
    const other = sides.filter((id) => id !== seedId);
    lines.push(
      `  opening on that room: ${gapLine(bridge)}; other side ${other.join(",") || "none"}; other side is outside: ${other.some((id) => comp.outside.has(id))}`,
    );
  }
  const clean = !border && !has15 && !has11 && area >= 95 && area <= 140;
  if (!clean) {
    const exit = leakPath(grid, region, start);
    if (exit.length) {
      lines.push("Shortest path from the living room out to the sheet edge:");
      for (const p of exit) lines.push(`  x=${p.x.toFixed(0)} y=${p.y.toFixed(0)}`);
    }
    await dumpGrid(grid, region, path.join(OUT_DIR, "_apt14_seal.png"));
  }
  if (!clean) {
    lines.push("");
    lines.push("Apartment 14 did not close as one apartment. Remaining gaps:");
    if (border) {
      lines.push("The fill still reaches the edge of the floor sheet, so the outer wall is open.");
    }
    if (has15) {
      lines.push("The fill still reaches apartment 15. A hole between them was not a detected door or window, so it was left open and the two flats join through it.");
    }
    if (has11) {
      lines.push("The fill still reaches apartment 11. The same kind of hole joins the lower unit.");
    }
    if (!border && !has15 && !has11 && (area < 95 || area > 140)) {
      lines.push(`The closed region measures ${area.toFixed(2)} m², not the printed 111.11. Rooms are still missing or an extra space was taken in.`);
    }
    if (refused.length) {
      lines.push("Openings kept shut because one side is the outside or the neighbouring flat:");
      for (const g of refused) {
        const sides = bridgeSides(sealed, comp.id, g);
        const note = sides
          .map((id) => `${id}${comp.outside.has(id) ? " outside" : ""}`)
          .join(", ");
        lines.push(`  ${g.reason}: ${gapLine(g)}; sides ${note || "none"}`);
      }
    }
    lines.push("Gaps with no door, window line, or window block, still open:");
    for (const g of near.slice(0, 18)) lines.push(`  ${gapLine(g)}`);
    if (near.length === 0) lines.push("  none in the third-floor window");
    writeFileSync(path.join(OUT_DIR, "דירה-14-report.txt"), lines.join("\n"), "utf8");
    console.log(lines.join("\n"));
    return;
  }

  const dxf = path.join(OUT_DIR, "דירה-14.dxf");
  const png = path.join(OUT_DIR, "דירה-14-golden-hour.png");
  const keptEntities = await writeClippedDxf(region, grid, dxf);
  await render(grid, region, seal.walls, [...draft, ...kept], png);
  lines.push(`isolated DXF: ${dxf}`);
  lines.push(`entities kept: ${keptEntities}`);
  lines.push(`image: ${png}`);
  lines.push("The image is the measured shell. Openings stay openings. Light is a low warm sun, not midday. No furniture was added.");
  writeFileSync(path.join(OUT_DIR, "דירה-14-report.txt"), lines.join("\n"), "utf8");
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
