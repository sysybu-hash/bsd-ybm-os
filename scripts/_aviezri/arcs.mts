import fs from "node:fs";
import { flattenDxf, readDxfDrawing } from "@/lib/projects/dxf-drawing";
const d = readDxfDrawing(new Uint8Array(fs.readFileSync(process.argv[2]!)))!;
for (const p of flattenDxf(d)) if (p.arc && p.arc.r > 150) console.log(p.layer, p.path.join(">"), p.arc.c.x.toFixed(1), p.arc.c.y.toFixed(1), p.arc.r.toFixed(1), (p.arc.start * 180 / Math.PI).toFixed(0), (p.arc.end * 180 / Math.PI).toFixed(0));
