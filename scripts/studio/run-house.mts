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
const { project, problems } = houseProjectFromFiles(files);
for (const p of problems) console.log(`note: ${p}`);
if (!project) throw new Error(`אי אפשר לבנות בית מהקבצים האלה: ${problems.join(" · ")}`);

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
  say: (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`),
  measured: async (m) => {
    const refs = m.state.artefacts ?? {};
    for (const [name, id] of Object.entries(refs)) {
      const bytes = m.artefacts.get(id);
      if (bytes && /^view-.*\.(jpe?g|png)$/i.test(name)) fs.writeFileSync(path.join(outDir, `${m.id}-${name.replace(/^view-/, "")}`), bytes);
    }
  },
});
fs.writeFileSync(path.join(outDir, "booklet.html"), html);
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
