/**
 * The accuracy certificate of one project, free (no paid calls):
 *   1. model against each plan sheet (metres; lib/projects/accuracy/sheet-fit),
 *   2. each delivered painting against the render it was painted from (pixels; painting-drift).
 *
 *   npx tsx --conditions=react-server scripts/accuracy.mts <config.json>
 *
 * config.json:
 *   { "model": "<dir with model.json>",
 *     "kinds": "factory",
 *     "sheets": [ { "name": "קומת קרקע", "pdf": "<sheet.pdf>", "page": 1, "storey": "ground", "scale": 200 } ],
 *     "paintings": { "renders": "<dir>", "paintings": "<dir>", "views": "<views.json, optional, for ortho m/px>" },
 *     "out": "<dir>" }
 *
 * Writes <out>/accuracy.json, an overlay JPEG per sheet (green ≤ 0.15 m, yellow ≤ 0.35 m, red beyond),
 * and prints the certificate. Needs pdftoppm on PATH.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { chamferDistance, inkMask } from "@/lib/projects/accuracy/distance-map";
import { fitModelToSheet, projectToSheet } from "@/lib/projects/accuracy/sheet-fit";
import { FACTORY_KINDS, storeyPlanPoints, type ScenePrimitive } from "@/lib/projects/accuracy/model-points";
import { driftPicture, paintingDrift } from "@/lib/projects/accuracy/painting-drift";
import { buildCertificate, certificateRows, CERTIFICATE_HEADERS_HE, type PaintingEntry, type SheetEntry } from "@/lib/projects/accuracy/certificate";

type Config = {
  model: string;
  kinds?: "factory";
  sheets: Array<{ name: string; pdf: string; page?: number; storey: string; scale: number }>;
  paintings?: { renders: string; paintings: string; views?: string };
  out: string;
};

const cfgPath = process.argv[2];
if (!cfgPath) {
  console.error("usage: scripts/accuracy.mts <config.json>");
  process.exit(2);
}
const base = path.dirname(path.resolve(cfgPath));
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as Config;
const at = (p: string) => (path.isAbsolute(p) ? p : path.join(base, p));
const out = at(cfg.out);
fs.mkdirSync(out, { recursive: true });
const DPI = 100;

const model = JSON.parse(fs.readFileSync(path.join(at(cfg.model), "model.json"), "utf8")) as { primitives: ScenePrimitive[] };
const kindOf = FACTORY_KINDS;

// ---- 1. sheets ----
const sheets: SheetEntry[] = [];
const sheetJson: unknown[] = [];
for (const s of cfg.sheets) {
  const tmp = path.join(os.tmpdir(), `accuracy-${process.pid}-${sheets.length}`);
  const page = String(s.page ?? 1);
  execFileSync("pdftoppm", ["-r", String(DPI), "-gray", "-png", "-singlefile", "-f", page, "-l", page, at(s.pdf), tmp]);
  const { data, info } = await sharp(`${tmp}.png`).raw().toBuffer({ resolveWithObject: true });
  const map = chamferDistance(inkMask(data, info.width, info.height, info.channels), info.width, info.height);
  const pts = storeyPlanPoints(model.primitives, s.storey, kindOf);
  if (!pts.length) throw new Error(`no ${s.storey} geometry in the model`);
  const t0 = Date.now();
  const acc = fitModelToSheet(pts, map, { pxPerM: (1000 / s.scale / 25.4) * DPI });
  const den = acc.scaleDenominator(DPI);
  console.log(`\n${s.name}: 1:${den.toFixed(1)}  rotation ${acc.rotationDeg.toFixed(2)}°  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  console.log(`  scale search (mean m): ${acc.scaleTrials.map((t) => `×${t.multiplier} ${t.meanM.toFixed(3)}`).join("  ")}`);
  for (const k of acc.byKind) {
    console.log(`  ${k.kind.padEnd(16)} n=${String(k.n).padStart(5)}  median ${k.median.toFixed(2)}  p90 ${k.p90.toFixed(2)}  max ${k.max.toFixed(2)} m  ≤0.15 ${(k.withinClose * 100).toFixed(0)}%  >0.35 ${(k.beyondFar * 100).toFixed(0)}%`);
  }
  sheets.push({ sheet: s.name, scale: `1:${Math.round(den)}`, byKind: acc.byKind, all: acc.all });
  sheetJson.push({ name: s.name, scaleDenominator: den, rotationDeg: acc.rotationDeg, all: acc.all, byKind: acc.byKind, scaleTrials: acc.scaleTrials });

  // the overlay picture, cropped round the model
  const marks: string[] = [];
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  pts.forEach((q, i) => {
    const [x, y] = projectToSheet(acc.fit, q.p);
    const m = acc.distancesM[i]!;
    marks.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.6" fill="${m <= 0.15 ? "#00b050" : m <= 0.35 ? "#f0b000" : "#e00000"}"/>`);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">${marks.join("")}</svg>`;
  const pad = 60;
  const L = Math.max(0, Math.floor(x0 - pad)), T = Math.max(0, Math.floor(y0 - pad));
  const comp = await sharp(`${tmp}.png`).composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  await sharp(comp)
    .extract({ left: L, top: T, width: Math.min(info.width - L, Math.ceil(x1 - x0 + 2 * pad)), height: Math.min(info.height - T, Math.ceil(y1 - y0 + 2 * pad)) })
    .jpeg({ quality: 88 })
    .toFile(path.join(out, `sheet-${s.storey}.jpg`));
  fs.rmSync(`${tmp}.png`, { force: true });
}

// ---- 2. paintings ----
const paintings: PaintingEntry[] = [];
const paintJson: unknown[] = [];
if (cfg.paintings) {
  const rDir = at(cfg.paintings.renders);
  const pDir = at(cfg.paintings.paintings);
  const views = cfg.paintings.views ? (JSON.parse(fs.readFileSync(at(cfg.paintings.views), "utf8")) as Array<{ id: string; orthoHalfWidth?: number }>) : [];
  console.log("");
  for (const f of fs.readdirSync(pDir).filter((n) => /\.(jpe?g|png)$/i.test(n)).sort()) {
    const view = f.replace(/\.(jpe?g|png)$/i, "");
    const renderFile = fs.readdirSync(rDir).find((n) => n.replace(/\.(jpe?g|png)$/i, "") === view);
    if (!renderFile) {
      console.log(`  ${view}: no render — not measured`);
      continue;
    }
    const render = fs.readFileSync(path.join(rDir, renderFile));
    const half = views.find((v) => v.id === view)?.orthoHalfWidth;
    const rw = (await sharp(render).metadata()).width ?? 1;
    const painted = fs.readFileSync(path.join(pDir, f));
    const d = await paintingDrift(render, painted, half ? (2 * half) / rw : undefined);
    fs.writeFileSync(path.join(out, `drift-${view}.jpg`), await driftPicture(render, painted));
    paintings.push({ view, drift: d });
    paintJson.push({ view, ...d });
    const P = (v: number) => `${(v * 100).toFixed(0)}%`;
    console.log(
      `  ${view.padEnd(22)} frame ${d.frameMovePx.toFixed(1)} px (dx ${d.frame.dx.toFixed(1)}, dy ${d.frame.dy.toFixed(1)}, s ${d.frame.s.toFixed(3)})` +
        `  as seen ≤3px ${P(d.kept.withinClose)}  aligned ≤3px ${P(d.keptAligned.withinClose)} >8px ${P(d.keptAligned.beyondFar)}` +
        `  new structure ${P(d.inventedNear)}  dressing ${P(d.dressing)}${d.keptAlignedM ? `  aligned median ${(d.keptAlignedM.median * 100).toFixed(0)} cm` : ""}`,
    );
  }
}

const cert = buildCertificate(sheets, paintings);
const rows = certificateRows(cert);
console.log(`\nתעודת דיוק: ${rows.summary}`);
console.log(CERTIFICATE_HEADERS_HE.sheets.join(" | "));
for (const r of rows.sheets) console.log(r.join(" | "));
console.log(CERTIFICATE_HEADERS_HE.paintings.join(" | "));
for (const r of rows.paintings) console.log(r.join(" | "));
fs.writeFileSync(path.join(out, "accuracy.json"), JSON.stringify({ date: new Date().toISOString(), grade: cert.grade, sheets: sheetJson, paintings: paintJson, rows }, null, 1));
console.log(`→ ${out}`);
