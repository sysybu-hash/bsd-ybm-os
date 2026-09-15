#!/usr/bin/env node
/**
 * Full booklet from a sales sheet.
 *
 *   npm run floorplan:booklet:full -- --unit 14 --style haredi_classic
 *   npm run floorplan:booklet:full -- --unit 14 --reuse
 */
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const argv = process.argv.slice(2);
const reuse = argv.includes("--reuse");
const args = new Map();
for (let i = 0; i < argv.length; i += 1) {
  const token = argv[i];
  if (!token?.startsWith("--")) continue;
  const key = token.replace(/^--/, "");
  const next = argv[i + 1];
  if (!next || next.startsWith("--")) {
    args.set(key, true);
    continue;
  }
  args.set(key, next);
  i += 1;
}

const styleId = typeof args.get("style") === "string" ? args.get("style") : "haredi_classic";
const unit = args.get("unit");
const plansDir = path.join(process.cwd(), "תוכניות לביצוע הדמיות");
let pdfPath = typeof args.get("pdf") === "string" ? args.get("pdf") : undefined;
if (!pdfPath && unit) {
  const match = fs
    .readdirSync(plansDir)
    .find((file) => file.startsWith(`דירה ${unit}`) && file.endsWith(".pdf") && !file.includes("מקור"));
  if (!match) {
    console.error(`no sales sheet for unit ${unit} in ${plansDir}`);
    process.exit(2);
  }
  pdfPath = path.join(plansDir, match);
}
const outDir = typeof args.get("out") === "string"
  ? args.get("out")
  : path.join(pdfPath ? path.dirname(pdfPath) : plansDir, "מוכן");

if (!pdfPath) {
  console.error('usage: --pdf "path/to/דירה 14 .pdf" | --unit 14 [--reuse] [--style haredi_classic]');
  process.exit(2);
}

const { buildFloorplanVizPdfHtml } = await import("../lib/projects/floorplan-viz-pdf-html.ts");
const { renderHtmlSectionsPdf } = await import("../lib/pdf/render-html-pdf-chromium.ts");
const { extractPdfPageRaster } = await import("../lib/projects/floorplan-vector.ts");
const { rasterizePdfPageJpeg } = await import("../lib/projects/floorplan-raster-page.ts");
const { parseFloorplanLayout } = await import("../lib/projects/floorplan-layout.ts");
const { layoutForHonestBooklet } = await import("../lib/projects/floorplan-booklet-rooms.ts");
const { resolveFloorplanVizStyle } = await import("../lib/projects/floorplan-viz-styles.ts");
const { stampFloorplanStill, stripStampBar } = await import("../lib/projects/floorplan-viz-stamp.ts");

const name = path.parse(pdfPath).name.trim();
const pdfBytes = fs.readFileSync(pdfPath);
const styleKit = resolveFloorplanVizStyle(styleId);
fs.mkdirSync(outDir, { recursive: true });

function truthForSheet(fileName) {
  const truthPath = path.join(process.cwd(), "scripts", "floorplan-truth.json");
  if (!fs.existsSync(truthPath)) return undefined;
  const all = JSON.parse(fs.readFileSync(truthPath, "utf8"));
  const row = (all.plans ?? []).find((plan) => plan.file === fileName);
  if (!row) return undefined;
  return {
    grossM2: row.grossM2,
    bedrooms: row.bedrooms,
    mmd: row.mmd,
    bathrooms: row.bathrooms,
    terraces: row.terraces ?? [],
  };
}

function bookletImages(images) {
  const kept = images.filter((img) => img.viewId === "overview" || img.viewId === "isometric");
  const rank = (img) => {
    if (img.viewId === "overview" && !img.roomName) return 0;
    if (img.viewId === "isometric") return 1;
    if (img.roomName === "גיאומטריה") return 2;
    return 3;
  };
  return kept.sort((a, b) => rank(a) - rank(b));
}

async function restamp(images, fields) {
  const out = [];
  for (const img of images) {
    const raw = await stripStampBar(Buffer.from(img.base64, "base64"));
    const stamped = await stampFloorplanStill(
      { mimeType: "image/jpeg", base64: raw.toString("base64") },
      fields,
    );
    out.push({ ...img, ...stamped });
  }
  return out;
}

async function planStill() {
  const page = await rasterizePdfPageJpeg(pdfBytes);
  if (page) return { mimeType: "image/jpeg", base64: page };
  const embedded = await extractPdfPageRaster(pdfBytes);
  if (embedded) return { mimeType: "image/jpeg", base64: embedded };
  return undefined;
}

let images;
let layout;
let enginesUsed = [];

if (reuse) {
  console.log(`${name}: rebuilding booklet from existing stills`);
  const reportPath = path.join(outDir, `${name} — בדיקה.json`);
  const report = fs.existsSync(reportPath)
    ? JSON.parse(fs.readFileSync(reportPath, "utf8"))
    : {};
  const stillFiles = fs
    .readdirSync(outDir)
    .filter((file) => file.startsWith(`${name} —`) && file.endsWith(".jpg") && !file.includes("(T)") && !file.includes("השוואה"))
    .sort((a, b) => {
      const rank = (file) => {
        if (file.includes("מבט על")) return 0;
        if (file.includes("איזומטריה")) return 1;
        if (file.includes("גיאומטריה")) return 2;
        return 3;
      };
      return rank(a) - rank(b);
    });
  const loaded = [];
  for (const file of stillFiles) {
    const bytes = fs.readFileSync(path.join(outDir, file));
    if (file.includes("הדמיה") || file.includes("מבט על")) {
      loaded.push({
        viewId: "overview",
        labelHe: "כל התוכנית — מבט על",
        mimeType: "image/jpeg",
        base64: bytes.toString("base64"),
      });
    } else if (file.includes("גיאומטריה")) {
      loaded.push({
        viewId: "overview",
        roomName: "גיאומטריה",
        labelHe: "גיאומטריה מהתוכנית",
        mimeType: "image/jpeg",
        base64: bytes.toString("base64"),
      });
    } else if (file.includes("איזומטריה")) {
      loaded.push({
        viewId: "isometric",
        labelHe: "כל התוכנית — איזומטריה",
        mimeType: "image/jpeg",
        base64: bytes.toString("base64"),
      });
    }
  }
  const seen = new Set();
  images = loaded.filter((img) => {
    const key = `${img.viewId}:${img.roomName ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (images.length === 0) {
    console.error("no reusable stills — run without --reuse first");
    process.exit(2);
  }
  layout = parseFloorplanLayout({
    title: `דירה ${String(unit ?? name.replace(/^דירה\s*/u, ""))}`,
    unitLabel: String(unit ?? name.replace(/^דירה\s*/u, "")),
    grossAreaM2: report.grossAreaM2,
    rooms: report.rooms ?? [],
  });
} else {
  const { visualizeFloorplanFromDrawing } = await import("../lib/projects/floorplan-viz.ts");
  console.log(`${name}: generating full ${styleId} booklet`);
  const result = await visualizeFloorplanFromDrawing(
    pdfBytes.toString("base64"),
    "application/pdf",
    {
      styleId,
      planKind: "sales-sheet",
      scope: "full",
      skipInteriors: true,
      sourceName: name,
    },
  );
  images = result.images;
  layout = result.layout;
  enginesUsed = result.enginesUsed;
  for (const img of result.images) {
    const slug = (img.roomName || img.labelHe).replace(/[\\/:*?"<>|]+/g, " ").trim();
    fs.writeFileSync(path.join(outDir, `${name} — ${slug}.jpg`), Buffer.from(img.base64, "base64"));
  }
}

const truth = truthForSheet(path.basename(pdfPath));
layout = layoutForHonestBooklet(layout, truth);
images = bookletImages(images);
images = await restamp(images, {
  unitLabel: layout.unitLabel?.replace(/^דירה\s*/u, "") ?? String(unit ?? ""),
  areaM2: layout.grossAreaM2,
});

const hero = images.find((img) => img.viewId === "overview" && !img.roomName) ?? images[0];
if (hero) {
  fs.writeFileSync(path.join(outDir, `${name} — הדמיה.jpg`), Buffer.from(hero.base64, "base64"));
}

const reportPath = path.join(outDir, `${name} — בדיקה.json`);
fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      unitLabel: name,
      grossAreaM2: layout.grossAreaM2,
      rooms: layout.rooms,
      confidence: { tier: "cad", hard: [], soft: layout.notes, ok: true },
      styleId,
      scope: "overview",
      enginesUsed,
      imageCount: images.length,
      reused: reuse,
    },
    null,
    2,
  ),
);

const planImage = await planStill();
const html = buildFloorplanVizPdfHtml(layout, images, {
  styleLabelHe: styleKit?.labelHe,
  styleSummaryHe: styleKit?.summaryHe,
  planImage,
});
const pdf = await renderHtmlSectionsPdf(html, {
  waitForImages: true,
  timeoutMs: 180_000,
});
const bookletPath = path.join(outDir, `${name} — חוברת.pdf`);
fs.writeFileSync(bookletPath, pdf);
console.log(
  `${name}: חוברת -> ${bookletPath} (${(pdf.byteLength / 1024).toFixed(0)} KB, ${images.length} מבטים, ${layout.rooms.length} חללים)`,
);
