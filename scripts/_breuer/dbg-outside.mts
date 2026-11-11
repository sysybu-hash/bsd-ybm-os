import { readBreuer } from "./read.mts";
import { segmentsOf } from "./grid.mts";
const { storeys } = readBreuer(process.argv[2]!);
for (const id of ["ק", "שיפוע"]) {
  const st = storeys.find((s) => s.id === id)!;
  const plot = st.pieces.find((p) => p.path.includes("גבולות מעודכנים") && p.layer === "gvul" && p.pts && p.pts.length > 3)!.pts!;
  const inP = (q: { x: number; y: number }) => { let c = false; for (let i = 0, j = plot.length - 1; i < plot.length; j = i++) { const a = plot[i]!, b = plot[j]!; if ((a.y > q.y) !== (b.y > q.y) && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
  const L: Record<string, number> = {};
  const T: Record<string, string[]> = {};
  for (const p of st.pieces) {
    if (p.path.some((n) => /A\$C2edb/.test(n))) continue;
    for (const [a, b] of segmentsOf(p)) { const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; if (!inP(m)) L[p.layer] = (L[p.layer] ?? 0) + Math.hypot(b.x - a.x, b.y - a.y) / 100; }
    if (p.text && p.at && !inP(p.at)) (T[p.layer] ??= []).push(p.text);
  }
  console.log(id, Object.entries(L).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v.toFixed(0)}m`).join(" "));
  for (const [k, v] of Object.entries(T)) console.log("   ", k, v.slice(0, 12).join(" | "));
}
