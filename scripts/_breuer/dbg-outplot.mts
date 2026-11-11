// Survey / site pieces outside the plot on the slope tab: by layer and block, with extents (plot-local cm) and decoded texts.
import { readBreuer } from "./read.mts";
import { segmentsOf } from "./grid.mts";
import { pointInPoly } from "./site.mts";
const { storeys } = readBreuer(process.argv[2]!);
const K = storeys.find((s) => s.id === "ק")!;
const plotP = K.pieces.find((p) => p.layer === "gvul" || /plot/i.test(p.layer));
void plotP;
const dos = (t: string) => [...t].map((ch) => { const c = ch.charCodeAt(0); return c >= 0x80 && c <= 0x9a ? String.fromCharCode(0x5d0 + c - 0x80) : ch; }).reverse().join("");
for (const id of ["שיפוע", "מרתף", "ק"]) {
  const st = storeys.find((s) => s.id === id)!;
  const g = new Map<string, { n: number; x0: number; x1: number; y0: number; y1: number; t: Set<string> }>();
  for (const p of st.pieces) {
    if (!/^(M\d+|C\d+|55|TR_YXZ|h kayam|line up|venta|HEZ-KNISA|kav binyan|B_GRAPHICS_SIGH|ELECTRICITY_WIRE|מודד)$/.test(p.layer)) continue;
    const segs = segmentsOf(p); const pts = segs.flatMap(([a, b]) => [a, b]); if (p.at) pts.push(p.at);
    if (!pts.length) continue;
    const k = `${p.layer} ${p.insert ?? p.type}`;
    const e = g.get(k) ?? { n: 0, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, t: new Set() };
    e.n++; for (const q of pts) { const x = q.x - st.origin.x, y = q.y - st.origin.y; e.x0 = Math.min(e.x0, x); e.x1 = Math.max(e.x1, x); e.y0 = Math.min(e.y0, y); e.y1 = Math.max(e.y1, y); }
    if (p.text) e.t.add(dos(p.text)); for (const a of p.attribs ?? []) if (a.text.trim()) e.t.add(`${a.tag}=${dos(a.text)}`);
    g.set(k, e);
  }
  console.log(`== ${id}`);
  for (const [k, e] of [...g].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k} ×${e.n} x ${e.x0.toFixed(0)}..${e.x1.toFixed(0)} y ${e.y0.toFixed(0)}..${e.y1.toFixed(0)} ${[...e.t].slice(0, 6).join(" | ")}`);
}
void pointInPoly;
