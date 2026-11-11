// Breuer 21 coverage audit (rule 3): every layer of every storey tab, the elevation band and the survey, by entity kind,
// against what the builder reads. A layer the builder names nowhere is "not read". Free, no model change.
// npx tsx --conditions=react-server scripts/_breuer/audit.mts <main dxf> <out.json>
import fs from "node:fs";
import { readBreuer } from "./read.mts";

const [file, outFile] = process.argv.slice(2);
const { all, storeys } = readBreuer(file!);
const src = ["build.mts", "read.mts", "site.mts", "grid.mts", "tin.mts"].map((f) => fs.readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
// layers the builder reads by name (string literal or inside a regex alternation)
// what is left out on purpose, and why (2026-11-10: "everything except the interior")
const REASONS: Record<string, string> = {
  senitar: "interior (sanitary fittings)", sanitary: "interior (sanitary fittings)", "ריהוט": "interior (furniture)", text: "notes and labels",
  "Text --Remark 1-50": "notes", TXT: "notes", TEXT_KN: "notes", hidden: "hidden lines: behind the cut, not seen", "E11חלון-דלט": "20 cm symbols inside the walls (services), interior",
  "E1אקיר": "20 cm symbols inside the walls (services), interior", Defpoints: "dimension points", "kav binyan": "building line (a limit, not a thing)",
  "HEZ-KNISA": "entrance arrows", B_GRAPHICS_SIGH: "north arrow graphic", "Text": "notes", "55": "survey line outside the plot, no name or height: meaning unknown",
  TR_YXZ: "survey spots: read by block M1502_P", M2801: "survey trees: read by block M2801_E", M2207: "survey: existing building's windows (to be demolished)",
  M2202: "survey: existing columns (to be demolished)", M2220: "survey: existing lift pit marks", M1010: "survey: existing building outline (to be demolished)",
  M2602: "survey: concrete strip round the existing building (to be demolished)", C1660: "survey: parcel lines (the plot is read from gvul)", C1610: "survey control points",
  M2603: "survey: existing item inside the plot", M2601: "survey: existing item inside the plot", M2412: "survey line outside the plot, no name or height: meaning unknown",
  M2417: "survey line outside the plot, no name or height: meaning unknown", M2298: "survey note", "מודד": "surveyor's frame", ELECTRICITY_WIRE: "survey: overhead wires of the existing building",
  venta: "4 vent ellipses inside storey ג (interior)", mabat1: "the elevation view markers drawn outside each plan (4 per storey)",
};
const otherKey = (src.match(/READ_BY_OTHER_KEY = \[([^\]]*)\]/)?.[1] ?? "").split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter(Boolean);
const named = (layer: string) => otherKey.includes(layer) || src.includes(`"${layer}"`) || new RegExp(`[(|^]${layer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[|)$]`).test(src);
const anchor = (p: (typeof all)[number]) => p.at ?? p.pts?.[0] ?? p.arc?.c ?? p.circle?.c ?? p.rings?.[0]?.[0];
// the elevation / section band (memory: x −34200..−7300, y −36000..−31200)
const inElev = (q?: { x: number; y: number }) => !!q && q.x > -34500 && q.x < -7000 && q.y > -36300 && q.y < -31000;
type Row = { region: string; layer: string; kinds: Record<string, number>; total: number; read: boolean; blocks: Record<string, number> };
const rows = new Map<string, Row>();
const add = (region: string, p: (typeof all)[number]) => {
  const k = `${region}\t${p.layer}`;
  const r = rows.get(k) ?? { region, layer: p.layer, kinds: {}, total: 0, read: named(p.layer), blocks: {} };
  const kind = p.text ? "TEXT" : p.dimension ? "DIMENSION" : p.type;
  r.kinds[kind] = (r.kinds[kind] ?? 0) + 1; r.total++;
  const b = p.path[0]; if (b) r.blocks[b] = (r.blocks[b] ?? 0) + 1;
  rows.set(k, r);
};
const seen = new Set<unknown>();
for (const s of storeys) for (const p of s.pieces) { seen.add(p); add(`storey ${s.id}`, p); }
for (const p of all) if (!seen.has(p) && inElev(anchor(p))) { seen.add(p); add("elevations+sections", p); }
let elsewhere = 0; for (const p of all) if (!seen.has(p)) elsewhere++;
const list = [...rows.values()].sort((a, b) => b.total - a.total);
// per layer over all regions
const byLayer = new Map<string, { total: number; read: boolean; regions: Set<string>; kinds: Record<string, number> }>();
for (const r of list) { const e = byLayer.get(r.layer) ?? { total: 0, read: r.read, regions: new Set(), kinds: {} }; e.total += r.total; e.regions.add(r.region); for (const [k, v] of Object.entries(r.kinds)) e.kinds[k] = (e.kinds[k] ?? 0) + v; byLayer.set(r.layer, e); }
const L = [...byLayer.entries()].sort((a, b) => b[1].total - a[1].total);
const tot = L.reduce((s, [, e]) => s + e.total, 0), readTot = L.filter(([, e]) => e.read).reduce((s, [, e]) => s + e.total, 0);
console.log(`pieces in storeys+elevations: ${tot}; on layers the builder reads: ${readTot} (${((100 * readTot) / tot).toFixed(1)}%); outside both regions: ${elsewhere}`);
console.log("\nNOT READ, NO REASON (layer · pieces · kinds · regions):");
for (const [l, e] of L) if (!e.read && !REASONS[l]) console.log(`  ${l} · ${e.total} · ${Object.entries(e.kinds).map(([k, v]) => `${k}:${v}`).join(" ")} · ${[...e.regions].slice(0, 4).join(", ")}${e.regions.size > 4 ? ` +${e.regions.size - 4}` : ""}`);
console.log("\nLEFT OUT ON PURPOSE (layer · pieces — why):");
for (const [l, e] of L) if (!e.read && REASONS[l]) console.log(`  ${l} · ${e.total} — ${REASONS[l]}`);
console.log("\nREAD:");
for (const [l, e] of L) if (e.read) console.log(`  ${l} · ${e.total} · ${Object.entries(e.kinds).map(([k, v]) => `${k}:${v}`).join(" ")}`);
fs.writeFileSync(outFile!, JSON.stringify({ tot, readTot, elsewhere, reasons: REASONS, layers: Object.fromEntries(L.map(([l, e]) => [l, { ...e, regions: [...e.regions] }])), rows: list }, null, 1));
