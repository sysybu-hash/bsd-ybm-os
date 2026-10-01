#!/usr/bin/env npx tsx
/**
 * A building's booklet from its permit strip (DWF) — deterministic, and free:
 * no image model is called.
 *
 *   npx tsx --conditions=react-server scripts/booklet-dwf.mts --dwf "<strip.dwf>" --name "<project>" --out "<booklet.pdf>" [--subtitle "…"]
 *
 * The name is asked for rather than read: the strip's own title block sits
 * beside the permit form, which carries the applicants' names and ID numbers.
 */
import fs from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local" });

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i] ?? "";
  if (arg.startsWith("--")) args.set(arg.slice(2), process.argv[i + 1] ?? "");
}
const file = args.get("dwf");
const name = args.get("name");
const out = args.get("out");
if (!file || !name || !out) {
  console.error('שימוש: --dwf "<גרמושקה.dwf>" --name "<שם הפרויקט>" --out "<חוברת.pdf>" [--subtitle "…"]');
  process.exit(1);
}

const { runWholeBooklet } = await import("@/lib/projects/building/dwf-booklet");
const { BUILDING_BOOKLET_PAGE } = await import("@/lib/projects/building/booklet-html");
const { renderHtmlSectionsPdf } = await import("@/lib/pdf/render-html-pdf-chromium");

const t0 = Date.now();
const source = fs.readFileSync(file);
const booklet = await runWholeBooklet({
  projectName: name,
  subtitle: args.get("subtitle"),
  source: async () => source,
  say: (step) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s  ${step}`),
});
for (const f of booklet.state.floors ?? []) {
  console.log(`  ${f.id} ${f.level.toFixed(2)} ${f.units.join(",") || "-"} registration ${(f.registration * 100).toFixed(0)}%`);
}
const pdf = await renderHtmlSectionsPdf(booklet.html, { waitForImages: true, timeoutMs: 600_000, sheet: BUILDING_BOOKLET_PAGE, jpegQuality: 86 });
fs.writeFileSync(out, pdf);
console.log(`${out} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
