import { readAviezri } from "./read.mts";
const R = readAviezri(process.argv[2]!);
for (const p of R.f1) if ((p.layer === "0" || /mabat_5/i.test(p.layer)) && p.pts && !(p as {overlay?:boolean}).overlay) {
  const xs = p.pts.map((q) => q.x); if (Math.min(...xs) > 0 && Math.max(...xs) < 3145) continue;
  console.log(p.layer, p.closed ? "C" : "O", p.pts.map((q) => `${Math.round(q.x)},${Math.round(q.y)}`).join(" "));
}
