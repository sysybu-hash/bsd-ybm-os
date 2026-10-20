#!/usr/bin/env npx tsx
/**
 * A house (or any building drawn as floor sheets and facades) from the files the architect hands over, free: no image model is called.
 *
 *   npx tsx --conditions=react-server scripts/studio/run-house.mts <out dir> "<name>" <file> [<file> ...]
 *
 * The files are the platform's own private-house input (lib/projects/building/house-project.ts): DXF layout tabs or DWF strips, named by floor and model
 * ("A-ground", "A-floor1", "facades"), with an optional house.json for what the sheets do not say. The measured pictures of every model are written beside
 * the booklet so the studio can show them; the booklet itself is booklet.pdf.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
config({ path: ".env.local" });

const { houseProjectFromFiles } = await import("@/lib/projects/building/house-project");
const { runPrivateHouseBooklet } = await import("@/lib/projects/building/house-booklet");
const { BUILDING_BOOKLET_PAGE } = await import("@/lib/projects/building/booklet-html");
const { renderHtmlSectionsPdf } = await import("@/lib/pdf/render-html-pdf-chromium");

process.env.ALLOW_PAID_AI = "";
const [outDir, projectName, ...paths] = process.argv.slice(2);
if (!outDir || !projectName || !paths.length) throw new Error('usage: <out dir> "<name>" <file> [<file> ...]');
fs.mkdirSync(outDir, { recursive: true });

const files = new Map<string, Buffer>();
for (const p of paths) files.set(path.basename(p), fs.readFileSync(p));
// A file given a floor role is one floor in model space: read whole, not by layout tab (the studio names such copies "<model>-<role>.dxf").
const whole = (name: string) => /^[^-]+-(ground|floor\d+|facades)\.dxf$/i.test(name);
const { project, problems } = houseProjectFromFiles(files, { whole });
for (const p of problems) console.log(`note: ${p}`);
if (!project) throw new Error(`אי אפשר לבנות בית מהקבצים האלה: ${problems.join(" · ")}`);

// A house's cars are a gate (a missed parking reading); a building whose DXF floors draw no parking at all (a school) is not held to it.
const { houseSheetReader } = await import("@/lib/projects/building/house-project");
const reader = houseSheetReader(async (name) => files.get(name)!);
let parkingDrawn = 0;
let allDxf = true;
for (const m of project.models) {
  for (const ref of m.floors) {
    if (!/\.dxf$/i.test(ref.file)) { allDxf = false; continue; }
    parkingDrawn += (await reader.inventory(ref))?.counts.parking ?? 0;
  }
}
const requireCars = !(allDxf && parkingDrawn === 0);
console.log(`parking drawn: ${parkingDrawn}${requireCars ? "" : " — none, so the cars gate is not applied"}`);

// What the model is checked against: the drawing's own counts (doors, windows, rooms). A mismatch is told to the architect, not buried in the log.
const quality: string[] = [];
const t0 = Date.now();
const { html } = await runPrivateHouseBooklet({
  load: async (name) => {
    const b = files.get(name);
    if (!b) throw new Error(`file not among the chosen: ${name}`);
    return b;
  },
  projectName,
  ai: false,
  photoreal: false,
  project,
  requireCars,
  say: (s) => {
    console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
    if (/ truth, /.test(s)) quality.push(s.replace(/^.* truth, /, ""));
  },
  measured: async (m) => {
    const refs = m.state.artefacts ?? {};
    for (const [name, id] of Object.entries(refs)) {
      const bytes = m.artefacts.get(id);
      if (bytes && /^view-.*\.(jpe?g|png)$/i.test(name)) fs.writeFileSync(path.join(outDir, `${m.id}-${name.replace(/^view-/, "")}`), bytes);
    }
  },
});
fs.writeFileSync(path.join(outDir, "booklet.html"), html);
fs.writeFileSync(path.join(outDir, "quality.json"), JSON.stringify(quality));
const pdf = await renderHtmlSectionsPdf(html, { sheet: BUILDING_BOOKLET_PAGE, jpegQuality: 80, timeoutMs: 300_000 });
let file = path.join(outDir, "booklet.pdf");
try {
  fs.writeFileSync(file, pdf);
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "EBUSY") throw err;
  file = path.join(outDir, `booklet-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}.pdf`);
  fs.writeFileSync(file, pdf);
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${file}`);
