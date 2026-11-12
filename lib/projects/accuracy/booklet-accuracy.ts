/**
 * The booklet's accuracy page: how far the model the pictures were drawn from lies from the sheets the client uploaded,
 * measured by the studio's overlay (flat-studio.ts sheetOverlay, building-studio.ts storeyOverlay) and printed as the
 * booklet's last page.
 *
 * The claim is narrow on purpose (live research 13.10, docs/plans/auto-booklet-vision.md risk 6): geometric agreement
 * with the uploaded file, nothing about the permit, the regulations or the building as built. It prints the measured
 * numbers and no pass/fail grade: the certificate's bounds (certificate.ts gradeSheet: 95 % within 15 cm) were set on
 * the scripts' fine fit, and the studio's overlay, which also measures walls the sheet draws in another way, is not yet
 * calibrated against them. The wording waits for a lawyer before it is sold as a certificate.
 */
import { PDFDocument } from "pdf-lib";

import { buildAppendixPageHtml, type BookletTable } from "@/lib/projects/building/booklet-html";
import { SHEET_BOUNDS_M, type DeviationStats } from "@/lib/projects/accuracy/stats";

export type AccuracyRow = { sheet: string; stats: DeviationStats };

const cm = (m: number) => String(Math.round(m * 100));
const pct = (v: number) => `${Math.round(v * 100)}%`;
/** A sheet's name, escaped, its signed numbers kept left to right ("מפלס +3.10", not "3.10+"). */
const sheetCell = (name: string) => name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/[+-]?\d[\d.,]*/g, (n) => `<span dir="ltr">${n}</span>`);

export function accuracyTable(rows: AccuracyRow[]): BookletTable {
  const close = cm(SHEET_BOUNDS_M.close);
  const far = cm(SHEET_BOUNDS_M.far);
  return {
    title: "המודל מול הגיליון",
    note: "המרחק מכל נקודה לאורך קירות המודל אל הקו הקרוב בגיליון, במטרים של הגיליון",
    head: ["גיליון", "נקודות שנמדדו", "חציון (ס\"מ)", "90% מהנקודות עד (ס\"מ)", `עד ${close} ס"מ`, `מעבר ל־${far} ס"מ`],
    rows: rows.map((r) => [sheetCell(r.sheet), String(r.stats.n), cm(r.stats.median), cm(r.stats.p90), pct(r.stats.withinClose), pct(r.stats.beyondFar)]),
  };
}

export const ACCURACY_WORDS: Array<{ title: string; text: string }> = [
  {
    title: "מה נמדד",
    text: "קירות המודל התלת־ממדי, שממנו צוירו כל ההדמיות בחוברת, הונחו על כל גיליון שהועלה. לאורך הקירות נדגמו נקודות, ולכל נקודה נמדד המרחק לקו הקרוב ביותר בגיליון, לפי קנה המידה של הגיליון.",
  },
  {
    title: "מה הדוח מראה",
    text: "את ההתאמה הגאומטרית בין המודל לבין הקבצים שהועלו, כפי שנמדדה בעת הפקת החוברת. ההדמיות צוירו מהמודל במנוע קבוע, בלי צביעה, ולכן לא נוספה בהן סטייה מעבר לזו שנמדדה כאן.",
  },
  {
    title: "מה הדוח אינו מאשר",
    text: "עמידה בהיתר, בתקנות או בכללי תכנון; התאמה למבנה כפי שייבנה או כפי שנבנה; ואת נכונות הקבצים שהועלו עצמם. ההדמיות להמחשה בלבד, ואין למדוד מהן.",
  },
];

export function accuracyPageHtml(projectName: string, rows: AccuracyRow[], producedAt?: Date): string {
  return buildAppendixPageHtml({
    projectName,
    kicker: "נספח · דוח דיוק",
    title: "דוח דיוק",
    table: accuracyTable(rows),
    paragraphs: ACCURACY_WORDS,
    caption: "מספרים שנמדדו, לא הערכה. המדידה חוזרת על עצמה: אותם קבצים נותנים אותם מספרים.",
    producedAt,
  });
}

/** The booklet with the accuracy page after its last page. */
export async function appendPdf(booklet: Buffer, page: Buffer): Promise<Buffer> {
  const out = await PDFDocument.load(booklet);
  const add = await PDFDocument.load(page);
  for (const p of await out.copyPages(add, add.getPageIndices())) out.addPage(p);
  return Buffer.from(await out.save());
}

/** The booklet's PDF, with the accuracy page when there are measured sheets; a failure here costs the page, never the booklet. */
export async function withAccuracyPage(
  bookletPdf: Buffer,
  projectName: string,
  rows: AccuracyRow[],
  htmlToPdf: (html: string) => Promise<Buffer>,
  onError: (message: string) => void,
): Promise<{ pdf: Buffer; added: boolean }> {
  const measured = rows.filter((r) => r.stats.n > 0);
  if (!measured.length) return { pdf: bookletPdf, added: false };
  try {
    return { pdf: await appendPdf(bookletPdf, await htmlToPdf(accuracyPageHtml(projectName, measured))), added: true };
  } catch (err: unknown) {
    onError(err instanceof Error ? err.message : String(err));
    return { pdf: bookletPdf, added: false };
  }
}
