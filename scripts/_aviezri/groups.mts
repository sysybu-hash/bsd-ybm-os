import { readAviezri } from "./read.mts";
import { ptsOf } from "./instances.mts";
const R = readAviezri(process.argv[2]!);
for (const [id, ps] of [["f1", R.f1], ["f2", R.f2]] as const) {
  const m = new Map<string, { n: number; bb: number[]; ov: boolean }>();
  for (const p of ps) { if (!/rihut|sanitary|tzeva|t-inst/.test(p.layer)) continue; const k = (p as {overlay?:boolean}).overlay ? "OV>" + p.path.slice(0, 2).join(">") : p.path.slice(0, 1).join(">") + " |" + p.layer;
    const e = m.get(k) ?? { n: 0, bb: [1e9, -1e9, 1e9, -1e9], ov: false }; e.n++; for (const q of ptsOf(p)) { e.bb[0] = Math.min(e.bb[0]!, q.x); e.bb[1] = Math.max(e.bb[1]!, q.x); e.bb[2] = Math.min(e.bb[2]!, q.y); e.bb[3] = Math.max(e.bb[3]!, q.y); } m.set(k, e); }
  console.log("==", id); for (const [k, e] of m) if (!k.startsWith("OV")) console.log(k.padEnd(40), e.n, e.bb.map((v) => v.toFixed(0)).join(","));
}
