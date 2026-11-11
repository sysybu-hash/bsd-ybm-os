// scratch: loose (not in a block) entities of the layers the audit lists as unread — grouped into clusters with their extent
import path from "node:path";
const G = await import("./plan-grid.mts");
const D = process.argv[2]!, LAY = new RegExp(process.argv[3]!);
for (const f of ["M-ground", "M-floor1", "M-floor2", "M-floor3", "M-roof"]) {
  const ps = G.readPieces(path.join(D, f + ".dxf")).filter((p) => !p.path.length && !p.insert && LAY.test(p.layer));
  const cl: Array<{ layer: string; x0: number; x1: number; y0: number; y1: number; n: number; kinds: Set<string>; txt: string }> = [];
  for (const p of ps) {
    const pts = p.pts ?? p.rings?.flat() ?? (p.arc ? [p.arc.c] : p.at ? [p.at] : []);
    if (!pts.length) continue;
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y), b = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    const c = cl.find((c2) => c2.layer === p.layer && b.x0 < c2.x1 + 30 && b.x1 > c2.x0 - 30 && b.y0 < c2.y1 + 30 && b.y1 > c2.y0 - 30);
    if (c) { c.x0 = Math.min(c.x0, b.x0); c.x1 = Math.max(c.x1, b.x1); c.y0 = Math.min(c.y0, b.y0); c.y1 = Math.max(c.y1, b.y1); c.n++; c.kinds.add(p.type); if (p.text) c.txt += p.text + " "; }
    else cl.push({ layer: p.layer, ...b, n: 1, kinds: new Set([p.type]), txt: p.text ? p.text + " " : "" });
  }
  for (const c of cl) console.log(f, c.layer, `n${c.n}`, [...c.kinds].join("/"), `X${c.x0.toFixed(0)}..${c.x1.toFixed(0)} Y${c.y0.toFixed(0)}..${c.y1.toFixed(0)}`, c.txt.slice(0, 40));
}
