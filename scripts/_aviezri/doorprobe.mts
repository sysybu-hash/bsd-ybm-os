import { readAviezri } from "./read.mts";
const r = readAviezri(process.argv[2]!);
for (const [n, ps] of [["f1", r.f1], ["f2", r.f2]] as const) {
  const arcs = ps.filter((p) => p.arc && !(p as any).overlay);
  const byL = new Map<string, number[]>();
  for (const a of arcs) { const k = a.layer; const l = byL.get(k) ?? []; l.push(Math.round(a.arc!.r)); byL.set(k, l); }
  for (const [k, l] of byL) console.log(n, k, l.sort((a, b) => a - b).join(","));
}
