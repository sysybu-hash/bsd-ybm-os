// Factory — the site file (AXES) and the survey: plot lines, roads, spot heights and their attributes.
//   npx tsx --conditions=react-server scripts/_factory/dump-site.mts <AXES dxf> <survey dxf>
import fs from "node:fs";
import { flattenDxf, readDxfDrawing } from "@/lib/projects/dxf-drawing";

const [axesF, surveyF] = process.argv.slice(2) as [string, string];
const X0 = 21150000;
const fmt = (q?: { x: number; y: number }) => (q ? `${((q.x - X0) / 100).toFixed(1)},${(q.y / 100).toFixed(1)}` : "?");
const ax = flattenDxf(readDxfDrawing(new Uint8Array(fs.readFileSync(axesF)))!);
console.log("--- AXES top-level geometry (x/100 - 211500, y/100) ---");
for (const p of ax) {
  if (p.path.length || p.layer === "0" && p.type === "INSERT") continue;
  if (p.pts) console.log(`${p.layer} ${p.type} closed=${p.closed} n=${p.pts.length} ${p.pts.slice(0, 12).map(fmt).join(" ")}`);
  else if (p.rings) console.log(`${p.layer} ${p.type} rings=${p.rings.length} n0=${p.rings[0]?.length} ${p.rings[0]?.slice(0, 10).map(fmt).join(" ")} solid=${p.solid} pattern=${p.pattern}`);
  else if (p.text) console.log(`${p.layer} TEXT "${p.text}" at ${fmt(p.at)}`);
}
const sv = flattenDxf(readDxfDrawing(new Uint8Array(fs.readFileSync(surveyF)))!);
console.log("--- survey (metres ITM; shown as cm-frame /100) ---");
const tags = new Map<string, number>();
let shown = 0;
const xs: number[] = [], ys: number[] = [];
for (const p of sv) {
  if (p.type === "INSERT" && p.insert === "M1502_P") {
    for (const a of p.attribs ?? []) tags.set(a.tag, (tags.get(a.tag) ?? 0) + 1);
    if (p.at) { xs.push(p.at.x); ys.push(p.at.y); }
    if (shown++ < 6) console.log(`M1502_P at ${p.at?.x.toFixed(2)},${p.at?.y.toFixed(2)} attribs ${JSON.stringify(p.attribs)}`);
  }
}
console.log("spot tags", JSON.stringify([...tags]), "x", Math.min(...xs).toFixed(1), Math.max(...xs).toFixed(1), "y", Math.min(...ys).toFixed(1), Math.max(...ys).toFixed(1));
const byL = new Map<string, number>();
for (const p of sv) if (/^C-TOPO|M1802/.test(p.layer) && p.pts) { byL.set(p.layer, (byL.get(p.layer) ?? 0) + 1); }
console.log("contour layers", JSON.stringify([...byL]));
for (const p of sv.filter((p) => /^C-TOPO-MAJR|M1802/.test(p.layer) && p.pts).slice(0, 4)) console.log(p.layer, p.type, "n", p.pts!.length, "first", JSON.stringify(p.pts![0]));
for (const p of sv.filter((p) => /^C-TOPO/.test(p.layer) && p.text)) console.log("contour label", p.text, JSON.stringify(p.at));
const others = new Map<string, number>();
for (const p of sv) if (p.type === "INSERT" && p.path.length === 0) others.set(`${p.insert}@${p.layer}`, (others.get(`${p.insert}@${p.layer}`) ?? 0) + 1);
console.log("survey inserts", JSON.stringify([...others]));
for (const p of sv) if (p.type === "INSERT" && /M2801_E|M6332_E|M2401_A|M2408_A/.test(p.insert ?? "") && p.path.length === 0) { console.log(p.insert, JSON.stringify(p.attribs), p.at?.x.toFixed(1), p.at?.y.toFixed(1)); break; }
