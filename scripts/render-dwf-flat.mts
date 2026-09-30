#!/usr/bin/env npx tsx
/**
 * Draw one apartment from a permit strip (DWF) — deterministically, and for free.
 *
 *   npx tsx --conditions=react-server scripts/render-dwf-flat.mts --dwf "תוכניות בנין/27.10.24-גרמושקה.dwf" --unit 7
 *   … --unit 34 --level upper        # a duplex's upper floor
 *   … --view overview|dollhouse      # the camera (overview by default)
 *
 * The strip is cut into its drawings, the floor sheet carrying the unit is
 * read into walls, rooms and apartments, and the apartment is built into the
 * same scene a sales sheet is. No image model is called.
 */
import fs from "node:fs";
import path from "node:path";

import { config } from "dotenv";

config({ path: ".env.local" });

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i] ?? "";
  if (arg.startsWith("--")) args.set(arg.slice(2), process.argv[i + 1] ?? "");
}
const file = args.get("dwf");
const unit = Number(args.get("unit"));
if (!file || !Number.isInteger(unit)) {
  console.error('שימוש: --dwf "<קובץ.dwf>" --unit <מספר דירה> [--level lower|upper] [--style <סגנון>] [--out <תיקייה>]');
  process.exit(1);
}
const outDir = args.get("out") ?? path.dirname(file);

const { geometryFromDwf, sheetGeometry } = await import("@/lib/projects/floorplan-dwf");
const { splitStrip, unitMarks } = await import("@/lib/projects/sheet-split");
const { levelMarks } = await import("@/lib/projects/floor-split");
const { readDwfFloor } = await import("@/lib/projects/dwf-floor");
const { flatFromDwfFloor } = await import("@/lib/projects/dwf-flat");
const { FLOORPLAN_VIZ_PRESETS, isFloorplanVizPresetId } = await import("@/lib/projects/floorplan-viz-styles");
const { buildFlatScene } = await import("@/lib/projects/scene3d/build-scene");
const { sceneStyleFor } = await import("@/lib/projects/scene3d/style");
const { chromiumSceneRenderer } = await import("@/lib/projects/scene3d/renderer");
const { QUALITY } = await import("@/lib/projects/scene3d/quality");
const { hashScene } = await import("@/lib/projects/scene3d/hash");

const strip = geometryFromDwf(fs.readFileSync(file));
if (!strip) throw new Error("no drawing read");
const UPM = (72 / 25.4) * 10;
const candidates = splitStrip(strip)
  .filter((s) => s.kind === "floor" && s.units.includes(unit))
  .map((s) => {
    const sheet = sheetGeometry(strip, s.box);
    const marks = levelMarks(sheet.texts).map((l) => l.value).sort((a, b) => a - b);
    return { sheet, level: marks[marks.length >> 1] ?? 0 };
  })
  .sort((a, b) => a.level - b.level);
const chosen = args.get("level") === "upper" ? candidates[1] : candidates[0];
if (!chosen) throw new Error(`no floor sheet carries apartment ${unit}`);

const floor = readDwfFloor(chosen.sheet, { unitsPerMetre: UPM, units: unitMarks(chosen.sheet.texts) });
const built = flatFromDwfFloor(floor, chosen.sheet, unit);
if (!built) throw new Error(`apartment ${unit} not read`);
const { flat, rooms } = built;
console.log(
  `דירה ${unit}: ${rooms.length} חדרים (${rooms.map((r) => `${r.name} ${r.areaM2}`).join(", ")}), ${flat.bodies.length} קירות, ${flat.openings.length} פתחים, ${flat.furniture.length} רהיטים, ${flat.floorM2.toFixed(1)} מ"ר`,
);

if (process.env.LIST) {
  for (const p of flat.furniture) {
    const room = rooms.find((r) => r.contents.includes(p))?.name ?? "-";
    console.log(`  ${p.kind} ${Math.round(p.widthCm)}x${Math.round(p.depthCm)} @${Math.round(((p.x - flat.bounds.x) / flat.unitsPerMetre) * 100)},${Math.round(((p.y - flat.bounds.y) / flat.unitsPerMetre) * 100)} ${room}`);
  }
  process.exit(0);
}
const styleArg = args.get("style") ?? "haredi_classic";
const style = sceneStyleFor(FLOORPLAN_VIZ_PRESETS[isFloorplanVizPresetId(styleArg) ? styleArg : "haredi_classic"]);
const scene = buildFlatScene(flat, rooms, { rules: style.rules });
const view = args.get("view") ?? "overview";
const frame = await chromiumSceneRenderer({ scene, style, view: { id: view as never }, quality: QUALITY.booklet });
if (!frame) throw new Error("no frame");
const suffix = args.get("level") ? ` ${args.get("level")}` : "";
const out = path.join(outDir, `דירה ${unit}${suffix} — גרמושקה — ${view}.jpg`);
fs.writeFileSync(out, Buffer.from(frame.base64, "base64"));
fs.writeFileSync(out.replace(/\.jpg$/, ".svg"), flat.svg);
console.log(`${frame.widthPx}x${frame.heightPx} · ${scene.meshes.length} גופים · hash ${hashScene(scene)} · ${out}`);
