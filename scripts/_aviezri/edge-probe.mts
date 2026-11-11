import { readAviezri } from "./read.mts";
import { heb } from "./heb.mts";
import { ptsOf } from "./instances.mts";
const R = readAviezri(process.argv[2]!);
const [x0, x1, y0, y1] = process.argv[3]!.split(",").map(Number) as [number, number, number, number];
for (const p of R.f2) { const q = ptsOf(p); if (!q.length) continue; const xs = q.map((v) => v.x), ys = q.map((v) => v.y);
  const b = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (b[0]! > x1 || b[1]! < x0 || b[2]! > y1 || b[3]! < y0) continue; if (/rihut|tzeva|midot/.test(p.layer) && (p as {overlay?:boolean}).overlay) continue;
  console.log(((p as {overlay?:boolean}).overlay ? "OV " : "   ") + p.path.join(">").slice(0, 18).padEnd(18), p.type.padEnd(10), p.layer.padEnd(16), p.text ? heb(p.text) : p.arc ? `arc r${p.arc.r.toFixed(0)}` : p.rings ? `hatch${p.solid ? "S" : ""}` : `n${q.length}${p.closed ? "C" : ""}`, b.map((v) => v.toFixed(0)).join(",")); }
