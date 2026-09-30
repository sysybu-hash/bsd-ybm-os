#!/usr/bin/env npx tsx
/**
 * מרכז פסג"ה — the building booklet, in the system's booklet design.
 *
 *   npx tsx --conditions=react-server scripts/booklet-pisga.mts <sheet pngs> <sheet views> <perspectives> <out.pdf>
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
config({ path: ".env.local" });

const sharp = (await import("sharp")).default;
const { buildBuildingBookletHtml, BUILDING_BOOKLET_PAGE } = await import("@/lib/projects/building/booklet-html");
const { renderHtmlSectionsPdf } = await import("@/lib/pdf/render-html-pdf-chromium");
const { LABELS_MINUS1, LABELS_MINUS2, LABELS_FUTURE } = await import("@/lib/projects/building/pisga");

const [sheetsDir, viewsDir, perspDir, out] = process.argv.slice(2) as [string, string, string, string];
const K = 1.5;
/** The drawing area of a sheet, without its title block: sheet-image pixels. */
const FRAME = { x: 10, y: 10, w: 2000, h: 1648 };

const jpeg = async (buf: Buffer | string, width = 2600) => ({
  mimeType: "image/jpeg",
  base64: (await sharp(buf).resize({ width, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()).toString("base64"),
});
/** The drawings on a sheet: the union of their boxes, with a margin — the frame both images share. */
const views = JSON.parse(fs.readFileSync(path.join(viewsDir, "sheets.json"), "utf8")) as Record<string, { sheet: number; box: [number, number, number, number] }>;
const frameOf = (n: number) => {
  const boxes = Object.values(views).filter((v) => v.sheet === n).map((v) => v.box);
  if (boxes.length === 0) return FRAME;
  const pad = 20;
  const x0 = Math.max(FRAME.x, Math.min(...boxes.map((b) => b[0])) - pad);
  const y0 = Math.max(FRAME.y, Math.min(...boxes.map((b) => b[1])) - pad);
  const x1 = Math.min(FRAME.x + FRAME.w, Math.max(...boxes.map((b) => b[2])) + pad);
  const y1 = Math.min(FRAME.y + FRAME.h, Math.max(...boxes.map((b) => b[3])) + pad);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};
const cropSheet = async (n: number) => {
  const f = frameOf(n);
  return jpeg(await sharp(path.join(sheetsDir, `sheet-${String(n).padStart(2, "0")}.png`)).extract({ left: f.x, top: f.y, width: f.w, height: f.h }).toBuffer());
};
const cropRender = async (n: number) => {
  const FRAME = frameOf(n);
  const f = path.join(viewsDir, `sheet-${String(n).padStart(2, "0")}.finished.placed.png`);
  const g = fs.existsSync(f) ? f : path.join(viewsDir, `sheet-${String(n).padStart(2, "0")}.placed.png`);
  return jpeg(
    await sharp(g).extract({ left: Math.round(FRAME.x * K), top: Math.round(FRAME.y * K), width: Math.round(FRAME.w * K), height: Math.round(FRAME.h * K) }).toBuffer(),
  );
};

const L = (v: string) => `<span dir="ltr">${v}</span>`;
const SHEETS: Array<[number, string, string]> = [
  [1, "שער — חזית צפונית", "החזית הצפונית, במבט ישר ובקנה המידה של הגיליון."],
  [2, "תכנית פיתוח", "המגרש מלמעלה: הרחוב, הכניסה לחניה, גג המבנה, החצר השקועה ומבנה גן הילדים הקיים."],
  [3, "תכנית גג עליון", "הגג מלמעלה: חניה ל־12 רכבים (אחד נגיש), רחבת הגג וחדר המעלית."],
  [4, "תכנית גג", "הגג מלמעלה, כפי שבגיליון."],
  [5, "קומה 1־", "הקומה העליונה בחתך אופקי, מלמעלה: עיצוב מרחבי למידה, כיתה, מבואה בחלל כפול, מזכירות, משרדים, סדנה ואולם רב־תכליתי."],
  [6, "קומה 2־", "הקומה התחתונה בחתך אופקי, מלמעלה: חדרי מחשבים, כיתות, חדרי עזר, ממ\"דים, מבואה ומדרגות, והקולונדה."],
  [7, "תכנית עתידית — אולם", "קומה 1־ בתכנית העתידית: אולם אירועים 236 מ\"ר עם 28 שולחנות עגולים, מטבח וממ\"ד."],
  [8, "חזיתות צפון ודרום", "החזית הצפונית (למעלה) והחזית הדרומית מעל החצר (למטה), בקנה המידה של הגיליון."],
  [9, "חזיתות מזרח ומערב", "החזית המזרחית (למעלה) והמערבית (למטה): המבנה החדש מעל גן הילדים הקיים."],
  [10, "חתכים א־א, ב־ב, ג־ג", "חתך לאורך המבנה (למעלה), חתך דרך המעלית (משמאל) וחתך דרך האולם הרב־תכליתי והמושבים המדורגים (מימין)."],
  [11, "חתך ד־ד", "חתך דרך המדרגות מהרחוב אל החצר."],
];

const sheets = [];
for (const [no, title, caption] of SHEETS) sheets.push({ no, title, caption, sheet: await cropSheet(no), render: await cropRender(no) });
// Sheet 12 is itself a picture: the lift, beside its photographic finish.
sheets.push({
  no: 12,
  title: "מעלון",
  caption: "המעלון הנגיש שבגיליון, בגימור צילומי.",
  sheet: await jpeg(path.join(sheetsDir, "sheet-12.png")),
  render: await jpeg(path.join(perspDir, "pisga-lift.jpg")),
});

const persp = (k: string) => path.join(perspDir, `pisga-${k}.jpg`);
const PLATES: Array<[string, string, string, string]> = [
  ["aerial-ne", "מבט חוץ", "מבט אוויר מצפון־מזרח", "המבנה החדש מעל מבנה גן הילדים הקיים, וחניה על הגג בגובה הרחוב."],
  ["aerial-sw", "מבט חוץ", "גג החניה והרחוב", "הכניסה לחניה מרחוב דוד המלך, דרך שער מקורה."],
  ["courtyard", "מבט חוץ", "החצר הדרומית והקולונדה", "מעבר מקורה לאורך הקומה, בין עמודי המבנה לקיר התמך ושדרת העצים."],
  ["lobby", "חללי פנים", "מבואה — חלל כפול", "מדרגות פתוחות ומעקה זכוכית, מבט אל הנוף דרך קיר המסך."],
  ["hall", "חללי פנים", "אולם רב־תכליתי 135 מ\"ר", "כ־117 מושבים ברצפה משופעת עד הבמה, חיפוי רפפות עץ אקוסטי."],
  ["design", "חללי פנים", "עיצוב מרחבי למידה 109 מ\"ר", "שולחנות עבודה ארוכים ומרחב גמיש."],
  ["workshop", "חללי פנים", "סדנה לגיל הרך 70 מ\"ר", "שולחנות קבוצתיים ופינות עבודה."],
  ["computers", "חללי פנים", "חדר מחשבים 50 מ\"ר", "עמדות מחשב גב אל גב."],
  ["classroom", "חללי פנים", "כיתה 50 מ\"ר", "שולחנות קבוצתיים ושולחנות עגולים."],
  ["future-event-hall", "תכנית עתידית", "אולם אירועים 236 מ\"ר", "28 שולחנות עגולים, כפי שבתכנית."],
];
const plates = [];
for (const [k, kicker, title, caption] of PLATES) if (fs.existsSync(persp(k))) plates.push({ kicker, title, caption, image: await jpeg(persp(k)) });

// The programme the sheets print: every named room with its printed area.
const rooms: Array<{ name: string; floor: string; area: string }> = [];
const seen = new Set<string>();
for (const [labels, floor] of [[LABELS_MINUS1, `קומה 1־ ${L("+12.77")}`], [LABELS_MINUS2, `קומה 2־ ${L("+8.29")}`], [LABELS_FUTURE.filter((l) => /236|60/.test(l.name)), "עתידי · קומה 1־"]] as const) {
  for (const l of labels) {
    const m = /(\d+)\s*מ/.exec(l.name);
    if (!m || /מעבר|שירותים/.test(l.name)) continue;
    const name = l.name.replace(/\s*\d+\s*מ"?ר?"?$/, "").replace(/\s*\d+\s*מ\\?"ר/, "").trim();
    const key = `${name}|${floor}|${m[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rooms.push({ name, floor, area: `${m[1]} מ"ר` });
  }
}

const html = buildBuildingBookletHtml({
  projectName: 'מרכז פסג"ה למורים',
  subtitle: "קריית ארבע",
  architect: "גוטליב אדריכלים · חוברת הגשה 09.09.25",
  hero: await jpeg(persp("north-facade")),
  kpis: [
    { label: "גיליונות", value: "12" },
    { label: "קומות", value: "2 + גג חניה" },
    { label: "חניה", value: "12 מקומות" },
    { label: "±0.00", value: L("923.20") },
    { label: "מעקה", value: L("+18.40") },
  ],
  paragraphs: [
    "מבנה חדש בן שתי קומות מעל מבנה גן ילדים קיים, חפור במדרון: הכניסה מרחוב דוד המלך בגובה הגג, שעליו חניה, ומשם יורדים במדרגות ובמעלית אל שתי קומות המרכז ואל החצר השקועה מדרום.",
    "כל גיליון בחוברת ההגשה מקבל כאן הדמיה בקנה המידה ובמסגרת של השרטוט עצמו — תוכניות מלמעלה, חזיתות וחתכים במבט ישר — והשוואה זה לצד זה. ההדמיות נבנו מתוך השרטוטים: הקירות, הפתחים, החדרים, הריהוט והמפלסים, כולל מבנה גן הילדים הקיים שאינו כלול בהיתר.",
  ],
  rooms,
  sheets,
  plates,
});
const pdf = await renderHtmlSectionsPdf(html, { waitForImages: true, timeoutMs: 300_000, sheet: BUILDING_BOOKLET_PAGE, jpegQuality: 86 });
fs.writeFileSync(out, pdf);
console.log(out, sheets.length * 3 + plates.length + 1, "pages");
