#!/usr/bin/env npx tsx
/**
 * מרכז פסג"ה — the building booklet, from the architect's DXF alone.
 *
 *   npx tsx --conditions=react-server scripts/booklet-pisga-dxf.mts "<drawing.dxf>" <out dir> [--no-pdf]
 *
 * Free: the model is built from the DXF (buildPisga with `dxf`), every
 * picture is rasterised by the system's own engine, and every drawing in the
 * booklet is the DXF's own linework, laid in the frame its render shares.
 * Nothing here calls an image model. The new floors are the subject; the
 * kindergarten under them is built and drawn as the existing context it is.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config } from "dotenv";
config({ path: ".env.local" });

const { readDxfDrawing, flattenDxf, entitiesWithin, arcPoints } = await import("@/lib/projects/dxf-drawing");
const { buildPisga, LEVEL } = await import("@/lib/projects/building/pisga");
const { dxfRoomLabels, PISGA_DXF } = await import("@/lib/projects/building/pisga-dxf");
const { renderBuildingFrames } = await import("@/lib/projects/building/renderer");
const { asCutPlan } = await import("@/lib/projects/building/cut-model");
const { buildBuildingBookletHtml, BUILDING_BOOKLET_PAGE } = await import("@/lib/projects/building/booklet-html");
const { renderHtmlSectionsPdf } = await import("@/lib/pdf/render-html-pdf-chromium");
type Payload = import("@/lib/projects/building/render-page").BuildingRenderPayload;
type Camera = Payload["camera"];
type DxfPiece = import("@/lib/projects/dxf-drawing").DxfPiece;

const [file, outDir, ...flags] = process.argv.slice(2);
if (!file || !outDir) throw new Error("usage: <drawing.dxf> <out dir> [--no-pdf]");
fs.mkdirSync(outDir, { recursive: true });
const t0 = Date.now();
const say = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${s}`);
const dxf = readDxfDrawing(fs.readFileSync(file));
if (!dxf) throw new Error("unreadable DXF");
const model = await buildPisga(null, { dxf });
say(`model: ${model.primitives.length} primitives`);
const allPieces = flattenDxf(dxf);

const W = 2400;
const jpeg = async (buf: Buffer, width = 2600) => ({
  mimeType: "image/jpeg",
  base64: (await sharp(buf).resize({ width, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()).toString("base64"),
});

// ---- The drawings' frames: every sheet's plan frame, and each elevation's and section's own. -------------------------------------------

type Frame = {
  /** Metres across the picture: the plan's x for plans and for views from the south and north, z for views from the east and west. */
  u: [number, number];
  /** Metres down the picture: the plan's z for plans, levels for views. */
  v: [number, number];
};
const heightFor = (f: Frame) => Math.round((W * (f.v[1] - f.v[0])) / (f.u[1] - f.u[0]));

type Sheet = {
  id: string;
  title: string;
  caption: string;
  frame: Frame;
  /** The render's camera and options. */
  camera: Camera;
  /** The drawing: how a piece of the DXF lands on the picture (u, v in metres), and which pieces. */
  place: (x: number, y: number) => [number, number];
  pieces: (p: DxfPiece) => boolean;
  /** Room names, plan only. */
  names?: Array<{ u: number; v: number; text: string }>;
};

const NO_SITE = ["car", "tree"];
const planFrame: Frame = { u: [-4, 66], v: [-10, 25] };
const sheetLeft = (id: "floor-2" | "floor-1") => PISGA_DXF.sheets[id];
const planPlace = (left: number, shift = 0) => (x: number, y: number): [number, number] => [(x - left - PISGA_DXF.corner.x - shift) / 100 + 0.88, (PISGA_DXF.frameY + PISGA_DXF.corner.y - y) / 100 + 1.02];
const inSheet = (left: number) => (p: DxfPiece) => {
  const q = p.pts?.[0] ?? p.arc?.c ?? p.circle?.c ?? p.at;
  return !!q && q.x >= left && q.x <= left + PISGA_DXF.width && q.y >= PISGA_DXF.frameY && q.y <= PISGA_DXF.frameY + PISGA_DXF.height;
};
const topCamera = (frame: Frame, extra: Partial<Camera>): Camera => {
  const cx = (frame.u[0] + frame.u[1]) / 2;
  const cz = (frame.v[0] + frame.v[1]) / 2;
  return { position: { x: cx, y: 400, z: cz }, target: { x: cx, y: 0, z: cz }, up: { x: 0, y: 0, z: -1 }, fovDeg: 30, orthoHalfWidth: (frame.u[1] - frame.u[0]) / 2, planStyle: extra.cutAboveM != null, ...extra };
};

const roomNames = (id: "floor-2" | "floor-1") => dxfRoomLabels(dxf, id).map((l) => ({ u: l.x, v: l.y, text: l.name.replace(/\s*\d+\s*מ"ר$/, "") }));

/** A drawing from the side: the image runs +x right from the south, −x from the north, +z from the west, −z from the east. */
type Side = {
  id: string;
  title: string;
  caption: string;
  from: "n" | "s" | "e" | "w";
  span: [number, number];
  levels: [number, number];
  box: { x0: number; x1: number; y0: number; y1: number };
  base: number;
  offset: number;
  section?: { axis: "x" | "z"; at: number; keep: 1 | -1 };
  hide?: string[];
  cut?: boolean;
};
const SIDES: Side[] = [
  { id: "north", title: "חזית צפונית", caption: "החזית הצפונית, במבט ישר: שני טורי חלונות, קיר המסך של המבואה והשלט, כפי שהשרטוט מציג.", from: "n", span: [-2.5, 55.5], levels: [6.5, 21.5], box: { x0: 153200, x1: 159400, y0: 644900, y1: 646800 }, base: 645347, offset: 1591.92, hide: NO_SITE },
  { id: "south", title: "חזית דרומית", caption: "החזית הדרומית מעל החצר: חלונות הקומות, הכניסה והמדרגות, הקולונדה מתחת.", from: "s", span: [-3, 58], levels: [6.5, 21.5], box: { x0: 152000, x1: 158800, y0: 641900, y1: 643700 }, base: 642064, offset: -1526.09, hide: [...NO_SITE, "site:retaining", "site:entrance", "site:sidewalk", "site:street", "site:stair", "site:crossing", "site:lane"], section: { axis: "z", at: 20.9, keep: -1 } },
  { id: "east", title: "חזית מזרחית", caption: "החזית המזרחית: המבנה החדש מעל מבנה גן הילדים הקיים.", from: "e", span: [-3, 25], levels: [4, 22], box: { x0: 147300, x1: 152500, y0: 644700, y1: 646600 }, base: 645113, offset: 1501.48, hide: NO_SITE, section: { axis: "x", at: 57.2, keep: -1 } },
  { id: "west", title: "חזית מערבית", caption: "החזית המערבית עם מדרגות החירום, מהדלת בקומה 1־ אל החצר.", from: "w", span: [-3, 25], levels: [4, 22], box: { x0: 147300, x1: 152500, y0: 642300, y1: 644300 }, base: 642521, offset: -1484.23, hide: NO_SITE, section: { axis: "x", at: -1.5, keep: 1 } },
  { id: "aa", title: "חתך א־א", caption: "חתך לאורך המבנה: שתי הקומות, המבואה בחלל כפול עם המדרגות, האולם, ומבנה גן הילדים הקיים מתחת.", from: "s", span: [-3, 58], levels: [-1, 21.5], box: { x0: 160000, x1: 170500, y0: 644300, y1: 646800 }, base: 645590, offset: -1630.91, hide: NO_SITE, section: { axis: "z", at: 6.3, keep: -1 }, cut: true },
  { id: "bb", title: "חתך ב־ב", caption: "חתך דרך האולם הרב־תכליתי: הישיבה במדרגות עד הבמה.", from: "w", span: [-3, 25], levels: [3, 21], box: { x0: 166500, x1: 171800, y0: 641900, y1: 644300 }, base: 642552, offset: -1673.65, hide: NO_SITE, section: { axis: "x", at: 49.3, keep: 1 }, cut: true },
  { id: "cc", title: "חתך ג־ג", caption: "חתך דרך המעלית וחדר המדרגות.", from: "e", span: [-3, 25], levels: [3, 21], box: { x0: 162800, x1: 166400, y0: 641900, y1: 644300 }, base: 642573, offset: 1641.8, hide: NO_SITE, section: { axis: "x", at: 31.9, keep: -1 }, cut: true },
  { id: "dd", title: "חתך ד־ד", caption: "חתך דרך המדרגות מהרחוב אל החצר.", from: "e", span: [-3, 25], levels: [3, 21], box: { x0: 171800, x1: 176000, y0: 641900, y1: 644300 }, base: 642475, offset: 1729.7, hide: NO_SITE, section: { axis: "x", at: 27.4, keep: -1 }, cut: true },
];

const sides: Sheet[] = SIDES.map((v) => {
  const ym = (v.levels[0] + v.levels[1]) / 2;
  const um = (v.span[0] + v.span[1]) / 2;
  const d = 300;
  const at = v.from === "n" ? { x: um, z: -d } : v.from === "s" ? { x: um, z: d } : v.from === "e" ? { x: d, z: um } : { x: -d, z: um };
  const target = v.from === "n" || v.from === "s" ? { x: um, y: ym, z: 0 } : { x: 0, y: ym, z: um };
  const plan = (x: number) => (v.from === "s" || v.from === "w" ? x / 100 + v.offset : v.offset - x / 100);
  return {
    id: v.id,
    title: v.title,
    caption: v.caption,
    frame: { u: v.span, v: v.levels },
    camera: { position: { x: at.x, y: ym, z: at.z }, target, fovDeg: 30, orthoHalfWidth: (v.span[1] - v.span[0]) / 2, ...(v.section ? { section: v.section, interior: v.cut === true } : {}), hideTags: v.hide },
    // u is metres across the picture from the frame's left edge, in the plan's own direction: the image's right is +x (south, west) or the reverse.
    place: (x, y) => {
      const pl = plan(x);
      const across = v.from === "s" || v.from === "w" ? pl : v.span[1] - (pl - v.span[0]);
      return [across, (y - v.base) / 100 + 8.29];
    },
    pieces: (p) => {
      const q = p.pts?.[0] ?? p.arc?.c;
      return !!q && q.x >= v.box.x0 && q.x <= v.box.x1 && q.y >= v.box.y0 && q.y <= v.box.y1;
    },
  };
});

const hideFloor1 = ["roof", "facade"];
const hideFloor2 = ["roof", "facade", "floor-1"];
const sheets: Sheet[] = [
  {
    id: "plan-floor-2",
    title: "תכנית קומה 2־",
    caption: `הקומה התחתונה של המרכז (${"+" + LEVEL.floorMinus2}) בחתך אופקי, מלמעלה: חדרי מחשבים, כיתות, חדרי עזר, ממ"דים, שירותים, המבואה והמדרגות. מתחתיה מבנה גן הילדים הקיים.`,
    frame: planFrame,
    camera: topCamera(planFrame, { cutAboveM: LEVEL.floorMinus2 + 1.5, interior: true, hideTags: hideFloor2 }),
    place: planPlace(sheetLeft("floor-2")),
    pieces: inSheet(sheetLeft("floor-2")),
    names: roomNames("floor-2"),
  },
  {
    id: "plan-floor-1",
    title: "תכנית קומה 1־",
    caption: `הקומה העליונה (${"+" + LEVEL.floorMinus1}) בחתך אופקי, מלמעלה: עיצוב מרחבי למידה, כיתה, מבואה בחלל כפול, מזכירות, משרדים, סדנה ואולם רב־תכליתי.`,
    frame: planFrame,
    camera: topCamera(planFrame, { cutAboveM: LEVEL.floorMinus1 + 1.5, interior: true, hideTags: hideFloor1 }),
    place: planPlace(sheetLeft("floor-1")),
    pieces: inSheet(sheetLeft("floor-1")),
    names: roomNames("floor-1"),
  },
  {
    id: "plan-roof",
    title: "תכנית גג",
    caption: "הגג מלמעלה: חניה, רחבת הגג, חדר המעלית והכניסה מהרחוב; הקירוי בולט 1.24 מ' צפונה מקיר הקומה.",
    frame: planFrame,
    camera: topCamera(planFrame, {}),
    place: planPlace(203544, -152),
    pieces: inSheet(203544),
  },
  ...sides,
];

/** The DXF's linework of a sheet as an SVG laid in its frame. */
function drawing(s: Sheet): string {
  const H = heightFor(s.frame);
  const k = W / (s.frame.u[1] - s.frame.u[0]);
  // Plans run z down the picture; views run levels up it.
  const isPlan = s.id.startsWith("plan");
  const at = (x: number, y: number): [number, number] => {
    const [u, v] = s.place(x, y);
    return [(u - s.frame.u[0]) * k, (s.frame.v[1] - v) * k];
  };
  // A plan's place() gives z, south-positive, which is down the picture.
  const atPlan = (x: number, y: number): [number, number] => {
    const [u, z] = s.place(x, y);
    return [(u - s.frame.u[0]) * k, (z - s.frame.v[0]) * k];
  };
  const to = isPlan ? atPlan : at;
  const colour = (layer: string) => (/^(קיר|אדום)/.test(layer) ? "#8a1c1c" : /^חלון/.test(layer) ? "#1c4fa0" : /^דלטוט|A-DOR/.test(layer) ? "#2a7a3a" : /^(רהיטים|furniture)/.test(layer) ? "#4a4a4a" : "#8c8c8c");
  const width = (layer: string) => (/^(קיר|אדום)/.test(layer) ? 2.2 : /^חלון/.test(layer) ? 1.4 : 0.9);
  const pieces = (isPlan ? flattenDxf(dxf!, entitiesWithin(dxf!, { centre: { x: sheetCentre(s), y: PISGA_DXF.frameY + PISGA_DXF.height / 2 }, width: PISGA_DXF.width, height: PISGA_DXF.height })) : allPieces).filter(s.pieces);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#ffffff"/>`;
  for (const p of pieces) {
    if (/^(מידה|טקסט|0$)/.test(p.layer) || p.text) continue;
    const line = p.pts && p.pts.length >= 2 ? (p.closed ? [...p.pts, p.pts[0]!] : p.pts) : p.arc ? arcPoints(p.arc.c, p.arc.r, p.arc.start, p.arc.end) : p.circle ? arcPoints(p.circle.c, p.circle.r, 0, Math.PI * 2) : null;
    if (!line) continue;
    svg += `<polyline fill="none" stroke="${colour(p.layer)}" stroke-width="${width(p.layer)}" points="${line.map((q) => to(q.x, q.y).map((n) => n.toFixed(1)).join(",")).join(" ")}"/>`;
  }
  for (const n of s.names ?? []) {
    const [x, y] = [(n.u - s.frame.u[0]) * k, (n.v - s.frame.v[0]) * k];
    svg += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="22" font-family="Arial, Helvetica, sans-serif" fill="#b00020" text-anchor="middle">${n.text.replace(/[<&>]/g, "")}</text>`;
  }
  return svg + "</svg>";
}
/** The left edge of the sheet a plan frame draws: the sheets are 9,757 apart on a row. */
function sheetCentre(s: Sheet): number {
  const left = s.id === "plan-floor-2" ? sheetLeft("floor-2") : s.id === "plan-floor-1" ? sheetLeft("floor-1") : 203544;
  return left + PISGA_DXF.width / 2;
}

// ---- The renders. ---------------------------------------------------------------------------------------------------------------------

const SUN_HIGH = { azimuthDeg: 160, elevationDeg: 72 };
const payload = (s: Sheet): Payload => ({
  model,
  camera: s.camera,
  width: W,
  height: heightFor(s.frame),
  sun: s.id.startsWith("plan") ? SUN_HIGH : { azimuthDeg: s.id === "south" ? 180 : s.id === "east" ? 110 : s.id === "west" ? 250 : 300, elevationDeg: 35 },
  // The elevations from the south, east and west stood washed out at the plans' exposure.
  exposure: s.id.startsWith("plan") ? 0.64 : ["south", "east", "west"].includes(s.id) ? 0.46 : 0.58,
  ao: true,
});
say(`rendering ${sheets.length} sheets`);
// A plan is the storey alone on a white sheet with its cut walls solid (cut-model.ts), as a drawing is read.
const sheetShots = await renderBuildingFrames(sheets.map((s) => (s.id.startsWith("plan-floor") ? asCutPlan(payload(s)) : payload(s))), { outputWidthPx: 99999 });

// ---- The perspectives: outside, and inside the new floors. ------------------------------------------------------------------------------

type View = { id: string; kicker: string; title: string; caption: string; camera: Camera; sun: { azimuthDeg: number; elevationDeg: number }; exposure?: number };
const VIEWS: View[] = [
  { id: "north-facade", kicker: "מבט חוץ", title: "החזית הצפונית", caption: "החזית שפונה אל המדרון: שני טורי חלונות באבן, קיר המסך של המבואה והשלט.", camera: { position: { x: 27.4, y: 6, z: -48 }, target: { x: 27.4, y: 10.5, z: 6 }, fovDeg: 38 }, sun: { azimuthDeg: 292, elevationDeg: 22 } },
  { id: "aerial-ne", kicker: "מבט חוץ", title: "מבט אוויר מצפון־מזרח", caption: "המבנה החדש מעל מבנה גן הילדים הקיים, וחניה על הגג בגובה הרחוב.", camera: { position: { x: 88, y: 46, z: -48 }, target: { x: 27, y: 7, z: 8 }, fovDeg: 32 }, sun: { azimuthDeg: 250, elevationDeg: 38 } },
  { id: "aerial-sw", kicker: "מבט חוץ", title: "גג החניה והרחוב", caption: "הכניסה לחניה מהרחוב דרך שער מקורה, והגג כחצר עליונה.", camera: { position: { x: -34, y: 44, z: 62 }, target: { x: 27, y: 12, z: 8 }, fovDeg: 32 }, sun: { azimuthDeg: 200, elevationDeg: 48 }, exposure: 0.46 },
  { id: "courtyard", kicker: "מבט חוץ", title: "החצר הדרומית והקולונדה", caption: "מעבר מקורה לאורך הקומה, בין עמודי המבנה לקיר התמך.", camera: { position: { x: 56, y: 10.0, z: 17.2 }, target: { x: 15, y: 11.0, z: 14.6 }, fovDeg: 58 }, sun: { azimuthDeg: 180, elevationDeg: 55 } },
  { id: "roof-top", kicker: "מבט חוץ", title: "הגג מלמעלה", caption: "חניה, רחבת הגג וחדר המעלית; הרחוב והכניסה מדרום.", camera: { position: { x: 27.4, y: 118, z: 34 }, target: { x: 27.4, y: 12, z: 9 }, fovDeg: 30 }, sun: { azimuthDeg: 200, elevationDeg: 60 } },
  { id: "lobby", kicker: "חללי פנים", title: "מבואה — חלל כפול", caption: "מדרגות פתוחות ומעקה זכוכית, מבט אל הנוף דרך קיר המסך.", camera: { position: { x: 33.2, y: 8.29 + 1.65, z: 6.4 }, target: { x: 22, y: 8.29 + 3.4, z: 4.2 }, fovDeg: 72, interior: true }, sun: { azimuthDeg: 290, elevationDeg: 25 } },
  { id: "hall", kicker: "חללי פנים", title: "אולם רב־תכליתי 135 מ\"ר", caption: "מושבים ברצפה משופעת עד הבמה, חיפוי רפפות עץ אקוסטי.", camera: { position: { x: 51.8, y: 12.77 + 1.6, z: 15.2 }, target: { x: 47.5, y: 12.77 + 1.1, z: 2 }, fovDeg: 62, interior: true }, sun: { azimuthDeg: 200, elevationDeg: 50 } },
  { id: "design", kicker: "חללי פנים", title: "עיצוב מרחבי למידה 109 מ\"ר", caption: "שולחנות עבודה ארוכים ומרחב גמיש.", camera: { position: { x: 13.8, y: 12.77 + 1.6, z: 8.6 }, target: { x: 4, y: 12.77 + 1.0, z: 2.5 }, fovDeg: 62, interior: true }, sun: { azimuthDeg: 290, elevationDeg: 25 } },
  { id: "workshop", kicker: "חללי פנים", title: "סדנה לגיל הרך 70 מ\"ר", caption: "שולחנות קבוצתיים ופינות עבודה.", camera: { position: { x: 43.5, y: 12.77 + 1.6, z: 10.4 }, target: { x: 35.5, y: 12.77 + 0.8, z: 14.6 }, fovDeg: 66, interior: true }, sun: { azimuthDeg: 200, elevationDeg: 45 } },
  { id: "computers", kicker: "חללי פנים", title: "חדר מחשבים 50 מ\"ר", caption: "עמדות מחשב גב אל גב.", camera: { position: { x: 8.4, y: 8.29 + 1.6, z: 5.7 }, target: { x: 2.2, y: 8.29 + 0.8, z: 2.6 }, fovDeg: 64, interior: true }, sun: { azimuthDeg: 290, elevationDeg: 25 } },
  { id: "classroom", kicker: "חללי פנים", title: "כיתה 50 מ\"ר", caption: "שולחנות קבוצתיים ושולחנות עגולים.", camera: { position: { x: 46.3, y: 8.29 + 1.6, z: 6.0 }, target: { x: 52.4, y: 8.29 + 0.8, z: 2.4 }, fovDeg: 64, interior: true }, sun: { azimuthDeg: 70, elevationDeg: 25 } },
];
say(`rendering ${VIEWS.length} perspectives`);
const viewShots = await renderBuildingFrames(
  VIEWS.map((v): Payload => ({ model, camera: v.camera, width: 2400, height: 1500, sun: v.sun, exposure: v.exposure ?? 0.62, ao: true, ...(Number(process.env.TRACE ?? 0) > 0 ? { pathTrace: { samples: Number(process.env.TRACE) } } : {}) })),
  { outputWidthPx: 1600 },
);
VIEWS.forEach((v, i) => fs.writeFileSync(path.join(outDir, `view-${v.id}.jpg`), viewShots[i]!));

// ---- The pages. -----------------------------------------------------------------------------------------------------------------------

const bookSheets = [];
for (const [i, s] of sheets.entries()) {
  const H = heightFor(s.frame);
  const drawn = await sharp(Buffer.from(drawing(s))).png().toBuffer();
  const rendered = await sharp(sheetShots[i]!).resize(W, H).jpeg({ quality: 90 }).toBuffer();
  fs.writeFileSync(path.join(outDir, `sheet-${s.id}.png`), drawn);
  fs.writeFileSync(path.join(outDir, `render-${s.id}.jpg`), rendered);
  bookSheets.push({ no: i + 1, title: s.title, caption: s.caption, sheet: await jpeg(drawn), render: await jpeg(rendered) });
}
const plates = [];
for (const [i, v] of VIEWS.entries()) if (v.id !== "north-facade") plates.push({ kicker: v.kicker, title: v.title, caption: v.caption, image: await jpeg(viewShots[i]!) });

const L = (v: string) => `<span dir="ltr">${v}</span>`;
const rooms: Array<{ name: string; floor: string; area: string }> = [];
const seen = new Set<string>();
for (const [id, floor] of [["floor-1", `קומה 1־ ${L("+" + LEVEL.floorMinus1)}`], ["floor-2", `קומה 2־ ${L("+" + LEVEL.floorMinus2)}`]] as const) {
  for (const l of dxfRoomLabels(dxf, id)) {
    const m = /(\d+)\s*מ"ר/.exec(l.name);
    if (!m) continue;
    const name = l.name.replace(/\s*\d+\s*מ"ר$/, "").trim();
    const key = `${name}|${floor}|${m[1]}|${Math.round(l.x)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rooms.push({ name, floor, area: `${m[1]} מ"ר` });
  }
}

const html = buildBuildingBookletHtml({
  projectName: 'מרכז פסג"ה למורים',
  subtitle: "קריית ארבע",
  architect: "גוטליב אדריכלים · קובץ עבודה 29.04.25",
  hero: await jpeg(viewShots[VIEWS.findIndex((v) => v.id === "north-facade")]!),
  kpis: [
    { label: "שרטוטים", value: String(bookSheets.length) },
    { label: "קומות חדשות", value: "2 + גג חניה" },
    { label: "אולם", value: '135 מ"ר' },
    { label: "±0.00", value: L("923.20") },
    { label: "מעקה", value: L("+18.40") },
  ],
  paragraphs: [
    "מבנה חדש בן שתי קומות מעל מבנה גן ילדים קיים, חפור במדרון: הכניסה מרחוב דוד המלך בגובה הגג, שעליו חניה, ומשם יורדים במדרגות ובמעלית אל שתי קומות המרכז ואל החצר השקועה מדרום.",
    "ההדמיה היא של הקומות החדשות. מבנה גן הילדים, שכבר בנוי, מוצג כהקשר קיים בלבד — מעטפתו ומחיצותיו כפי שהשרטוטים מציבים אותן. כל תמונה בחוברת נבנתה מתוך קובץ ה־DXF של האדריכל, ולצד כל הדמיה השרטוט שלה בקווי ה־DXF עצמם, באותה מסגרת: הקירות, החלונות והדלתות לפי הסמלים, שמות החדרים ושטחיהם המודפסים, המפלסים והריהוט.",
  ],
  rooms,
  sheets: bookSheets,
  plates,
});
fs.writeFileSync(path.join(outDir, "booklet.html"), html);
say(`html: ${bookSheets.length * 3 + plates.length + 1} pages`);
if (!flags.includes("--no-pdf")) {
  const pdf = await renderHtmlSectionsPdf(html, { waitForImages: true, timeoutMs: 300_000, sheet: BUILDING_BOOKLET_PAGE, jpegQuality: 86 });
  fs.writeFileSync(path.join(outDir, "booklet.pdf"), pdf);
  say(`pdf: ${path.join(outDir, "booklet.pdf")}`);
}
process.exit(0);
