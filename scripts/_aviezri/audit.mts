// Coverage audit: every layer of the three DWGs, how many pieces, and what the builder does with it.
import { readAviezri, SHEETS } from "./read.mts";
const R = readAviezri(process.argv[2]!);
const USE: Array<[RegExp, string]> = [
  [/^(Rb_)?kir_(hootz|pnim)$/, "built: walls (grid), elevations: silhouette"],
  [/^Rb_h_(kayam|block)$/, "built: wall hatches close the walls; non-solid kayam = terrace"],
  [/^(Rb_)?ptachim$/, "built: window frames in the walls, elevation openings + panes"],
  [/^Rb_h_mitar$/, "built: door swings → doorways; on the C stair: treads (rebuilt from rings)"],
  [/^R?B?_?mabat_5$|^RB_mabat_5$/i, "built: surrounds, cornices, site edges, C stair rings, door frames"],
  [/^Rb_midot\.?$/, "read: level marks (+3.25/+3.30/+4.40/+7.04/+10.04/+10.73/+11.03/+12.13), dims"],
  [/^Rb_text\.?$|^RB_text$/, "read: names (void, ramp, synthetic grass, stair numbers)"],
  [/^0$/, "built: site lines (bridges, plot band, boundary)"],
  [/^Rb_rihut\.?$/, "NOT built: furniture (pews, tables, ark) — interior only, no interior view yet"],
  [/^Rb_sanitary$/, "NOT built: toilets, basins — interior only"],
  [/^Rb_miflasim$/, "read: section/level marks only (A, B)"],
  [/^Rb_nistar/, "not built: hidden lines (overhead / below) — drawing convention"],
  [/elec/i, "read: hidden LED of the sign (annotation)"],
  [/^Rb_mabat_[123]$/, "read: elevation detail lines inside walls (no separate mass)"],
  [/^Rb_h_harisa$/, "not built, on purpose: demolition hatch (a 1.56 m wall piece in the porch, X 124–280 Y 1630–1656)"],
  [/^Rb_pticha$|^Rb_h_tzeva$|^h_tzeva$/, "elevation fill/opening colour — painted by the look, no mass"],
  [/^Rb_t-inst$|^AM_0$|^_?Defpoints$|^Rb_kir_pnim$/, "construction/dimension helpers — nothing to build"],
];
const tally = (name: string, ps: Array<{ layer: string; overlay?: boolean }>) => {
  const m = new Map<string, number>(); for (const p of ps) m.set(p.layer, (m.get(p.layer) ?? 0) + 1);
  console.log(`\n== ${name}`);
  for (const [l, n] of [...m].sort((a, b) => b[1] - a[1])) console.log(`${l.padEnd(22)} ${String(n).padStart(5)}  ${USE.find(([re]) => re.test(l))?.[1] ?? "?? UNCLASSIFIED"}`);
};
tally("f000 (beit-midrash storey +3.30)", R.f1.filter((p) => !(p as { overlay?: boolean }).overlay));
tally("f100 (gallery storey +7.04)", R.f2.filter((p) => !(p as { overlay?: boolean }).overlay));
tally("main: furniture over F1", R.f1.filter((p) => (p as { overlay?: boolean }).overlay));
tally("main: furniture over F2", R.f2.filter((p) => (p as { overlay?: boolean }).overlay));
for (const s of SHEETS) tally(`main: ${s.title}`, R.elev.get(s.id)!);
