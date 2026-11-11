/** Site zones of the ground tabs: regions closed by wall + mabat lines inside the plot, with the level marks that fall in them. Draws a PNG. */
import fs from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { readBreuer } from "./read.mts";
import { buildGrid, CELL, segmentsOf } from "./grid.mts";
import type { Pt } from "@/lib/projects/dxf-drawing";

const [file, outPng, tab] = process.argv.slice(2);
const { storeys } = readBreuer(file!);
const st = storeys.find((s) => s.id === (tab ?? "ק"))!;
const o = st.origin;
const L = (q: Pt): Pt => ({ x: q.x - o.x, y: q.y - o.y });
const segs: Array<[Pt, Pt]> = [];
for (const p of st.pieces) {
  if (!/^(wall|wall2|mabat|gvul)$/.test(p.layer) || p.text || p.dimension) continue;
  if (p.path.some((n) => /^A\$C2edb|מפלס כולל רחוב|צפון-2|^\*D/.test(n))) continue;
  for (const [a, b] of segmentsOf(p)) segs.push([L(a), L(b)]);
}
const plotPts = st.pieces.filter((p) => p.path.includes("גבולות מעודכנים") && p.layer === "gvul" && p.pts && p.pts.length > 3).flatMap((p) => p.pts!.map(L));
const bx = { x0: Math.min(...plotPts.map((q) => q.x)), y0: Math.min(...plotPts.map((q) => q.y)), x1: Math.max(...plotPts.map((q) => q.x)), y1: Math.max(...plotPts.map((q) => q.y)) };
const g = buildGrid(segs, bx);
const marks: Array<{ at: Pt; v: number; tab: string }> = [];
for (const s2 of storeys.filter((s) => s.id === "ק" || s.id === "שיפוע")) for (const p of s2.pieces) {
  if (!p.text || !p.at || p.dimension || p.path.includes("A$C2edb726f")) continue;
  const m = /^([±+\-])\s?(\d+\.\d\d)$/.exec(p.text.trim());
  if (!m || p.text.trim().startsWith("+2") && Number(m[2]) > 20) continue;
  const v = m[1] === "-" ? -Number(m[2]) : Number(m[2]);
  if (Math.abs(v) > 8) continue;
  marks.push({ at: { x: p.at.x - s2.origin.x, y: p.at.y - s2.origin.y }, v, tab: s2.id });
}
const regMarks = new Map<number, string[]>();
for (const m of marks) {
  const i = Math.floor((m.at.x - g.x0) / CELL), j = Math.floor((m.at.y - g.y0) / CELL);
  // the mark's own symbol may sit on a line: look round it
  let r = 0;
  for (let d = 0; d < 8 && !r; d++) for (let b = -d; b <= d && !r; b++) for (let a = -d; a <= d && !r; a++) { const k = (j + b) * g.nx + (i + a); if (g.region[k]) r = g.region[k]!; else if (g.outside[k]) r = -1; }
  (regMarks.get(r) ?? regMarks.set(r, []).get(r)!).push(`${m.tab}:${m.v}`);
}
console.log("marks", marks.length, [...regMarks].map(([r, v]) => `${r}(${r > 0 ? ((g.regionSize[r]! * CELL * CELL) / 1e4).toFixed(1) + "m²" : "out"}): ${v.join(",")}`).join(" | "));
const W = g.nx, H = g.ny;
const cv = createCanvas(W, H); const c = cv.getContext("2d"); const img = c.createImageData(W, H);
const col = (r: number) => [(r * 97) % 200 + 40, (r * 57) % 200 + 40, (r * 31) % 200 + 40];
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const k = j * W + i, q = ((H - 1 - j) * W + i) * 4;
  const [R, G, B] = g.line[k] ? [0, 0, 0] : g.outside[k] ? [255, 255, 255] : regMarks.has(g.region[k]!) ? col(g.region[k]!) : [215, 215, 215];
  img.data[q] = R!; img.data[q + 1] = G!; img.data[q + 2] = B!; img.data[q + 3] = 255;
}
c.putImageData(img, 0, 0);
c.font = "20px Arial"; c.fillStyle = "#d00";
for (const m of marks) c.fillText(`${m.tab}${m.v}`, (m.at.x - g.x0) / CELL, H - (m.at.y - g.y0) / CELL);
fs.writeFileSync(outPng!, cv.toBuffer("image/png"));
