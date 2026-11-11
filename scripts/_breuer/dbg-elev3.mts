import fs from "node:fs";
import { flattenDxf, readDxfDrawing } from "@/lib/projects/dxf-drawing";
const d = readDxfDrawing(fs.readFileSync(process.argv[2]!))!;
const all = flattenDxf(d);
// x extents of each layer's geometry in the elevation band, binned per 100cm
const ps = all.filter((p) => { const q = p.at ?? p.pts?.[0]; return !!q && q.y >= -36000 && q.y <= -31200 && q.x >= -36000 && q.x <= -15000; });
const bins = new Map<number, number>();
for (const p of ps) for (const q of p.pts ?? (p.at ? [p.at] : [])) { const b = Math.floor(q.x / 200) * 200; bins.set(b, (bins.get(b) ?? 0) + 1); }
console.log([...bins].sort((a, b) => a[0] - b[0]).map(([b, n]) => `${b}:${n}`).join(" "));
