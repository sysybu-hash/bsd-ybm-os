/**
 * Factory — coverage audit: every top-level piece of the four DXFs, by file / layer / type, and whether the builder reads that layer.
 *   npx tsx --conditions=react-server scripts/_factory/audit.mts "<dxf dir>" <1|2>
 * For the plan files only the chosen option's pieces count (the same x band the builder uses).
 */
import fs from "node:fs";
import path from "node:path";
import { flattenDxf, readDxfDrawing, type DxfPiece } from "@/lib/projects/dxf-drawing";

const [dir, optArg] = process.argv.slice(2) as [string, string];
const OPT = Number(optArg);
const X0 = 21150000;
const inOption = (q: { x: number }) => { const rx = (q.x - X0) / 100; return OPT === 1 ? rx > 440 && rx < 560 : rx > 580 && rx < 660; };
const anchor = (p: DxfPiece) => p.at ?? p.pts?.[0] ?? p.rings?.[0]?.[0] ?? p.arc?.c ?? p.circle?.c;
// what the builder reads, per file: layer (and optionally insert name / type) → how
const PLAN: Array<[RegExp, (p: DxfPiece) => boolean, string]> = [
  [/^00-WL$/, (p) => !!p.pts, "shell outline (+ the terrace ring)"],
  [/^00-WL pnimi$/, (p) => !!p.pts, "rooms (closed) / corridor walls (open)"],
  [/.*/, (p) => p.type === "INSERT" && /^(stairs|elevator|oven|00-delet.*|entrance)$/.test(p.insert ?? ""), "blocks: stairs, lifts, ovens, entrance doors, arrows"],
  [/^0$/, (p) => !!p.text, "room / truck labels"],
  [/^00-hatch$/, () => true, "hatches — counted, dropped (reported)"],
  [/^00-HIDDEN$/, () => true, "hidden lines — counted, dropped (reported)"],
];
const AXES: Array<[RegExp, (p: DxfPiece) => boolean, string]> = [];
const SURVEY: Array<[RegExp, (p: DxfPiece) => boolean, string]> = [
  [/.*/, (p) => p.type === "INSERT" && p.insert === "M1502_P", "spot heights → ground"],
  [/.*/, (p) => p.type === "INSERT" && p.insert === "M2801_E", "trees"],
  [/^C-TOPO/, (p) => !!p.pts, "contours — counted, dropped (reported)"],
];
AXES.push([/^00-m-cahol$/, (p) => !!p.pts && !!p.closed, "plot line"], [/^00-m-adom$/, (p) => !!p.rings, "approved road surface"], [/^00-m-tzaov$/, (p) => !!p.rings, "open public space surface"]);
SURVEY.push([/^0$/, (p) => p.type === "ATTRIB", "attributes of the spot / tree blocks (their HEIGHT etc.)"]);
// site features (builder, 2026-11-10): by the survey legend's codes
SURVEY.push(
  [/^M2200$|^M2205$|^M2221$|^M2220$/, () => true, "existing buildings / sheds, roof and floor levels"],
  [/^M2602$|^M2651$/, () => true, "walls and their top levels"], [/^M2601$/, () => true, "fence"], [/^M2612$/, () => true, "gates"],
  [/^M2404$|^M2408$|^M2401$|^M2405$|^M2407$/, () => true, "kerbs, paving, asphalt edges, concrete"],
  [/^M1510$|^M1509$/, () => true, "slope top / foot (painted)"], [/^M6332$|^M6351$/, () => true, "poles and the overhead line"],
  [/^M4616$/, () => true, "water riser"], [/^M2812$/, () => true, "rocks"], [/^TR_ANOT_L$/, () => true, "notes naming the sheds / fence"],
  [/^M1802$|^MIG-NUM$|^Mcellno$|^Mrozeta$|^M1280$|^TR_GIL|^declaration$|^0$|^M10|^C16|^M18|^M1502$|^M6091$|^M6241$|^M2207$|^M2417$|^M4001$|^M4010$|^M4615$|^M4801$|^M4804$|^M6331$|^M2221$|^C-TOPO/, () => true, "paper / legend samples: tallied, nothing to build"],
);
AXES.push([/^00-mabat$/, () => true, "survey road edges, copied (built from the survey)"], [/^0$/, (p) => !!p.closed || !!p.text, "hatch borders / place names"], [/^00-m-adom$/, (p) => !!p.pts, "building line (paper)"], [/^00-help$/, () => true, "drafting helper (paper)"]);
PLAN.push([/^0$/, (p) => !!p.pts && !p.closed, "truck-route arrows"], [/^00-DIM/, () => true, "dimensions (paper; the 1:200 scale was checked against them by the overlay)"]);

const files: Array<[string, typeof PLAN, boolean]> = [
  ["komat karka_Delicatess-Kiryat Arba.dxf", PLAN, true],
  ["koma 1_Delicatess-Kiryat Arba.dxf", PLAN, true],
  ["AXES_Delicatess-Kiryat Arba.dxf", AXES, false],
  ["668-mgr12-220726.dxf", SURVEY, false],
];
for (const [f, rules, byOpt] of files) {
  const all = flattenDxf(readDxfDrawing(new Uint8Array(fs.readFileSync(path.join(dir, f))))!).filter((p) => p.path.length === 0);
  const mine = byOpt ? all.filter((p) => { const a = anchor(p); return !!a && inOption(a); }) : all;
  const far = (p: DxfPiece) => { if (byOpt) return false; const a = anchor(p); if (!a) return false; const k = f.startsWith("668") ? 100 : 1; const rx = (a.x * k - X0) / 100, ry = (a.y * k - 60350860) / 100; return Math.hypot(rx - 500, ry) > 400; };
  const groups = new Map<string, { n: number; how: string; ex: string[] }>();
  for (const p of mine) {
    const rule = far(p) ? [/x/, () => true, "OUTSIDE the site (> 400 m away: sheet library / title block)"] as const : rules.find(([re, ok]) => re.test(p.layer) && ok(p));
    const k = `${p.layer} | ${p.type}${p.insert ? ` ${p.insert}` : ""}`;
    const g = groups.get(k) ?? { n: 0, how: rule ? rule[2] : "NOT READ", ex: [] };
    g.n++; if (p.text && g.ex.length < 4 && !g.ex.includes(p.text)) g.ex.push(p.text);
    groups.set(k, g);
  }
  const read = [...groups.values()].filter((g) => g.how !== "NOT READ").reduce((a, g) => a + g.n, 0);
  console.log(`\n=== ${f}${byOpt ? ` (option ${OPT})` : ""}: ${mine.length} pieces, ${read} on read layers, ${mine.length - read} not read`);
  for (const [k, g] of [...groups].sort((a, b) => (a[1].how === "NOT READ" ? 0 : 1) - (b[1].how === "NOT READ" ? 0 : 1) || b[1].n - a[1].n)) {
    console.log(`  ${g.how === "NOT READ" ? "✗" : "✓"} ${k.padEnd(48)} ${String(g.n).padStart(5)}  ${g.how}${g.ex.length ? `  e.g. ${g.ex.map((t) => `"${t.slice(0, 30)}"`).join(", ")}` : ""}`);
  }
}
