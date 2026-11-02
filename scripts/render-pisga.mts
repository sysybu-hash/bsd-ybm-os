#!/usr/bin/env npx tsx
/**
 * מרכז פסג"ה — the building read from its booklet and drawn, for free.
 *
 *   npx tsx --conditions=react-server scripts/render-pisga.mts "<booklet.pdf>" <out dir> [view…]
 */
import fs from "node:fs";
import sharp from "sharp";
import path from "node:path";
import { config } from "dotenv";
config({ path: ".env.local" });

const { buildPisga } = await import("@/lib/projects/building/pisga");
const { renderBuildingFrames } = await import("@/lib/projects/building/renderer");
type Payload = import("@/lib/projects/building/render-page").BuildingRenderPayload;

const [file, outDir, ...only] = process.argv.slice(2);
if ((!file && !process.env.DXF) || !outDir) throw new Error("usage: <booklet.pdf> <out dir> [view…]  (or DXF=<file> with any first argument)");
fs.mkdirSync(outDir, { recursive: true });
const t = Date.now();
// FUTURE=1: sheet 7's future plan for floor −1, written as pisga-future-*.
const future = process.env.FUTURE === "1";
// DXF=<file>: the architect's DXF in place of the permit booklet's PDF (no future plan there).
const dxfFile = process.env.DXF;
const dxf = dxfFile ? (await import("@/lib/projects/dxf-drawing")).readDxfDrawing(fs.readFileSync(dxfFile)) : null;
if (dxfFile && !dxf) throw new Error(`unreadable DXF: ${dxfFile}`);
// PHOTO=<png/jpg path>: the plot's aerial photograph on the ground, a draft fit.
const groundPhoto = process.env.PHOTO ? `data:image/jpeg;base64,${(await sharp(fs.readFileSync(process.env.PHOTO)).jpeg({ quality: 88 }).toBuffer()).toString("base64")}` : undefined;
// SURVEY=<the 2022 survey as DXF>: the existing ground, side stairs and walls round the plot (pisga-survey.ts).
const survey = process.env.SURVEY ? (await import("@/lib/projects/dxf-drawing")).readDxfDrawing(fs.readFileSync(process.env.SURVEY)) ?? undefined : undefined;
const model = await buildPisga(dxf ? null : new Uint8Array(fs.readFileSync(file)), { future, dxf: dxf ?? undefined, groundPhoto, survey });
// No figures in any frame (the user's rule, 2026-10-20): the model's people for scale are left out unless PEOPLE=1.
if (process.env.PEOPLE !== "1") model.primitives = model.primitives.filter((p) => p.type !== "person");
console.log(`model: ${model.primitives.length} primitives in ${Date.now() - t}ms`);

// Traced by default, at the most the GPU holds without spoiling the frame (measured 2026-10-19 on aerial-ne: 1024 samples at 2400 px is clean in ~2 min;
// 2048 samples comes back white, 1024 at 3600 px loses walls and scrambles the ground). PT=0 rasterises instead; SIZE=<width> scales the frame
// (a traced frame is held to 2400 px); PT is held to 1024.
const PT_MAX = 1024, TRACED_MAX_PX = 2400;
const PT = Math.min(PT_MAX, Number(process.env.PT ?? PT_MAX));
const W = Math.min(Number(process.env.SIZE ?? 2400), PT ? TRACED_MAX_PX : Infinity), H = Math.round((W * 1500) / 2400);
if (Number(process.env.PT ?? 0) > PT_MAX || Number(process.env.SIZE ?? 0) > W) console.warn(`held to PT=${PT}, SIZE=${W}: past that the traced frame is spoiled`);
const views: Record<string, Omit<Payload, "model" | "width" | "height">> = {
  "aerial-ne": { camera: { position: { x: 88, y: 46, z: -48 }, target: { x: 27, y: 7, z: 8 }, fovDeg: 32 }, sun: { azimuthDeg: 250, elevationDeg: 38 }, exposure: 0.62, ao: true },
  "north-facade": { camera: { position: { x: 27.4, y: 6, z: -48 }, target: { x: 27.4, y: 10.5, z: 6 }, fovDeg: 38 }, sun: { azimuthDeg: 292, elevationDeg: 22 }, exposure: 0.66, ao: true },
  "aerial-sw": { camera: { position: { x: -34, y: 44, z: 62 }, target: { x: 27, y: 12, z: 8 }, fovDeg: 32 }, sun: { azimuthDeg: 200, elevationDeg: 48 }, exposure: 0.62, ao: true },
  "elev-north": { camera: { position: { x: 27.4, y: 11.5, z: -120 }, target: { x: 27.4, y: 11.5, z: 0 }, fovDeg: 30, orthoHalfWidth: 30, hideTags: ["site:ground-far"] }, sun: { azimuthDeg: 300, elevationDeg: 30 }, exposure: 0.66, ao: true },
  "elev-south": { camera: { position: { x: 27.4, y: 12.5, z: 120 }, target: { x: 27.4, y: 12.5, z: 0 }, fovDeg: 30, orthoHalfWidth: 30, section: { axis: "z", at: 20.3, keep: -1 }, hideTags: ["site:neighbour", "site:ground-far", "site:retaining", "site:entrance", "site:sidewalk", "site:street", "site:survey-", "site:aerial-road", "site:stair", "tree", "car"] }, sun: { azimuthDeg: 180, elevationDeg: 45 }, exposure: 0.62, ao: true },
  "dollhouse-1": { camera: { position: { x: 27, y: 44, z: 36 }, target: { x: 27, y: 12.8, z: 8.5 }, fovDeg: 42, cutAboveM: 12.77 + 2.3, hideTags: ["roof", "facade", "kindergarten", "site:stair", "car"] }, sun: { azimuthDeg: 200, elevationDeg: 55 }, exposure: 0.62, ao: true },
  "dollhouse-2": { camera: { position: { x: 27, y: 40, z: 34 }, target: { x: 27, y: 8.3, z: 7.5 }, fovDeg: 42, cutAboveM: 8.29 + 2.3, hideTags: ["roof", "floor-1", "facade", "kindergarten", "site:stair", "car"] }, sun: { azimuthDeg: 200, elevationDeg: 55 }, exposure: 0.62, ao: true },
  "dollhouse-1-west": { camera: { position: { x: 10, y: 30, z: 20 }, target: { x: 10, y: 12.8, z: 8 }, fovDeg: 50, cutAboveM: 12.77 + 2.3, hideTags: ["roof", "facade", "kindergarten", "site:stair", "car"] }, sun: { azimuthDeg: 200, elevationDeg: 55 }, exposure: 0.62, ao: true },
  // Floor −1's glazed partition (x 7.8–12.8, z 10.15) from each side.
  "glaze-1-s": { camera: { position: { x: 10.3, y: 12.77 + 1.6, z: 2.5 }, target: { x: 10.3, y: 12.77 + 1.3, z: 11 }, fovDeg: 70, interior: true }, sun: { azimuthDeg: 200, elevationDeg: 50 }, exposure: 0.62, ao: true },
  "glaze-1-n": { camera: { position: { x: 10.3, y: 12.77 + 1.6, z: 12.4 }, target: { x: 10.3, y: 12.77 + 1.2, z: 4 }, fovDeg: 80, interior: true }, sun: { azimuthDeg: 200, elevationDeg: 50 }, exposure: 0.62, ao: true },
  "glaze-1-e": { camera: { position: { x: 18, y: 12.77 + 1.6, z: 11.2 }, target: { x: 8, y: 12.77 + 1.3, z: 9.6 }, fovDeg: 70, interior: true }, sun: { azimuthDeg: 200, elevationDeg: 50 }, exposure: 0.62, ao: true },
  "glaze-1-w": { camera: { position: { x: 2.2, y: 12.77 + 1.6, z: 11.6 }, target: { x: 12, y: 12.77 + 1.3, z: 9.6 }, fovDeg: 70, interior: true }, sun: { azimuthDeg: 200, elevationDeg: 50 }, exposure: 0.62, ao: true },
  "glaze-1-top": { camera: { position: { x: 10.3, y: 12.77 + 16, z: 18 }, target: { x: 10.3, y: 12.77, z: 8 }, fovDeg: 50, cutAboveM: 12.77 + 2.9, hideTags: ["roof", "facade", "kindergarten", "site:stair", "car"] }, sun: { azimuthDeg: 200, elevationDeg: 55 }, exposure: 0.62, ao: true },
  // The sheet audit's fixes (2026-11-02): the staff kitchen's worktop, the lift's landing doors and the blind's strips, the stair head, a door's leaf.
  "fix-kitchen": { camera: { position: { x: 4.6, y: 12.77 + 1.6, z: 9.9 }, target: { x: 3.4, y: 12.77 + 0.7, z: 12.4 }, fovDeg: 70, interior: true }, sun: { azimuthDeg: 200, elevationDeg: 50 }, exposure: 0.62, ao: true },
  "fix-lift-1": { camera: { position: { x: 31.9, y: 12.77 + 1.6, z: 10.3 }, target: { x: 31.4, y: 12.77 + 0.9, z: 12.6 }, fovDeg: 80, interior: true }, sun: { azimuthDeg: 200, elevationDeg: 50 }, exposure: 0.62, ao: true },
  "fix-lift-2": { camera: { position: { x: 32.4, y: 8.29 + 1.6, z: 10.0 }, target: { x: 31.8, y: 8.29 + 0.9, z: 12.6 }, fovDeg: 80, interior: true }, sun: { azimuthDeg: 200, elevationDeg: 50 }, exposure: 0.62, ao: true },
  "fix-stair-head": { camera: { position: { x: 27.3, y: 12.77 + 1.9, z: 10.4 }, target: { x: 27.3, y: 12.77 + 0.6, z: 13.6 }, fovDeg: 80, interior: true }, sun: { azimuthDeg: 200, elevationDeg: 55 }, exposure: 0.62, ao: true },
  "fix-hall-exit": { camera: { position: { x: 47.5, y: 12.77 + 1.6, z: 5.2 }, target: { x: 44.0, y: 12.77 + 0.9, z: 1.9 }, fovDeg: 75, interior: true }, sun: { azimuthDeg: 200, elevationDeg: 50 }, exposure: 0.62, ao: true },
  "fix-roof-park": { camera: { position: { x: 38, y: 17.25 + 2.2, z: 11 }, target: { x: 36, y: 17.25 + 0.4, z: 3.5 }, fovDeg: 70 }, sun: { azimuthDeg: 200, elevationDeg: 50 }, exposure: 0.62, ao: true },
  "fix-roof-canopy": { camera: { position: { x: 20.5, y: 17.25 + 2.4, z: 7.5 }, target: { x: 16, y: 17.25 + 0.3, z: 1.6 }, fovDeg: 65 }, sun: { azimuthDeg: 200, elevationDeg: 50 }, exposure: 0.62, ao: true },
  "fix-roof-well": { camera: { position: { x: 27.3, y: 17.25 + 6, z: 8.5 }, target: { x: 27.3, y: 15, z: 15 }, fovDeg: 70 }, sun: { azimuthDeg: 200, elevationDeg: 55 }, exposure: 0.62, ao: true },
  "dollhouse-kg": { camera: { position: { x: 27, y: 46, z: -22 }, target: { x: 27, y: 0, z: 3 }, fovDeg: 45, cutAboveM: 2.3, hideTags: ["roof", "facade", "site:", "tree", "car", "person"] }, sun: { azimuthDeg: 200, elevationDeg: 55 }, exposure: 0.62, ao: true },
  "hall-stage": { camera: { position: { x: 50.5, y: 12.77 + 1.6, z: 2.2 }, target: { x: 48.0, y: 12.5, z: 15 }, fovDeg: 66, interior: true }, sun: { azimuthDeg: 200, elevationDeg: 50 }, exposure: 0.62, ao: true },
  hall: { camera: { position: { x: 51.8, y: 12.77 + 1.6, z: 15.2 }, target: { x: 47.5, y: 12.77 + 1.1, z: 2 }, fovDeg: 62 , interior: true }, sun: { azimuthDeg: 200, elevationDeg: 50 }, exposure: 0.62, ao: true },
  design: { camera: { position: { x: 13.8, y: 12.77 + 1.6, z: 8.6 }, target: { x: 4, y: 12.77 + 1.0, z: 2.5 }, fovDeg: 62 , interior: true }, sun: { azimuthDeg: 290, elevationDeg: 25 }, exposure: 0.62, ao: true },
  lobby: { camera: { position: { x: 33.2, y: 8.29 + 1.65, z: 6.4 }, target: { x: 22, y: 8.29 + 3.4, z: 4.2 }, fovDeg: 72 , interior: true }, sun: { azimuthDeg: 290, elevationDeg: 25 }, exposure: 0.62, ao: true },
  computers: { camera: { position: { x: 8.4, y: 8.29 + 1.6, z: 5.7 }, target: { x: 2.2, y: 8.29 + 0.8, z: 2.6 }, fovDeg: 64, interior: true }, sun: { azimuthDeg: 290, elevationDeg: 25 }, exposure: 0.62, ao: true },
  classroom: { camera: { position: { x: 46.3, y: 8.29 + 1.6, z: 6.0 }, target: { x: 52.4, y: 8.29 + 0.8, z: 2.4 }, fovDeg: 64, interior: true }, sun: { azimuthDeg: 70, elevationDeg: 25 }, exposure: 0.62, ao: true },
  workshop: { camera: { position: { x: 43.5, y: 12.77 + 1.6, z: 10.4 }, target: { x: 35.5, y: 12.77 + 0.8, z: 14.6 }, fovDeg: 66, interior: true }, sun: { azimuthDeg: 200, elevationDeg: 45 }, exposure: 0.62, ao: true },
  site: { camera: { position: { x: 20, y: 62, z: 72 }, target: { x: 27, y: 8, z: 4 }, fovDeg: 36 }, sun: { azimuthDeg: 215, elevationDeg: 50 }, exposure: 0.62, ao: true },
  "roof-top": { camera: { position: { x: 27.4, y: 118, z: 34 }, target: { x: 27.4, y: 12, z: 9 }, fovDeg: 30 }, sun: { azimuthDeg: 200, elevationDeg: 60 }, exposure: 0.62, ao: true },
  "elev-east": { camera: { position: { x: 140, y: 11, z: 4 }, target: { x: 0, y: 11, z: 4 }, fovDeg: 30, orthoHalfWidth: 24, section: { axis: "x", at: 57.2, keep: -1 }, hideTags: ["site:neighbour", "site:ground-far", "tree", "car"] }, sun: { azimuthDeg: 110, elevationDeg: 35 }, exposure: 0.62, ao: true },
  "elev-west": { camera: { position: { x: -140, y: 11, z: 4 }, target: { x: 0, y: 11, z: 4 }, fovDeg: 30, orthoHalfWidth: 24, section: { axis: "x", at: -1.5, keep: 1 }, hideTags: ["site:neighbour", "site:ground-far", "tree", "car"] }, sun: { azimuthDeg: 250, elevationDeg: 35 }, exposure: 0.62, ao: true },
  "section-aa": { camera: { position: { x: 27.4, y: 11, z: 140 }, target: { x: 27.4, y: 11, z: 0 }, fovDeg: 30, orthoHalfWidth: 31, section: { axis: "z", at: 6.3, keep: -1 }, interior: true, hideTags: ["site:neighbour", "site:ground-far", "tree", "car"] }, sun: { azimuthDeg: 200, elevationDeg: 55 }, exposure: 0.62, ao: true },
  "section-bb": { camera: { position: { x: 140, y: 12, z: 6 }, target: { x: 0, y: 12, z: 6 }, fovDeg: 30, orthoHalfWidth: 20, section: { axis: "x", at: 49.3, keep: -1 }, interior: true, hideTags: ["site:neighbour", "site:ground-far", "tree", "car"] }, sun: { azimuthDeg: 110, elevationDeg: 50 }, exposure: 0.62, ao: true },
  "section-dd": { camera: { position: { x: 140, y: 12, z: 8 }, target: { x: 0, y: 12, z: 8 }, fovDeg: 30, orthoHalfWidth: 20, section: { axis: "x", at: 28.4, keep: -1 }, interior: true, hideTags: ["site:neighbour", "site:ground-far", "tree", "car"] }, sun: { azimuthDeg: 110, elevationDeg: 50 }, exposure: 0.62, ao: true },
  "event-hall": { camera: { position: { x: 21.5, y: 12.77 + 1.7, z: 10.2 }, target: { x: 6, y: 12.77 + 0.9, z: 3.5 }, fovDeg: 66, interior: true }, sun: { azimuthDeg: 290, elevationDeg: 25 }, exposure: 0.62, ao: true },
  "north-high": { camera: { position: { x: 27, y: 30, z: -34 }, target: { x: 27, y: 8, z: -2 }, fovDeg: 40 }, sun: { azimuthDeg: 300, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "west-stair": { camera: { position: { x: -10, y: 24, z: 32 }, target: { x: -1, y: 9.5, z: 12 }, fovDeg: 42 }, sun: { azimuthDeg: 150, elevationDeg: 45 }, exposure: 0.64, ao: true },
  "ne-corner": { camera: { position: { x: 76, y: 18, z: -15 }, target: { x: 55, y: 8.5, z: 3 }, fovDeg: 42 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "kg-upper-nw": { camera: { position: { x: 4, y: 13, z: -22 }, target: { x: 16, y: 6.5, z: -1 }, fovDeg: 50 }, sun: { azimuthDeg: 300, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "east-end": { camera: { position: { x: 78, y: 24, z: -20 }, target: { x: 50, y: 9, z: 6 }, fovDeg: 50 }, sun: { azimuthDeg: 250, elevationDeg: 38 }, exposure: 0.62, ao: true },
  "east-corner": { camera: { position: { x: 66, y: 22, z: 4 }, target: { x: 55, y: 9, z: 14 }, fovDeg: 55 }, sun: { azimuthDeg: 250, elevationDeg: 38 }, exposure: 0.62, ao: true },
  "north-terrace": { camera: { position: { x: 27, y: 17, z: -22 }, target: { x: 27, y: 8, z: -3 }, fovDeg: 45 }, sun: { azimuthDeg: 300, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "end-e": { camera: { position: { x: 70, y: 22, z: -14 }, target: { x: 55, y: 5, z: 1 }, fovDeg: 40 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "end-w": { camera: { position: { x: -22, y: 22, z: -14 }, target: { x: -2, y: 5, z: 1 }, fovDeg: 40 }, sun: { azimuthDeg: 120, elevationDeg: 40 }, exposure: 0.64, ao: true },
  // From the street, as the site photos were taken (2026-10-29): the east stair from the parked cars at its foot (photos 11–12), the west one from the road below it.
  "photo-east-stair": { camera: { position: { x: 82, y: 1.9, z: -9 }, target: { x: 68, y: 6.5, z: 9 }, fovDeg: 62 }, sun: { azimuthDeg: 250, elevationDeg: 25 }, exposure: 0.64, ao: true },
  "photo-west-stair": { camera: { position: { x: -27, y: 5.5, z: -10 }, target: { x: -14, y: 9, z: 8 }, fovDeg: 62 }, sun: { azimuthDeg: 250, elevationDeg: 25 }, exposure: 0.64, ao: true },
  "aerial-east-stair": { camera: { position: { x: 92, y: 30, z: 6 }, target: { x: 68, y: 7, z: 12 }, fovDeg: 45 }, sun: { azimuthDeg: 250, elevationDeg: 45 }, exposure: 0.64, ao: true },
  "aerial-west-stair": { camera: { position: { x: -40, y: 30, z: 4 }, target: { x: -14, y: 9, z: 10 }, fovDeg: 45 }, sun: { azimuthDeg: 150, elevationDeg: 45 }, exposure: 0.64, ao: true },
  // Where each side stair meets the building (the sheets' emergency exits and the kindergarten's exit paths), close.
  "jn-e-kg": { camera: { position: { x: 78, y: 7, z: -4 }, target: { x: 68.5, y: 1.2, z: 3 }, fovDeg: 50 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "jn-e-exit": { camera: { position: { x: 77, y: 13, z: 5 }, target: { x: 66, y: 6, z: 10.5 }, fovDeg: 50 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "jn-e-ramp": { camera: { position: { x: 73, y: 20, z: 15 }, target: { x: 63, y: 12.3, z: 20.5 }, fovDeg: 50 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "jn-e-ramp2": { camera: { position: { x: 70, y: 17, z: 24 }, target: { x: 64.5, y: 12.3, z: 20 }, fovDeg: 45 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "jn-e-ramp3": { camera: { position: { x: 60, y: 17, z: 12 }, target: { x: 64.5, y: 12.3, z: 20 }, fovDeg: 45 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "jn-e-ramp4": { camera: { position: { x: 72, y: 14, z: 30 }, target: { x: 64.5, y: 11, z: 20.5 }, fovDeg: 40 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "jn-e-ramp5": { camera: { position: { x: 64.6, y: 30, z: 20.9 }, target: { x: 64.6, y: 12, z: 20.5 }, fovDeg: 30 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "jn-e-ramp6": { camera: { position: { x: 57, y: 16, z: 26 }, target: { x: 64.2, y: 11.5, z: 20.5 }, fovDeg: 40 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "jn-e-ramp7": { camera: { position: { x: 58, y: 10.5, z: 16 }, target: { x: 64, y: 11, z: 19.5 }, fovDeg: 45 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "jn-e-ramp8": { camera: { position: { x: 63.9, y: 26, z: 19.7 }, target: { x: 63.9, y: 12, z: 19.7 }, fovDeg: 14 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "jn-e-ramp9": { camera: { position: { x: 60, y: 15.5, z: 15 }, target: { x: 64, y: 12, z: 19.5 }, fovDeg: 28 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  // The upper road past the plot's east end, where it turns south-east beside the neighbours' blocks: at eye level and from above.
  "road-upper-east": { camera: { position: { x: 50, y: 19, z: 33 }, target: { x: 95, y: 20, z: 56 }, fovDeg: 55 }, sun: { azimuthDeg: 215, elevationDeg: 45 }, exposure: 0.62, ao: true },
  "road-upper-top": { camera: { position: { x: 70, y: 75, z: 5 }, target: { x: 95, y: 20, z: 50 }, fovDeg: 45 }, sun: { azimuthDeg: 215, elevationDeg: 45 }, exposure: 0.62, ao: true },
  // Eye level: walking down the ramp towards the stairs, and from the landing back up it.
  "jn-e-ramp10": { camera: { position: { x: 59.5, y: 13.6, z: 18.2 }, target: { x: 65.5, y: 12.6, z: 20.6 }, fovDeg: 60 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "jn-e-ramp11": { camera: { position: { x: 65.8, y: 14, z: 21 }, target: { x: 59, y: 12.3, z: 18 }, fovDeg: 60 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "jn-e-top": { camera: { position: { x: 74, y: 23, z: 36 }, target: { x: 64, y: 16, z: 27 }, fovDeg: 50 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "jn-e-head": { camera: { position: { x: 72, y: 22, z: 36 }, target: { x: 66.3, y: 16.8, z: 29.5 }, fovDeg: 55 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "jn-w-kg": { camera: { position: { x: -20, y: 10, z: -6 }, target: { x: -10.5, y: 4.8, z: 3.5 }, fovDeg: 50 }, sun: { azimuthDeg: 150, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "jn-w-exit": { camera: { position: { x: -22, y: 15, z: 1 }, target: { x: -11.5, y: 8.7, z: 6.5 }, fovDeg: 50 }, sun: { azimuthDeg: 150, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "jn-w-top": { camera: { position: { x: -21, y: 22, z: 12 }, target: { x: -11.5, y: 15, z: 19 }, fovDeg: 50 }, sun: { azimuthDeg: 150, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "photo-plaza": { camera: { position: { x: 21, y: 2.6, z: -29.5 }, target: { x: 30, y: 2, z: -6 }, fovDeg: 70 }, sun: { azimuthDeg: 250, elevationDeg: 18 }, exposure: 0.64, ao: true },
  "photo-junction": { camera: { position: { x: 53, y: 2.8, z: -37 }, target: { x: 28, y: 1, z: -17 }, fovDeg: 65 }, sun: { azimuthDeg: 250, elevationDeg: 25 }, exposure: 0.64, ao: true },
  "street-top": { camera: { position: { x: 30, y: 55, z: -55 }, target: { x: 30, y: 0, z: -18 }, fovDeg: 50 }, sun: { azimuthDeg: 200, elevationDeg: 50 }, exposure: 0.64, ao: true },
  "east-side": { camera: { position: { x: 84, y: 20, z: -6 }, target: { x: 60, y: 6.5, z: 9 }, fovDeg: 42 }, sun: { azimuthDeg: 250, elevationDeg: 40 }, exposure: 0.64, ao: true },
  // East of the terraced row's last house (x −25.5), over the upper road: from among the houses the row hid the whole building.
  "west-side": { camera: { position: { x: -21, y: 24, z: 36 }, target: { x: -1, y: 9, z: 12 }, fovDeg: 42 }, sun: { azimuthDeg: 150, elevationDeg: 45 }, exposure: 0.64, ao: true },
  // Between the drawn row of trees (z 19.6, x −2.2 and 2.6) and the colonnade: the camera stood 0.6 m from a trunk, inside its crown.
  courtyard: { camera: { position: { x: 0.2, y: 9.9, z: 17.8 }, target: { x: 28, y: 11.2, z: 14.6 }, fovDeg: 58 }, sun: { azimuthDeg: 180, elevationDeg: 55 }, exposure: 0.66, ao: true },
  // The main entrance from the street: the flight down to the landing and the core's flight on to floor −1.
  entrance: { camera: { position: { x: 21.5, y: 31, z: 33 }, target: { x: 27.4, y: 13.5, z: 15 }, fovDeg: 45 }, sun: { azimuthDeg: 200, elevationDeg: 50 }, exposure: 0.66, ao: true },
  // Upper road (street, +17.2), eye height, where the entrance stairs sit beside the parking drive (x 35.3–41.3).
  "road-wide": { camera: { position: { x: 33, y: 18.9, z: 33 }, target: { x: 34, y: 16.8, z: 20 }, fovDeg: 52 }, sun: { azimuthDeg: 200, elevationDeg: 42 }, exposure: 0.64, ao: true },
  "road-stairs": { camera: { position: { x: 30, y: 18.9, z: 29 }, target: { x: 27.4, y: 16.2, z: 20 }, fovDeg: 48 }, sun: { azimuthDeg: 210, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "road-drive": { camera: { position: { x: 38.3, y: 18.9, z: 32 }, target: { x: 38.3, y: 17.3, z: 18 }, fovDeg: 48 }, sun: { azimuthDeg: 190, elevationDeg: 42 }, exposure: 0.64, ao: true },
  "road-from-west": { camera: { position: { x: 16, y: 18.9, z: 29 }, target: { x: 36, y: 17.2, z: 22 }, fovDeg: 46 }, sun: { azimuthDeg: 230, elevationDeg: 38 }, exposure: 0.64, ao: true },
  "road-from-east": { camera: { position: { x: 54, y: 19.1, z: 35 }, target: { x: 34, y: 17.2, z: 22 }, fovDeg: 46 }, sun: { azimuthDeg: 160, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "road-gate": { camera: { position: { x: 44, y: 18.9, z: 28 }, target: { x: 32, y: 16.8, z: 20 }, fovDeg: 50 }, sun: { azimuthDeg: 185, elevationDeg: 40 }, exposure: 0.64, ao: true },
  // The kindergarten's two ends from the north: the emergency stairs its facade draws up to the terrace, the west deck and its stair.
  "kg-west": { camera: { position: { x: -22, y: 16, z: -16 }, target: { x: -3, y: 5, z: 4 }, fovDeg: 45 }, sun: { azimuthDeg: 250, elevationDeg: 45 }, exposure: 0.64, ao: true },
  "kg-east": { camera: { position: { x: 76, y: 14, z: -14 }, target: { x: 60, y: 3.5, z: 3 }, fovDeg: 45 }, sun: { azimuthDeg: 250, elevationDeg: 45 }, exposure: 0.64, ao: true },
  "kg-west-n": { camera: { position: { x: 0, y: 8, z: -13 }, target: { x: -6, y: 4.5, z: 3.5 }, fovDeg: 50 }, sun: { azimuthDeg: 250, elevationDeg: 45 }, exposure: 0.64, ao: true },
  "kg-entrance": { camera: { position: { x: 13.5, y: 1.7, z: -12 }, target: { x: 14.5, y: 2.1, z: -7.2 }, fovDeg: 75 }, sun: { azimuthDeg: 292, elevationDeg: 30 }, exposure: 0.64, ao: true },
  "kg-west-wing": { camera: { position: { x: 10, y: 2.2, z: -11.5 }, target: { x: 11, y: 2.2, z: -7 }, fovDeg: 60 }, sun: { azimuthDeg: 292, elevationDeg: 30 }, exposure: 0.64, ao: true },
  "kg-east-n": { camera: { position: { x: 64, y: 7, z: -11 }, target: { x: 62, y: 4, z: 5 }, fovDeg: 55 }, sun: { azimuthDeg: 250, elevationDeg: 45 }, exposure: 0.64, ao: true },
  "kg-ne-corner": { camera: { position: { x: 61, y: 12, z: -5 }, target: { x: 55, y: 7.5, z: 3 }, fovDeg: 50 }, sun: { azimuthDeg: 250, elevationDeg: 45 }, exposure: 0.64, ao: true },
  "kg-nw-corner": { camera: { position: { x: -7, y: 12, z: -6 }, target: { x: 0.5, y: 6.5, z: 3 }, fovDeg: 50 }, sun: { azimuthDeg: 250, elevationDeg: 45 }, exposure: 0.64, ao: true },
  "kg-west-link": { camera: { position: { x: -24, y: 16, z: -2 }, target: { x: -12.5, y: 7, z: 7.5 }, fovDeg: 50 }, sun: { azimuthDeg: 250, elevationDeg: 45 }, exposure: 0.64, ao: true },
  // West kindergarten — inner faces (toward the building / along the deck), not only the slope outside.
  "kg-west-in": { camera: { position: { x: -14, y: 7, z: 1.5 }, target: { x: 1.5, y: 4.8, z: 3.4 }, fovDeg: 48 }, sun: { azimuthDeg: 110, elevationDeg: 42 }, exposure: 0.64, ao: true },
  "kg-west-deck": { camera: { position: { x: -5, y: 8.5, z: -0.5 }, target: { x: 0.5, y: 4.6, z: 3.2 }, fovDeg: 52 }, sun: { azimuthDeg: 120, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "kg-west-door": { camera: { position: { x: -2.5, y: 6.5, z: 5.2 }, target: { x: 0.95, y: 5.4, z: 3.6 }, fovDeg: 45 }, sun: { azimuthDeg: 115, elevationDeg: 38 }, exposure: 0.64, ao: true },
  "kg-west-path56": { camera: { position: { x: -5, y: 11, z: 9 }, target: { x: -12.5, y: 5.7, z: 3.4 }, fovDeg: 50 }, sun: { azimuthDeg: 130, elevationDeg: 44 }, exposure: 0.64, ao: true },
  "kg-west-stairdn": { camera: { position: { x: -8, y: 11, z: 8.5 }, target: { x: -13.2, y: 4.8, z: 1.2 }, fovDeg: 48 }, sun: { azimuthDeg: 140, elevationDeg: 42 }, exposure: 0.64, ao: true },
  "kg-west-terrace": { camera: { position: { x: -1.5, y: 11.5, z: 7.8 }, target: { x: -7.5, y: 9.1, z: 7.6 }, fovDeg: 48 }, sun: { azimuthDeg: 100, elevationDeg: 40 }, exposure: 0.64, ao: true },
  "kg-west-grate": { camera: { position: { x: -2, y: 10.5, z: 5.8 }, target: { x: -6.5, y: 9.2, z: 5.2 }, fovDeg: 50 }, sun: { azimuthDeg: 105, elevationDeg: 38 }, exposure: 0.64, ao: true },
  "kg-west-link-in": { camera: { position: { x: -9, y: 9.5, z: 9.5 }, target: { x: -13.2, y: 7.2, z: 6.5 }, fovDeg: 50 }, sun: { azimuthDeg: 125, elevationDeg: 42 }, exposure: 0.64, ao: true },
  "kg-west-link-top": { camera: { position: { x: -7, y: 10.2, z: 11.2 }, target: { x: -11, y: 8.9, z: 10.5 }, fovDeg: 46 }, sun: { azimuthDeg: 115, elevationDeg: 40 }, exposure: 0.64, ao: true },
  // Four surroundings views. Cameras only: the model is unchanged.
  "from-below": { camera: { position: { x: 21.6, y: 9.4, z: -32.6 }, target: { x: 28, y: 7.4, z: 1 }, fovDeg: 76 }, sun: { azimuthDeg: 155, elevationDeg: 32 }, exposure: 0.66, ao: true },
  "from-southeast": { camera: { position: { x: 118, y: 78, z: 96 }, target: { x: 16, y: 8, z: -8 }, fovDeg: 50 }, sun: { azimuthDeg: 230, elevationDeg: 44 }, exposure: 0.64, ao: true },
  "from-south": { camera: { position: { x: 30, y: 110, z: 155 }, target: { x: 28, y: 12, z: -10 }, fovDeg: 52 }, sun: { azimuthDeg: 200, elevationDeg: 50 }, exposure: 0.64, ao: true },
  "from-north": { camera: { position: { x: -48, y: 52, z: -86 }, target: { x: 16, y: 8, z: 0 }, fovDeg: 62 }, sun: { azimuthDeg: 18, elevationDeg: 42 }, exposure: 0.64, ao: true },
};
const chosen = Object.entries(views).filter(([id]) => only.length === 0 || only.includes(id));
// A tree within 12 m in front of a camera (inside 36 degrees of its view) fills a corner of the frame with a trunk under a cut crown, which
// a painter "corrects" every time (Wolf, 2026-10-26): said before any frame is drawn.
for (const [id, v] of chosen) {
  const { position: p, target: t } = v.camera;
  const dx = t.x - p.x, dz = t.z - p.z, l = Math.hypot(dx, dz);
  for (const q of model.primitives) {
    if (q.type !== "tree" || (q.tag ?? "").includes(":inside:")) continue;
    const d = Math.hypot(q.at.x - p.x, q.at.z - p.z);
    if (d < 12 && ((q.at.x - p.x) * dx + (q.at.z - p.z) * dz) / (d * l) > Math.cos((36 * Math.PI) / 180)) console.warn(`${id}: a tree ${d.toFixed(1)} m in front of the camera, at (${q.at.x.toFixed(1)}, ${q.at.z.toFixed(1)})`);
  }
}
// A neighbour between a camera and the building hides it: each of the building's windows in the frame is sighted from the camera, and a view
// with more than one in twenty behind a neighbour is named before any frame is drawn (the neighbours' boxes, pisga-neighbours.ts).
{
  const { pisgaNeighbourBoxes } = await import("@/lib/projects/building/pisga-neighbours");
  const boxes = pisgaNeighbourBoxes(model.primitives);
  const windows = model.primitives.flatMap((q) => (q.type === "box" && /^(floor-1|floor-2):window/.test(q.tag ?? "") ? [q.centre] : []));
  const hits = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) => boxes.some((b) => {
    let t0 = 0, t1 = 1;
    for (const [a, d, lo, hi] of [[p.x, q.x - p.x, b.x0, b.x1], [p.y, q.y - p.y, -1e4, b.y1], [p.z, q.z - p.z, b.z0, b.z1]] as const) {
      if (Math.abs(d) < 1e-9) { if (a < lo || a > hi) return false; continue; }
      const [u, v] = [(lo - a) / d, (hi - a) / d].sort((m, n) => m - n) as [number, number];
      t0 = Math.max(t0, u); t1 = Math.min(t1, v);
      if (t0 > t1) return false;
    }
    return true;
  });
  for (const [id, v] of chosen) {
    if (v.camera.interior || (v.camera.hideTags ?? []).some((h: string) => "site:neighbour".startsWith(h))) continue;
    const { position: p, target: t, fovDeg } = v.camera;
    const dx = t.x - p.x, dz = t.z - p.z, l = Math.hypot(dx, dz) || 1;
    const seen = windows.filter((w) => { const d = Math.hypot(w.x - p.x, w.z - p.z) || 1; return ((w.x - p.x) * dx + (w.z - p.z) * dz) / (d * l) > Math.cos(((fovDeg ?? 50) * Math.PI) / 360); });
    const hidden = seen.filter((w) => hits(p, w)).length;
    if (seen.length && hidden / seen.length > 0.05) console.warn(`${id}: ${hidden} of ${seen.length} windows in the frame are behind a neighbouring building — move the camera`);
  }
}
// DRY=1: the checks above only, no frame.
if (process.env.DRY === "1") process.exit(0);
// NOSIGN=1: the same frames with the lettering left off, for the photographic
// finish — the system draws the lettering back, never the model.
const nosign = process.env.NOSIGN === "1";
// Each frame goes down a ladder of sample counts until it comes back neither blank nor too dark to be a frame (an interior needs the longest to settle and
// the GPU gives up first): the most the GPU holds without spoiling it is what is kept. A cut or a section is rasterised by the page whatever PT says.
// An interior comes back blank at 1024 (measured 2026-10-19), so it starts at 512 rather than spend a whole failed trace first.
const ladderOf = (interior: boolean) => [interior ? Math.min(PT, 512) : PT, 512, 256, 128, 0].filter((n, k, all) => n <= PT && all.indexOf(n) === k);
for (const [id, v] of chosen) {
  const ladder = ladderOf(v.camera.interior === true);
  // The dark band is drawn on the DXF's north elevation and stays; only its lettering is left off.
  // HIDE=tag,tag leaves those tags out of every frame (finding what a shape in a frame is).
  const hide = (process.env.HIDE ?? "").split(",").filter(Boolean);
  const camera0 = nosign ? { ...v.camera, hideTags: [...(v.camera.hideTags ?? []), "facade:sign"] } : v.camera;
  const camera = hide.length ? { ...camera0, hideTags: [...(camera0.hideTags ?? []), ...hide] } : camera0;
  let done: { buf: Buffer; pt: number } | null = null;
  for (const pt of ladder) {
    const renderAa = (process.env.RENDER_AA as "smaa" | "msaa" | "ss2" | undefined) ?? "smaa";
    const renderCylinderUV = process.env.RENDER_CYLINDER_UV === "0" ? 0 : undefined;
    const [buf] = await renderBuildingFrames([
      { ...v, camera, model, width: W, height: H, renderAa, renderCylinderUV, ...(pt ? { pathTrace: { samples: pt } } : {}) },
    ], { outputWidthPx: Number(process.env.OUT ?? 1600), timeoutMs: pt ? 1_800_000 : process.env.FRAME_MS ? Number(process.env.FRAME_MS) : undefined });
    const st = await sharp(buf!).stats();
    if (st.channels[0]!.stdev < 2) {
      console.warn(`${id}: blank at PT=${pt}, trying fewer samples`);
      continue;
    }
    done = { buf: buf!, pt };
    break;
  }
  if (!done) throw new Error(`frame ${id}: blank at every sample count`);
  const out = path.join(outDir, `pisga-${future ? "future-" : ""}${done.pt ? `pt${done.pt}-` : ""}${id}${nosign ? "-nosign" : ""}.jpg`);
  fs.writeFileSync(out, done.buf);
  console.log(out);
}
