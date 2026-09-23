/**
 * Draw one apartment from its sales sheet — deterministically, and for free.
 *
 *   npm run floorplan:render3d -- --pdf "תוכניות/דירה 21.pdf" --area 91.84
 *   npm run floorplan:render3d -- --pdf "…" --area 91.84 --style luxury
 *   npm run floorplan:render3d -- --pdf "…" --area 91.84 --all-styles
 *
 * No image model is called and nothing is billed: the sheet is measured, the
 * scene is built from the measurement by rule, and a headless Chromium
 * photographs it. The same code path the platform runs.
 *
 * --area is the printed gross in m², which is what locks the scale. It is the
 * one thing this script will not guess.
 */
import fs from "node:fs";
import path from "node:path";

import { config } from "dotenv";

config({ path: ".env.local" });

const args = new Map<string, string>();
const flags = new Set<string>();
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i] ?? "";
  if (!arg.startsWith("--")) continue;
  const next = process.argv[i + 1];
  if (next && !next.startsWith("--")) {
    args.set(arg.replace(/^--/, ""), next);
    i += 1;
  } else {
    flags.add(arg.replace(/^--/, ""));
  }
}

const pdfPath = args.get("pdf");
const areaM2 = Number(args.get("area"));
if (!pdfPath || !Number.isFinite(areaM2) || areaM2 <= 0) {
  console.error(
    'שימוש: npm run floorplan:render3d -- --pdf "<קובץ.pdf>" --area <מ"ר> [--style <סגנון>] [--all-styles] [--out <תיקייה>]',
  );
  process.exit(1);
}

const outDir = args.get("out") ?? path.dirname(pdfPath);
const unit = args.get("unit") ?? path.basename(pdfPath).replace(/\.[^.]+$/, "");

const { FLOORPLAN_VIZ_PRESETS, FLOORPLAN_VIZ_PRESET_IDS, isFloorplanVizPresetId } = await import(
  "@/lib/projects/floorplan-viz-styles"
);
const { renderFlatFromPdf } = await import("@/lib/projects/floorplan-render-flat");
const { buildFlatScene } = await import("@/lib/projects/scene3d/build-scene");
const { hashScene } = await import("@/lib/projects/scene3d/hash");
const { sceneStyleFor } = await import("@/lib/projects/scene3d/style");
const { chromiumSceneRenderer } = await import("@/lib/projects/scene3d/renderer");
const { QUALITY } = await import("@/lib/projects/scene3d/quality");
const { stampFloorplanStill } = await import("@/lib/projects/floorplan-viz-stamp");

const styleArg = args.get("style") ?? "haredi_classic";
const styles = flags.has("all-styles")
  ? [...FLOORPLAN_VIZ_PRESET_IDS]
  : [isFloorplanVizPresetId(styleArg) ? styleArg : "haredi_classic"];

const measuredAt = Date.now();
const rendered = await renderFlatFromPdf(fs.readFileSync(pdfPath), {
  targetAreaM2: areaM2,
  label: unit,
} as never);
if (!rendered) {
  console.error("לא נמצא קנה מידה שמשחזר את השטח המודפס — בדקו את --area");
  process.exit(2);
}
console.log(
  `נמדד ב-${Date.now() - measuredAt}ms: ${rendered.rooms.length} חדרים, ${rendered.flat.bodies.length} קירות, ${rendered.flat.openings.length} פתחים`,
);

for (const styleId of styles) {
  const style = sceneStyleFor(FLOORPLAN_VIZ_PRESETS[styleId]);
  const scene = buildFlatScene(rendered.flat, rendered.rooms, { rules: style.rules });
  const startedAt = Date.now();
  const frame = await chromiumSceneRenderer({
    scene,
    style,
    view: { id: "overview" },
    quality: QUALITY.booklet,
  });
  if (!frame) {
    console.error(`${styleId}: לא התקבל פריים`);
    continue;
  }
  const stamped = await stampFloorplanStill(
    { base64: frame.base64, mimeType: frame.mimeType },
    { unitLabel: unit, areaM2 },
  );
  const out = path.join(outDir, `${unit} — מדוד — ${styleId}.jpg`);
  fs.writeFileSync(out, Buffer.from(stamped.base64, "base64"));
  console.log(
    `${styleId}: ${frame.widthPx}x${frame.heightPx} ב-${Date.now() - startedAt}ms · ${scene.meshes.length} גופים · hash ${hashScene(scene)} · ${out}`,
  );
}
