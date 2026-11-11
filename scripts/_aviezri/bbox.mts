import fs from "node:fs";
import { flattenDxf, readDxfDrawing } from "@/lib/projects/dxf-drawing";
const d = readDxfDrawing(new Uint8Array(fs.readFileSync(process.argv[2]!)))!;
const by = new Map<string, number[]>();
for (const p of flattenDxf(d)) { const pts = p.pts ?? p.rings?.flat() ?? []; if (!pts.length) continue; const b = by.get(p.layer) ?? [1e9, -1e9, 1e9, -1e9]; for (const q of pts) { b[0] = Math.min(b[0]!, q.x); b[1] = Math.max(b[1]!, q.x); b[2] = Math.min(b[2]!, q.y); b[3] = Math.max(b[3]!, q.y); } by.set(p.layer, b); }
for (const [l, b] of by) console.log(l.padEnd(20), b.map((v) => v.toFixed(1)).join(" "));
