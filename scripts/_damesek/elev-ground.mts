const G = await import("./plan-grid.mts");
const ps = G.readPieces(process.argv[2]!);
const c: Record<string, { n: number; x0: number; x1: number; y0: number; y1: number; pat: Set<string> }> = {};
for (const p of ps) {
  if (!p.rings) continue;
  const q = p.rings.flat(); const k = p.layer + (p.path.length ? ">blk" : "");
  const r = (c[k] ??= { n: 0, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, pat: new Set() });
  r.n++; r.pat.add(p.pattern ?? ""); for (const v of q) { r.x0 = Math.min(r.x0, v.x); r.x1 = Math.max(r.x1, v.x); r.y0 = Math.min(r.y0, v.y); r.y1 = Math.max(r.y1, v.y); }
}
for (const [k, r] of Object.entries(c)) console.log(k.padEnd(20), r.n, `x ${r.x0.toFixed(0)}..${r.x1.toFixed(0)} y ${r.y0.toFixed(0)}..${r.y1.toFixed(0)}`, [...r.pat].slice(0, 5).join(","));
const lines = ps.filter((p) => /TOPO/.test(p.layer) && p.pts);
console.log("topo lines", lines.length, lines.slice(0, 8).map((p) => p.pts!.map((v) => `${v.x.toFixed(0)},${v.y.toFixed(0)}`).join(" ")).join(" | "));
