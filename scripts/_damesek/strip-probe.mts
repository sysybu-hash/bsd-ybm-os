const G = await import("./plan-grid.mts");
const ps = G.readPieces(process.argv[2]!); const [e0, e1] = [+process.argv[3]!, +process.argv[4]!];
const c: Record<string, number[]> = {};
for (const p of ps) { const pts = p.pts ?? p.rings?.flat() ?? []; if (!pts.length) continue; const xs = pts.map((q) => q.x); if (Math.min(...xs) < e0 || Math.max(...xs) > e1) continue; const k = `${p.layer}|${(p.path[0] ?? "").slice(0, 30)}`; const ys = pts.map((q) => q.y); (c[k] ??= [1e9, -1e9]); c[k]![0] = Math.min(c[k]![0]!, ...ys); c[k]![1] = Math.max(c[k]![1]!, ...ys); }
for (const [k, v] of Object.entries(c)) console.log(k, v.map((x) => x.toFixed(0)).join(".."));
