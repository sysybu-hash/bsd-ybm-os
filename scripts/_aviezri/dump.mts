// Aviezri: what each DXF holds — xref inserts, layouts, per-layer piece counts. npx tsx --conditions=react-server scripts/_aviezri/dump.mts <dxf>
import fs from "node:fs";
import { flattenDxf, readDxfDrawing } from "@/lib/projects/dxf-drawing";
const d = readDxfDrawing(new Uint8Array(fs.readFileSync(process.argv[2]!)))!;
const all = flattenDxf(d);
for (const p of all) if (p.insert && /avi|azri/i.test(p.insert)) console.log("XREF", p.insert, JSON.stringify(p.m), p.path.join(">"));
for (const l of d.layouts) for (const v of l.viewports) console.log("VP", l.name, Math.round(v.centre.x), Math.round(v.centre.y), Math.round(v.width), Math.round(v.height), v.paperWidth.toFixed(0));
const c = new Map<string, Map<string, number>>();
for (const p of all) { const k = p.layer; const m = c.get(k) ?? new Map(); const t = p.type + (p.solid ? "(solid)" : "") ; m.set(t, (m.get(t) ?? 0) + 1); c.set(k, m); }
for (const [k, m] of [...c].sort()) console.log("L", k, [...m].map(([t, n]) => `${t}:${n}`).join(" "), d.layers.get(k)?.off ? "OFF" : "", d.layers.get(k)?.frozen ? "FROZEN" : "");
