const G = await import("./plan-grid.mts");
for (const f of process.argv.slice(2)) {
  const ps = G.readPieces(f);
  const c: Record<string, string[]> = {};
  for (const p of ps) { if (!p.rings || !G.WALL_LAYERS.test(p.layer)) continue; const pts = p.rings.flat(); const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y); (c[`${p.layer}:${p.pattern}:${p.path.length ? "blk" : "ms"}`] ??= []).push(`${Math.min(...xs).toFixed(0)},${Math.min(...ys).toFixed(0)}`); }
  console.log("==", f.split(/[\/]/).pop(), Object.entries(c).map(([k, v]) => `${k} ×${v.length}${v.length < 4 ? " [" + v.join(" ") + "]" : ""}`).join(" | "));
}
