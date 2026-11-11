// The "-door" inserts on the elevations: block, place (elevation-local x cm, level m), block extent.
import fs from "node:fs";
import { flattenDxf, readDxfDrawing } from "@/lib/projects/dxf-drawing";
import { ELEVS, Y0 } from "./elev-openings.mts";
const drawing = readDxfDrawing(fs.readFileSync(process.argv[2]!, "utf8"));
const by = new Map<string, { xs: number[]; ys: number[]; sheet: string; ins: string }>();
for (const p of flattenDxf(drawing)) {
  if (p.layer !== "-door" && !p.path.some((n) => /door/i.test(n)) && !/door/i.test(p.insert ?? "")) continue;
  const pts = [...(p.pts ?? []), ...(p.at ? [p.at] : [])]; if (!pts.length) continue;
  const e = ELEVS.find((e) => pts[0]!.x >= e.x0 - 300 && pts[0]!.x <= e.x1 + 300); if (!e || pts[0]!.y < -35300 || pts[0]!.y > -31300) continue;
  const key = `${e.sheet} ${p.insert ?? ""} ${p.path.join(">")} ${p.type} ${p.layer}`;
  const v = by.get(key) ?? { xs: [], ys: [], sheet: e.sheet, ins: p.layer };
  for (const q of pts) { v.xs.push(q.x - e.x0); v.ys.push((q.y - Y0) / 100); } by.set(key, v);
}
for (const [k, v] of by) console.log(k, `[${v.ins}]`, `x ${Math.round(Math.min(...v.xs))}..${Math.round(Math.max(...v.xs))} z ${Math.min(...v.ys).toFixed(2)}..${Math.max(...v.ys).toFixed(2)} n${v.xs.length}`);
