import { dxfSheets, storeyOf } from "@/lib/projects/building/dxf-house";
import { readDxfDrawing } from "@/lib/projects/dxf-drawing";
import { dxfReportLines, readDxfPlans, renderDxfPageJpeg } from "@/lib/projects/floorplan-dxf";
import { lockScaleAtDrawingUnits } from "@/lib/projects/floorplan-scale";
import type { FloorplanVectorGeometry } from "@/lib/projects/floorplan-vector";
import {
  COMMERCIAL_WORDS,
  countMatches,
  DWELLING_WORDS,
  SITE_WORDS,
  type FileEvidence,
  type PlanEvidence,
} from "@/lib/projects/structure/classify";
import type { IdentifiedPlan, StructureReport } from "@/lib/validation/schemas/floorplan-structure";

/** Plans past this many are listed in the report, not read: a drawing can hold dozens of details. */
const MAX_PLANS = 12;
/** Measuring a plan's closed floor takes seconds; the largest few are what anyone picks. */
const MAX_MEASURED = 6;
export const PREVIEW_PX = 480;
const FACADE_WORDS = /facade|elevation|חזית|חזיתות/i;

export type FileIdentification = {
  evidence: FileEvidence;
  plans: IdentifiedPlan[];
  units: StructureReport["units"];
  unread: string[];
};

/** The storey the plan's own text names, the tallest such text first; none when it names none. */
function titleOf(geometry: FloorplanVectorGeometry): string | undefined {
  const named = (geometry.labels ?? []).filter((l) => storeyOf(l.text) != null);
  if (!named.length) return undefined;
  return named.reduce((a, b) => (b.height > a.height ? b : a)).text.trim().slice(0, 120);
}

function closedFloorM2(geometry: FloorplanVectorGeometry): number | undefined {
  const upm = geometry.unitsPerMetre;
  if (!upm) return undefined;
  const lock = lockScaleAtDrawingUnits(
    geometry.segments,
    { x: 0, y: 0, width: geometry.pageWidth, height: geometry.pageHeight },
    upm,
    geometry.curves,
  );
  return lock ? lock.floorM2 : 0;
}

/**
 * A DXF, read for what it is: each plan its walls and doors make, with what
 * it prints, how much floor its walls close, and a preview; the layout tabs
 * that name storeys or facades. No model is called.
 */
export async function identifyDxf(bytes: Uint8Array): Promise<FileIdentification> {
  const drawing = readDxfDrawing(bytes);
  if (!drawing) {
    return {
      evidence: { fileKind: "dxf", plans: [], storeySheets: 0, facadeSheets: 0, numberedFloorSheets: 0, houseSheets: 0 },
      plans: [],
      units: { metresPerUnit: null, from: "unknown" },
      unread: ["הקובץ אינו DXF שאפשר לקרוא"],
    };
  }
  const { geometries, texts } = readDxfPlans(drawing, MAX_PLANS);
  const report = geometries[0]?.cad;
  const tabs = dxfSheets(drawing);
  const storeyTabs = tabs.filter((s) => s.storey != null).length;
  const facadeTabs = tabs.filter((s) => FACADE_WORDS.test(s.name)).length;
  const facadeTitles = countMatches(texts, /^\s*חזית\s/u);

  const evidence: PlanEvidence[] = [];
  const plans: IdentifiedPlan[] = [];
  for (const [index, geometry] of geometries.entries()) {
    const upm = geometry.unitsPerMetre;
    const widthM = upm ? geometry.pageWidth / upm : 0;
    const heightM = upm ? geometry.pageHeight / upm : 0;
    const labels = (geometry.labels ?? []).map((l) => l.text);
    const doors = report?.plans[index]?.doors;
    // A plan is where doors open (floorplan-dxf readPieces). A drawing with no
    // swing anywhere is offered whole, every cluster a candidate floor.
    const anyDoors = report?.plans.some((p) => p.doors >= 2) ?? false;
    const kind = !anyDoors || (doors ?? 0) >= 2 ? "floor" : "other";
    const title = titleOf(geometry);
    const storey = title ? storeyOf(title) : null;
    const closedM2 = index < MAX_MEASURED ? closedFloorM2(geometry) : undefined;
    const id = `dxf:${index}`;
    evidence.push({
      id,
      kind,
      widthM,
      heightM,
      closedM2,
      units: [],
      dwelling: countMatches(labels, DWELLING_WORDS),
      commercial: countMatches(labels, COMMERCIAL_WORDS),
      site: countMatches(labels, SITE_WORDS),
      storey,
    });
    const jpeg = await renderDxfPageJpeg(geometry, PREVIEW_PX);
    plans.push({
      id,
      kind,
      ...(title ? { title } : {}),
      ...(storey != null ? { level: storey === "roof" ? "גג" : String(storey) } : {}),
      widthM,
      heightM,
      ...(closedM2 != null ? { closedM2 } : {}),
      ...(doors != null ? { doors } : {}),
      ...(jpeg ? { preview: `data:image/jpeg;base64,${jpeg.toString("base64")}` } : {}),
    });
  }

  const unread = report ? dxfReportLines(report).filter((line) => !line.startsWith("בקובץ ")) : [];
  if (report && report.plans.length > geometries.length) {
    unread.unshift(`בקובץ ${report.plans.length} תוכניות; מוצגות ${geometries.length} הגדולות`);
  }
  return {
    evidence: {
      fileKind: "dxf",
      plans: evidence,
      storeySheets: storeyTabs,
      facadeSheets: facadeTabs + (facadeTitles > 0 ? 1 : 0),
      numberedFloorSheets: 0,
      houseSheets: 0,
    },
    plans,
    units: {
      metresPerUnit: report?.unitsM || null,
      from: report?.unitsFrom ?? "unknown",
    },
    unread,
  };
}
