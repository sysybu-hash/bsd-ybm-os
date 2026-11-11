import { readAviezri } from "./read.mts";
import { heb } from "./heb.mts";
const R = readAviezri(process.argv[2]!);
for (const [id, ps] of [["f1", R.f1], ["f2", R.f2]] as const) {
  const m = new Map<string, { n: number; w: number; h: number; ex: string; layers: Set<string> }>();
  for (const p of ps) {
    if (!/rihut|sanitary|h_tzeva/i.test(p.layer)) continue;
    const key = `${(p as { overlay?: boolean }).overlay ? "ovl" : "own"}:${p.path?.join(">") ?? p.insert ?? "-"}`;
    const q = p.pts ?? p.rings?.flat() ?? (p.arc ? [p.arc.c] : p.circle ? [p.circle.c] : []);
    const xs = q.map((v) => v.x), ys = q.map((v) => v.y);
    const e = m.get(key) ?? { n: 0, w: 0, h: 0, ex: "", layers: new Set() };
    e.n++; e.layers.add(p.layer); if (q.length) { e.w = Math.max(e.w, Math.max(...xs) - Math.min(...xs)); e.h = Math.max(e.h, Math.max(...ys) - Math.min(...ys)); }
    if (!e.ex && q.length) e.ex = `${Math.round(xs[0]!)},${Math.round(ys[0]!)}`;
    m.set(key, e);
  }
  console.log("==", id);
  for (const [k, e] of [...m].sort((a, b) => b[1].n - a[1].n).slice(0, 60)) console.log(String(e.n).padStart(5), k.slice(0, 70).padEnd(70), Math.round(e.w), Math.round(e.h), e.ex, [...e.layers].join(","));
}
