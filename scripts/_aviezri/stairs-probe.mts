import { readAviezri } from "./read.mts";
import { heb } from "./heb.mts";
import { instancesOf, ptsOf } from "./instances.mts";
const R = readAviezri(process.argv[2]!);
const inBox = (b: number[], x0: number, x1: number, y0: number, y1: number) => b[0]! >= x0 && b[1]! <= x1 && b[2]! >= y0 && b[3]! <= y1;
for (const [id, ps] of [["f1", R.f1], ["f2", R.f2]] as const) {
  for (const it of instancesOf(ps)) {
    if (it.overlay) continue;
    const pts = it.children.flatMap(ptsOf); if (!pts.length) continue;
    const b = [Math.min(...pts.map((q) => q.x)), Math.max(...pts.map((q) => q.x)), Math.min(...pts.map((q) => q.y)), Math.max(...pts.map((q) => q.y))];
    const ls = [...new Set(it.children.map((c) => c.layer))];
    if (!ls.some((l) => /mabat_5|nistar_(elyon|tachton)/.test(l)) || ls.some((l) => /ptachim/.test(l))) continue;
    const tx = it.children.filter((c) => c.text).map((c) => heb(c.text!));
    console.log(id, it.name.padEnd(12), ls.join(" ").padEnd(40), b.map((v) => v.toFixed(0)).join(","), tx.join("|"));
  }
}
