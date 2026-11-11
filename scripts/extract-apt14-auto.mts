/**
 * Finds apartment 14 from the DXF itself: the App_Nom diamond whose nearby
 * area text is 111.11. Seals every door and window except the entrance
 * opening beside that diamond, and floods the whole flat.
 */
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import sharp from "sharp";

import { sealDxfWallsForFlood } from "../lib/projects/dxf-seal-openings";
import { bodyRect, bridgesAcrossGaps, closeCorners, type WallBody } from "../lib/projects/floorplan-solid";
import type { VectorSegment } from "../lib/projects/floorplan-vector";

const DXF = path.join("C:\\Users\\User\\Desktop\\BSD-YBM-OS", "מערכת הדמיות", "ויינברג", "מכר סופי 29.10.26.dxf");
const OUT = path.join(path.dirname(DXF), "דירה-14-אוטומטית.png");
const UPM = 100;
const CELL = 3;

type Seg = VectorSegment;
type Mark = { x: number; y: number; name: string; text: string };
type Seal = WallBody & { kind: "door" | "end" | "glazing" | "patch" | "draft" };

async function* pairsOf(file: string) {
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

function cleanText(value: string) {
  return value.replace(/\\P/gi, " ").replace(/\\[A-Za-z][^;]*;/g, "").replace(/[{}]/g, "").trim();
}

const wallLayer = (layer: string) => /^(a-wl|a-wall|00-wl|a-el|a-bl|3)$/i.test(layer);
const glazeLayer = (layer: string) => /^(00-win|חלון|חלונות)$/i.test(layer) || /window|a-glaz/i.test(layer);
const markLayer = (layer: string) => glazeLayer(layer) || /^(00-dor|a-dr|door|doors|פתחים)$/i.test(layer);

function axis(x1: number, y1: number, x2: number, y2: number): Seg | null {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  if (dx < 15 && dy < 15) return null;
  if (dy <= 14 || dy < dx * 0.08) return { x1, y1: (y1 + y2) / 2, x2, y2: (y1 + y2) / 2, lineWidth: 1 };
  if (dx <= 14 || dx < dy * 0.08) return { x1: (x1 + x2) / 2, y1, x2: (x1 + x2) / 2, y2, lineWidth: 1 };
  return null;
}

async function readSheet(box: { x0: number; y0: number; x1: number; y1: number }) {
  const walls: Seg[] = [];
  const glazing: Seg[] = [];
  const marks: Array<{ x: number; y: number }> = [];
  const labels: Mark[] = [];
  const areas: Array<{ x: number; y: number; text: string }> = [];
  let section = "";
  let expect = false;
  let cur: { type: string; layer: string; name: string; text: string; xs: number[]; ys: number[] } | null = null;
  let insert: { name: string; x: number; y: number } | null = null;

  const inside = (x: number, y: number) => x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
  const take = (layer: string, xs: number[], ys: number[]) => {
    for (let i = 1; i < Math.min(xs.length, ys.length); i++) {
      const seg = axis(xs[i - 1]!, ys[i - 1]!, xs[i]!, ys[i]!);
      if (!seg) continue;
      const mx = (seg.x1 + seg.x2) / 2;
      const my = (seg.y1 + seg.y2) / 2;
      if (!inside(mx, my) && !inside(seg.x1, seg.y1) && !inside(seg.x2, seg.y2)) continue;
      if (wallLayer(layer)) walls.push(seg);
      else if (glazeLayer(layer)) glazing.push(seg);
    }
  };

  for await (const { code, value } of pairsOf(DXF)) {
    if (code === "0" && value === "SECTION") {
      expect = true;
      continue;
    }
    if (expect && code === "2") {
      section = value;
      expect = false;
      continue;
    }
    if (code === "0" && value === "ENDSEC") {
      cur = null;
      section = "";
      continue;
    }
    if (section !== "ENTITIES") continue;
    if (code === "0") {
      if (cur) {
        if (cur.type === "LINE" || cur.type === "LWPOLYLINE") take(cur.layer, cur.xs, cur.ys);
        if ((cur.type === "INSERT" || cur.type === "ARC" || cur.type === "CIRCLE") && markLayer(cur.layer) && cur.xs[0] != null && cur.ys[0] != null && inside(cur.xs[0], cur.ys[0])) {
          marks.push({ x: cur.xs[0], y: cur.ys[0] });
        }
        if (cur.type === "INSERT") insert = { name: cur.name, x: cur.xs[0] ?? 0, y: cur.ys[0] ?? 0 };
        if (cur.type === "ATTRIB" && insert && /app_nom/i.test(insert.name)) {
          const text = cleanText(cur.text);
          if (text) labels.push({ x: insert.x, y: insert.y, name: insert.name, text });
        }
        if (cur.type === "SEQEND") insert = null;
        if ((cur.type === "TEXT" || cur.type === "MTEXT") && cur.xs[0] != null && cur.ys[0] != null) {
          const text = cleanText(cur.text);
          if (/111[,.]11/.test(text)) areas.push({ x: cur.xs[0], y: cur.ys[0], text });
        }
      }
      cur = { type: value, layer: "0", name: "", text: "", xs: [], ys: [] };
      continue;
    }
    if (!cur) continue;
    if (code === "8") cur.layer = value;
    else if (code === "2" && !cur.name) cur.name = value;
    else if (code === "1") cur.text = value;
    else if (code === "10" || code === "11") cur.xs.push(Number(value));
    else if (code === "20" || code === "21") cur.ys.push(Number(value));
  }
  return { walls, glazing, marks, labels, areas };
}

function inGap(gap: WallBody, x: number, y: number, reach: number) {
  return gap.orientation === "h"
    ? x >= gap.from - reach && x <= gap.to + reach && Math.abs(y - gap.centre) <= gap.thickness / 2 + reach
    : y >= gap.from - reach && y <= gap.to + reach && Math.abs(x - gap.centre) <= gap.thickness / 2 + reach;
}

function gapsNearMarker(bodies: WallBody[], marker: { x: number; y: number }): Seal[] {
  const out: Seal[] = [];
  for (const orientation of ["h", "v"] as const) {
    const ends: Array<{ at: number; centre: number; thickness: number }> = [];
    for (const body of bodies) {
      if (body.orientation !== orientation) continue;
      for (const at of [body.from, body.to]) {
        const x = orientation === "h" ? at : body.centre;
        const y = orientation === "h" ? body.centre : at;
        if (Math.hypot(x - marker.x, y - marker.y) < 400) ends.push({ at, centre: body.centre, thickness: body.thickness });
      }
    }
    for (let i = 0; i < ends.length; i++) {
      for (let j = i + 1; j < ends.length; j++) {
        const a = ends[i]!;
        const b = ends[j]!;
        const across = Math.abs(a.centre - b.centre);
        const span = Math.abs(a.at - b.at);
        if (across > 50 || span < 60 || span > 230) continue;
        const gap: Seal = {
          orientation,
          centre: (a.centre + b.centre) / 2,
          thickness: Math.max(a.thickness, b.thickness, 16),
          from: Math.min(a.at, b.at),
          to: Math.max(a.at, b.at),
          kind: "end",
        };
        if (distToBody(gap, marker.x, marker.y) > 280) continue;
        out.push(gap);
      }
    }
  }
  return out;
}

function splitsNeighbours(gap: Seal, marker: { x: number; y: number }, other: { x: number; y: number } | null) {
  if (!other) return false;
  if (Math.abs(marker.x - other.x) > Math.abs(marker.y - other.y)) {
    const mid = (marker.x + other.x) / 2;
    return gap.orientation === "h" && gap.from < mid - 5 && gap.to > mid + 5;
  }
  const mid = (marker.y + other.y) / 2;
  return gap.orientation === "v" && gap.from < mid - 5 && gap.to > mid + 5;
}

type Grid = { cols: number; rows: number; ox: number; oy: number; wall: Uint8Array };

function paint(grid: Grid, x: number, y: number, w: number, h: number) {
  const c0 = Math.max(0, Math.floor((x - grid.ox) / CELL));
  const r0 = Math.max(0, Math.floor((y - grid.oy) / CELL));
  const c1 = Math.min(grid.cols, Math.ceil((x + w - grid.ox) / CELL));
  const r1 = Math.min(grid.rows, Math.ceil((y + h - grid.oy) / CELL));
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) grid.wall[r * grid.cols + c] = 1;
}

function paintBody(grid: Grid, body: WallBody) {
  const rect = bodyRect(body);
  paint(grid, rect.x, rect.y, Math.max(rect.w, CELL), Math.max(rect.h, CELL));
}

function makeGrid(origin: { ox: number; oy: number; cols: number; rows: number }, bodies: WallBody[], glazing: Seg[]): Grid {
  const grid: Grid = { ...origin, wall: new Uint8Array(origin.cols * origin.rows) };
  for (const body of bodies) paintBody(grid, body);
  for (const seg of glazing) {
    const x = Math.min(seg.x1, seg.x2);
    const y = Math.min(seg.y1, seg.y2);
    paint(grid, x, y, Math.max(Math.abs(seg.x2 - seg.x1), 8), Math.max(Math.abs(seg.y2 - seg.y1), 8));
  }
  const { cols, rows } = grid;
  for (let c = 0; c < cols; c++) {
    grid.wall[c] = 1;
    grid.wall[(rows - 1) * cols + c] = 1;
  }
  for (let r = 0; r < rows; r++) {
    grid.wall[r * cols] = 1;
    grid.wall[r * cols + cols - 1] = 1;
  }
  return grid;
}

function locate(grid: Grid, x: number, y: number): number | null {
  const c = Math.round((x - grid.ox) / CELL);
  const r = Math.round((y - grid.oy) / CELL);
  const rad = Math.ceil(150 / CELL);
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

function flood(grid: Grid, start: number) {
  const seen = new Uint8Array(grid.wall.length);
  if (grid.wall[start]) return seen;
  const q = [start];
  seen[start] = 1;
  let qi = 0;
  const { cols } = grid;
  while (qi < q.length) {
    const i = q[qi++]!;
    const r = (i / cols) | 0;
    const c = i - r * cols;
    const step = (j: number) => {
      if (!seen[j] && !grid.wall[j]) {
        seen[j] = 1;
        q.push(j);
      }
    };
    if (c > 0) step(i - 1);
    if (c + 1 < cols) step(i + 1);
    if (r > 0) step(i - cols);
    if (r + 1 < grid.rows) step(i + cols);
  }
  return seen;
}

function labelSpaces(grid: Grid) {
  const id = new Int32Array(grid.wall.length);
  const outside = new Set<number>();
  let next = 1;
  const { cols, rows } = grid;
  for (let s = 0; s < grid.wall.length; s++) {
    if (grid.wall[s] || id[s]) continue;
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
        if (!id[j] && !grid.wall[j]) {
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
  return { id, outside };
}

function sidesOf(grid: Grid, ids: Int32Array, body: WallBody): number[] {
  const mid = (body.from + body.to) / 2;
  const found = new Set<number>();
  for (const dist of [28, 55, 90, 140]) {
    const pts = body.orientation === "h" ? [{ x: mid, y: body.centre - dist }, { x: mid, y: body.centre + dist }] : [{ x: body.centre - dist, y: mid }, { x: body.centre + dist, y: mid }];
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

function distToBody(body: WallBody, x: number, y: number) {
  if (body.orientation === "h") {
    const px = Math.min(Math.max(x, body.from), body.to);
    return Math.hypot(px - x, body.centre - y);
  }
  const py = Math.min(Math.max(y, body.from), body.to);
  return Math.hypot(body.centre - x, py - y);
}

function holds(grid: Grid, region: Uint8Array, x: number, y: number) {
  const i = locate(grid, x, y);
  return i != null && region[i] === 1;
}

function areaM2(region: Uint8Array) {
  let n = 0;
  for (let i = 0; i < region.length; i++) if (region[i]) n++;
  return (n * CELL * CELL) / 1e4;
}

function nearestCorners(bodies: WallBody[], reach: number, doors: Seal[]): Seal[] {
  const ends = bodies.flatMap((body) =>
    [body.from, body.to].map((at) =>
      body.orientation === "h"
        ? { x: at, y: body.centre, orientation: "h" as const }
        : { x: body.centre, y: at, orientation: "v" as const },
    ),
  );
  const best = ends.map(() => ({ j: -1, d: reach }));
  for (let i = 0; i < ends.length; i++) {
    for (let j = 0; j < ends.length; j++) {
      if (i === j || ends[i]!.orientation === ends[j]!.orientation) continue;
      const d = Math.hypot(ends[i]!.x - ends[j]!.x, ends[i]!.y - ends[j]!.y);
      if (d < best[i]!.d) best[i] = { j, d };
    }
  }
  const used = new Set<string>();
  const out: Seal[] = [];
  for (let i = 0; i < ends.length; i++) {
    const j = best[i]!.j;
    if (j < 0 || best[j]!.j !== i) continue;
    const key = i < j ? `${i}:${j}` : `${j}:${i}`;
    if (used.has(key)) continue;
    used.add(key);
    const a = ends[i]!;
    const b = ends[j]!;
    const gap: Seal = {
      orientation: Math.abs(a.x - b.x) >= Math.abs(a.y - b.y) ? "h" : "v",
      centre: Math.abs(a.x - b.x) >= Math.abs(a.y - b.y) ? (a.y + b.y) / 2 : (a.x + b.x) / 2,
      thickness: Math.max(Math.abs(a.x - b.x) >= Math.abs(a.y - b.y) ? Math.abs(a.y - b.y) : Math.abs(a.x - b.x), 14),
      from: Math.abs(a.x - b.x) >= Math.abs(a.y - b.y) ? Math.min(a.x, b.x) : Math.min(a.y, b.y),
      to: Math.abs(a.x - b.x) >= Math.abs(a.y - b.y) ? Math.max(a.x, b.x) : Math.max(a.y, b.y),
      kind: "patch",
    };
    if (doors.some((door) => door.orientation === gap.orientation && Math.abs(door.centre - gap.centre) < 40 && Math.min(door.to, gap.to) - Math.max(door.from, gap.from) > (door.to - door.from) * 0.4)) continue;
    out.push(gap);
  }
  return out;
}

function partyCaps(bodies: WallBody[], marker: { x: number; y: number }, other: Mark | null): Seal[] {
  if (!other) return [];
  const sideBySide = Math.abs(marker.y - other.y) < Math.abs(marker.x - other.x);
  const mid = sideBySide ? (marker.x + other.x) / 2 : (marker.y + other.y) / 2;
  const orientation = sideBySide ? "v" : "h";
  const wall = bodies
    .filter((body) => body.orientation === orientation && Math.abs(body.centre - mid) < 90 && body.to - body.from > 150)
    .sort((a, b) => b.to - b.from - (a.to - a.from))[0];
  if (!wall) return [];
  const out: Seal[] = [];
  for (const end of [wall.from, wall.to]) {
    let best = 220;
    let at = 0;
    for (const otherWall of bodies) {
      if (otherWall.orientation === orientation) continue;
      if (otherWall.from - 40 > wall.centre || otherWall.to + 40 < wall.centre) continue;
      const gap = Math.abs(otherWall.centre - end);
      if (gap > 15 && gap < best) {
        best = gap;
        at = otherWall.centre;
      }
    }
    if (best >= 220) continue;
    out.push({
      orientation,
      centre: wall.centre,
      thickness: Math.max(wall.thickness, 16),
      from: Math.min(end, at),
      to: Math.max(end, at),
      kind: "patch",
    });
  }
  return out;
}

function crossesParty(body: WallBody, a: Mark, b: Mark) {
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  if (Math.abs(a.y - b.y) < Math.abs(a.x - b.x)) {
    return body.orientation === "h" && body.from < midX && body.to > midX && Math.abs(body.centre - midY) < 1800;
  }
  return body.orientation === "v" && body.from < midY && body.to > midY && Math.abs(body.centre - midX) < 1800;
}

const FURNITURE_BLOCKS = new Set(["00-kiyor 60", "00-kiyor 7", "00-sherotim", "00-mekarer", "00-m. kvisa", "00-gaz", "*U2365", "*U2563", "d8", "d13", "MIF_2"]);

type FurnInsert = { name: string; x: number; y: number; sx: number; sy: number; rot: number };
type FurnSeg = { x1: number; y1: number; x2: number; y2: number };

async function readFurniture(): Promise<FurnSeg[]> {
  const blocks = new Map<string, { baseX: number; baseY: number; segs: FurnSeg[] }>();
  const inserts: FurnInsert[] = [];
  let section = "";
  let expect = false;
  let blockName = "";
  let sawBase = false;
  let cur: { type: string; xs: number[]; ys: number[]; r: number; a0: number; a1: number } | null = null;
  const flush = () => {
    if (!cur) return;
    const block = blocks.get(blockName);
    if (!block) return;
    const push = (x1: number, y1: number, x2: number, y2: number) => {
      if (![x1, y1, x2, y2].every(Number.isFinite)) return;
      block.segs.push({ x1, y1, x2, y2 });
    };
    if (cur.type === "LINE" && cur.xs.length >= 2 && cur.ys.length >= 2) push(cur.xs[0]!, cur.ys[0]!, cur.xs[1]!, cur.ys[1]!);
    if ((cur.type === "LWPOLYLINE" || cur.type === "POLYLINE") && cur.xs.length >= 2) {
      for (let i = 1; i < Math.min(cur.xs.length, cur.ys.length); i++) push(cur.xs[i - 1]!, cur.ys[i - 1]!, cur.xs[i]!, cur.ys[i]!);
    }
    if (cur.type === "CIRCLE" && cur.xs[0] != null && cur.ys[0] != null && cur.r > 0) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const b = ((i + 1) / 16) * Math.PI * 2;
        push(cur.xs[0] + Math.cos(a) * cur.r, cur.ys[0] + Math.sin(a) * cur.r, cur.xs[0] + Math.cos(b) * cur.r, cur.ys[0] + Math.sin(b) * cur.r);
      }
    }
    if (cur.type === "ARC" && cur.xs[0] != null && cur.ys[0] != null && cur.r > 0) {
      let a0 = (cur.a0 * Math.PI) / 180;
      let a1 = (cur.a1 * Math.PI) / 180;
      if (a1 <= a0) a1 += Math.PI * 2;
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        const a = a0 + ((a1 - a0) * i) / steps;
        const b = a0 + ((a1 - a0) * (i + 1)) / steps;
        push(cur.xs[0] + Math.cos(a) * cur.r, cur.ys[0] + Math.sin(a) * cur.r, cur.xs[0] + Math.cos(b) * cur.r, cur.ys[0] + Math.sin(b) * cur.r);
      }
    }
    cur = null;
  };
  for await (const { code, value } of pairsOf(DXF)) {
    if (code === "0" && value === "SECTION") {
      expect = true;
      continue;
    }
    if (expect && code === "2") {
      section = value;
      expect = false;
      continue;
    }
    if (code === "0" && value === "ENDSEC") {
      flush();
      cur = null;
      section = "";
      continue;
    }
    if (section === "BLOCKS") {
      if (code === "0" && value === "BLOCK") {
        flush();
        blockName = "";
        sawBase = false;
        continue;
      }
      if (code === "2" && !blockName) {
        blockName = value;
        if (FURNITURE_BLOCKS.has(blockName) && !blocks.has(blockName)) blocks.set(blockName, { baseX: 0, baseY: 0, segs: [] });
        continue;
      }
      if (!FURNITURE_BLOCKS.has(blockName)) continue;
      const block = blocks.get(blockName)!;
      if (!sawBase && code === "10") {
        block.baseX = Number(value);
        continue;
      }
      if (!sawBase && code === "20") {
        block.baseY = Number(value);
        sawBase = true;
        continue;
      }
      if (code === "0") {
        if (value === "VERTEX" && cur?.type === "POLYLINE") continue;
        flush();
        cur = { type: value, xs: [], ys: [], r: 0, a0: 0, a1: 0 };
        continue;
      }
      if (!cur) continue;
      if (code === "10") cur.xs.push(Number(value));
      else if (code === "20") cur.ys.push(Number(value));
      else if (code === "11") cur.xs.push(Number(value));
      else if (code === "21") cur.ys.push(Number(value));
      else if (code === "40") cur.r = Number(value);
      else if (code === "50") cur.a0 = Number(value);
      else if (code === "51") cur.a1 = Number(value);
      continue;
    }
    if (section !== "ENTITIES") continue;
    if (code === "0") {
      if (cur && cur.type === "INSERT" && FURNITURE_BLOCKS.has((cur as { name?: string }).name ?? "")) {
        const ins = cur as { type: string; name?: string; xs: number[]; ys: number[]; r: number; a0: number; a1: number; sx?: number; sy?: number };
        if (ins.xs[0] != null && ins.ys[0] != null) {
          inserts.push({ name: ins.name ?? "", x: ins.xs[0], y: ins.ys[0], sx: ins.sx || 1, sy: ins.sy || ins.sx || 1, rot: ins.a0 || 0 });
        }
      }
      const next = { type: value, name: "", xs: [] as number[], ys: [] as number[], r: 0, a0: 0, a1: 0, sx: 1, sy: 1 };
      cur = next;
      continue;
    }
    if (!cur || cur.type !== "INSERT") continue;
    const ins = cur as { type: string; name?: string; xs: number[]; ys: number[]; r: number; a0: number; a1: number; sx?: number; sy?: number };
    if (code === "2" && !ins.name) ins.name = value;
    else if (code === "10") ins.xs.push(Number(value));
    else if (code === "20") ins.ys.push(Number(value));
    else if (code === "41") ins.sx = Number(value);
    else if (code === "42") ins.sy = Number(value);
    else if (code === "50") ins.a0 = Number(value);
  }
  const world: FurnSeg[] = [];
  for (const ins of inserts) {
    const block = blocks.get(ins.name);
    if (!block) continue;
    const ang = (ins.rot * Math.PI) / 180;
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const map = (x: number, y: number) => {
      const lx = (x - block.baseX) * ins.sx;
      const ly = (y - block.baseY) * ins.sy;
      return [ins.x + lx * cos - ly * sin, ins.y + lx * sin + ly * cos] as const;
    };
    for (const seg of block.segs) {
      const [x1, y1] = map(seg.x1, seg.y1);
      const [x2, y2] = map(seg.x2, seg.y2);
      world.push({ x1, y1, x2, y2 });
    }
  }
  console.log("furniture inserts", inserts.length, "segments", world.length);
  return world;
}

async function main() {
  console.log("labels");
  const survey = await readSheet({ x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 });
  const fours = survey.labels.filter((label) => label.text === "14");
  const chosen = fours
    .map((label) => {
      let best = 1e12;
      for (const area of survey.areas) best = Math.min(best, Math.hypot(area.x - label.x, area.y - label.y));
      return { label, best };
    })
    .sort((a, b) => a.best - b.best)[0];
  if (!chosen || chosen.best > 800) {
    console.log(JSON.stringify({ found: false, labels: fours.length, areas: survey.areas.length }));
    return;
  }
  const here = chosen.label;
  const near = (text: string) =>
    survey.labels
      .filter((label) => label.text === text && Math.hypot(label.x - here.x, label.y - here.y) < 2500)
      .sort((a, b) => Math.hypot(a.x - here.x, a.y - here.y) - Math.hypot(b.x - here.x, b.y - here.y))[0] ?? null;
  const other15 = near("15");
  const other11 = near("11");
  const box = { x0: here.x - 1800, y0: here.y - 2200, x1: here.x + 1600, y1: here.y + 1600 };
  console.log("geometry", here, "15", other15, "11", other11);
  const sheet = await readSheet(box);
  const seal = sealDxfWallsForFlood(sheet.walls, sheet.glazing, sheet.marks, UPM);
  const glazePts = sheet.glazing.map((seg) => ({ x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 }));
  const glazed = bridgesAcrossGaps(seal.walls, (gap) => {
    const span = gap.to - gap.from;
    return span > UPM * 0.2 && span <= UPM * 4.8 && glazePts.some((p) => inGap({ ...gap, source: undefined }, p.x, p.y, UPM * 0.45));
  }).map((gap) => ({ ...gap, kind: "glazing" as const }));
  const doors: Seal[] = seal.bridges.map((gap) => ({ ...gap, kind: gap.reason === "draft" ? "draft" : "door" }));
  const nearGaps = gapsNearMarker(seal.walls, here);
  const entranceGap =
    nearGaps
      .filter((gap) => !splitsNeighbours(gap, here, other15) && !splitsNeighbours(gap, here, other11))
      .sort((a, b) => distToBody(a, here.x, here.y) - distToBody(b, here.x, here.y))[0] ?? null;
  const party = partyCaps(seal.walls, here, other15);
  const corners = nearestCorners(seal.walls, 210, doors);
  const seals: Seal[] = [...doors, ...glazed, ...party, ...nearGaps, ...corners];

  let minX = box.x0;
  let minY = box.y0;
  let maxX = box.x1;
  let maxY = box.y1;
  for (const seg of sheet.walls) {
    minX = Math.min(minX, seg.x1, seg.x2);
    maxX = Math.max(maxX, seg.x1, seg.x2);
    minY = Math.min(minY, seg.y1, seg.y2);
    maxY = Math.max(maxY, seg.y1, seg.y2);
  }
  const pad = 80;
  const origin = {
    ox: minX - pad,
    oy: minY - pad,
    cols: Math.ceil((maxX - minX + pad * 2) / CELL) + 2,
    rows: Math.ceil((maxY - minY + pad * 2) / CELL) + 2,
  };
  const tightened = closeCorners(seal.walls, 55);
  const closed = makeGrid(origin, [...tightened, ...seals], sheet.glazing);
  for (const seg of sheet.walls) {
    const x = Math.min(seg.x1, seg.x2) - 8;
    const y = Math.min(seg.y1, seg.y2) - 8;
    paint(closed, x, y, Math.max(Math.abs(seg.x2 - seg.x1), 16), Math.max(Math.abs(seg.y2 - seg.y1), 16));
  }
  if (other15) {
    const x = (here.x + other15.x) / 2;
    paint(closed, x - 18, box.y0, 36, box.y1 - box.y0);
    for (const wall of seal.walls) {
      if (wall.orientation !== "h") continue;
      for (const end of [wall.from, wall.to]) {
        if (Math.abs(end - x) > 220) continue;
        paint(closed, Math.min(end, x), wall.centre - 16, Math.abs(end - x), 32);
      }
    }
  }
  {
    const src = closed.wall;
    const out = new Uint8Array(src);
    const { cols, rows } = closed;
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        const i = r * cols + c;
        if (src[i - 1] || src[i + 1] || src[i - cols] || src[i + cols]) out[i] = 1;
      }
    }
    closed.wall = out;
  }
  const spaces = labelSpaces(closed);
  {
    const living = locate(closed, here.x - 350, here.y + 480);
    const id = living == null ? 0 : spaces.id[living] ?? 0;
    console.log("living-side outside", spaces.outside.has(id));
    for (const seg of sheet.walls) {
      const x0 = Math.min(seg.x1, seg.x2);
      const x1 = Math.max(seg.x1, seg.x2);
      const y0 = Math.min(seg.y1, seg.y2);
      const y1 = Math.max(seg.y1, seg.y2);
      if (x1 < 54680 || x0 > 54980 || y1 < 33340 || y0 > 33720) continue;
      console.log(`  seg ${Math.round(x0)}..${Math.round(x1)} , ${Math.round(y0)}..${Math.round(y1)}`);
    }
    if (living != null && spaces.outside.has(id)) {
      const { cols, rows } = closed;
      const prev = new Int32Array(closed.wall.length);
      prev.fill(-1);
      const q = [living];
      prev[living] = living;
      let exit = -1;
      for (let qi = 0; qi < q.length && exit < 0; qi++) {
        const i = q[qi]!;
        const r = (i / cols) | 0;
        const c = i - r * cols;
        if (c <= 2 || r <= 2 || c >= cols - 3 || r >= rows - 3) {
          exit = i;
          break;
        }
        for (const j of [i - 1, i + 1, i - cols, i + cols]) {
          if (j < 0 || j >= prev.length || prev[j] !== -1 || closed.wall[j]) continue;
          prev[j] = i;
          q.push(j);
        }
      }
      const path: string[] = [];
      for (let i = exit, n = 0; i >= 0 && i !== living && n < 8; n++) {
        const r = (i / cols) | 0;
        const c = i - r * cols;
        path.push(`${Math.round(closed.ox + c * CELL)},${Math.round(closed.oy + r * CELL)}`);
        i = prev[i]!;
        for (let s = 0; s < 40 && i !== living && i >= 0; s++) i = prev[i]!;
      }
      console.log("leak", path.join(" | "));
    }
  }
  const locals = survey.labels.filter((label) => /^\d+$/.test(label.text) && Math.hypot(label.x - here.x, label.y - here.y) < 3000);
  const nearestMarker = (x: number, y: number) => {
    let best = locals[0]!;
    let dist = Infinity;
    for (const label of locals) {
      const d = (label.x - x) ** 2 + (label.y - y) ** 2;
      if (d < dist) {
        dist = d;
        best = label;
      }
    }
    return best;
  };
  const owned = new Set<number>();
  const otherRooms = new Set<number>();
  const stats = new Map<number, { n: number; sx: number; sy: number }>();
  for (let i = 0; i < spaces.id.length; i++) {
    const id = spaces.id[i]!;
    if (!id || spaces.outside.has(id)) continue;
    const row = stats.get(id) ?? { n: 0, sx: 0, sy: 0 };
    const r = (i / closed.cols) | 0;
    const c = i - r * closed.cols;
    row.n++;
    row.sx += closed.ox + c * CELL;
    row.sy += closed.oy + r * CELL;
    stats.set(id, row);
  }
  for (const [id, row] of stats) {
    const marker = nearestMarker(row.sx / row.n, row.sy / row.n);
    const m2 = (row.n * CELL * CELL) / 1e4;
    if (m2 > 2) console.log(`room ${m2.toFixed(1)} at ${Math.round(row.sx / row.n)},${Math.round(row.sy / row.n)} -> ${marker.text}`);
    if (marker.text === "14" && Math.hypot(marker.x - here.x, marker.y - here.y) < 50) owned.add(id);
    else otherRooms.add(id);
  }
  const seed = new Uint8Array(closed.wall.length);
  for (let i = 0; i < seed.length; i++) if (owned.has(spaces.id[i]!)) seed[i] = 1;
  const rad = Math.round(140 / CELL);
  const dilate = (src: Uint8Array) => {
    const tmp = new Uint8Array(src.length);
    const out = new Uint8Array(src.length);
    const { cols, rows } = closed;
    for (let r = 0; r < rows; r++) {
      const base = r * cols;
      let n = 0;
      for (let k = 0; k <= rad && k < cols; k++) if (src[base + k]) n++;
      for (let c = 0; c < cols; c++) {
        if (n) tmp[base + c] = 1;
        const add = c + rad + 1;
        const rem = c - rad;
        if (add < cols && src[base + add]) n++;
        if (rem >= 0 && src[base + rem]) n--;
      }
    }
    for (let c = 0; c < cols; c++) {
      let n = 0;
      for (let k = 0; k <= rad && k < rows; k++) if (tmp[k * cols + c]) n++;
      for (let r = 0; r < rows; r++) {
        if (n) out[r * cols + c] = 1;
        const add = r + rad + 1;
        const rem = r - rad;
        if (add < rows && tmp[add * cols + c]) n++;
        if (rem >= 0 && tmp[rem * cols + c]) n--;
      }
    }
    return out;
  };
  const grown = dilate(seed);
  const closedMask = new Uint8Array(grown.length);
  const empty = new Uint8Array(grown.length);
  for (let i = 0; i < grown.length; i++) if (!grown[i]) empty[i] = 1;
  const eroded = dilate(empty);
  const partyX = other15 ? (here.x + other15.x) / 2 : null;
  for (let i = 0; i < closedMask.length; i++) {
    if (eroded[i] || closed.wall[i] || otherRooms.has(spaces.id[i]!)) continue;
    if (partyX != null) {
      const c = i % closed.cols;
      const x = closed.ox + c * CELL;
      if (here.x < partyX ? x > partyX : x < partyX) continue;
    }
    closedMask[i] = 1;
  }
  const entrance =
    doors
      .filter((gap) => gap.kind === "door")
      .sort((a, b) => distToBody(a, here.x, here.y) - distToBody(b, here.x, here.y))[0] ?? null;
  const region = seed;
  const open = closed;
  const area = areaM2(region);
  const border = false;
  const start = owned.size ? 1 : null;

  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let r = 0; r < open.rows; r++) {
    for (let c = 0; c < open.cols; c++) {
      if (!region[r * open.cols + c]) continue;
      const x = open.ox + c * CELL;
      const y = open.oy + r * CELL;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  const margin = 70;
  x0 -= margin;
  y0 -= margin;
  x1 += margin;
  y1 += margin;
  const scale = 2;
  const width = Math.max(1, Math.ceil((x1 - x0) / CELL));
  const height = Math.max(1, Math.ceil((y1 - y0) / CELL));
  const img = Buffer.alloc(width * height * 3);
  const set = (x: number, y: number, rgb: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const o = (y * width + x) * 3;
    img[o] = rgb[0];
    img[o + 1] = rgb[1];
    img[o + 2] = rgb[2];
  };
  const pix = (wx: number, wy: number) => [Math.floor((wx - x0) / CELL), Math.floor((y1 - wy) / CELL)] as const;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) set(x, y, [244, 239, 230]);
  for (let r = 0; r < open.rows; r++) {
    for (let c = 0; c < open.cols; c++) {
      if (!region[r * open.cols + c]) continue;
      const [px, py] = pix(open.ox + c * CELL, open.oy + r * CELL);
      const sun = 0.72 + 0.28 * (px / width);
      set(px, py, [Math.round(214 * sun), Math.round(156 * sun), Math.round(78 * sun)]);
    }
  }
  const draw = (body: WallBody, rgb: [number, number, number]) => {
    const rect = bodyRect(body);
    const c0 = Math.floor((rect.x - x0) / CELL);
    const c1 = Math.ceil((rect.x + rect.w - x0) / CELL);
    const r0 = Math.floor((y1 - (rect.y + rect.h)) / CELL);
    const r1 = Math.ceil((y1 - rect.y) / CELL);
    for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) set(x, y, rgb);
  };
  for (const body of seal.walls) draw(body, [48, 36, 28]);
  for (const gap of seals) {
    if (gap === entrance) continue;
    draw(gap, gap.kind === "glazing" ? [70, 96, 108] : [48, 36, 28]);
  }
  if (entrance) draw(entrance, [255, 248, 236]);
  const [dx, dy] = pix(here.x, here.y);
  for (let i = -8; i <= 8; i++) {
    set(dx + i, dy + i, [150, 28, 24]);
    set(dx + i, dy - i, [150, 28, 24]);
  }
  await sharp(img, { raw: { width, height, channels: 3 } }).resize(width * scale, height * scale, { kernel: "nearest" }).png().toFile(OUT);

  const numbers = [...new Set(survey.labels.map((label) => label.text))].filter((text) => /^\d+$/.test(text)).sort((a, b) => Number(a) - Number(b));
  const report = {
    found: true,
    apartmentNumbers: numbers,
    marker: { x: here.x, y: here.y, text: here.text },
    areaTextM: Number((chosen.best / UPM).toFixed(2)),
    entrance: entrance
      ? {
          orientation: entrance.orientation,
          at: Number(entrance.centre.toFixed(1)),
          from: Number(entrance.from.toFixed(1)),
          to: Number(entrance.to.toFixed(1)),
          metres: Number(((entrance.to - entrance.from) / UPM).toFixed(2)),
          distanceM: Number((distToBody(entrance, here.x, here.y) / UPM).toFixed(2)),
        }
      : null,
    sealedM2: Number(area.toFixed(2)),
    printedM2: 111.11,
    containsMarker: holds(open, region, here.x, here.y),
    contains15: other15 ? holds(open, region, other15.x, other15.y) : false,
    contains11: other11 ? holds(open, region, other11.x, other11.y) : false,
    touchesSheetEdge: border,
    rooms: owned.size,
    seals: seals.length,
    image: OUT,
  };
  writeFileSync(OUT.replace(/\.png$/, ".json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
