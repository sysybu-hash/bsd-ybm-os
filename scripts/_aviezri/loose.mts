import { readAviezri } from "./read.mts";
import { heb } from "./heb.mts";
import { ptsOf } from "./instances.mts";
const R = readAviezri(process.argv[2]!);
const L = new RegExp(process.argv[3]!);
for (const [id, ps] of [["f1", R.f1], ["f2", R.f2]] as const) {
  const loose = ps.filter((p) => L.test(p.layer) && !p.insert && p.path.length <= 1);
  console.log(`== ${id} ${loose.length}`);
  for (const c of loose.slice(0, 80)) { const q = ptsOf(c); if (!q.length) continue; const xs = q.map((v) => v.x), ys = q.map((v) => v.y);
    console.log("  ", c.path.join(">").slice(0, 20).padEnd(20), c.type.padEnd(10), c.layer.padEnd(14), c.text ? heb(c.text) : c.arc ? `arc r${c.arc.r.toFixed(0)}` : c.circle ? `circ r${c.circle.r.toFixed(0)}` : c.rings ? `hatch${c.solid ? "S" : ""}` : `n${q.length}${c.closed ? "C" : ""}`, [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map((v) => v.toFixed(0)).join(",")); }
}
