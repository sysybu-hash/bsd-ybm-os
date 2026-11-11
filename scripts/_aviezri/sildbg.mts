import { readAviezri, SHEETS, ELEV_Y0 } from "./read.mts";
const R = readAviezri(process.argv[2]!);
for (const s of SHEETS) {
  const ps = R.elev.get(s.id)!;
  console.log("==", s.id);
  for (const p of ps) { if (!/kir_hootz|mabat_5/i.test(p.layer)) continue; const pts = p.pts; if (!pts) { console.log("nopts", p.layer, Object.keys(p).join(",")); continue; }
    for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i]!, b = pts[i + 1]!; const z = (a.y - ELEV_Y0) / 100; if (Math.abs(a.y - b.y) > 0.5 || Math.abs(a.x - b.x) < 30 || z < 10) continue; console.log(p.layer, z.toFixed(2), Math.round(Math.min(s.along(a.x), s.along(b.x))), Math.round(Math.max(s.along(a.x), s.along(b.x)))); } }
}
