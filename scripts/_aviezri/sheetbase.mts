import { readAviezri, SHEETS } from "./read.mts";
const R = readAviezri(process.argv[2]!);
for (const s of SHEETS) {
  const ps = R.elev.get(s.id)!;
  const hz = new Map<number, { n: number; len: number; layers: Set<string> }>();
  for (const p of ps) { if (!p.pts) continue; for (let i = 0; i + 1 < p.pts.length; i++) { const a = p.pts[i]!, b = p.pts[i + 1]!; if (Math.abs(a.y - b.y) > 0.5 || Math.abs(a.x - b.x) < 300) continue; const k = Math.round(a.y); const e = hz.get(k) ?? { n: 0, len: 0, layers: new Set() }; e.n++; e.len += Math.abs(a.x - b.x); e.layers.add(p.layer); hz.set(k, e); } }
  console.log("==", s.id);
  for (const [k, e] of [...hz].sort((a, b) => a[0] - b[0])) console.log(k, ((k + 11519) / 100).toFixed(2), e.n, e.len.toFixed(0), [...e.layers].join(","));
}
