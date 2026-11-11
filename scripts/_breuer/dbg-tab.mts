/** Draw one storey tab in storey-local cm with a 2 m grid: <dxf> <tab> <out.png> [x0 x1 y0 y1] */
import fs from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { readBreuer } from "./read.mts";
const [file, tab, out, ...bb] = process.argv.slice(2);
const { storeys } = readBreuer(file!);
const st = storeys.find((s) => s.id === tab)!; const o = st.origin;
const [x0, x1, y0, y1] = bb.length ? bb.map(Number) as [number, number, number, number] : [-200, 3400, -1000, 2600];
const W = 2400, s = W / (x1 - x0), H = Math.round((y1 - y0) * s);
const X = (x: number) => (x - o.x - x0) * s, Y = (y: number) => (y1 - (y - o.y)) * s;
const cv = createCanvas(W, H); const g = cv.getContext("2d");
g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
g.strokeStyle = "#cde"; g.fillStyle = "#89a"; g.font = "14px Arial";
for (let x = Math.ceil(x0 / 200) * 200; x < x1; x += 200) { g.beginPath(); g.moveTo((x - x0) * s, 0); g.lineTo((x - x0) * s, H); g.stroke(); g.fillText(String(x), (x - x0) * s + 2, 14); }
for (let y = Math.ceil(y0 / 200) * 200; y < y1; y += 200) { g.beginPath(); g.moveTo(0, (y1 - y) * s); g.lineTo(W, (y1 - y) * s); g.stroke(); g.fillText(String(y), 2, (y1 - y) * s - 2); }
const hex = (c: number) => "#" + (c === 0xffffff || c === 0 ? 0x222222 : c).toString(16).padStart(6, "0");
const LRE = process.env.LAYRE ? new RegExp(process.env.LAYRE) : null;
for (const p of st.pieces) {
  if (LRE && !LRE.test(p.layer)) continue;
  g.strokeStyle = g.fillStyle = hex(p.colour); g.lineWidth = 1;
  if (p.pts) { g.beginPath(); p.pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Y(q.y)) : g.moveTo(X(q.x), Y(q.y)))); if (p.closed) g.closePath(); g.stroke(); }
  else if (p.arc) { g.beginPath(); g.arc(X(p.arc.c.x), Y(p.arc.c.y), p.arc.r * s, -p.arc.start, -p.arc.end, true); g.stroke(); }
  else if (p.circle) { g.beginPath(); g.arc(X(p.circle.c.x), Y(p.circle.c.y), p.circle.r * s, 0, 2 * Math.PI); g.stroke(); }
  else if (p.text && p.at && !p.path.some((n) => n.startsWith("A$C2edb"))) { g.save(); g.translate(X(p.at.x), Y(p.at.y)); g.rotate(-(p.rotation ?? 0) * Math.PI / 180); g.font = `${Math.max(9, (p.height ?? 10) * s).toFixed(0)}px Arial`; g.fillStyle = "#c00"; g.fillText(p.text.slice(0, 30), 0, 0); g.restore(); }
}
fs.writeFileSync(out!, cv.toBuffer("image/png")); console.log("ok", W, H);
