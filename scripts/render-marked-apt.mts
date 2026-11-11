/**
 * Renders only the apartment inside the user's red outline.
 * The outline is a hard wall. Door and window gaps inside it are sealed.
 */
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import sharp from "sharp";

import { sealDxfWallsForFlood } from "../lib/projects/dxf-seal-openings";
import { bodyRect } from "../lib/projects/floorplan-solid";
import type { VectorSegment } from "../lib/projects/floorplan-vector";

const MARK = "C:/Users/User/.cursor/projects/c-Users-User-Desktop-BSD-YBM-OS/assets/_apt14_map-425bc4cc-c9ca-4da4-81e3-063db89c93a1.png";
const DXF = path.join("C:\\Users\\User\\Desktop\\BSD-YBM-OS", "מערכת הדמיות", "ויינברג", "מכר סופי 29.10.26.dxf");
const OUT = path.join("C:\\Users\\User\\Desktop\\BSD-YBM-OS", "מערכת הדמיות", "ויינברג", "דירה-14-מבודדת.png");
const WIN = [53800, 57200, 30000, 34000];
const SW = 1400;
const SH = 1200;
const UPM = 100;

const wallLayer = (layer: string) => /^(a-wl|a-wall|00-wl|a-el)$/i.test(layer);
const glazeLayer = (layer: string) => /^(00-win|חלון|חלונות)$/i.test(layer) || /window|a-glaz/i.test(layer);
const markLayer = (layer: string) => glazeLayer(layer) || /^(00-dor|a-dr|door|doors|פתחים)$/i.test(layer);

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

function axis(x1: number, y1: number, x2: number, y2: number): VectorSegment | null {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  if (dx < 15 && dy < 15) return null;
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

async function main() {
  const { data, info } = await sharp(MARK).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const red = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (r > 200 && g < 60 && b < 60) red[p] = 1;
  }
  const outside = new Uint8Array(W * H);
  const q: number[] = [];
  for (let x = 0; x < W; x++) {
    q.push(x, (H - 1) * W + x);
  }
  for (let y = 0; y < H; y++) q.push(y * W, y * W + W - 1);
  for (const s of q) outside[s] = 1;
  let qi = 0;
  while (qi < q.length) {
    const i = q[qi++]!;
    if (red[i]) continue;
    const x = i % W;
    const y = (i / W) | 0;
    const step = (j: number) => {
      if (!outside[j] && !red[j]) {
        outside[j] = 1;
        q.push(j);
      }
    };
    if (x > 0) step(i - 1);
    if (x + 1 < W) step(i + 1);
    if (y > 0) step(i - W);
    if (y + 1 < H) step(i + W);
  }
  const inside = (px: number, py: number) => {
    const x = Math.round(px);
    const y = Math.round(py);
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    return outside[y * W + x] === 0;
  };
  const toPx = (x: number, y: number) => {
    const sx = ((x - WIN[0]) / (WIN[1] - WIN[0])) * (SW - 20) + 10;
    const sy = ((WIN[3] - y) / (WIN[3] - WIN[2])) * (SH - 20) + 10;
    return [sx * (W / SW), sy * (H / SH)] as const;
  };
  const toWorld = (px: number, py: number) => {
    const sx = px * (SW / W);
    const sy = py * (SH / H);
    const x = WIN[0] + ((sx - 10) / (SW - 20)) * (WIN[1] - WIN[0]);
    const y = WIN[3] - ((sy - 10) / (SH - 20)) * (WIN[3] - WIN[2]);
    return [x, y] as const;
  };
  const inApt = (x: number, y: number) => {
    const [px, py] = toPx(x, y);
    return inside(px, py);
  };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (outside[y * W + x]) continue;
      const [wx, wy] = toWorld(x, y);
      minX = Math.min(minX, wx);
      maxX = Math.max(maxX, wx);
      minY = Math.min(minY, wy);
      maxY = Math.max(maxY, wy);
    }
  }
  const pad = 40;
  const box = { x0: minX - pad, y0: minY - pad, x1: maxX + pad, y1: maxY + pad };

  const walls: VectorSegment[] = [];
  const glazing: VectorSegment[] = [];
  const marks: Array<{ x: number; y: number }> = [];
  let section = "";
  let expectName = false;
  let cur: { type: string; layer: string; xs: number[]; ys: number[] } | null = null;
  const take = (layer: string, xs: number[], ys: number[]) => {
    const n = Math.min(xs.length, ys.length);
    for (let i = 1; i < n; i++) {
      const seg = axis(xs[i - 1]!, ys[i - 1]!, xs[i]!, ys[i]!);
      if (!seg) continue;
      const mx = (seg.x1 + seg.x2) / 2;
      const my = (seg.y1 + seg.y2) / 2;
      if (mx < box.x0 || mx > box.x1 || my < box.y0 || my > box.y1) continue;
      if (!inApt(mx, my) && !inApt(seg.x1, seg.y1) && !inApt(seg.x2, seg.y2)) continue;
      if (wallLayer(layer)) walls.push(seg);
      else if (glazeLayer(layer)) glazing.push(seg);
    }
  };
  for await (const { code, value } of pairsOf(DXF)) {
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
      cur = null;
      section = "";
      continue;
    }
    if (section !== "ENTITIES") continue;
    if (code === "0") {
      if (cur && (cur.type === "LINE" || cur.type === "LWPOLYLINE")) take(cur.layer, cur.xs, cur.ys);
      if (cur && (cur.type === "INSERT" || cur.type === "ARC") && markLayer(cur.layer) && cur.xs[0] != null && cur.ys[0] != null && inApt(cur.xs[0], cur.ys[0])) {
        marks.push({ x: cur.xs[0], y: cur.ys[0] });
      }
      cur = { type: value, layer: "0", xs: [], ys: [] };
      continue;
    }
    if (!cur) continue;
    if (code === "8") cur.layer = value;
    else if (code === "10" || code === "11") cur.xs.push(Number(value));
    else if (code === "20" || code === "21") cur.ys.push(Number(value));
  }

  const seal = sealDxfWallsForFlood(walls, glazing, marks, UPM);
  const CELL = 4;
  const ox = minX - 20;
  const oy = minY - 20;
  const cols = Math.ceil((maxX - minX + 40) / CELL) + 2;
  const rows = Math.ceil((maxY - minY + 40) / CELL) + 2;
  const blocked = new Uint8Array(cols * rows);
  const allowed = new Uint8Array(cols * rows);
  const atCell = (x: number, y: number) => {
    const c = Math.floor((x - ox) / CELL);
    const r = Math.floor((y - oy) / CELL);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return -1;
    return r * cols + c;
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = ox + (c + 0.5) * CELL;
      const y = oy + (r + 0.5) * CELL;
      const i = r * cols + c;
      if (inApt(x, y)) allowed[i] = 1;
      else blocked[i] = 1;
    }
  }
  const paint = (x: number, y: number, w: number, h: number) => {
    const c0 = Math.max(0, Math.floor((x - ox) / CELL));
    const r0 = Math.max(0, Math.floor((y - oy) / CELL));
    const c1 = Math.min(cols, Math.ceil((x + w - ox) / CELL));
    const r1 = Math.min(rows, Math.ceil((y + h - oy) / CELL));
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        const i = r * cols + c;
        if (allowed[i]) blocked[i] = 1;
      }
    }
  };
  for (const body of [...seal.walls, ...seal.bridges]) {
    const rect = bodyRect(body);
    paint(rect.x, rect.y, Math.max(rect.w, CELL), Math.max(rect.h, CELL));
  }
  for (const patch of seal.patches) paint(patch.x, patch.y, patch.w, patch.h);

  const seed = atCell(54833, 33008);
  const region = new Uint8Array(cols * rows);
  if (seed >= 0 && allowed[seed] && !blocked[seed]) {
    const fq = [seed];
    region[seed] = 1;
    let fi = 0;
    while (fi < fq.length) {
      const i = fq[fi++]!;
      const r = (i / cols) | 0;
      const c = i - r * cols;
      const step = (j: number) => {
        if (region[j] || blocked[j] || !allowed[j]) return;
        region[j] = 1;
        fq.push(j);
      };
      if (c > 0) step(i - 1);
      if (c + 1 < cols) step(i + 1);
      if (r > 0) step(i - cols);
      if (r + 1 < rows) step(i + cols);
    }
  }
  let openCells = 0;
  let filled = 0;
  let leaked = 0;
  for (let i = 0; i < allowed.length; i++) {
    if (!allowed[i] || blocked[i]) continue;
    openCells++;
    if (region[i]) filled++;
    else leaked++;
  }
  const openM2 = (openCells * CELL * CELL) / 1e4;
  const filledM2 = (filled * CELL * CELL) / 1e4;
  const cover = openCells ? filled / openCells : 0;

  let pminX = W, pminY = H, pmaxX = 0, pmaxY = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (outside[y * W + x]) continue;
      pminX = Math.min(pminX, x);
      pminY = Math.min(pminY, y);
      pmaxX = Math.max(pmaxX, x);
      pmaxY = Math.max(pmaxY, y);
    }
  }
  const scale = 3;
  const cw = pmaxX - pminX + 1;
  const ch = pmaxY - pminY + 1;
  const outW = cw * scale;
  const outH = ch * scale;
  const img = Buffer.alloc(outW * outH * 3);
  const put = (x: number, y: number, rgb: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= outW || y >= outH) return;
    const o = (y * outW + x) * 3;
    img[o] = rgb[0];
    img[o + 1] = rgb[1];
    img[o + 2] = rgb[2];
  };
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const sx = pminX + x;
      const sy = pminY + y;
      const src = sy * W + sx;
      let rgb: [number, number, number] = [244, 239, 230];
      if (red[src]) rgb = [196, 48, 42];
      else if (!outside[src]) {
        const [wx, wy] = toWorld(sx, sy);
        const cell = atCell(wx, wy);
        const sun = 0.55 + 0.45 * (x / cw);
        if (cell >= 0 && blocked[cell] && allowed[cell]) rgb = [58, 44, 34];
        else if (cell >= 0 && region[cell]) rgb = [Math.round(210 * sun + 20), Math.round(150 * sun), Math.round(70 * sun)];
        else rgb = [232, 214, 184];
      }
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) put(x * scale + dx, y * scale + dy, rgb);
      }
    }
  }
  await sharp(img, { raw: { width: outW, height: outH, channels: 3 } }).png().toFile(OUT);
  const report = {
    walls: walls.length,
    bridges: seal.bridges.length,
    byReason: seal.bridges.reduce<Record<string, number>>((m, b) => ({ ...m, [b.reason]: (m[b.reason] ?? 0) + 1 }), {}),
    openInteriorM2: Number(openM2.toFixed(2)),
    sealedFloodM2: Number(filledM2.toFixed(2)),
    cover: Number(cover.toFixed(3)),
    unfilledM2: Number(((leaked * CELL * CELL) / 1e4).toFixed(2)),
    leakedOutside: false,
    out: OUT,
  };
  writeFileSync(OUT.replace(/\.png$/, ".json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
