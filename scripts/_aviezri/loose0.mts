import { readAviezri } from "./read.mts";
import { ptsOf } from "./instances.mts";
const R = readAviezri(process.argv[2]!);
for (const p of R.f1) { if (p.path.length || !/rihut|sanitary|tzeva/.test(p.layer) || p.insert) continue; const q = ptsOf(p); const xs = q.map((v) => v.x), ys = q.map((v) => v.y);
  console.log(p.type.padEnd(10), p.layer.padEnd(12), p.arc ? `arc r${p.arc.r.toFixed(0)}` : p.circle ? "circ" : p.rings ? `hatch${p.solid ? "S" : ""}` : `n${q.length}${p.closed ? "C" : ""}`, [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map((v) => v.toFixed(0)).join(",")); }
