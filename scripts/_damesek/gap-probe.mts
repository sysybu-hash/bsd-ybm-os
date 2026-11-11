const G = await import("./plan-grid.mts");
const ps = G.readPieces(process.argv[2]!); const want = new RegExp(process.argv[3]!);
const xs = ps.filter((p) => p.rings && G.WALL_LAYERS.test(p.layer)).flatMap((p) => p.rings!.flat());
const g = G.makeGrid(Math.min(...xs.map((p) => p.x)) - 50, Math.min(...xs.map((p) => p.y)) - 50, Math.max(...xs.map((p) => p.x)) + 50, Math.max(...xs.map((p) => p.y)) + 50);
for (const p of ps) if (p.rings && G.WALL_LAYERS.test(p.layer)) G.fillRings(g, p.rings, Number(/FP_(\d+)/.exec(p.pattern ?? "")?.[1] ?? 9) % 10 || 9);
let cur: string | null = null; let bx = [1e9, 1e9, -1e9, -1e9]; let shown = 0;
const flush = () => {
  if (!cur || shown >= 1) return; shown++;
  console.log(cur, bx.map((v) => v.toFixed(0)).join(","));
  for (let y = bx[3]! + 40; y >= bx[1]! - 40; y -= 5) { let row = ""; for (let x = bx[0]! - 60; x <= bx[2]! + 60; x += 5) { const i = Math.floor((x - g.x0) / 5), j = Math.floor((y - g.y0) / 5); const v = g.a[j * g.nx + i]!; row += v ? String(v) : "."; } console.log(y.toFixed(0).padStart(6), row); }
};
for (const p of ps) {
  if (p.insert && !p.path.length) { flush(); cur = want.test(p.insert) ? p.insert : null; bx = [1e9, 1e9, -1e9, -1e9]; continue; }
  if (cur && p.path[0] === cur) for (const q of p.pts ?? []) { bx[0] = Math.min(bx[0]!, q.x); bx[1] = Math.min(bx[1]!, q.y); bx[2] = Math.max(bx[2]!, q.x); bx[3] = Math.max(bx[3]!, q.y); }
}
flush();
