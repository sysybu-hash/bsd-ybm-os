import fs from "node:fs";
import { flattenDxf, readDxfDrawing } from "@/lib/projects/dxf-drawing";
import { ELEVS } from "./elev-openings.mts";
const d = readDxfDrawing(fs.readFileSync(process.argv[2]!))!;
for (const p of flattenDxf(d)) {
  if (!p.rings && !p.strokes) continue;
  const q = (p.rings?.flat() ?? p.strokes!.flat());
  const xs = q.map((v) => v.x), ys = q.map((v) => v.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const e = ELEVS.find((e) => x0 >= e.x0 && x1 <= e.x1); if (!e || y0 < -35300 || y1 > -31300) continue;
  console.log(e.sheet, p.type, p.layer, "c" + p.colour.toString(16), p.solid ? "solid" : "", p.strokes ? `strokes ${p.strokes.length}` : `rings ${p.rings!.length}`, "x", (x0 - e.x0).toFixed(0), (x1 - e.x0).toFixed(0), "lvl", ((y0 + 34523) / 100).toFixed(2), ((y1 + 34523) / 100).toFixed(2), (p as { pattern?: string }).pattern ?? "");
}
