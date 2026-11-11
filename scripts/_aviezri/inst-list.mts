import { readAviezri } from "./read.mts";
import { instancesOf, ptsOf } from "./instances.mts";
const R = readAviezri(process.argv[2]!);
for (const [id, ps] of [["f1", R.f1], ["f2", R.f2]] as const) {
  const ins = instancesOf(ps);
  const by = new Map<string, { n: number; ov: number; depth: number; layers: Set<string>; bb: number[] }>();
  for (const i of ins) {
    const k = i.name; const e = by.get(k) ?? { n: 0, ov: 0, depth: i.path.length, layers: new Set(), bb: [1e9, -1e9, 1e9, -1e9] };
    e.n++; if (i.overlay) e.ov++;
    for (const c of i.children) { e.layers.add(c.layer); for (const p of ptsOf(c)) { e.bb[0] = Math.min(e.bb[0]!, p.x); e.bb[1] = Math.max(e.bb[1]!, p.x); e.bb[2] = Math.min(e.bb[2]!, p.y); e.bb[3] = Math.max(e.bb[3]!, p.y); } }
    by.set(k, e);
  }
  console.log(`=== ${id}: ${ins.length} instances`);
  for (const [k, e] of [...by].sort((a, b) => a[1].depth - b[1].depth)) console.log(`${k.padEnd(28)} ×${e.n} ov${e.ov} d${e.depth} [${[...e.layers].join(" ")}] X${e.bb[0]!.toFixed(0)}..${e.bb[1]!.toFixed(0)} Y${e.bb[2]!.toFixed(0)}..${e.bb[3]!.toFixed(0)}`);
}
