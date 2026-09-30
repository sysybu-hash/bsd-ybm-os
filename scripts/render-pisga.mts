#!/usr/bin/env npx tsx
/**
 * מרכז פסג"ה — the building read from its booklet and drawn, for free.
 *
 *   npx tsx --conditions=react-server scripts/render-pisga.mts "<booklet.pdf>" <out dir> [view…]
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
config({ path: ".env.local" });

const { buildPisga } = await import("@/lib/projects/building/pisga");
const { renderBuildingFrames } = await import("@/lib/projects/building/renderer");
type Payload = import("@/lib/projects/building/render-page").BuildingRenderPayload;

const [file, outDir, ...only] = process.argv.slice(2);
if (!file || !outDir) throw new Error("usage: <booklet.pdf> <out dir> [view…]");
fs.mkdirSync(outDir, { recursive: true });
const t = Date.now();
const model = await buildPisga(new Uint8Array(fs.readFileSync(file)));
console.log(`model: ${model.primitives.length} primitives in ${Date.now() - t}ms`);

const W = 2400, H = 1500;
const views: Record<string, Omit<Payload, "model" | "width" | "height">> = {
  "aerial-ne": { camera: { position: { x: 88, y: 46, z: -48 }, target: { x: 27, y: 7, z: 8 }, fovDeg: 32 }, sun: { azimuthDeg: 250, elevationDeg: 38 }, exposure: 0.62, ao: true },
  "north-facade": { camera: { position: { x: 27.4, y: 6, z: -48 }, target: { x: 27.4, y: 10.5, z: 6 }, fovDeg: 38 }, sun: { azimuthDeg: 292, elevationDeg: 22 }, exposure: 0.66, ao: true },
  "aerial-sw": { camera: { position: { x: -34, y: 44, z: 62 }, target: { x: 27, y: 12, z: 8 }, fovDeg: 32 }, sun: { azimuthDeg: 200, elevationDeg: 48 }, exposure: 0.62, ao: true },
  "dollhouse-1": { camera: { position: { x: 27, y: 44, z: 36 }, target: { x: 27, y: 12.8, z: 8.5 }, fovDeg: 42, cutAboveM: 12.77 + 2.3, hideTags: ["roof", "facade", "kindergarten", "site:stair"] }, sun: { azimuthDeg: 200, elevationDeg: 55 }, exposure: 0.62, ao: true },
  "dollhouse-2": { camera: { position: { x: 27, y: 40, z: 34 }, target: { x: 27, y: 8.3, z: 7.5 }, fovDeg: 42, cutAboveM: 8.29 + 2.3, hideTags: ["roof", "floor-1", "facade", "kindergarten", "site:stair"] }, sun: { azimuthDeg: 200, elevationDeg: 55 }, exposure: 0.62, ao: true },
  hall: { camera: { position: { x: 51.8, y: 12.77 + 1.6, z: 15.2 }, target: { x: 47.5, y: 12.77 + 1.1, z: 2 }, fovDeg: 62 , interior: true }, sun: { azimuthDeg: 200, elevationDeg: 50 }, exposure: 0.62, ao: true },
  design: { camera: { position: { x: 13.8, y: 12.77 + 1.6, z: 8.6 }, target: { x: 4, y: 12.77 + 1.0, z: 2.5 }, fovDeg: 62 , interior: true }, sun: { azimuthDeg: 290, elevationDeg: 25 }, exposure: 0.62, ao: true },
  lobby: { camera: { position: { x: 33.2, y: 8.29 + 1.65, z: 6.4 }, target: { x: 22, y: 8.29 + 3.4, z: 4.2 }, fovDeg: 72 , interior: true }, sun: { azimuthDeg: 290, elevationDeg: 25 }, exposure: 0.62, ao: true },
  courtyard: { camera: { position: { x: 2, y: 10, z: 19.6 }, target: { x: 30, y: 11.2, z: 13.5 }, fovDeg: 58 }, sun: { azimuthDeg: 180, elevationDeg: 55 }, exposure: 0.66, ao: true },
};
const chosen = Object.entries(views).filter(([id]) => only.length === 0 || only.includes(id));
const frames = await renderBuildingFrames(chosen.map(([, v]) => ({ ...v, model, width: W, height: H })), { outputWidthPx: 1600 });
chosen.forEach(([id], i) => {
  const out = path.join(outDir, `pisga-${id}.jpg`);
  fs.writeFileSync(out, frames[i]!);
  console.log(out);
});
