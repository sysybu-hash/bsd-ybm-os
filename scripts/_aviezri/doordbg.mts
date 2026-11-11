import { readAviezri, SHEETS, ELEV_Y0 } from "./read.mts";
const R = readAviezri(process.argv[2]!);
const s = SHEETS.find((x) => x.id === "east")!;
for (const p of R.elev.get("east")!) {
  const q = p.pts ?? p.rings?.flat() ?? (p.arc ? [p.arc.c] : []); if (!q.length) continue;
  const us = q.map((v) => s.along(v.x)), zs = q.map((v) => (v.y - ELEV_Y0) / 100);
  const u0 = Math.min(...us), u1 = Math.max(...us);
  if (u1 < 2550 || u0 > 2850 || Math.max(...zs) < 3.2 || Math.min(...zs) > 6.5) continue;
  console.log(p.layer, p.closed ? "C" : "O", q.length, u0.toFixed(0), u1.toFixed(0), Math.min(...zs).toFixed(2), Math.max(...zs).toFixed(2), p.insert ?? "");
}
