#!/usr/bin/env npx tsx
/**
 * מרכז פסג"ה — the renderer's own top-down cut of each floor against the DXF's wall ink, pixel by pixel.
 *
 *   npx tsx --conditions=react-server scripts/verify-pisga-topdown.mts "<drawing.dxf>" <out dir>
 *
 * The model is drawn by the real renderer, parallel projection from straight above, north up, as a mask (flat black on white), cut 1.2 m over the
 * floor, only that floor's wall boxes shown. The DXF's walls (the red pen of the sheet's plan page) are rasterised in the same frame, 40 px a metre.
 * Reported: recall (the drawing's ink within 6 cm of a model pixel), precision (model pixels within 20 cm of ink: the drawing's wall body is unfilled), and the largest gaps both ways as
 * boxes in metres. Writes <floor>-overlay.png: the drawing in red, the model in blue, both dark where they agree.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config } from "dotenv";
config({ path: ".env.local" });
const { readDxfDrawing } = await import("@/lib/projects/dxf-drawing");
const { buildPisga, LEVEL } = await import("@/lib/projects/building/pisga");
const { dxfPlanPage, PISGA_DXF } = await import("@/lib/projects/building/pisga-dxf");
const { renderBuildingFrames } = await import("@/lib/projects/building/renderer");
const { fillPolygon, drawLine, emptyMask, label } = await import("@/lib/projects/building/raster");

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) throw new Error("usage: <drawing.dxf> <out dir>");
fs.mkdirSync(outDir, { recursive: true });
const dxf = readDxfDrawing(fs.readFileSync(file))!;
const model = await buildPisga(null, { dxf });

const PPM = 40;
const CX = 28, CZ = 12, HALF = 44;
const W = HALF * 2 * PPM, H = 1600;
const x0 = CX - HALF, z0 = CZ - H / PPM / 2;

const floors = [
  { id: "floor-2" as const, level: LEVEL.floorMinus2, other: "floor-1" },
  { id: "floor-1" as const, level: LEVEL.floorMinus1, other: "floor-2" },
];
const NOT_WALL = ["site", "tree", "car", "person", "plant", "roof", "kindergarten", "facade", "terrain", "planter"];
for (const f of floors) {
  const hide = [...NOT_WALL, f.other, ...["slab", "floor", "inside", "window", "door", "curtain", "surround", "sill", "lining"].map((t) => `${f.id}:${t}`)];
  const [png] = await renderBuildingFrames(
    [{ model, width: W, height: H, sun: { azimuthDeg: 200, elevationDeg: 60 }, exposure: 1, ao: false, camera: { position: { x: CX, y: 120, z: CZ }, target: { x: CX, y: 0, z: CZ }, fovDeg: 30, orthoHalfWidth: HALF, up: { x: 0, y: 0, z: -1 }, cutAboveM: f.level + 1.2, hideTags: hide, mask: true } }],
    { outputWidthPx: W },
  );
  const raw = await sharp(png!).resize(W, H).greyscale().raw().toBuffer();
  const built = new Uint8Array(W * H);
  for (let i = 0; i < built.length; i++) built[i] = raw[i]! < 128 ? 1 : 0;

  // The drawing's walls in the same raster.
  const page = dxfPlanPage(dxf, PISGA_DXF.sheets[f.id]);
  const m = emptyMask(W, H);
  const px = (x: number) => (x - x0) * PPM;
  const pz = (z: number) => (z - z0) * PPM;
  for (const p of page.paths) {
    if (p.stroke !== 0xff0000 && p.fill !== 0xff0000) continue;
    for (const ring of p.rings) {
      const pts = ring.map(([x, y]): [number, number] => [px((x - 500) / 100), pz((y - 1030) / 100)]);
      if (p.filled) fillPolygon(m, pts);
      for (let i = 1; i < pts.length; i++) drawLine(m, pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1]);
    }
  }
  const ink = m.data;
  const dil = (a: Uint8Array, R = Math.round(0.06 * PPM)) => {
    const o = new Uint8Array(a.length);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (a[j * W + i]) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const jj = j + dy, ii = i + dx; if (jj >= 0 && jj < H && ii >= 0 && ii < W) o[jj * W + ii] = 1; }
    return o;
  };
  const dBuilt = dil(built);
  // The drawing's wall is two face lines (and a hatch), its body unfilled: a model pixel is a wall the drawing has when it is within a wall's thickness (0.2 m) of ink.
  const dInk = dil(Uint8Array.from(ink), Math.round(0.2 * PPM));
  const miss = new Uint8Array(W * H), extra = new Uint8Array(W * H);
  let inkN = 0, inkIn = 0, bN = 0, bIn = 0;
  for (let i = 0; i < W * H; i++) {
    if (ink[i]) { inkN++; if (dBuilt[i]) inkIn++; else miss[i] = 1; }
    if (built[i]) { bN++; if (dInk[i]) bIn++; else extra[i] = 1; }
  }
  const boxes = (mask: Uint8Array, minM2: number) => {
    const { ids, sizes } = label({ cols: W, rows: H, data: mask } as never, 1);
    const bx = new Map<number, [number, number, number, number]>();
    for (let i = 0; i < ids.length; i++) { const id = ids[i]!; if (!id || !mask[i]) continue; const x = i % W, y = (i - x) / W; const b = bx.get(id) ?? [x, x, y, y]; b[0] = Math.min(b[0], x); b[1] = Math.max(b[1], x); b[2] = Math.min(b[2], y); b[3] = Math.max(b[3], y); bx.set(id, b); }
    return [...bx].map(([id, b]) => ({ m2: (sizes[id] ?? 0) / (PPM * PPM), x: [(b[0] / PPM + x0).toFixed(1), (b[1] / PPM + x0).toFixed(1)], z: [(b[2] / PPM + z0).toFixed(1), (b[3] / PPM + z0).toFixed(1)] })).filter((b) => b.m2 >= minM2).sort((a, b) => b.m2 - a.m2).slice(0, 8);
  };
  console.log(`\n## ${f.id}: recall ${((100 * inkIn) / inkN).toFixed(1)}%  precision ${((100 * bIn) / bN).toFixed(1)}%  (ink ${(inkN / PPM / PPM).toFixed(0)} m², model ${(bN / PPM / PPM).toFixed(0)} m²)`);
  console.log("drawing ink the model lacks (largest):");
  for (const b of boxes(miss, 0.03)) console.log(`  x ${b.x[0]}..${b.x[1]} z ${b.z[0]}..${b.z[1]}  ${b.m2.toFixed(2)} m²`);
  console.log("model walls the drawing lacks (largest):");
  for (const b of boxes(extra, 0.03)) console.log(`  x ${b.x[0]}..${b.x[1]} z ${b.z[0]}..${b.z[1]}  ${b.m2.toFixed(2)} m²`);
  const rgb = Buffer.alloc(W * H * 3, 255);
  for (let i = 0; i < W * H; i++) {
    const a = ink[i], b = built[i];
    const c = a && b ? [30, 30, 30] : a ? [225, 40, 40] : b ? [60, 110, 235] : [255, 255, 255];
    rgb[i * 3] = c[0]!; rgb[i * 3 + 1] = c[1]!; rgb[i * 3 + 2] = c[2]!;
  }
  await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path.join(outDir, `${f.id}-overlay.png`));
}
