const G = await import("./plan-grid.mts");
for (const f of ["M-ground", "M-floor1"]) {
  const ps = G.readPieces(process.argv[2]! + "/" + f + ".dxf");
  for (const p of ps) {
    if (!p.rings || !G.WALL_LAYERS.test(p.layer)) continue;
    for (const r of p.rings) {
      const xs = r.map((q) => q.x), ys = r.map((q) => q.y);
      const X0 = Math.min(...xs), X1 = Math.max(...xs), Y0 = Math.min(...ys), Y1 = Math.max(...ys);
      if (Y0 > -690 || X1 < -1500 || X0 > 300) continue;
      console.log(f, X0.toFixed(0), X1.toFixed(0), Y0.toFixed(0), Y1.toFixed(0), r.length);
    }
  }
  for (const p of ps) if (p.text && p.at && p.at.y < -650 && p.at.x > -1500 && p.at.x < 300 && /[א-ת]|^\+/.test(p.text)) console.log(f, "TEXT", p.text, p.at.x.toFixed(0), p.at.y.toFixed(0));
}
