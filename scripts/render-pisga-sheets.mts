#!/usr/bin/env npx tsx
/**
 * מרכז פסג"ה — one render per drawing of the permit booklet, at the drawing's
 * own scale and framing, so the render can be laid over the sheet.
 *
 *   npx tsx --conditions=react-server scripts/render-pisga-sheets.mts "<booklet.pdf>" <out dir> [id…]
 *
 * Regions are in pixels of the sheet images rendered at 0.7 px/pt (2359 × 1668).
 * A plan's frame is known exactly from how the sheets register on floor −1's;
 * an elevation or a section is drawn at the same 32.04 pt a metre, and is
 * rendered with a margin and registered onto its drawing afterwards.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
config({ path: ".env.local" });

const { buildPisga } = await import("@/lib/projects/building/pisga");
const { renderBuildingFrames } = await import("@/lib/projects/building/renderer");
type Payload = import("@/lib/projects/building/render-page").BuildingRenderPayload;
type Camera = Payload["camera"];

const [file, outDir, ...only] = process.argv.slice(2);
if (!file || !outDir) throw new Error("usage: <booklet.pdf> <out dir> [id…]");
fs.mkdirSync(outDir, { recursive: true });

const PX_PER_PT = 0.7;
const UPM = 32.04;
/** Render resolution over the sheet image's. */
const K = 1.5;
/** Each sheet mapped onto floor −1's: x' = s·x + tx (page points). */
const REG: Record<number, [number, number, number]> = {
  2: [1.133404934003893, -107.30819045809153, -172.60161434330803],
  3: [0.9990999769277249, 33.9008491429704, 50.67032231089024],
  4: [1.0005, 11.0, 24.56],
  5: [1, 0, 0],
  6: [1.00565, 22.86, 33.98],
  7: [1.10867, -163.78, -48.19],
};
type Box = [number, number, number, number];
const PLAN_BOX: Box = [18, 18, 1999, 1645];

type View = {
  id: string;
  sheet: number;
  box: Box;
  future?: boolean;
  plan?: { cutAbove?: number; hide?: string[] };
  /** The drawing's scale over the plans' 32.04 pt a metre, read off its lines. */
  ratio?: number;
  side?: { from: "n" | "s" | "e" | "w"; u: number; y: number; band?: number; section?: { axis: "x" | "z"; at: number; keep: 1 | -1 }; hide?: string[] };
};

const NO_SITE = ["car", "tree"];
const VIEWS: View[] = [
  { id: "s01-north", ratio: 0.864, sheet: 1, box: [106, 979, 1958, 1569], side: { from: "n", u: 27.4, y: 9, hide: NO_SITE } },
  { id: "s02-site", sheet: 2, box: PLAN_BOX, plan: {} },
  { id: "s03-roof-top", sheet: 3, box: PLAN_BOX, plan: {} },
  { id: "s04-roof", sheet: 4, box: PLAN_BOX, plan: {} },
  { id: "s05-floor-1", sheet: 5, box: PLAN_BOX, plan: { cutAbove: 12.77 + 1.5, hide: ["roof", "facade"] } },
  { id: "s06-floor-2", sheet: 6, box: PLAN_BOX, plan: { cutAbove: 8.29 + 1.5, hide: ["roof", "facade", "floor-1"] } },
  { id: "s07-future", sheet: 7, box: PLAN_BOX, future: true, plan: { cutAbove: 12.77 + 1.5, hide: ["roof", "facade"] } },
  { id: "s08-north", ratio: 0.901, sheet: 8, box: [35, 295, 1946, 932], side: { from: "n", u: 27.4, y: 9, hide: NO_SITE } },
  {
    id: "s08-south",
    sheet: 8,
    box: [35, 944, 1934, 1286],
    side: { from: "s", u: 27.4, y: 12, section: { axis: "z", at: 20.9, keep: -1 }, band: 0, hide: [...NO_SITE, "site:retaining", "site:entrance", "site:sidewalk", "site:street", "site:stair", "site:crossing", "site:lane"] },
  },
  { id: "s09-east", ratio: 1.51, sheet: 9, box: [708, 47, 1993, 826], side: { from: "e", u: 6, y: 9, section: { axis: "x", at: 57.2, keep: -1 }, hide: NO_SITE } },
  { id: "s09-west", ratio: 1.51, sheet: 9, box: [731, 932, 1934, 1651], side: { from: "w", u: 6, y: 9, section: { axis: "x", at: -1.5, keep: 1 }, hide: NO_SITE } },
  { id: "s10-aa", ratio: 0.996, sheet: 10, box: [106, 271, 1934, 755], side: { from: "s", u: 27.4, y: 9, section: { axis: "z", at: 6.3, keep: -1 }, hide: NO_SITE } },
  { id: "s10-cc", ratio: 0.996, sheet: 10, box: [35, 826, 1085, 1415], side: { from: "e", u: 10, y: 11, section: { axis: "x", at: 31.9, keep: -1 }, hide: NO_SITE } },
  { id: "s10-bb", ratio: 0.996, sheet: 10, box: [1109, 896, 2005, 1415], side: { from: "w", u: 9, y: 11, section: { axis: "x", at: 49.3, keep: 1 }, hide: NO_SITE } },
  { id: "s11-dd", ratio: 2.17, sheet: 11, box: [59, 236, 2005, 1569], side: { from: "e", u: 12, y: 11, section: { axis: "x", at: 27.4, keep: -1 }, hide: NO_SITE } },
];

const chosen = VIEWS.filter((v) => only.length === 0 || only.includes(v.id));
const pdf = new Uint8Array(fs.readFileSync(file));
const models = new Map<boolean, Awaited<ReturnType<typeof buildPisga>>>();
for (const future of [false, true]) {
  if (chosen.some((v) => (v.future ?? false) === future)) models.set(future, await buildPisga(pdf, { future }));
}

const SUN = { azimuthDeg: 215, elevationDeg: 48 };
const SUN_HIGH = { azimuthDeg: 160, elevationDeg: 72 };
const meta: Record<string, unknown> = {};
const payloads: Payload[] = [];
for (const v of chosen) {
  const [x0, y0, x1, y1] = v.box;
  let camera: Camera;
  let width: number;
  let height: number;
  if (v.plan) {
    const [s, tx, ty] = REG[v.sheet]!;
    const toModel = (px: number, py: number) => ({
      x: (s * (px / PX_PER_PT) + tx - 500) / UPM,
      z: (s * (py / PX_PER_PT) + ty - 1030) / UPM,
    });
    const a = toModel(x0, y0);
    const b = toModel(x1, y1);
    width = Math.round((x1 - x0) * K);
    height = Math.round((y1 - y0) * K);
    const cx = (a.x + b.x) / 2;
    const cz = (a.z + b.z) / 2;
    camera = {
      position: { x: cx, y: 400, z: cz },
      target: { x: cx, y: 0, z: cz },
      up: { x: 0, y: 0, z: -1 },
      fovDeg: 30,
      orthoHalfWidth: (b.x - a.x) / 2,
      ...(v.plan.cutAbove != null ? { cutAboveM: v.plan.cutAbove, interior: true } : {}),
      hideTags: v.plan.hide,
    };
    meta[v.id] = { kind: "plan", sheet: v.sheet, box: v.box };
  } else {
    const sd = v.side!;
    const margin = 1.3;
    width = Math.round((x1 - x0) * K * margin);
    height = Math.round((y1 - y0) * K * margin);
    const halfW = ((x1 - x0) * margin) / (PX_PER_PT * UPM * (v.ratio ?? 1)) / 2;
    const d = 300;
    const at =
      sd.from === "n" ? { x: sd.u, z: -d } : sd.from === "s" ? { x: sd.u, z: d } : sd.from === "e" ? { x: d, z: sd.u } : { x: -d, z: sd.u };
    const target = sd.from === "n" || sd.from === "s" ? { x: sd.u, y: sd.y, z: 0 } : { x: 0, y: sd.y, z: sd.u };
    camera = {
      position: { x: at.x, y: sd.y, z: at.z },
      target,
      fovDeg: 30,
      orthoHalfWidth: halfW,
      ...(sd.section ? { section: sd.section, interior: v.id.includes("-aa") || v.id.includes("-bb") || v.id.includes("-cc") || v.id.includes("-dd") } : {}),
      ...(sd.band != null ? { groundBand: sd.band } : {}),
      hideTags: sd.hide,
    };
    meta[v.id] = { kind: "side", sheet: v.sheet, box: v.box, margin, ratio: v.ratio ?? 1 };
  }
  // NOSIGN=1: the same frame without the lettering and its band, so the
  // system can lay its own lettering back over a finish.
  if (process.env.NOSIGN === "1") camera = { ...camera, hideTags: [...(camera.hideTags ?? []), "facade:sign", "facade:band"] };
  payloads.push({ model: models.get(v.future ?? false)!, camera, width, height, sun: v.plan ? SUN_HIGH : SUN, exposure: 0.64, ao: true });
}

const frames = await renderBuildingFrames(payloads, { outputWidthPx: 99999 });
chosen.forEach((v, i) => {
  const out = path.join(outDir, `${v.id}${process.env.NOSIGN === "1" ? ".nosign" : ""}.jpg`);
  fs.writeFileSync(out, frames[i]!);
  console.log(out);
});
if (process.env.NOSIGN === "1") process.exit(0);
const metaFile = path.join(outDir, "sheets.json");
const prev = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
fs.writeFileSync(metaFile, JSON.stringify({ ...prev, ...meta }, null, 2));
