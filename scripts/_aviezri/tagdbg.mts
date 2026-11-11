import { readAviezri } from "./read.mts";
const R = readAviezri(process.argv[2]!);
for (const p of R.f2) { const q = p.rings?.[0] ?? p.pts; if (!q || !/kayam/.test(p.layer)) continue;
  const xs = q.map((v) => v.x), ys = q.map((v) => v.y); if (Math.min(...xs) > 3050 && Math.max(...xs) < 3130 && Math.min(...ys) > 350 && Math.max(...ys) < 420) console.log(p.type, p.layer, p.solid, (p as {overlay?:boolean}).overlay, JSON.stringify(p.path)); }
