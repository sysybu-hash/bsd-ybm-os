/** Openings as the four elevation drawings show them (model space, cm). Usage: <dxf> [json-out] */
import fs from "node:fs";
import { flattenDxf, readDxfDrawing } from "@/lib/projects/dxf-drawing";
export const ELEVS = [
  { sheet: "צפון", x0: -32900, x1: -29700 },
  { sheet: "מזרח", x0: -29400, x1: -26300 },
  { sheet: "דרום", x0: -24900, x1: -21600 },
  { sheet: "מערב", x0: -20900, x1: -17400 },
] as const;
export const Y0 = -34503; // ±0.00
export type ElevOpening = { sheet: string; x0: number; x1: number; z0: number; z1: number; n: number };
export function readElevOpenings(file: string): ElevOpening[] {
  const d = readDxfDrawing(fs.readFileSync(file))!;
  const ps = flattenDxf(d).filter((p) => /^(open windows|opens|open door)$/.test(p.layer) && !p.text && (p.pts || p.arc));
  const out: ElevOpening[] = [];
  for (const e of ELEVS) {
    const boxes: Array<{ x0: number; x1: number; y0: number; y1: number; n: number }> = [];
    for (const p of ps) {
      const q = p.pts ?? [];
      if (!q.length) continue;
      const xs = q.map((v) => v.x), ys = q.map((v) => v.y);
      const b = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), n: 1 };
      if (b.x0 < e.x0 || b.x1 > e.x1 || b.y0 < -35300 || b.y1 > -31300) continue;
      boxes.push(b);
    }
    // one symbol's pieces (frame, sashes, sill board) touch and share most of the narrower one's width; two symbols drawn over
    // each other share less, and stay two openings
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < boxes.length && !merged; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!, b = boxes[j]!;
        const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        if (ox >= 0.8 * Math.min(a.x1 - a.x0, b.x1 - b.x0) && a.y0 <= b.y1 + 2 && b.y0 <= a.y1 + 2) {
          boxes[i] = { x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1), n: a.n + b.n };
          boxes.splice(j, 1); merged = true; break;
        }
      }
    }
    for (const b of boxes) if (b.x1 - b.x0 >= 30 && b.y1 - b.y0 >= 30) out.push({ sheet: e.sheet, x0: Math.round(b.x0), x1: Math.round(b.x1), z0: +((b.y0 - Y0) / 100).toFixed(2), z1: +((b.y1 - Y0) / 100).toFixed(2), n: b.n });
  }
  return out;
}
if (process.argv[1]?.endsWith("elev-openings.mts")) {
  const r = readElevOpenings(process.argv[2]!);
  const LV: Array<[string, number]> = [["שיפוע", -3], ["ק", 0], ["א", 3.15], ["ב", 6.3], ["ג", 9.45], ["ד", 12.6], ["ה", 15.75], ["ו", 18.9], ["פ", 22.05], ["גג", 25.2]];
  const st = (z: number) => [...LV].reverse().find(([, l]) => z >= l - 0.2)?.[0] ?? "?";
  for (const e of ELEVS) {
    console.log("==", e.sheet);
    const byS = new Map<string, ElevOpening[]>();
    for (const o of r.filter((o) => o.sheet === e.sheet)) (byS.get(st(o.z0)) ?? byS.set(st(o.z0), []).get(st(o.z0))!).push(o);
    for (const [s, l] of [...byS].sort((a, b) => LV.findIndex((v) => v[0] === a[0]) - LV.findIndex((v) => v[0] === b[0])))
      console.log(" ", s, l.length, l.sort((a, b) => a.x0 - b.x0).map((o) => `${o.x0 - e.x0}..${o.x1 - e.x0}[${(o.z0 - (LV.find((v) => v[0] === s)?.[1] ?? 0)).toFixed(2)}/${(o.z1 - (LV.find((v) => v[0] === s)?.[1] ?? 0)).toFixed(2)}]`).join(" "));
  }
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(r, null, 1));
}
