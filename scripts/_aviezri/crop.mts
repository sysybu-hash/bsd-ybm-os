/** Crop of a DXF in model coords, coloured by layer, with a legend: crop.mts <dxf> <x0,x1,y0,y1> <out.png> [px] [layer regex] */
import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { flattenDxf, readDxfDrawing, apply, type Matrix } from "@/lib/projects/dxf-drawing";
import { heb } from "./heb.mts";
const [file, boxArg, out, pxArg, layArg] = process.argv.slice(2);
const d = readDxfDrawing(readFileSync(file!))!;
const [x0, x1, y0, y1] = boxArg!.split(",").map(Number) as [number, number, number, number];
const LAY = layArg ? new RegExp(layArg) : null;
const W = Number(pxArg ?? 2000), s = W / (x1 - x0), H = Math.round((y1 - y0) * s);
const cv = createCanvas(W, H + 200); const g = cv.getContext("2d");
g.fillStyle = "#fff"; g.fillRect(0, 0, W, H + 200);
const X = (x: number) => (x - x0) * s, Y = (y: number) => (y1 - y) * s;
const pal = ["#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#42d4f4", "#f032e6", "#9a6324", "#800000", "#469990", "#000075", "#808000", "#a9a9a9", "#000000", "#ffe119", "#dcbeff"];
const lays = new Map<string, string>();
const col = (l: string) => { if (!lays.has(l)) lays.set(l, pal[lays.size % pal.length]!); return lays.get(l)!; };
const inb = (p: { x: number; y: number }) => p.x > x0 - 50 && p.x < x1 + 50 && p.y > y0 - 50 && p.y < y1 + 50;
for (const p of flattenDxf(d)) {
  if (LAY && !LAY.test(p.layer)) continue;
  const c = col(p.layer); g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 1.2;
  if (p.rings) { if (!p.rings.some((r) => r.some(inb))) continue; g.globalAlpha = p.solid ? 0.35 : 0.12; g.beginPath(); for (const r of p.rings) r.forEach((q, i) => (i ? g.lineTo(X(q.x), Y(q.y)) : g.moveTo(X(q.x), Y(q.y)))); g.fill("evenodd"); g.globalAlpha = 1; }
  else if (p.pts && p.pts.length > 1) { if (!p.pts.some(inb)) continue; g.beginPath(); p.pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Y(q.y)) : g.moveTo(X(q.x), Y(q.y)))); if (p.closed) g.closePath(); g.stroke(); }
  else if (p.arc) { if (!inb(p.arc.c)) continue; g.beginPath(); g.arc(X(p.arc.c.x), Y(p.arc.c.y), p.arc.r * s, -p.arc.start, -p.arc.end, true); g.stroke(); }
  else if (p.circle) { if (!inb(p.circle.c)) continue; g.beginPath(); g.arc(X(p.circle.c.x), Y(p.circle.c.y), p.circle.r * s, 0, 7); g.stroke(); }
  else if (p.at && (p.text || p.attribs)) { if (!inb(p.at)) continue; g.font = `${Math.max(9, (p.height ?? 10) * s)}px Arial`; g.fillText(heb(p.text ?? p.attribs!.map((a) => a.text).join("/")), X(p.at.x), Y(p.at.y)); }
}
let k = 0; g.font = "14px Arial";
for (const [l, c] of lays) { g.fillStyle = c; g.fillText(l, 10 + (k % 5) * (W / 5), H + 20 + Math.floor(k / 5) * 18); k++; }
writeFileSync(out!, cv.toBuffer("image/png"));
