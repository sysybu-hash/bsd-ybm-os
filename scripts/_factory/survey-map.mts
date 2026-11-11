/**
 * Factory — a map of the survey's site features in the model's frame, with both options' rooms and the plot over them, to see
 * what stands where before building it.
 *   npx tsx --conditions=react-server scripts/_factory/survey-map.mts "<dxf dir>" "<model dir option 1>" "<model dir option 2>" <out.png>
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { flattenDxf, readDxfDrawing, type DxfPiece } from "@/lib/projects/dxf-drawing";

const [dir, m1, m2, out] = process.argv.slice(2) as [string, string, string, string];
const all = flattenDxf(readDxfDrawing(new Uint8Array(fs.readFileSync(path.join(dir, "668-mgr12-220726.dxf"))))!);
const MS = (q: { x: number; y: number }): [number, number] => [q.x - 212000.6, -(q.y - 603508.6)];
const COL: Record<string, string> = {
  M2200: "#1030ff", M2205: "#6080ff", M2221: "#ff2020", M2220: "#ff8080", M2651: "#d00000", M2602: "#00a0d0", M2601: "#00c000",
  M2612: "#70a000", M2401: "#555555", M2404: "#ff00ff", M2408: "#cc5500", M2405: "#cc9900", M2407: "#999999", M2417: "#7700aa",
  M1510: "#00e0e0", M1509: "#ff9000", M1802: "#0000aa", M6332: "#ff0000", M6351: "#ff6600", M4616: "#0000ff", M2812: "#408040",
  M2801: "#30a030", "C-TOPO-MINR1": "#bbbbbb", "C-TOPO-MINR2": "#bbbbbb", "C-TOPO-MINR3": "#dddddd", "C-TOPO-MAJR": "#999999", TR_ANOT_L: "#000000",
};
const S = 9, X0 = -70, Z0 = -60, W = 140 * S, H = 120 * S;
const px = (p: [number, number]) => `${((p[0] - X0) * S).toFixed(1)},${((p[1] - Z0) * S).toFixed(1)}`;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="white"/>`;
const used = new Set<string>();
for (const p of all) {
  const c = COL[p.layer]; if (!c) continue;
  const a = p.at ?? p.pts?.[0] ?? p.arc?.c ?? p.circle?.c; if (!a) continue;
  const q = MS(a); if (q[0] < X0 || q[0] > X0 + 120 || q[1] < Z0 || q[1] > Z0 + 120) continue; // the legend column at x ≈ 57–61 is cut off
  used.add(p.layer);
  const wdt = /TOPO/.test(p.layer) ? 1 : 3;
  if (p.pts) svg += `<polyline points="${p.pts.map((v) => px(MS(v))).join(" ")}${p.closed ? " " + px(MS(p.pts[0]!)) : ""}" fill="none" stroke="${c}" stroke-width="${wdt}"/>`;
  else if (p.type === "INSERT") svg += `<circle cx="${px(q).split(",")[0]}" cy="${px(q).split(",")[1]}" r="6" fill="${c}"/>`;
  if (p.type === "INSERT" && p.attribs?.length) { const h = p.attribs.find((t) => t.tag === "HEIGHT")?.text; if (h) svg += `<text x="${(q[0] - X0) * S + 7}" y="${(q[1] - Z0) * S - 4}" font-size="13" fill="${c}">${h}</text>`; }
  if (p.layer === "TR_ANOT_L" && p.attribs) svg += `<text x="${(q[0] - X0) * S + 7}" y="${(q[1] - Z0) * S}" font-size="16">${p.attribs.map((t) => t.text).join(" ")}</text>`;
}
for (const [m, col] of [[m1, "#00000088"], [m2, "#9900cc88"]] as const) {
  const r = JSON.parse(fs.readFileSync(path.join(m, "report.json"), "utf8"));
  for (const room of [...r.groundRooms]) svg += `<polygon points="${(room.ring as Array<[number, number]>).map(px).join(" ")}" fill="${col.slice(0, 7)}22" stroke="${col}" stroke-width="1.5"/>`;
}
let ly = 20;
for (const l of [...used].sort()) { svg += `<rect x="10" y="${ly - 11}" width="14" height="10" fill="${COL[l]}"/><text x="30" y="${ly}" font-size="14">${l}</text>`; ly += 17; }
svg += `<text x="10" y="${H - 30}" font-size="16">black: option 1 ground rooms · purple: option 2 ground rooms</text></svg>`;
await sharp(Buffer.from(svg)).png().toFile(out);
console.log(out);
