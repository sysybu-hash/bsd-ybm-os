import fs from "node:fs";
import { flattenDxf, readDxfDrawing, type DxfPiece } from "@/lib/projects/dxf-drawing";
const S = process.argv[2]!;
const load = (f: string) => flattenDxf(readDxfDrawing(new Uint8Array(fs.readFileSync(`${S}/${f}.dxf`)))!);
const bb = (p: DxfPiece) => { const pts = p.pts ?? p.rings?.flat() ?? (p.arc ? [p.arc.c] : []); return pts.length ? [Math.min(...pts.map((q) => q.x)), Math.max(...pts.map((q) => q.x)), Math.min(...pts.map((q) => q.y)), Math.max(...pts.map((q) => q.y))] : null; };
function clusters(boxes: number[][], gap: number) {
  const out: number[][] = [];
  for (const b of boxes.sort((a, c) => a[0]! - c[0]!)) {
    const o = out.find((c) => b[0]! <= c[1]! + gap && b[1]! >= c[0]! - gap && b[2]! <= c[3]! + gap && b[3]! >= c[2]! - gap);
    if (o) { o[0] = Math.min(o[0]!, b[0]!); o[1] = Math.max(o[1]!, b[1]!); o[2] = Math.min(o[2]!, b[2]!); o[3] = Math.max(o[3]!, b[3]!); } else out.push([...b]);
  }
  // merge pass
  for (let k = 0; k < 3; k++) for (let i = 0; i < out.length; i++) for (let j = out.length - 1; j > i; j--) { const a = out[i]!, b = out[j]!; if (b[0]! <= a[1]! + gap && b[1]! >= a[0]! - gap && b[2]! <= a[3]! + gap && b[3]! >= a[2]! - gap) { a[0] = Math.min(a[0]!, b[0]!); a[1] = Math.max(a[1]!, b[1]!); a[2] = Math.min(a[2]!, b[2]!); a[3] = Math.max(a[3]!, b[3]!); out.splice(j, 1); } }
  return out;
}
const main = load("main");
const Y0 = -11502;
for (const [name, x0, x1] of [["N-sheet", -1400, 2400], ["E-sheet", 6000, 9800], ["W-sheet", 12100, 15900]] as const) {
  const bs = main.filter((p) => /ptachim/i.test(p.layer)).map(bb).filter((b): b is number[] => !!b && b[0]! > x0 && b[1]! < x1 && b[2]! > -11800 && b[3]! < -10000);
  const cl = clusters(bs, 3).filter((c) => c[1]! - c[0]! > 40);
  console.log(name, cl.sort((a, b) => a[0]! - b[0]!).map((c) => `[${c[0]!.toFixed(0)}..${c[1]!.toFixed(0)} w${(c[1]! - c[0]!).toFixed(0)} z${((c[2]! - Y0) / 100).toFixed(2)}..${((c[3]! - Y0) / 100).toFixed(2)}]`).join(" "));
  const outline = main.filter((p) => /kir_hootz/i.test(p.layer)).map(bb).filter((b): b is number[] => !!b && b[0]! > x0 && b[1]! < x1 && b[2]! > -11800 && b[3]! < -10000);
  console.log("  outline x", Math.min(...outline.map((b) => b[0]!)).toFixed(0), Math.max(...outline.map((b) => b[1]!)).toFixed(0));
}
for (const f of ["f000", "f100"]) {
  const ps = load(f);
  const bs = ps.filter((p) => /ptachim/i.test(p.layer) && p.pts).map(bb).filter((b): b is number[] => !!b);
  const cl = clusters(bs, 3).filter((c) => Math.max(c[1]! - c[0]!, c[3]! - c[2]!) > 50);
  const xs = ps.filter((p) => /kir_hootz/.test(p.layer)).map(bb).filter((b): b is number[] => !!b);
  const X0 = Math.min(...xs.map((b) => b[0]!)), X1 = Math.max(...xs.map((b) => b[1]!)), Ya = Math.min(...xs.map((b) => b[2]!)), Yb = Math.max(...xs.map((b) => b[3]!));
  console.log(f, "frame", X0, X1, Ya, Yb);
  for (const c of cl.sort((a, b) => a[0]! - b[0]! || a[2]! - b[2]!)) console.log("  open", (c[0]! - X0).toFixed(0), (c[1]! - X0).toFixed(0), (c[2]! - Ya).toFixed(0), (c[3]! - Ya).toFixed(0));
}
