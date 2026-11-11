/**
 * The accuracy certificate: one verdict per link of the chain, printed in the
 * booklet so a buyer (and a regulator) can see how far the pictures are from
 * the permit sheet.
 *
 *   sheet → model     metres, measured on the sheet (fitModelToSheet)
 *   render → painting pixels / metres, measured on the picture (paintingDrift)
 *
 * The render itself is drawn from the model by a deterministic engine, so
 * that link carries no measured error of its own.
 */

import type { KindDeviation } from "./sheet-fit";
import type { PaintingDrift } from "./painting-drift";
import type { DeviationStats } from "./stats";

export type Grade = "pass" | "warn" | "fail";

/** Sheet link: green ≥ 95 % within 0.15 m and ≤ 1 % beyond 0.35 m. */
export function gradeSheet(s: DeviationStats): Grade {
  if (!s.n) return "fail";
  if (s.withinClose >= 0.95 && s.beyondFar <= 0.01) return "pass";
  if (s.withinClose >= 0.85 && s.beyondFar <= 0.05) return "warn";
  return "fail";
}

/**
 * Painting link, three parts, the worst decides (bounds provisional — to be
 * calibrated against eye verdicts, live research 5.40):
 *   frame    — the whole picture moved ≤ 6 px at 960 wide (warn ≤ 20);
 *   geometry — after the frame is undone, ≥ 85 % of the render's edges within
 *              3 px and ≤ 5 % beyond 8 px (warn ≥ 70 % / ≤ 12 %);
 *   invented — ≤ 10 % of the painting's edges are new structure 8–40 px from
 *              the render's (warn ≤ 20 %); dressing beyond 40 px is not graded.
 */
export function gradePainting(d: PaintingDrift): Grade {
  if (!d.kept.n) return "fail";
  const frame: Grade = d.frameMovePx <= 6 ? "pass" : d.frameMovePx <= 20 ? "warn" : "fail";
  const g = d.keptAligned;
  const geometry: Grade = g.withinClose >= 0.85 && g.beyondFar <= 0.05 ? "pass" : g.withinClose >= 0.7 && g.beyondFar <= 0.12 ? "warn" : "fail";
  const invented: Grade = d.inventedNear <= 0.1 ? "pass" : d.inventedNear <= 0.2 ? "warn" : "fail";
  return worst([frame, geometry, invented]);
}

export type SheetEntry = { sheet: string; scale: string; byKind: KindDeviation[]; all: DeviationStats };
export type PaintingEntry = { view: string; drift: PaintingDrift; /** The render shipped instead of the painting. */ usedRender?: boolean };

export type Certificate = {
  sheets: Array<SheetEntry & { grade: Grade }>;
  paintings: Array<PaintingEntry & { grade: Grade }>;
  grade: Grade;
};

const worst = (gs: Grade[]): Grade => (gs.includes("fail") ? "fail" : gs.includes("warn") ? "warn" : "pass");

export function buildCertificate(sheets: SheetEntry[], paintings: PaintingEntry[]): Certificate {
  const s = sheets.map((e) => ({ ...e, grade: gradeSheet(e.all) }));
  // a view that shipped the free render has nothing painted to grade
  const p = paintings.map((e) => ({ ...e, grade: e.usedRender ? ("pass" as Grade) : gradePainting(e.drift) }));
  return { sheets: s, paintings: p, grade: worst([...s.map((e) => e.grade), ...p.map((e) => e.grade)]) };
}

// ---- booklet text (Hebrew; the booklet is a printed document in the client's language) ----

const GRADE_HE: Record<Grade, string> = { pass: "עובר", warn: "גבולי", fail: "נכשל" };
const pct = (v: number) => `${Math.round(v * 100)}%`;
const cm = (m: number) => `${Math.round(m * 100)}`;

/** Lines for the booklet's accuracy page. Numbers only in cells (live research 6.6); units in the headers. */
export function certificateRows(c: Certificate): { sheets: string[][]; paintings: string[][]; summary: string } {
  const sheets = c.sheets.map((e) => [e.sheet, e.scale, cm(e.all.median), cm(e.all.p90), pct(e.all.withinClose), GRADE_HE[e.grade]]);
  const paintings = c.paintings.map((e) => [
    e.view,
    e.usedRender ? "—" : String(Math.round(e.drift.frameMovePx)),
    e.usedRender ? "—" : pct(e.drift.keptAligned.withinClose),
    e.usedRender ? "—" : pct(e.drift.keptAligned.beyondFar),
    e.usedRender ? "—" : pct(e.drift.inventedNear),
    e.usedRender ? "רינדור" : GRADE_HE[e.grade],
  ]);
  return { sheets, paintings, summary: GRADE_HE[c.grade] };
}

export const CERTIFICATE_HEADERS_HE = {
  sheets: ["גיליון", "קנה מידה", "חציון (ס\"מ)", "90% עד (ס\"מ)", "עד 15 ס\"מ", "ציון"],
  paintings: ["מבט", "הזזת מסגרת (פיקסלים)", "קווים שנשמרו", "קווים שזזו", "מבנה שנוסף", "ציון"],
};
