import fs from "node:fs";
import { flattenDxf, readDxfDrawing } from "@/lib/projects/dxf-drawing";
import { ELEVS, Y0 } from "./elev-openings.mts";
import { FACE } from "./elev-fit.mts";
const OFF: Record<string, number> = { "דרום": -958, "צפון": 2267 };
const d = readDxfDrawing(fs.readFileSync(process.argv[2]!))!;
for (const p of flattenDxf(d)) {
  if (p.type !== "HATCH" || (p as { pattern?: string }).pattern !== "_USER") continue;
  const e = ELEVS.find((e) => p.strokes!.every(([u]) => u.x >= e.x0 && u.x <= e.x1)); if (!e || !OFF[e.sheet]) continue;
  const xs = [...new Set(p.strokes!.filter(([u, v]) => Math.abs(u.x - v.x) < 1).map(([u]) => Math.round(u.x - e.x0)))].sort((a, b) => a - b);
  const toModel = (x: number) => -(FACE[e.sheet]!.sign * x + OFF[e.sheet]!) / 100;
  console.log(e.sheet, "strokes", xs.length, "spacing", xs.slice(1).map((x, i) => x - xs[i]!).slice(0, 12).join(","), "model z from", toModel(xs[0]!).toFixed(2), "to", toModel(xs.at(-1)!).toFixed(2));
  if (p.rings) for (const r of p.rings) { const rx = r.map((q) => q.x - e.x0); console.log("  ring x", Math.min(...rx).toFixed(0), Math.max(...rx).toFixed(0), "→ z", toModel(Math.min(...rx)).toFixed(2), toModel(Math.max(...rx)).toFixed(2), "lvl", ((Math.min(...r.map((q) => q.y)) - Y0) / 100 + 0.2).toFixed(2), ((Math.max(...r.map((q) => q.y)) - Y0) / 100 + 0.2).toFixed(2)); }
}
