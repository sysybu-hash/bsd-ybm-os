#!/usr/bin/env npx tsx
/**
 * A building's booklet from its permit strip (DWF) — deterministic, and free:
 * no image model is called.
 *
 *   npx tsx --conditions=react-server scripts/booklet-dwf.mts --dwf "<strip.dwf>" --name "<project>" --out "<booklet.pdf>" [--subtitle "…"] [--trace 128]
 *
 * --trace path-traces the outside views (cover, aerials, elevations) on this
 * machine's GPU with that many samples a pixel: bounced light, soft shadows.
 * --finish paints the cover and the aerials with the image model (paid, up to
 * six calls), each kept only if it holds the render's structure.
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
const say = (step: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s  ${step}`);

/**
 * --finish: the cover and the two aerials painted by the image model over
 * the render — up to two tries each, a paid call a try — and kept only where
 * the finish holds the render's edges (≥ 0.6) and its masses (≥ 0.5). The
 * system draws everything else; the model only paints.
 */
const finishViews = args.has("finish")
  ? async (pictures: { get(name: string): Buffer | undefined; set(name: string, data: Buffer): void }) => {
      const { GoogleGenAI } = await import("@google/genai");
      const { getGeminiApiKey } = await import("@/lib/gemini-api-key");
      const { finishPass, finishPrompt, massMatch, structuralMatch } = await import("@/lib/projects/building/finish");
      const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
      const subject = "a ten-storey residential building in Israel, clad in Jerusalem limestone, with balconies and aluminium laundry screens, on a paved plot";
      let calls = 0;
      for (const id of ["view-hero.jpg", "view-aerial-se.jpg", "view-aerial-nw.jpg"]) {
        const render = pictures.get(id);
        if (!render) continue;
        let best: { image: Buffer; score: number } | null = null;
        for (let attempt = 1; attempt <= 2 && (!best || best.score < 0.7); attempt++) {
          calls++;
          const done = await finishPass(client, finishPrompt("exterior", subject, { plainGround: true }), render);
          if (!done) continue;
          // Its edges where the render's are, and its masses: a close-up the
          // model redrew passes on edges alone — stone courses meet stone courses.
          const edges = await structuralMatch(render, done.image);
          const masses = await massMatch(render, done.image);
          const score = Math.min(edges, masses + 0.1);
          say(`finish ${id} try ${attempt}: ${done.model} edges ${edges.toFixed(3)} masses ${masses.toFixed(3)}`);
          if (edges >= 0.6 && masses >= 0.5 && (!best || score > best.score)) best = { image: done.image, score };
          if (process.env.KEEP_FINISH) fs.writeFileSync(`${process.env.KEEP_FINISH}/${id.replace(".jpg", "")}-try${attempt}.jpg`, done.image);
        }
        if (best) pictures.set(id, best.image);
        else say(`finish ${id}: no finish held the render; the render is kept`);
      }
      say(`finish: ${calls} image calls`);
    }
  : undefined;
const booklet = await runWholeBooklet({
  projectName: name,
  subtitle: args.get("subtitle"),
  source: async () => source,
  traceSamples: args.get("trace") ? Number(args.get("trace")) : undefined,
  afterViews: finishViews,
  say,
});
for (const f of booklet.state.floors ?? []) {
  console.log(`  ${f.id} ${f.level.toFixed(2)} ${f.units.join(",") || "-"} registration ${(f.registration * 100).toFixed(0)}%`);
}
const pdf = await renderHtmlSectionsPdf(booklet.html, { waitForImages: true, timeoutMs: 600_000, sheet: BUILDING_BOOKLET_PAGE, jpegQuality: 86 });
fs.writeFileSync(out, pdf);
console.log(`${out} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
