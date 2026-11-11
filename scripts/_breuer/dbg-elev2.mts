import fs from "node:fs";
import { flattenDxf, readDxfDrawing } from "@/lib/projects/dxf-drawing";
const d = readDxfDrawing(fs.readFileSync(process.argv[2]!))!;
const all = flattenDxf(d);
const inBox = (q?: { x: number; y: number }) => !!q && q.x >= -34200 && q.x <= -15900 && q.y >= -36000 && q.y <= -31200;
const ps = all.filter((p) => inBox(p.at ?? p.pts?.[0] ?? p.arc?.c ?? p.circle?.c));
const n = new Map<string, number>();
for (const p of ps) { const k = `${p.layer}|${p.type}|c${p.colour.toString(16)}|${p.path.at(-1) ?? ""}`.slice(0, 70); n.set(k, (n.get(k) ?? 0) + 1); }
console.log([...n].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => `${k}:${v}`).join("\n"));
for (const p of ps) if (p.text && /חזית|^[+\-±]?\s?\d+\.\d\d|קומה|קרקע|שיפוע|גג/.test(p.text)) console.log("T", JSON.stringify(p.text.slice(0, 30)), p.at!.x.toFixed(0), p.at!.y.toFixed(0), p.layer, p.path.at(-1));
