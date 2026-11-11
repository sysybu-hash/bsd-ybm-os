import { readBreuer } from "./read.mts";
const { storeys, drawing } = readBreuer(process.argv[2]!);
const a = storeys.find((s) => s.id === "א")!;
const ins = a.pieces.filter((p) => p.type === "INSERT" && p.layer === "opens");
for (const p of ins.slice(0, 5)) {
  const kids = a.pieces.filter((q) => q.pts && q.path.at(-1) === p.insert);
  const xs = kids.flatMap((q) => q.pts!.map((v) => v.x - a.origin.x)), ys = kids.flatMap((q) => q.pts!.map((v) => v.y - a.origin.y));
  const blk = drawing.blocks.get(p.insert!)!;
  console.log(p.insert, "at", (p.at!.x - a.origin.x).toFixed(0), (p.at!.y - a.origin.y).toFixed(0), "m.e,f", (p.m!.e - a.origin.x).toFixed(0), (p.m!.f - a.origin.y).toFixed(0), "a b c d", p.m!.a.toFixed(2), p.m!.b.toFixed(2), p.m!.c.toFixed(2), p.m!.d.toFixed(2), "base", blk.base.x.toFixed(0), blk.base.y.toFixed(0), "kids x", Math.min(...xs).toFixed(0), Math.max(...xs).toFixed(0), "y", Math.min(...ys).toFixed(0), Math.max(...ys).toFixed(0), "n", kids.length);
}
