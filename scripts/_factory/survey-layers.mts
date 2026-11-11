/**
 * Factory — what each survey layer is: the survey sheet's own legend (its sample lines / symbols beside their Hebrew names) gives
 * code → name; then every layer's pieces near the site: count, kinds, length, extent, texts (DOS Hebrew decoded).
 *   npx tsx --conditions=react-server scripts/_factory/survey-layers.mts "<dxf dir>"
 */
import fs from "node:fs";
import path from "node:path";
import { flattenDxf, readDxfDrawing, type DxfPiece } from "@/lib/projects/dxf-drawing";

const [dir] = process.argv.slice(2) as [string];
const all = flattenDxf(readDxfDrawing(new Uint8Array(fs.readFileSync(path.join(dir, "668-mgr12-220726.dxf"))))!);
// DOS Hebrew (cp862: 0x80 = א … 0x9A = ת) arrives as cp1252 glyphs or raw C1 code points; reversed (visual order)
const CP1252 = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ";
const heb = (s: string) => {
  let out = "", hit = false;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    let b = -1;
    if (c >= 0x80 && c <= 0x9f) b = c; else { const i = CP1252.indexOf(ch); if (i >= 0) b = 0x80 + i; }
    if (b >= 0x80 && b <= 0x9a) { out += String.fromCodePoint(0x5d0 + (b - 0x80)); hit = true; } else out += ch;
  }
  return hit ? [...out].reverse().join("") : s;
};
const anchor = (p: DxfPiece) => p.at ?? p.pts?.[0] ?? p.rings?.[0]?.[0] ?? p.arc?.c ?? p.circle?.c;
const X0 = 211500, Y0 = 603508.6;
const rel = (q: { x: number; y: number }) => ({ x: q.x - X0, y: q.y - Y0 });
const len = (p: DxfPiece) => { const v = p.pts ?? []; let s = 0; for (let i = 1; i < v.length; i++) s += Math.hypot(v[i]!.x - v[i - 1]!.x, v[i]!.y - v[i - 1]!.y); return s; };

// ---- the legend: texts in the legend column, each with the nearest non-text piece to its left ----
const texts = all.filter((p) => p.text && p.at);
const leg = texts.find((p) => heb(p.text!).includes("מקרא"));
if (leg) {
  const L = leg.at!;
  console.log(`legend title at ${rel(L).x.toFixed(1)}, ${rel(L).y.toFixed(1)}`);
  const rows = texts.filter((p) => Math.abs(p.at!.x - L.x) < 40 && p.at!.y < L.y && p.at!.y > L.y - 200).sort((a, b) => b.at!.y - a.at!.y);
  const samples = all.filter((p) => !p.text && p.type !== "ATTRIB" && anchor(p));
  for (const t of rows) {
    const near = samples.map((p) => ({ p, d: Math.hypot(anchor(p)!.x - t.at!.x, (anchor(p)!.y - t.at!.y) * 2) })).filter((x) => x.d < 25).sort((a, b) => a.d - b.d).slice(0, 3);
    console.log(`  ${heb(t.text!).padEnd(24)} ← ${near.map((x) => `${x.p.layer}/${x.p.type}${x.p.insert ? ":" + x.p.insert : ""} (${x.d.toFixed(1)})`).join(", ")}`);
  }
}
// ---- every layer near the site ----
const near = all.filter((p) => { const a = anchor(p); if (!a) return false; const r = rel(a); return Math.hypot(r.x - 500, r.y) < 400; });
const by = new Map<string, DxfPiece[]>();
for (const p of near) by.set(p.layer, [...(by.get(p.layer) ?? []), p]);
console.log(`\n${near.length} pieces near the site, ${by.size} layers`);
for (const [layer, ps] of [...by].sort((a, b) => b[1].length - a[1].length)) {
  const kinds = new Map<string, number>(); for (const p of ps) { const k = p.type + (p.insert ? ":" + p.insert : ""); kinds.set(k, (kinds.get(k) ?? 0) + 1); }
  const xs = ps.map((p) => rel(anchor(p)!).x), ys = ps.map((p) => rel(anchor(p)!).y);
  const tx = [...new Set(ps.filter((p) => p.text).map((p) => heb(p.text!)))].slice(0, 6);
  const at = [...new Set(ps.flatMap((p) => (p.attribs ?? []).map((a) => `${a.tag}=${heb(a.text)}`)))].slice(0, 4);
  console.log(`${layer.padEnd(14)} ${String(ps.length).padStart(4)}  ${[...kinds].map(([k, n]) => `${k}×${n}`).join(" ")}  len ${ps.reduce((s, p) => s + len(p), 0).toFixed(0)} m  x ${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)} y ${Math.min(...ys).toFixed(0)}..${Math.max(...ys).toFixed(0)}  #${ps[0]!.colour.toString(16).padStart(6, "0")}${tx.length ? `  "${tx.join('" "')}"` : ""}${at.length ? `  [${at.join(", ")}]` : ""}`);
}
