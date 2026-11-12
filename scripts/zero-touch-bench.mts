#!/usr/bin/env npx tsx
/**
 * Zero-touch bench (docs/plans/auto-booklet-vision.md, phase 0): every project
 * we delivered, run through the WEBSITE's own pipelines with no human input,
 * free — measured renders only, never a painting, never a paid reading.
 *
 *   npx tsx --conditions=react-server scripts/zero-touch-bench.mts <out dir> [<project id> ...]
 *
 * For each project, from the files a client would drag in (its source folder
 * under "מערכת הדמיות"):
 *   convert  — a DWG is read on the site only after a paid conversion; the bench uses the
 *              DXF beside it where one exists (the conversion is automatic, not a touch),
 *              else the file is dropped and said so
 *   identify — the site's identify step (structure/identify.ts, free)
 *   route    — which site pipeline takes that structure: house booklet, DWF building
 *              booklet, flat run, or none
 *   model / render / booklet — the pipeline itself, ai:false, photoreal:false
 *   accuracy — the model against its PDF sheet (lib/projects/accuracy), where the
 *              project has one and the model was built
 * and what a person would have had to do on the way (touch points).
 *
 * Writes <out>/bench.json and <out>/bench.md (Hebrew). Each project's result is
 * written as soon as it ends, so a long run can be stopped and read.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "dotenv";

// The keys of the main checkout, so lib/env validates — then every paid door shut.
for (const p of [".env.local", "../../../.env.local"]) if (fs.existsSync(p)) config({ path: p });
for (const k of Object.keys(process.env)) {
  if (/GEMINI|GOOGLE_(AI|GENAI|API)|ANTHROPIC|OPENAI|GROQ|FAL_|REPLICATE|CLOUDCONVERT|DOCUMENTAI|XAI|DEEPSEEK|MISTRAL/i.test(k)) delete process.env[k];
}
process.env.ALLOW_PAID_AI = "";
// Local runs hit the production database: the bench must not write, so it cannot reach one.
process.env.DATABASE_URL = "postgresql://bench:bench@127.0.0.1:1/none";
process.env.DIRECT_URL = process.env.DATABASE_URL;

const { identifyStructure } = await import("@/lib/projects/structure/identify");
const { houseProjectFromFiles, houseSheetReader, inferRequireCars } = await import("@/lib/projects/building/house-project");
const { runPrivateHouseBooklet } = await import("@/lib/projects/building/house-booklet");
const { runWholeBooklet } = await import("@/lib/projects/building/dwf-booklet");
const { unitGeometryFromDxf, geometryFromDxf } = await import("@/lib/projects/floorplan-dxf");
const { chamferDistance, inkMask } = await import("@/lib/projects/accuracy/distance-map");
const { fitModelToSheet } = await import("@/lib/projects/accuracy/sheet-fit");
const { storeyPlanPoints } = await import("@/lib/projects/accuracy/model-points");
const { gradeSheet } = await import("@/lib/projects/accuracy/certificate");
const sharp = (await import("sharp")).default;

type ScenePrimitive = import("@/lib/projects/accuracy/model-points").ScenePrimitive;

const ROOT = "C:\\Users\\User\\Desktop\\BSD-YBM-OS\\מערכת הדמיות";

/** The files a client would upload, and the sheets the model is checked against. */
type Fixture = {
  id: string;
  name: string;
  /** Relative to ROOT. */
  upload: string[];
  /** A flat cut out of a whole-floor file: the number the client must type. */
  unit?: number;
  /** Plan sheets as PDF, for the accuracy certificate: which storey of the model each draws, and its nominal scale. */
  sheets?: Array<{ name: string; pdf: string; page?: number; storey: string; scale: number }>;
};

const W = "ויינברג/קבצים/מכר סופי 29.10.26.dxf";
const GOT = "הדמיות גוטליב/בית פרטי";
const FIXTURES: Fixture[] = [
  ...[14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map((n): Fixture => ({ id: `weinberg-${n}`, name: `ויינברג ${n}`, upload: [W], unit: n })),
  {
    id: "gottlieb",
    name: "גוטליב (בית פרטי)",
    upload: [
      `${GOT}/דגמים-A_קומת קרקע.dwf`,
      `${GOT}/דגמים-A_קומה א.dwf`,
      `${GOT}/דגמים-B_קומת קרקע.dwf`,
      `${GOT}/דגמים-B_קומה א.dwf`,
      `${GOT}/דגמים-C-קרקע.dwf`,
      `${GOT}/דגמים-C-קומה א.dwf`,
      `${GOT}/דגמים חזיתות_08.10.2026.dwf`,
    ],
    sheets: [
      { name: "A קרקע", pdf: `${GOT}/דגמים-A_קומת קרקע.pdf`, storey: "A:0", scale: 100 },
      { name: "A קומה א", pdf: `${GOT}/דגמים-A_קומה א.pdf`, storey: "A:1", scale: 100 },
    ],
  },
  { id: "pisga", name: "מרכז פסגה", upload: ["מרכז פסגה/27.10.24-גרמושקה.dwf"] },
  {
    id: "breuer21",
    name: "ברויאר 21",
    upload: ["אוירבך - מודל UP/ברויאר 21/ברויאר 21 _ביצוע.dwg", "אוירבך - מודל UP/ברויאר 21/קומה טיפוסית.dwg", "אוירבך - מודל UP/ברויאר 21/בני ברק ברויאר 21.dwg", "אוירבך - מודל UP/ברויאר 21/בויאר 21 הנדסה 06.05.26.dwg"],
  },
  {
    id: "factory",
    name: "מפעל דליקטס",
    upload: [
      "הדמיות גוטליב/מפעל/komat karka_Delicatess-Kiryat Arba.dwg",
      "הדמיות גוטליב/מפעל/koma 1_Delicatess-Kiryat Arba.dwg",
      "הדמיות גוטליב/מפעל/AXES_Delicatess-Kiryat Arba.dwg",
      "הדמיות גוטליב/מפעל/668-mgr12-220726.dwg",
    ],
  },
  { id: "aviezri", name: "אבי עזרי", upload: ["אוירבך - מודל UP/אביעזרי/אבי עזרי_תוכניות מעודכנות 4.pdf", "אוירבך - מודל UP/אביעזרי/קבצי RAR/\u200f\u200fאבי עזרי_להדמיה.dwg"] },
  {
    id: "damesek",
    name: "דמשק אליעזר",
    upload: [
      "Sheet-קומה א (1).pdf",
      "Sheet-קומה ב (2).pdf",
      "Sheet-קומה ג (1).pdf",
      "Sheet-קומה ד-גג (1).pdf",
      "Sheet-תכנית גגות (1).pdf",
      "Sheet-חזית דרומית (1).pdf",
      "Sheet-חזית מזרחית (2).pdf",
      "Sheet-חזית מערבית (1).pdf",
      "Sheet-חזית צפונית (2).pdf",
    ].map((f) => `אוירבך - מודל UP/דמשק אליעזר/${f}`),
  },
  { id: "bukshpan", name: "בוקשפן", upload: ["הדמיות דוב בוקשפן/תוכנית בוקשפן.pdf"] },
  { id: "adler", name: "אדלר", upload: ["חיים אדלר/תכנית בנייה.pdf", "חיים אדלר/תכנית הריסה.pdf", "חיים אדלר/תכנית העמדה.pdf"] },
  {
    id: "wolf",
    name: "סמינר וולף",
    upload: [
      "סמינר וולף/tochnit karka_kayam_seminar volf.dxf",
      "סמינר וולף/tochnit 1_kayam_seminar volf.dxf",
      "סמינר וולף/tochnit 2_tosefet_seminar volf.dxf",
      "סמינר וולף/tochnit 3_tosefet_seminar volf.dxf",
      "סמינר וולף/tochnit gag_tosefet_seminar volf.dxf",
      "סמינר וולף/chazitot_seminar volf.dxf",
    ],
  },
  { id: "pisgat-beitar", name: "פסגת ביתר כע4/כע5", upload: ["אוירבך - מודל UP/פסגת ביתר עילית/כע 4 כניסה לעיר.pdf", "אוירבך - מודל UP/פסגת ביתר עילית/__כע5_חניות וחצרות_V8 (3).pdf", "אוירבך - מודל UP/פסגת ביתר עילית/__כע4,5 (1).fbx"] },
];

type Stage = "convert" | "identify" | "route" | "model" | "render" | "booklet" | "accuracy";
type TouchPoint = { who: "client" | "team"; what: string };
type Result = {
  id: string;
  name: string;
  files: string[];
  reachedBooklet: boolean;
  /** The last stage that ran, and where it stopped (null when it reached the booklet). */
  stoppedAt: Stage | null;
  why: string | null;
  route: "house" | "building-dwf" | "flat" | "none" | null;
  structure?: { kind: string; sure: boolean; plans: number; blockers: string[] };
  touchPoints: TouchPoint[];
  pictures: { rendered: number; painted: number; renderFraction: number | null };
  accuracy: Array<{ sheet: string; grade: string; scale: string; median: number; p90: number; withinClose: number }> | null;
  accuracyNote?: string;
  notes: string[];
  ms: Record<string, number>;
  totalMs: number;
};

const [outDir, ...only] = process.argv.slice(2);
if (!outDir) throw new Error("usage: zero-touch-bench.mts <out dir> [<project id> ...]");
fs.mkdirSync(outDir, { recursive: true });
const jsonPath = path.join(outDir, "bench.json");
const results: Result[] = fs.existsSync(jsonPath) ? (JSON.parse(fs.readFileSync(jsonPath, "utf8")) as { results: Result[] }).results : [];

const timed = async <T,>(r: Result, stage: Stage, fn: () => Promise<T>): Promise<T> => {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    r.ms[stage] = (r.ms[stage] ?? 0) + Date.now() - t0;
  }
};
const say = (id: string) => (s: string) => process.stdout.write(`  [${id}] ${s}\n`);

async function runOne(fx: Fixture): Promise<Result> {
  const t0 = Date.now();
  const r: Result = { id: fx.id, name: fx.name, files: fx.upload.map((f) => path.basename(f)), reachedBooklet: false, stoppedAt: null, why: null, route: null, touchPoints: [], pictures: { rendered: 0, painted: 0, renderFraction: null }, accuracy: null, notes: [], ms: {}, totalMs: 0 };
  const stop = (stage: Stage, why: string) => {
    r.stoppedAt = stage;
    r.why = why;
    return r;
  };
  // Every booklet is named by the client (typed): the one touch every route has.
  r.touchPoints.push({ who: "client", what: "שם הפרויקט" });

  // ---- convert ----
  const files: Array<{ name: string; bytes: Buffer }> = [];
  const extra: Array<{ name: string; why: string }> = [];
  await timed(r, "convert", async () => {
    for (const rel of fx.upload) {
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) {
        extra.push({ name: path.basename(rel), why: "הקובץ לא נמצא בתיקייה" });
        continue;
      }
      if (/\.dwg$/i.test(rel)) {
        const base = path.basename(rel, path.extname(rel));
        const dxf = [path.join(path.dirname(abs), `${base}.dxf`), path.join(path.dirname(abs), "dxf", `${base}.dxf`)].find((p) => fs.existsSync(p));
        if (dxf) {
          files.push({ name: `${base}.dxf`, bytes: fs.readFileSync(dxf) });
          r.notes.push(`${base}.dwg → DXF (באתר: המרה אוטומטית בתשלום, CloudConvert)`);
        } else extra.push({ name: path.basename(rel), why: "DWG בלי DXF לצידו: באתר נקרא רק אחרי המרה בתשלום, והספסל חינמי" });
        continue;
      }
      if (/\.(fbx|ifc|obj|skp)$/i.test(rel)) {
        extra.push({ name: path.basename(rel), why: "סוג קובץ שהאתר לא קורא" });
        continue;
      }
      files.push({ name: path.basename(rel), bytes: fs.readFileSync(abs) });
    }
  });
  for (const e of extra) r.notes.push(`לא נכנס: ${e.name} — ${e.why}`);
  if (!files.length) return stop("convert", extra.map((e) => `${e.name}: ${e.why}`).join(" · "));

  // ---- identify ----
  let report: Awaited<ReturnType<typeof identifyStructure>>;
  try {
    report = await timed(r, "identify", () => identifyStructure(files.slice(0, 12)));
  } catch (err: unknown) {
    return stop("identify", err instanceof Error ? err.message : String(err));
  }
  r.structure = { kind: report.structure, sure: report.sure, plans: report.plans.length, blockers: report.blockers };
  if (!report.sure) r.touchPoints.push({ who: "client", what: `אישור סוג המבנה (זוהה "${report.structure}", לא בטוח)` });

  // ---- route: as the site's windows send it ----
  const kinds = new Set(files.map((f) => path.extname(f.name).toLowerCase()));
  const route: Result["route"] =
    report.structure === "house" || (files.length > 1 && [...kinds].every((k) => k === ".dxf" || k === ".dwf"))
      ? "house"
      : files.length === 1 && kinds.has(".dwf") && (report.structure === "building" || report.structure === "unknown")
        ? "building-dwf"
        : report.structure === "site"
          ? "none"
          : "flat";
  r.route = route;
  if (route === "none") return stop("route", "תוכנית פיתוח / אתר: אין לה מסלול הפקה באתר");
  if (report.blockers.length && route !== "house") return stop("route", `נחסם בזיהוי: ${report.blockers.join(" · ")}`);

  // ---- flat: the site's run reads its rooms with a paid model before the measured render ----
  if (route === "flat") {
    if (files.length > 1) r.touchPoints.push({ who: "client", what: `בחירת קובץ אחד מתוך ${files.length} (ריצת דירה מקבלת קובץ אחד)` });
    if (report.plans.length > 1) r.touchPoints.push({ who: "client", what: `בחירת תוכנית מתוך ${report.plans.length}` });
    const first = files[0]!;
    if (/\.dxf$/i.test(first.name)) {
      if (fx.unit) r.touchPoints.push({ who: "client", what: `מספר הדירה (${fx.unit}) — הקובץ הוא קומה שלמה` });
      const read = await timed(r, "model", async () => (fx.unit ? unitGeometryFromDxf(first.bytes, fx.unit) : await geometryFromDxf(first.bytes).then((g) => (g ? { geometry: g } : { reason: "empty" }))));
      if ("reason" in read) return stop("model", `הדירה לא הופרדה מהקומה: ${read.reason}`);
      r.notes.push(`גאומטריה נקראה: ${read.geometry.walls?.length ?? "?"} קירות, ${read.geometry.unitsPerMetre ? "יחידות מהקובץ" : "בלי יחידות"}`);
    }
    r.touchPoints.push({ who: "client", what: "אישור מבנה ותוכנית בחלון הזיהוי" });
    r.touchPoints.push({ who: "team", what: "צביעה פתוחה לבעלים בלבד; ייצוא חוברת ידני" });
    return stop("render", "ריצת הדירה באתר קוראת את החדרים במודל בתשלום (extractFloorplanLayout) לפני הרינדור המדוד; תמונה אחת בלי פנים, אין חוברת מדורגת. הספסל חינמי ולא מריץ אותה");
  }

  // ---- building from one DWF strip: the building-booklet job, as it runs it ----
  const models: Array<{ name: string; primitives: ScenePrimitive[]; floors?: Array<{ id: string }> }> = [];
  if (route === "building-dwf") {
    try {
      const out = await timed(r, "render", () =>
        runWholeBooklet({ projectName: fx.name, source: async () => files[0]!.bytes, say: say(fx.id) }),
      );
      const raw = out.artefacts.get(out.state.artefacts?.["model.json"] ?? "");
      if (raw) models.push({ name: fx.name, primitives: (JSON.parse(raw.toString("utf8")) as { primitives: ScenePrimitive[] }).primitives, floors: out.state.floors });
      r.pictures.rendered = Object.keys(out.state.artefacts ?? {}).filter((n) => /^view-.*\.jpg$|^apt-/.test(n)).length;
      r.reachedBooklet = out.html.length > 0;
      fs.writeFileSync(path.join(outDir, `${fx.id}.html`), out.html);
    } catch (err: unknown) {
      return stop(r.ms.render ? "render" : "model", err instanceof Error ? err.message : String(err));
    }
  }

  // ---- house booklet: the private-house job's reading, unpainted ----
  if (route === "house") {
    const map = new Map(files.map((f) => [f.name, f.bytes]));
    const { project, problems } = houseProjectFromFiles(map);
    for (const p of problems) r.notes.push(`בית: ${p}`);
    if (!project) return stop("model", `אי אפשר לבנות בית מהקבצים: ${problems.join(" · ")}`);
    const cars = await inferRequireCars(project, houseSheetReader(async (n) => map.get(n)!));
    r.notes.push(`חניות משורטטות: ${cars.parkingDrawn}${cars.requireCars ? "" : " — שער המכוניות לא מופעל"}`);
    r.touchPoints.push({ who: "client", what: "סקירת המדידה ואישור (צביעה / ללא צביעה) לפני הצביעה" });
    try {
      const out = await timed(r, "render", () =>
        runPrivateHouseBooklet({
          load: async (n) => {
            const b = map.get(n);
            if (!b) throw new Error(`file not among the chosen: ${n}`);
            return b;
          },
          projectName: fx.name,
          ai: false,
          photoreal: false,
          project,
          say: say(fx.id),
          measured: async (m) => {
            const raw = m.artefacts.get(m.state.artefacts?.["model.json"] ?? "");
            if (raw) models.push({ name: m.name, primitives: (JSON.parse(raw.toString("utf8")) as { primitives: ScenePrimitive[] }).primitives, floors: m.state.floors });
          },
        }),
      );
      r.pictures.rendered = out.pictures;
      r.reachedBooklet = out.html.length > 0;
      fs.writeFileSync(path.join(outDir, `${fx.id}.html`), out.html);
    } catch (err: unknown) {
      return stop(r.ms.render ? "render" : "model", err instanceof Error ? err.message : String(err));
    }
  }
  r.pictures.renderFraction = r.pictures.rendered ? 1 : null;

  // ---- accuracy against the PDF sheets, where the project has them ----
  if (!fx.sheets?.length) r.accuracyNote = "אין גיליון PDF מוגדר לפרויקט";
  else if (!models.length) r.accuracyNote = "אין model.json";
  else {
    r.accuracy = [];
    await timed(r, "accuracy", async () => {
      for (const s of fx.sheets!) {
        const [modelName, storey] = s.storey.split(":");
        const m = models.find((x) => x.name.includes(modelName!)) ?? models[0]!;
        const tag = storeyTag(m, Number(storey));
        // A building model tags a storey's walls with the bare storey id ("floor-0"): named, so the sampler takes them.
        const prims = m.primitives.map((p) => (p.tag === tag ? { ...p, tag: `${tag}:wall` } : p));
        const pts = storeyPlanPoints(prims, tag, BUILDING_KINDS);
        if (!pts.length) {
          r.accuracy!.push({ sheet: s.name, grade: "fail", scale: "—", median: NaN, p90: NaN, withinClose: 0 });
          r.notes.push(`תעודה: אין קווי תוכנית לקומה ${storey} במודל ${m.name}`);
          continue;
        }
        const tmp = path.join(os.tmpdir(), `bench-${process.pid}-${fx.id}-${r.accuracy!.length}`);
        const DPI = 100;
        execFileSync("pdftoppm", ["-r", String(DPI), "-gray", "-png", "-singlefile", "-f", String(s.page ?? 1), "-l", String(s.page ?? 1), path.join(ROOT, s.pdf), tmp]);
        const { data, info } = await sharp(`${tmp}.png`).raw().toBuffer({ resolveWithObject: true });
        const map = chamferDistance(inkMask(data, info.width, info.height, info.channels), info.width, info.height);
        const acc = fitModelToSheet(pts, map, { pxPerM: (1000 / s.scale / 25.4) * DPI });
        r.accuracy!.push({ sheet: s.name, grade: gradeSheet(acc.all), scale: `1:${Math.round(acc.scaleDenominator(DPI))}`, median: acc.all.median, p90: acc.all.p90, withinClose: acc.all.withinClose });
        fs.rmSync(`${tmp}.png`, { force: true });
      }
    });
  }
  r.totalMs = Date.now() - t0;
  return r;
}

/** The storey prefix a building model tags its primitives with. */
function storeyTag(m: { floors?: Array<{ id: string }> }, storey: number): string {
  return m.floors?.[storey]?.id ?? `floor-${storey}`;
}

/** A building model's plan-cut kinds (building/from-dwf): its walls only — not linings, surrounds, sills or anything it furnishes. */
const BUILDING_KINDS = (t: string): string | null => (t === "wall" ? "קירות" : null);

for (const fx of FIXTURES) {
  if (only.length && !only.includes(fx.id)) continue;
  process.stdout.write(`\n== ${fx.name}\n`);
  let res: Result;
  try {
    res = await runOne(fx);
  } catch (err: unknown) {
    res = { id: fx.id, name: fx.name, files: fx.upload, reachedBooklet: false, stoppedAt: "model", why: `שגיאה לא צפויה: ${err instanceof Error ? err.message : String(err)}`, route: null, touchPoints: [], pictures: { rendered: 0, painted: 0, renderFraction: null }, accuracy: null, notes: [], ms: {}, totalMs: 0 };
  }
  if (!res.totalMs) res.totalMs = Object.values(res.ms).reduce((a, b) => a + b, 0);
  const i = results.findIndex((x) => x.id === res.id);
  if (i >= 0) results[i] = res;
  else results.push(res);
  process.stdout.write(`   → ${res.reachedBooklet ? "חוברת" : `נעצר ב-${res.stoppedAt}: ${res.why}`} · ${res.touchPoints.length} נקודות מגע · ${(res.totalMs / 1000).toFixed(0)} ש'\n`);
  writeOut();
}

function writeOut() {
  const order = new Map(FIXTURES.map((f, i) => [f.id, i]));
  results.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  const reached = results.filter((x) => x.reachedBooklet).length;
  const summary = {
    at: new Date().toISOString(),
    projects: results.length,
    reachedBooklet: reached,
    zeroTouch: results.filter((x) => x.reachedBooklet && x.touchPoints.filter((t) => t.what !== "שם הפרויקט").length === 0).length,
    medianTouchPoints: median(results.map((x) => x.touchPoints.length)),
    certificatePass: results.filter((x) => x.accuracy?.length && x.accuracy.every((a) => a.grade === "pass")).length,
    paintedFraction: 0,
  };
  fs.writeFileSync(jsonPath, JSON.stringify({ summary, results }, null, 2));
  const stageHe: Record<Stage, string> = { convert: "המרה", identify: "זיהוי", route: "ניתוב", model: "מודל", render: "רינדור", booklet: "חוברת", accuracy: "תעודה" };
  const lines = [
    `# ספסל "בלי יד אדם": תוצאות`,
    "",
    `> נוצר ב־${summary.at.slice(0, 16).replace("T", " ")} ע"י \`scripts/zero-touch-bench.mts\`. חינם: רינדור בלבד, בלי צביעה ובלי קריאה בתשלום.`,
    "",
    `- **הגיעו לחוברת:** ${reached} מתוך ${results.length}`,
    `- **הגיעו לחוברת בלי מגע מעבר לשם הפרויקט:** ${summary.zeroTouch}`,
    `- **חציון נקודות מגע:** ${summary.medianTouchPoints}`,
    `- **תעודה "עובר" מול הגיליון:** ${summary.certificatePass}`,
    `- **שיעור הצביעה:** 0% (הספסל לא צובע; כל מבט הוא רינדור חינמי)`,
    "",
    "| פרויקט | מסלול | חוברת? | נעצר ב | למה | נקודות מגע | תמונות | תעודה | זמן (ש') |",
    "|---|---|---|---|---|---|---|---|---|",
    ...results.map((x) =>
      [
        x.name,
        x.route ?? "—",
        x.reachedBooklet ? "כן" : "לא",
        x.stoppedAt ? stageHe[x.stoppedAt] : "—",
        (x.why ?? "").replace(/\|/g, "/").slice(0, 160),
        String(x.touchPoints.length),
        String(x.pictures.rendered),
        x.accuracy?.length ? x.accuracy.map((a) => `${a.sheet}: ${a.grade}`).join("; ") : (x.accuracyNote ?? "—"),
        (x.totalMs / 1000).toFixed(0),
      ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
    ),
    "",
    "## נקודות מגע לפי פרויקט",
    "",
    ...results.flatMap((x) => [`- **${x.name}:** ${x.touchPoints.map((t) => `${t.what}${t.who === "team" ? " (צוות)" : ""}`).join("; ")}`]),
    "",
    "## הערות",
    "",
    ...results.flatMap((x) => (x.notes.length ? [`- **${x.name}:** ${x.notes.join("; ")}`] : [])),
    "",
  ];
  fs.writeFileSync(path.join(outDir, "bench.md"), lines.join("\n"));
}

function median(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}
