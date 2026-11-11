import { readAviezri, anchor } from "./read.mts";
const R = readAviezri(process.argv[2]!);
for (const [id, ps] of [["f1", R.f1], ["f2", R.f2]] as const) {
  const m = new Map<string, { n: number; x0: number; x1: number; y0: number; y1: number; kinds: Set<string> }>();
  for (const p of ps) {
    const pts = p.pts ?? p.rings?.flat() ?? (p.arc ? [p.arc.c] : p.at ? [p.at] : p.circle ? [p.circle.c] : []);
    if (!pts.length) continue;
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    const out = Math.min(...xs) < -20 || Math.max(...xs) > 3165 || Math.min(...ys) < -20 || Math.max(...ys) > 3083;
    const inT = Math.min(...xs) > 2480 && Math.min(...ys) > 1080 && Math.max(...ys) < 2960; // the terrace
    if (!out && !inT) continue;
    const k = `${(p as {overlay?:boolean}).overlay ? "ovl:" : ""}${p.layer}${inT && !out ? " [terrace]" : ""}`;
    const e = m.get(k) ?? { n: 0, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, kinds: new Set() };
    e.n++; e.x0 = Math.min(e.x0, ...xs); e.x1 = Math.max(e.x1, ...xs); e.y0 = Math.min(e.y0, ...ys); e.y1 = Math.max(e.y1, ...ys);
    e.kinds.add(p.insert ? "ins:" + p.insert : p.arc ? "arc" : p.rings ? "hatch" : p.text ? "text" : p.circle ? "circle" : "line"); m.set(k, e);
  }
  console.log("==", id);
  for (const [k, e] of [...m].sort()) console.log(k.padEnd(34), String(e.n).padStart(4), [e.x0, e.x1, e.y0, e.y1].map(Math.round).join(","), [...e.kinds].slice(0, 5).join(" "));
}
