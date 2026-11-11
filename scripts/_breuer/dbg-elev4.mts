import fs from "node:fs";
import { flattenDxf, readDxfDrawing } from "@/lib/projects/dxf-drawing";
const d = readDxfDrawing(fs.readFileSync(process.argv[2]!))!;
const [x0, x1, y0, y1] = process.argv.slice(3).map(Number) as [number, number, number, number];
for (const p of flattenDxf(d)) { const q = p.pts; if (!q) continue; for (let i = 0; i + 1 < q.length; i++) { const a = q[i]!, b = q[i + 1]!; if (Math.abs(a.y - b.y) < 0.5 && a.y > y0 && a.y < y1 && Math.max(a.x, b.x) > x0 && Math.min(a.x, b.x) < x1 && Math.abs(a.x - b.x) > 20) console.log(a.y.toFixed(1), Math.min(a.x, b.x).toFixed(0), Math.max(a.x, b.x).toFixed(0), p.layer, p.path.at(-1)); } }
