const G = await import("./plan-grid.mts");
const ps = G.readPieces(process.argv[2]!);
const groups = new Map<string, typeof ps>();
for (const p of ps) { const top = p.path[0]; if (!top || !G.OPENING.test(top)) continue; const k = top; (groups.get(k) ?? groups.set(k, []).get(k)!).push(p); }
const inserts = ps.filter((p) => p.insert && G.OPENING.test(p.insert));
console.log("insert markers", inserts.length, "groups", groups.size, "sample marker", JSON.stringify(inserts[0]).slice(0, 300));
console.log("sample child", JSON.stringify(ps.find((p) => p.path.length && G.OPENING.test(p.path[0]!)) ?? null).slice(0, 300));
