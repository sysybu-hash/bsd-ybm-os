import { readBreuer } from "./read.mts";
import { buildGrid, CELL, segmentsOf } from "./grid.mts";
import type { Pt } from "@/lib/projects/dxf-drawing";
const [file, tab, xs, ys] = process.argv.slice(2);
const { storeys } = readBreuer(file!);
const st = storeys.find((s) => s.id === tab)!; const o = st.origin; const L = (q: Pt) => ({ x: q.x - o.x, y: q.y - o.y });
const segs: Array<[Pt, Pt]> = [];
for (const p of st.pieces) { if (!/^(wall|wall2)$/.test(p.layer) || p.text || p.dimension || p.path.some((n) => /^A\$C2edb|גבולות מעודכנים|מפלס כולל רחוב|צפון-2|^\*D|DIM/.test(n))) continue; for (const [a, b] of segmentsOf(p)) segs.push([L(a), L(b)]); }
const plotPts = st.pieces.filter((p) => p.path.includes("גבולות מעודכנים") && p.pts && p.pts.length > 3).flatMap((p) => p.pts!.map(L));
const bx = { x0: Math.min(...plotPts.map((q) => q.x)), y0: Math.min(...plotPts.map((q) => q.y)), x1: Math.max(...plotPts.map((q) => q.x)), y1: Math.max(...plotPts.map((q) => q.y)) };
const g = buildGrid(segs.filter(([a, b]) => [a, b].every((q) => q.x >= bx.x0 - 50 && q.x <= bx.x1 + 50 && q.y >= bx.y0 - 50 && q.y <= bx.y1 + 50)), bx);
const y = Number(ys);
let row = "";
for (let x = Number(xs) - 60; x <= Number(xs) + 120; x += CELL) { const i = Math.floor((x - g.x0) / CELL), j = Math.floor((y - g.y0) / CELL); const k = j * g.nx + i; const r = g.region[k]!; row += g.line[k] ? "#" : g.outside[k] ? "." : r ? (g.regionDepth[r]! <= 3 ? "t" : "R") : "?"; }
console.log(row);
// open-window pieces near
for (const p of st.pieces) { if (!/^(open windows|opens)$/.test(p.layer)) continue; const q = p.pts?.[0] ?? p.at; if (!q) continue; const a = L(q); if (Math.abs(a.x - Number(xs)) < 80 && Math.abs(a.y - y) < 120) console.log(p.layer, p.type, p.path.join(">"), a.x.toFixed(0), a.y.toFixed(0)); }
