import { readAviezri } from "./read.mts";
import { heb } from "./heb.mts";
import { instancesOf, inv, ap, ptsOf } from "./instances.mts";
const R = readAviezri(process.argv[2]!);
const want = process.argv[3]!.split(","); const lim = Number(process.argv[4] ?? 14);
for (const [id, ps] of [["f1", R.f1], ["f2", R.f2]] as const) {
  const ins = instancesOf(ps);
  for (const w of want) {
    const all = ins.filter((i) => i.name === w); const it = all[0]; if (!it) continue;
    const mi = inv(it.m);
    const lb = [1e9, -1e9, 1e9, -1e9];
    for (const c of it.children) for (const v of ptsOf(c).map((q) => ap(mi, q))) { lb[0] = Math.min(lb[0]!, v.x); lb[1] = Math.max(lb[1]!, v.x); lb[2] = Math.min(lb[2]!, v.y); lb[3] = Math.max(lb[3]!, v.y); }
    const texts = [...new Set(it.children.filter((c) => c.text).map((c) => heb(c.text!)))];
    console.log(`== ${id} ${w} ×${all.length} rot=${all.map((i) => (Math.atan2(i.m.b, i.m.a) * 180 / Math.PI).toFixed(0) + (i.m.a * i.m.d - i.m.b * i.m.c < 0 ? "m" : "")).join(" ")} at=${all.map((i) => i.m.e.toFixed(0) + "," + i.m.f.toFixed(0)).slice(0, 6).join(" ")} local=${lb.map((v) => v.toFixed(0)).join(",")} n=${it.children.length} texts=${JSON.stringify(texts)}`);
    for (const c of it.children.filter((c) => !c.text).slice(0, lim)) {
      const q = ptsOf(c).map((v) => ap(mi, v)); if (!q.length) { console.log("  ", c.type, c.layer, c.insert ?? ""); continue; }
      const xs = q.map((v) => v.x), ys = q.map((v) => v.y);
      console.log("  ", c.type.padEnd(10), c.layer.padEnd(14), (c.insert ?? "").padEnd(8), c.arc ? `arc r${c.arc.r.toFixed(0)}` : c.circle ? `circ r${c.circle.r.toFixed(0)}` : c.rings ? `hatch${c.solid ? "S" : ""}` : `n${q.length}${c.closed ? "C" : ""}`, [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map((v) => v.toFixed(0)).join(","));
    }
  }
}
