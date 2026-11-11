// Block instances in the flattened order: an INSERT piece is followed by its children (dxf-drawing flattenDxf).
import type { DxfPiece, Pt } from "@/lib/projects/dxf-drawing";
export type Inst = { name: string; path: string[]; m: NonNullable<DxfPiece["m"]>; children: DxfPiece[]; overlay: boolean };
export function instancesOf(ps: DxfPiece[]): Inst[] {
  const out: Inst[] = []; const stack: Inst[] = [];
  for (const p of ps) {
    while (stack.length) { const t = stack[stack.length - 1]!; const d = t.path.length; if (p.path.length > d && p.path[d] === t.name && p.path.slice(0, d).join("|") === t.path.join("|")) break; stack.pop(); }
    for (const t of stack) t.children.push(p);
    if (p.insert && p.m) { const it: Inst = { name: p.insert, path: p.path, m: p.m, children: [], overlay: !!(p as { overlay?: boolean }).overlay }; out.push(it); stack.push(it); }
  }
  return out;
}
export const inv = (m: Inst["m"]) => { const det = m.a * m.d - m.b * m.c; return { a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det, e: (m.c * m.f - m.d * m.e) / det, f: (m.b * m.e - m.a * m.f) / det }; };
export const ap = (m: Inst["m"], p: Pt): Pt => ({ x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f });
export const ptsOf = (p: DxfPiece): Pt[] => p.pts ?? p.rings?.flat() ?? (p.arc ? [p.arc.c] : p.circle ? [p.circle.c] : p.at ? [p.at] : []);
