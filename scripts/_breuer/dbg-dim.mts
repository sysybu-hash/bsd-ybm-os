import { readBreuer } from "./read.mts";
const { storeys, drawing } = readBreuer(process.argv[2]!);
const a = storeys.find((s) => s.id === "א")!;
const t = a.pieces.find((p) => p.text?.startsWith("u.k") && p.path.at(-1)?.startsWith("*D"))!;
const n = t.path.at(-1)!;
console.log(n, t.path, t.rotation);
for (const p of a.pieces.filter((q) => q.path.at(-1) === n)) console.log(p.type, p.layer, p.text ?? "", JSON.stringify(p.pts?.map((v) => [Math.round(v.x - a.origin.x), Math.round(v.y - a.origin.y)])));
const blk = drawing.blocks.get(n)!; console.log(blk.entities.map((e) => e.type).join(","));
const dims = a.pieces.filter((p) => p.dimension && p.text?.includes("u.k")); console.log(dims.length, dims[0]);
