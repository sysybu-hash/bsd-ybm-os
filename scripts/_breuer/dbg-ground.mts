/** Ground heights of a built model as a PNG (red high, blue low), building walls in black: <model dir> <out.png> */
import fs from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
const [dir, out] = process.argv.slice(2);
const m = JSON.parse(fs.readFileSync(`${dir}/model.json`, "utf8"));
const t = m.primitives.find((p: { type: string }) => p.type === "terrain");
const S = 4, cv = createCanvas(t.nx * S, t.nz * S), g = cv.getContext("2d");
const hs: number[] = t.heights; const lo = Math.min(...hs), hi = Math.max(...hs);
for (let r = 0; r < t.nz; r++) for (let c = 0; c < t.nx; c++) {
  const v = (hs[r * t.nx + c]! - lo) / (hi - lo);
  g.fillStyle = `hsl(${(1 - v) * 240},80%,55%)`; g.fillRect(c * S, r * S, S, S);
}
g.fillStyle = "rgba(0,0,0,0.5)";
for (const p of m.primitives) if (p.type === "prism" && /^wall:ק|^sitewall/.test(p.tag ?? "")) { g.beginPath(); p.ring.forEach(([x, z]: [number, number], i: number) => { const X = ((x - t.x0) / t.dx) * S, Y = ((z - t.z0) / t.dx) * S; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.fill(); }
g.fillStyle = "#000"; g.font = "bold 22px Arial";
for (let r = 0; r < t.nz; r += 16) for (let c = 0; c < t.nx; c += 16) g.fillText(hs[r * t.nx + c]!.toFixed(1), c * S, r * S);
fs.writeFileSync(out!, cv.toBuffer("image/png")); console.log("range", lo, hi);
