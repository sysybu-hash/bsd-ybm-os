const G = await import("./plan-grid.mts");
const ps = G.readPieces(process.argv[2]!);
for (const p of ps) if (p.text && /\d+\.\d\d/.test(p.text) && p.at) console.log(p.layer, p.path[0]?.slice(0, 30) ?? "", JSON.stringify(p.text), p.at.x.toFixed(0), p.at.y.toFixed(0));
