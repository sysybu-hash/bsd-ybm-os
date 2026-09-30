import sharp from "sharp";

import { dwfFlatForUnit } from "@/lib/projects/dwf-building";
import { assessFloorplanRun } from "@/lib/projects/floorplan-confidence";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { measureBlockFidelity } from "@/lib/projects/floorplan-fidelity";
import type { RenderedFlat } from "@/lib/projects/floorplan-render-flat";
import { emptyFloorplanSpend, type FloorplanSpend } from "@/lib/projects/floorplan-spend";

/**
 * One apartment of a permit strip, drawn the way a CAD drawing is drawn.
 *
 * The sales-sheet route has to find the scale and the flat before it can
 * draw anything, and checks the one against a printed area. Here both are
 * given: the floor sheet is at 1:100 and the reader already knows which rooms
 * are this apartment's. What is left is the plate and its verdict — and the
 * floor sheet itself, cut round the apartment, as the booklet's source page.
 */
export type RenderedDwfFlat = RenderedFlat & {
  /** The floor sheet round the apartment, the page a booklet shows beside the render. */
  sheetRaster: { mimeType: "image/jpeg"; base64: string };
  /** The sheet's size, the frame the flat's bounds are measured in. */
  page: { width: number; height: number };
};

export async function renderFlatFromDwf(
  strip: DwfGeometry,
  unit: number,
  options: { level?: "lower" | "upper" | null; spend?: FloorplanSpend } = {},
): Promise<RenderedDwfFlat | null> {
  const spend = options.spend ?? emptyFloorplanSpend();
  const built = dwfFlatForUnit(strip, unit, options.level ?? null);
  if (!built) return null;
  const { flat, rooms, sheet } = built;
  const plate = await sharp(Buffer.from(flat.svg), { density: 200 })
    .flatten({ background: "#f4efe6" })
    .jpeg({ quality: 94 })
    .toBuffer();
  const fidelity = await measureBlockFidelity({ geometry: plate, still: plate, furniture: flat.furniture, bounds: flat.bounds });
  const sheetRaster = await sheetAround(sheet, flat.bounds);
  return {
    flat,
    rooms,
    geometry: plate,
    still: { mimeType: "image/jpeg", base64: plate.toString("base64") },
    score: 0,
    failures: [],
    attempts: 0,
    fidelity,
    coolTint: 0,
    confidence: assessFloorplanRun({
      // The scale is the drawing's own, so there is no area to miss.
      areaError: 0,
      unitsPerMetre: flat.unitsPerMetre,
      wallCount: flat.bodies.length,
      furniture: flat.furniture,
      rooms,
      fidelity,
      coolTint: 0,
      foundTerraces: flat.terraces.length,
      printedTerraces: flat.printedTerraceCount,
      auditHardFailures: [],
    }),
    spend,
    sheetRaster: { mimeType: "image/jpeg", base64: sheetRaster.toString("base64") },
    page: { width: sheet.pageWidth, height: sheet.pageHeight },
  };
}

/**
 * The sheet round a box, an eighth of its size beyond it on each side, as a
 * JPEG 2000 px wide. Lines and text only: the sheet's fills are the masks laid
 * under its level marks, in the paper's colour, and drawn in any other they
 * black the marks out. Walls are hatched in lines, so nothing is lost.
 */
async function sheetAround(sheet: DwfGeometry, box: { x: number; y: number; width: number; height: number }): Promise<Buffer> {
  const margin = Math.max(box.width, box.height) * 0.12;
  const x0 = box.x - margin;
  const y0 = box.y - margin;
  const w = box.width + 2 * margin;
  const h = box.height + 2 * margin;
  const px = 2000;
  const scale = px / w;
  const inside = (x: number, y: number) => x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h;
  const lines = [...sheet.segments, ...sheet.curves]
    .filter((s) => inside(s.x1, s.y1) || inside(s.x2, s.y2))
    .map((s) => {
      const heavy = s.lineWidth >= 1.2;
      return `<line x1="${((s.x1 - x0) * scale).toFixed(1)}" y1="${((s.y1 - y0) * scale).toFixed(1)}" x2="${((s.x2 - x0) * scale).toFixed(1)}" y2="${((s.y2 - y0) * scale).toFixed(1)}" stroke="${heavy ? "#20252b" : "#5b636c"}" stroke-width="${heavy ? 2.2 : 0.9}" stroke-linecap="round"/>`;
    })
    .join("");
  const escape = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
  // The room names, written as the sheet writes them: the reader's text, not strokes.
  const texts = sheet.texts
    .filter((t) => inside(t.x, t.y) && t.text.trim())
    .map((t) => `<text x="${((t.x - x0) * scale).toFixed(1)}" y="${((t.y - y0) * scale).toFixed(1)}" font-size="${(t.height * scale).toFixed(1)}" font-family="Arial, sans-serif" fill="#1f2937" text-anchor="middle" direction="rtl">${escape(t.text)}</text>`)
    .join("");
  const height = Math.round(h * scale);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${height}" viewBox="0 0 ${px} ${height}"><rect width="100%" height="100%" fill="#ffffff"/>${lines}${texts}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}
