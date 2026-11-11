import fs from "node:fs";
import { flattenDxf, readDxfDrawing } from "@/lib/projects/dxf-drawing";
import { ELEVS } from "./elev-openings.mts";
const d = readDxfDrawing(fs.readFileSync(process.argv[2]!))!;
const all = flattenDxf(d);
for (const e of ELEVS) {
  const n = new Map<string, { c: number; x0: number; x1: number; y0: number; y1: number }>();
  for (const p of all) { const q = p.pts; if (!q || q.length < 2) continue;
    for (let i = 0; i + 1 < q.length; i++) { const a = q[i]!, b = q[i + 1]!; if (Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) < 100) continue; if (a.x < e.x0 || a.x > e.x1 || Math.min(a.y, b.y) < -35300 || Math.max(a.y, b.y) > -31300) continue;
      const k = `${p.layer}|c${p.colour.toString(16)}|${p.path.at(-1) ?? ""}`; const v = n.get(k) ?? { c: 0, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 }; v.c++; v.x0 = Math.min(v.x0, a.x - e.x0); v.x1 = Math.max(v.x1, a.x - e.x0); v.y0 = Math.min(v.y0, a.y, b.y); v.y1 = Math.max(v.y1, a.y, b.y); n.set(k, v); } }
  console.log("==", e.sheet); for (const [k, v] of [...n].sort((a, b) => b[1].c - a[1].c).slice(0, 8)) console.log(" ", k, v.c, "x", v.x0.toFixed(0), v.x1.toFixed(0), "lvl", ((v.y0 + 34523) / 100).toFixed(2), ((v.y1 + 34523) / 100).toFixed(2));
}
