// Hatches on the four elevations: pattern, layer, and each one's box (elevation-local x cm, level m) — to read the stone boxes.
import fs from "node:fs";
import { flattenDxf, readDxfDrawing } from "@/lib/projects/dxf-drawing";
import { ELEVS, Y0 } from "./elev-openings.mts";
const drawing = readDxfDrawing(fs.readFileSync(process.argv[2]!, "utf8"));
const rows = new Map<string, number>();
for (const p of flattenDxf(drawing)) {
  if (p.type !== "HATCH") continue;
  const pts = (p.rings ?? []).flat(); if (!pts.length) continue;
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  const e = ELEVS.find((e) => Math.min(...xs) >= e.x0 - 300 && Math.max(...xs) <= e.x1 + 300); if (!e || Math.min(...ys) < -35300 || Math.max(...ys) > -31300) continue;
  const pat = (p as { pattern?: string }).pattern ?? "?";
  const k = `${e.sheet} ${p.layer} ${pat}`; rows.set(k, (rows.get(k) ?? 0) + 1);
  if (process.argv[3] && new RegExp(process.argv[3]).test(pat)) for (const r of p.rings ?? []) { const rx = r.map((q) => q.x), ry = r.map((q) => q.y); console.log(`${e.sheet} ring x ${Math.round(Math.min(...rx) - e.x0)}..${Math.round(Math.max(...rx) - e.x0)} z ${((Math.min(...ry) - Y0) / 100).toFixed(2)}..${((Math.max(...ry) - Y0) / 100).toFixed(2)} n${r.length}`); }
  if (false) console.log(`${e.sheet} ${p.layer} ${pat} x ${Math.round(Math.min(...xs) - e.x0)}..${Math.round(Math.max(...xs) - e.x0)} z ${((Math.min(...ys) - Y0) / 100).toFixed(2)}..${((Math.max(...ys) - Y0) / 100).toFixed(2)}`);
}
for (const [k, n] of rows) console.log(k, n);
