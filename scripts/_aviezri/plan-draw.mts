/** Draw a storey in the rel frame: its own file grey, the main file's overlay red. plan-draw.mts <dxf dir> <f1|f2> <out.png> [x0,x1,y0,y1] */
import { writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { readAviezri } from "./read.mts";
const [dir, which, out, boxArg] = process.argv.slice(2);
const r = readAviezri(dir!);
const ps = which === "f2" ? r.f2 : r.f1;
const [x0, x1, y0, y1] = (boxArg ?? "-600,3800,-600,3600").split(",").map(Number) as [number, number, number, number];
const W = 2400, s = W / (x1 - x0), H = Math.round((y1 - y0) * s);
const cv = createCanvas(W, H); const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
const X = (x: number) => (x - x0) * s, Y = (y: number) => (y1 - y) * s;
for (const p of ps) {
  const ov = (p as { overlay?: boolean }).overlay;
  g.strokeStyle = ov ? "#d00" : /kir/.test(p.layer) ? "#00a" : "#888"; g.lineWidth = /kir/.test(p.layer) ? 1.5 : 0.8;
  if (p.pts && p.pts.length > 1) { g.beginPath(); p.pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Y(q.y)) : g.moveTo(X(q.x), Y(q.y)))); if (p.closed) g.closePath(); g.stroke(); }
  else if (p.arc) { g.beginPath(); g.arc(X(p.arc.c.x), Y(p.arc.c.y), p.arc.r * s, -p.arc.start, -p.arc.end, true); g.stroke(); }
  else if (p.circle) { g.beginPath(); g.arc(X(p.circle.c.x), Y(p.circle.c.y), p.circle.r * s, 0, 7); g.stroke(); }
}
writeFileSync(out!, cv.toBuffer("image/png"));
console.log(r.counts);
