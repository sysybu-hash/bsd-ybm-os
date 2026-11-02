import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const outDir = path.join(process.cwd(), "lib", "projects", "building", "textures");
await mkdir(outDir, { recursive: true });

const rand = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const png = (w, h, rgba) => sharp(Buffer.from(rgba), { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();

const normalFrom = (w, h, height) => {
  const rgba = new Uint8Array(w * h * 4);
  const at = (x, y) => height[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);
      const nx = -dx * 4;
      const ny = -dy * 4;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (y * w + x) * 4;
      rgba[i] = 128 + 127 * (nx / len);
      rgba[i + 1] = 128 + 127 * (ny / len);
      rgba[i + 2] = 128 + 127 * nz / len;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
};

const hash2 = (x, y) => {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  return (Math.imul(n, 1274126177) >>> 0) / 4294967296;
};

const stone = (w, h) => {
  const r = rand(11);
  const rgba = new Uint8Array(w * h * 4);
  const height = new Float32Array(w * h);
  const rows = 12;
  const ch = h / rows;
  const courses = [];
  for (let row = 0; row < rows; row++) {
    const lengths = [];
    const tones = [];
    let total = 0;
    while (total < w - 1) {
      let len = Math.round(w * (0.16 + r() * 0.18));
      if (total + len > w) len = w - total;
      if (len < w * 0.08 && lengths.length) {
        lengths[lengths.length - 1] += len;
        break;
      }
      lengths.push(len);
      tones.push(0.7 + r() * 0.24);
      total += len;
    }
    courses.push({ lengths, tones, shift: row % 2 === 0 ? 0 : Math.round(lengths[0] * 0.5) });
  }
  for (let y = 0; y < h; y++) {
    const row = Math.min(rows - 1, Math.floor(y / ch));
    const course = courses[row];
    const inJoint = y % ch < 4 || y % ch > ch - 4;
    for (let x = 0; x < w; x++) {
      const local = (x + course.shift) % w;
      let acc = 0;
      let idx = 0;
      for (; idx < course.lengths.length; idx++) {
        if (local < acc + course.lengths[idx]) break;
        acc += course.lengths[idx];
      }
      if (idx >= course.lengths.length) idx = course.lengths.length - 1;
      const edge = local - acc < 4 || acc + course.lengths[idx] - local < 4;
      const grain = (hash2(x, y) - 0.5) * 0.035;
      let v = course.tones[idx] + grain;
      if (inJoint || edge) v = 0.36 + hash2(x, y) * 0.06;
      const i = y * w + x;
      height[i] = inJoint || edge ? 0.12 : 0.72 + course.tones[idx] * 0.2;
      const o = i * 4;
      rgba[o] = Math.min(255, v * 232);
      rgba[o + 1] = Math.min(255, v * 210);
      rgba[o + 2] = Math.min(255, v * 172);
      rgba[o + 3] = 255;
    }
  }
  return { rgba, height };
};

const wrapNoise = (w, h, cells, seed) => {
  const r = rand(seed);
  const grid = Array.from({ length: cells }, () => Array.from({ length: cells }, () => r()));
  return (x, y) => {
    const fx = (x / w) * cells;
    const fy = (y / h) * cells;
    const x0 = Math.floor(fx) % cells;
    const y0 = Math.floor(fy) % cells;
    const x1 = (x0 + 1) % cells;
    const y1 = (y0 + 1) % cells;
    const tx = fx - Math.floor(fx);
    const ty = fy - Math.floor(fy);
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = grid[y0][x0];
    const b = grid[y0][x1];
    const c = grid[y1][x0];
    const d = grid[y1][x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
};

const asphalt = (w, h) => {
  const rgba = new Uint8Array(w * h * 4);
  const height = new Float32Array(w * h);
  const coarse = wrapNoise(w, h, 4, 29);
  const mid = wrapNoise(w, h, 12, 31);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const speck = hash2(x, y) < 0.16 ? 0.12 + hash2(x + 17, y) * 0.28 : 0;
      const wash = 0.2 + coarse(x, y) * 0.06 + mid(x, y) * 0.03;
      const v = wash + speck * 0.4;
      const i = y * w + x;
      height[i] = 0.3 + speck + mid(x, y) * 0.15;
      const o = i * 4;
      rgba[o] = Math.min(255, v * 255);
      rgba[o + 1] = Math.min(255, v * 250);
      rgba[o + 2] = Math.min(255, v * 242);
      rgba[o + 3] = 255;
    }
  }
  return { rgba, height };
};

const paving = (w, h) => {
  const r = rand(47);
  const rgba = new Uint8Array(w * h * 4);
  const height = new Float32Array(w * h);
  const cols = 6;
  const rows = 10;
  const bw = w / cols;
  const bh = h / rows;
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / bh);
    const off = (row % 2) * (bw / 2);
    for (let x = 0; x < w; x++) {
      const lx = (x + off) % bw;
      const ly = y % bh;
      const joint = lx < 3 || ly < 3;
      const tone = 0.62 + ((Math.floor((x + off) / bw) * 13 + row * 7) % 10) * 0.025 + (r() - 0.5) * 0.02;
      const v = joint ? 0.42 : tone;
      const i = y * w + x;
      height[i] = joint ? 0.2 : 0.8;
      const o = i * 4;
      rgba[o] = Math.min(255, v * 230);
      rgba[o + 1] = Math.min(255, v * 214);
      rgba[o + 2] = Math.min(255, v * 196);
      rgba[o + 3] = 255;
    }
  }
  return { rgba, height };
};

const pairs = [
  ["jerusalem-stone", stone(1024, 1024)],
  ["asphalt", asphalt(512, 512)],
  ["paving", paving(512, 512)],
];
for (const [name, img] of pairs) {
  const [dw, dh] = name === "jerusalem-stone" ? [1024, 1024] : [512, 512];
  await writeFile(path.join(outDir, `${name}-diffuse.png`), await png(dw, dh, img.rgba));
  await writeFile(path.join(outDir, `${name}-normal.png`), await png(dw, dh, normalFrom(dw, dh, img.height)));
}
console.log("wrote", outDir);
