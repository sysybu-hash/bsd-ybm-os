import { PDFDocument } from "pdf-lib";

import { rasterizePdfPageJpeg } from "@/lib/projects/floorplan-raster-page";
import { extractFloorplanVectorGeometry, extractPdfPageText, extractPrintedAreas } from "@/lib/projects/floorplan-vector";
import { storeyOf } from "@/lib/projects/building/dxf-house";
import {
  COMMERCIAL_WORDS,
  countMatches,
  DWELLING_WORDS,
  SITE_WORDS,
  type PlanEvidence,
} from "@/lib/projects/structure/classify";
import { PREVIEW_PX, type FileIdentification } from "@/lib/projects/structure/identify-dxf";
import type { IdentifiedPlan, PlanSheetKind } from "@/lib/validation/schemas/floorplan-structure";

/** A sales brochure runs to a dozen pages; past that it is not one plan set. */
export const MAX_PDF_PAGES = 12;
/** A floor plan draws at least this many wall faces; a cover or a table draws none. */
const MIN_FLOOR_WALLS = 8;

/** One page of a PDF as a PDF of its own, which every page-1 reader takes. */
export async function pdfPage(pdf: Uint8Array, index: number): Promise<Uint8Array | null> {
  try {
    const source = await PDFDocument.load(pdf, { ignoreEncryption: true });
    if (index < 0 || index >= source.getPageCount()) return null;
    if (source.getPageCount() === 1) return pdf;
    const out = await PDFDocument.create();
    const [page] = await out.copyPages(source, [index]);
    out.addPage(page!);
    return await out.save();
  } catch {
    return null;
  }
}

async function pageCount(pdf: Uint8Array): Promise<number> {
  try {
    return (await PDFDocument.load(pdf, { ignoreEncryption: true })).getPageCount();
  } catch {
    return 0;
  }
}

/** What a page draws, from what it prints and how many walls it has. */
function pageKind(text: string, walls: number, areas: number): PlanSheetKind {
  if (SITE_WORDS.test(text) && areas === 0) return "site";
  if (/חזית|elevation/i.test(text) && areas === 0 && !DWELLING_WORDS.test(text)) return "elevation";
  if (/חתך|section/i.test(text) && areas === 0 && !DWELLING_WORDS.test(text)) return "section";
  return walls >= MIN_FLOOR_WALLS ? "floor" : "other";
}

/**
 * A PDF, read page by page for what it is: the words each page prints, the
 * areas it prints, how much wall it draws, and a preview. A page that names
 * two or more numbered flats is a building's floor. No model is called.
 */
export async function identifyPdf(bytes: Uint8Array): Promise<FileIdentification> {
  const pages = await pageCount(bytes);
  const evidence: PlanEvidence[] = [];
  const plans: IdentifiedPlan[] = [];
  let numbered = 0;
  let storeys = 0;
  let facades = 0;
  const shown = Math.min(pages, MAX_PDF_PAGES);
  for (let index = 0; index < shown; index++) {
    const page = await pdfPage(bytes, index);
    if (!page) continue;
    const [text, geometry, areas] = await Promise.all([
      extractPdfPageText(page),
      extractFloorplanVectorGeometry(page),
      extractPrintedAreas(page),
    ]);
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const flats = new Set([...text.matchAll(/דירה\s*(\d{1,3})/gu)].map((m) => Number(m[1])));
    const kind = pageKind(text, geometry?.walls.length ?? 0, areas.length);
    if (kind === "floor" && flats.size >= 2) numbered += 1;
    if (kind === "elevation") facades += 1;
    const titleLine = lines.find((l) => storeyOf(l) != null);
    const storey = titleLine ? storeyOf(titleLine) : null;
    if (storey != null) storeys += 1;
    const id = `pdf:${index}`;
    evidence.push({
      id,
      kind,
      widthM: 0,
      heightM: 0,
      units: [...flats],
      dwelling: countMatches(lines, DWELLING_WORDS),
      commercial: countMatches(lines, COMMERCIAL_WORDS),
      site: countMatches(lines, SITE_WORDS),
      storey,
    });
    const preview = await rasterizePdfPageJpeg(page, PREVIEW_PX);
    plans.push({
      id,
      kind,
      ...(titleLine ? { title: titleLine.slice(0, 120) } : { title: `עמוד ${index + 1}` }),
      ...(storey != null ? { level: storey === "roof" ? "גג" : String(storey) } : {}),
      widthM: 0,
      heightM: 0,
      ...(flats.size ? { units: [...flats].sort((a, b) => a - b) } : {}),
      ...(preview ? { preview: `data:image/jpeg;base64,${preview}` } : {}),
    });
  }
  return {
    evidence: {
      fileKind: "pdf",
      plans: evidence,
      storeySheets: storeys,
      facadeSheets: facades,
      numberedFloorSheets: numbered,
      houseSheets: 0,
    },
    plans,
    units: { metresPerUnit: null, from: "printed" },
    unread: pages > MAX_PDF_PAGES ? [`ב־PDF ${pages} עמודים; נקראו ${MAX_PDF_PAGES} הראשונים`] : [],
  };
}
