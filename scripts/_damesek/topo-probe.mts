const G = await import("./plan-grid.mts");
const { readDxfDrawing } = await import("@/lib/projects/dxf-drawing");
import fs from "node:fs";
for (const f of process.argv.slice(2)) {
  const d = readDxfDrawing(fs.readFileSync(f))!;
  const ents = d.entities.filter((e) => e.values[e.codes.indexOf(8)] === "C-TOPO" || /TOPO|SITE|L-/.test(e.values[e.codes.indexOf(8)] ?? ""));
  const c: Record<string, number> = {};
  for (const e of ents) { const k = e.type + ":" + e.values[e.codes.indexOf(8)]; c[k] = (c[k] ?? 0) + 1; }
  console.log("==", f.split(/[\/]/).pop(), JSON.stringify(c));
  const z = new Set<string>();
  for (const e of ents.slice(0, 400)) { for (const code of [30, 38]) { const i = e.codes.indexOf(code); if (i >= 0) z.add(e.values[i]!.trim()); } }
  console.log("z values", [...z].slice(0, 30).join(" "));
  const ps = G.readPieces(f).filter((p) => /TOPO|SITE/.test(p.layer));
  const texts = ps.filter((p) => p.text).map((p) => p.text).slice(0, 30);
  console.log("pieces", ps.length, "texts", texts.join(" | "));
}
