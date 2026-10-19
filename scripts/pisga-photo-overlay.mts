#!/usr/bin/env npx tsx
/**
 * The plot's aerial photograph with the plan's own lines on it, for correcting the rough fit pisga.ts lays it by:
 *   npx tsx scripts/pisga-photo-overlay.mts <photo> <out.jpg> [S CU CV CXM CZM ROTdeg]
 * Red: the building's footprint (x 0.88..53.92, z 1.02..16.58); yellow: the plot's south line (the DXF's G110-10); cyan: the street's asphalt (2–11 m past it).
 */
import fs from "node:fs";
import sharp from "sharp";
const [photo, out, ...n] = process.argv.slice(2);
const [S, CU, CV, CXM, CZM, ROT] = [0.3346, 884, 403, 27, 29.4, 2.956].map((d, i) => (n[i] ? Number(n[i]) : d)) as [number, number, number, number, number, number];
const c = Math.cos((ROT * Math.PI) / 180), sn = Math.sin((ROT * Math.PI) / 180);
const pt = (x: number, z: number): [number, number] => [((x - CXM) * c + (z - CZM) * sn) / S + CU, (-(x - CXM) * sn + (z - CZM) * c) / S + CV];
const px = (x: number, z: number) => pt(x, z)[0], pz = (x: number, z: number) => pt(x, z)[1];
const PLOT: Array<[number, number]> = [[-16, 21.4], [-10.99, 21.27], [4.44, 20.92], [20.78, 21.77], [38.18, 24.0], [61.32, 29.41], [75, 32.6]];
const off = ([x, z]: [number, number], a: number): [number, number] => [x, z + a];
const poly = (pts: Array<[number, number]>, c: string, w = 3) => `<polyline fill="none" stroke="${c}" stroke-width="${w}" points="${pts.map(([x, z]) => `${px(x, z).toFixed(0)},${pz(x, z).toFixed(0)}`).join(" ")}"/>`;
const rect = (x0: number, x1: number, z0: number, z1: number) => poly([[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]], "#ff2020", 4);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1812" height="747">${rect(0.88, 53.92, 1.02, 16.58)}${poly(PLOT, "#ffe000")}${poly(PLOT.map((p) => off(p, 2)), "#00e5ff", 2)}${poly(PLOT.map((p) => off(p, 11)), "#00e5ff", 2)}</svg>`;
await sharp(fs.readFileSync(photo!)).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 88 }).toFile(out!);
console.log(out);
