import { readAviezri } from "./read.mts";
const R = readAviezri(process.argv[2]!);
for (const p of R.f1) if (/harisa|mabat_1$/.test(p.layer)) { const q = p.pts ?? p.rings?.flat() ?? []; const xs = q.map((v) => v.x), ys = q.map((v) => v.y);
  console.log(p.layer, p.rings ? `hatch solid=${!!p.solid} rings=${p.rings.length}` : "line", [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map(Math.round).join(",")); }
