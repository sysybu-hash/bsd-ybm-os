import sharp from "sharp";

import { buildBuildingBookletHtml, type BookletImage, type BuildingBookletPlate, type BuildingBookletSheet } from "@/lib/projects/building/booklet-html";
import { buildingFromDwf, DWF_BUILDING_STANDARDS, type DwfBuilding } from "@/lib/projects/building/from-dwf";
import { dwfBuildingViews, levelText } from "@/lib/projects/building/dwf-views";
import { renderBuildingFrames } from "@/lib/projects/building/renderer";
import { dwfFlatForUnit, listDwfUnits } from "@/lib/projects/dwf-building";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { dwfSheetJpeg } from "@/lib/projects/floorplan-render-dwf";
import { renderMeasuredStill } from "@/lib/projects/floorplan-render3d-still";
import { floorplanGeometryPayload } from "@/lib/projects/floorplan-geometry-payload";
import { resolveFloorplanVizStyle } from "@/lib/projects/floorplan-viz-styles";
import { splitStrip } from "@/lib/projects/sheet-split";
import { sheetGeometry } from "@/lib/projects/floorplan-dwf";

/**
 * A building's booklet from its permit strip (DWF), with nothing entered by
 * hand but the project's name.
 *
 * The building is stood up from the strip (buildingFromDwf) and drawn from
 * cameras solved from its size. Each floor sheet is paired with its storey
 * drawn from above in the sheet's own frame — the same picture, pixel for
 * pixel — and each elevation with the building drawn square to that face.
 * Every apartment follows as a plate of its own, the measured render a flat
 * gets from its sales sheet. Nothing here calls an image model: the finish
 * is a separate, paid step.
 */
export type DwfBookletOptions = {
  projectName: string;
  subtitle?: string;
  /** The practice or the submission the strip belongs to, as the cover credits it. */
  credit?: string;
  styleId?: string;
  onProgress?: (step: string) => void;
};

export type DwfBooklet = { html: string; building: DwfBuilding; pages: number };

const jpeg = async (buf: Buffer, width = 2600): Promise<BookletImage> => ({
  mimeType: "image/jpeg",
  base64: (await sharp(buf).resize({ width, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()).toString("base64"),
});

/** A drawing's own extent on its sheet: its lines, the stray 2% at either end left out. */
function drawnBox(g: DwfGeometry): { x: number; y: number; width: number; height: number } {
  const xs = g.segments.flatMap((s) => [s.x1, s.x2]).sort((a, b) => a - b);
  const ys = g.segments.flatMap((s) => [s.y1, s.y2]).sort((a, b) => a - b);
  const at = (arr: number[], q: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(q * (arr.length - 1))))] ?? 0;
  const x0 = at(xs, 0.02);
  const x1 = at(xs, 0.98);
  const y0 = at(ys, 0.02);
  const y1 = at(ys, 0.98);
  const pad = 0.04 * Math.max(x1 - x0, y1 - y0);
  return { x: x0 - pad, y: y0 - pad, width: x1 - x0 + 2 * pad, height: y1 - y0 + 2 * pad };
}

export async function buildDwfBuildingBooklet(strip: DwfGeometry, options: DwfBookletOptions): Promise<DwfBooklet> {
  const say = options.onProgress ?? (() => undefined);
  say("reading the building");
  const building = buildingFromDwf(strip, { name: options.projectName });
  const views = dwfBuildingViews(building);
  say(`drawing ${views.length} views`);
  const frames = await renderBuildingFrames(
    views.map((v) => ({ ...v.payload, model: building.model })),
    { outputWidthPx: 2000 },
  );
  const frameOf = (id: string) => frames[views.findIndex((v) => v.id === id)];

  // Sheets: each floor beside its storey from above; each elevation beside the face.
  const sheets: BuildingBookletSheet[] = [];
  let no = 0;
  for (const f of building.floors) {
    const render = frameOf(`plan-${f.id}`);
    if (!render) continue;
    const box = { x: 0, y: 0, width: f.sheet.pageWidth, height: f.sheet.pageHeight };
    sheets.push({
      no: ++no,
      title: f.units.length ? `קומה ${levelText(f.level)} — דירות ${f.units.join(", ")}` : `קומה ${levelText(f.level)}`,
      caption: `תכנית הקומה והקומה בהדמיה, מלמעלה, באותה מסגרת ובאותו קנה מידה. ${Math.round(f.registration * 100)}% מקירות הגיליון מתיישבים על הקומה הסמוכה.`,
      sheet: await jpeg(await dwfSheetJpeg(f.sheet, box, 2400)),
      render: await jpeg(render),
    });
  }
  const elevations: Array<[string, string]> = [
    ["elev-south", "חזית דרומית"],
    ["elev-east", "חזית מזרחית"],
    ["elev-north", "חזית צפונית"],
    ["elev-west", "חזית מערבית"],
  ];
  const stripSheets = splitStrip(strip);
  for (const [id, title] of elevations) {
    const render = frameOf(id);
    const drawn = stripSheets.find((s) => s.kind === "elevation" && (s.title ?? "").includes(title));
    if (!render || !drawn) continue;
    const g = sheetGeometry(strip, drawn.box);
    sheets.push({
      no: ++no,
      title,
      caption: "החזית בגיליון, והבניין בהדמיה במבט ישר אל אותה חזית.",
      sheet: await jpeg(await dwfSheetJpeg(g, drawnBox(g), 2400)),
      render: await jpeg(render),
    });
  }

  // Plates: the aerials, then every apartment.
  const plates: BuildingBookletPlate[] = [];
  for (const [id, title] of [["aerial-se", "מבט על מדרום־מזרח"], ["aerial-nw", "מבט על מצפון־מערב"]] as const) {
    const image = frameOf(id);
    if (image) plates.push({ kicker: "מבט חוץ", title, caption: "הבניין כולו, כפי שנבנה מתוכניות הקומות, המפלסים והחתכים שבגרמושקה.", image: await jpeg(image) });
  }
  const style = resolveFloorplanVizStyle(options.styleId ?? "haredi_classic");
  const rooms: Array<{ name: string; floor: string; area: string }> = [];
  const units = listDwfUnits(strip);
  say(`drawing ${units.length} apartments`);
  for (const u of units) {
    const flat = dwfFlatForUnit(strip, u.unit, u.level);
    if (!flat) continue;
    const label = `דירה ${u.unit}${u.level === "upper" ? " — קומה עליונה" : u.level === "lower" ? " — קומה תחתונה" : ""}`;
    const bedrooms = flat.rooms.filter((r) => r.kind === "bedroom" || r.kind === "mmd").length;
    rooms.push({ name: label, floor: `<span dir="ltr">${levelText(u.levelM)}</span>`, area: `${flat.flat.floorM2.toFixed(1)} מ"ר` });
    const still = await renderMeasuredStill({
      geometry: floorplanGeometryPayload(flat.flat, flat.rooms, { labelled: [], page: { width: flat.sheet.pageWidth, height: flat.sheet.pageHeight } }),
      styleKit: style,
      unitTitle: label,
      areaM2: flat.flat.floorM2,
      deadlineMs: Date.now() + 120_000,
      selected: true,
    });
    if (!still) continue;
    plates.push({
      kicker: "דירות",
      title: label,
      caption: `${bedrooms} חדרי שינה (כולל ממ"ד), ${flat.rooms.length} חללים, ${flat.flat.floorM2.toFixed(1)} מ"ר${flat.flat.terraces.length ? `, ${flat.flat.terraces.length === 1 ? "מרפסת" : `${flat.flat.terraces.length} מרפסות`}` : ""}.`,
      image: await jpeg(Buffer.from(still.base64, "base64")),
    });
  }

  const storeys = building.floors.filter((f) => !f.roof);
  const top = Math.max(...storeys.map((f) => f.level + f.height));
  const hero = frameOf("hero") ?? frameOf("aerial-se");
  if (!hero) throw new Error("the building could not be drawn");
  const html = buildBuildingBookletHtml({
    projectName: options.projectName,
    subtitle: options.subtitle ?? "",
    architect: options.credit ?? "",
    hero: await jpeg(hero),
    kpis: [
      { label: "קומות", value: String(storeys.length) },
      { label: "דירות", value: String(new Set(units.map((u) => u.unit)).size) },
      { label: "גובה", value: `<span dir="ltr">${levelText(top)}</span>` },
      { label: "גיליונות", value: String(sheets.length) },
    ],
    paragraphs: [
      `הבניין נבנה ישירות מגרמושקת ההיתר: כל תוכנית קומה נקראה לקירות, לפתחים, לחדרים ולדירות, המפלס של כל קומה נלקח מהמפלסים שמסומנים עליה, והקומות הונחו זו על זו לפי הקירות שחוזרים בכולן — חדר המדרגות והמעלית.`,
      `מה שהתוכניות אינן משרטטות נלקח מתקנים מקובלים ומצוין כאן: אדן חלון ${DWF_BUILDING_STANDARDS.window.sill.toFixed(2)} מ' ומשקוף ${DWF_BUILDING_STANDARDS.window.head.toFixed(2)} מ', דלת למרפסת מזוגגת עד הרצפה, מעקה מרפסת בגובה ${DWF_BUILDING_STANDARDS.railing.toFixed(2)} מ' — מעקה סורגים כשהחזיתות משרטטות סורגים — ומעקה גג בגובה ${DWF_BUILDING_STANDARDS.parapet.toFixed(2)} מ'.`,
    ],
    rooms,
    sheets,
    plates,
  });
  return { html, building, pages: 1 + sheets.length * 3 + plates.length };
}
