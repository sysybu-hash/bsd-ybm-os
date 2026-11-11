const G = await import("./plan-grid.mts");
for (const f of process.argv.slice(2)) {
  const ps = G.readPieces(f);
  console.log("==", f.split(/[\/]/).pop());
  for (const p of ps) {
    if (!p.rings || !G.WALL_LAYERS.test(p.layer)) continue;
    const pts = p.rings.flat(); const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    if (Math.max(...xs) < 380) continue;
    console.log(p.layer, p.pattern, p.path.join(">").slice(0, 40), `x ${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)} y ${Math.min(...ys).toFixed(0)}..${Math.max(...ys).toFixed(0)} rings ${p.rings.length}`);
  }
}
