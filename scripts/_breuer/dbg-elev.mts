import fs from "node:fs";
import { flattenDxf, readDxfDrawing } from "@/lib/projects/dxf-drawing";
const d = readDxfDrawing(fs.readFileSync(process.argv[2]!))!;
const all = flattenDxf(d);
console.log("layouts:", d.layouts.map((l) => `${l.name}[${l.viewports.length}]`).join(" | "));
for (const l of d.layouts.filter((l) => /חזית/.test(l.name))) {
  for (const vp of l.viewports) {
    const inVp = (q?: { x: number; y: number }) => !!q && Math.abs(q.x - vp.centre.x) <= vp.width / 2 && Math.abs(q.y - vp.centre.y) <= vp.height / 2;
    const ps = all.filter((p) => inVp(p.at ?? p.pts?.[0] ?? p.arc?.c ?? p.circle?.c));
    const n = new Map<string, number>();
    for (const p of ps) { const k = `${p.layer}|${p.type}|c${p.colour.toString(16)}`; n.set(k, (n.get(k) ?? 0) + 1); }
    console.log(`\n== ${l.name} vp centre ${vp.centre.x.toFixed(0)},${vp.centre.y.toFixed(0)} ${vp.width.toFixed(0)}x${vp.height.toFixed(0)} pieces ${ps.length}`);
    console.log([...n].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k}:${v}`).join("  "));
    const marks = ps.filter((p) => p.text && /^[+\-±]?\s?\d+\.\d\d/.test(p.text.trim())).map((p) => `${p.text!.trim()}@${p.at!.x.toFixed(0)},${p.at!.y.toFixed(0)}`);
    console.log("marks:", marks.slice(0, 40).join(" "));
  }
}
