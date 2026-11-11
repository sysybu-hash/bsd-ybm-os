import { readAviezri } from "./read.mts";
import { instancesOf, inv, ap, ptsOf } from "./instances.mts";
const R = readAviezri(process.argv[2]!);
const ins = instancesOf(R.f2);
const t = ins.find((i) => i.name === "A$C54296138")!; const mi = inv(t.m);
const chairs = ins.filter((i) => i.name === "ch3" && i.path[i.path.length - 1] === "A$C54296138").slice(0, 6);
for (const c of chairs) for (const k of c.children) console.log(c.m.e.toFixed(0), c.m.f.toFixed(0), k.layer, k.pts!.length, ptsOf(k).map((q) => ap(mi, q)).map((q) => `${q.x.toFixed(0)},${q.y.toFixed(0)}`).join(" "));
