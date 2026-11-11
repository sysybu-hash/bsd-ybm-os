const G = await import("./plan-grid.mts");
const ps = G.readPieces(process.argv[2]!);
const want = new RegExp(process.argv[3]!);
let cur: string | null = null, n = 0;
for (const p of ps) {
  if (p.insert && !p.path.length) { cur = want.test(p.insert) ? p.insert : null; if (cur) { n++; if (n > 1) break; console.log("INSERT", p.insert, p.at); } continue; }
  if (!cur || p.path[0] !== cur) continue;
  const pts = p.pts ?? p.rings?.flat() ?? [];
  if (!pts.length) continue;
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  console.log(p.type.padEnd(10), p.layer.padEnd(12), `x ${Math.min(...xs).toFixed(1)}..${Math.max(...xs).toFixed(1)} y ${Math.min(...ys).toFixed(1)}..${Math.max(...ys).toFixed(1)}`, p.arc ? `arc r=${p.arc.r.toFixed(1)} c=${p.arc.c.x.toFixed(1)},${p.arc.c.y.toFixed(1)}` : "", p.pattern ?? "", p.colour.toString(16));
}
