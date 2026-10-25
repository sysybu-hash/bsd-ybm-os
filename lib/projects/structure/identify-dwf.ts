import { DWF_FLOOR_UNITS_PER_METRE, houseUnitMarks, listDwfUnits, readDwfStrip } from "@/lib/projects/dwf-building";
import { sheetGeometry } from "@/lib/projects/floorplan-dwf";
import { dwfSheetJpeg } from "@/lib/projects/floorplan-render-dwf";
import { storeyOf } from "@/lib/projects/building/dxf-house";
import { splitStrip } from "@/lib/projects/sheet-split";
import {
  COMMERCIAL_WORDS,
  countMatches,
  DWELLING_WORDS,
  SITE_WORDS,
  type PlanEvidence,
} from "@/lib/projects/structure/classify";
import { PREVIEW_PX, type FileIdentification } from "@/lib/projects/structure/identify-dxf";
import type { IdentifiedPlan, PlanSheetKind } from "@/lib/validation/schemas/floorplan-structure";

/** A strip can be thirty drawings; the previews of the first this many are drawn. */
const MAX_PREVIEWS = 24;

/**
 * A permit strip (DWF), read for what it is: its drawings with their kinds,
 * titles and apartment numbers (sheet-split.ts), and the apartments the
 * strip draws. A strip with no numbered floor whose plans mark houses at
 * their living rooms is a private house. No model is called.
 */
export async function identifyDwf(bytes: Buffer, extraUnread: string[] = []): Promise<FileIdentification & { dwfUnits: ReturnType<typeof listDwfUnits> }> {
  const strip = readDwfStrip(bytes);
  if (!strip) {
    return {
      evidence: { fileKind: "dwf", plans: [], storeySheets: 0, facadeSheets: 0, numberedFloorSheets: 0, houseSheets: 0 },
      plans: [],
      units: { metresPerUnit: null, from: "unknown" },
      unread: ["קובץ ה־DWF לא נקרא", ...extraUnread],
      dwfUnits: [],
    };
  }
  const sheets = splitStrip(strip);
  const numbered = sheets.filter((s) => s.kind === "floor" && s.units.length > 0).length;
  let houseSheets = 0;
  let facades = 0;
  let storeys = 0;
  const evidence: PlanEvidence[] = [];
  const plans: IdentifiedPlan[] = [];
  for (const [index, s] of sheets.entries()) {
    const kind: PlanSheetKind = s.kind === "form" ? "other" : s.kind;
    const sheet = sheetGeometry(strip, s.box);
    const texts = sheet.texts.map((t) => t.text);
    // A house plan prints its rooms in outline, not text: no words to count,
    // and the strip's house marks say floor (dwf-building houseSheets).
    const isHouseFloor = numbered === 0 && (s.kind === "floor" || s.kind === "other") && houseUnitMarks(sheet).length > 0;
    if (isHouseFloor) houseSheets += 1;
    if (s.kind === "elevation") facades += 1;
    const storey = s.title ? storeyOf(s.title) : null;
    if (storey != null) storeys += 1;
    const widthM = s.box.width / DWF_FLOOR_UNITS_PER_METRE;
    const heightM = s.box.height / DWF_FLOOR_UNITS_PER_METRE;
    const id = `dwf:${index}`;
    evidence.push({
      id,
      kind: isHouseFloor ? "floor" : kind,
      widthM,
      heightM,
      units: s.units,
      dwelling: countMatches(texts, DWELLING_WORDS),
      commercial: countMatches(texts, COMMERCIAL_WORDS),
      site: countMatches(texts, SITE_WORDS),
      storey,
    });
    const preview = index < MAX_PREVIEWS ? await dwfSheetJpeg(strip, s.box, PREVIEW_PX) : null;
    plans.push({
      id,
      kind: isHouseFloor ? "floor" : kind,
      ...(s.title ? { title: s.title.slice(0, 120) } : {}),
      ...(storey != null ? { level: storey === "roof" ? "גג" : String(storey) } : {}),
      widthM,
      heightM,
      ...(s.units.length ? { units: s.units } : {}),
      ...(preview ? { preview: `data:image/jpeg;base64,${preview.toString("base64")}` } : {}),
    });
  }
  const forms = sheets.filter((s) => s.kind === "form").length;
  return {
    evidence: {
      fileKind: "dwf",
      plans: evidence,
      storeySheets: storeys,
      facadeSheets: facades,
      numberedFloorSheets: numbered,
      houseSheets,
    },
    plans,
    units: { metresPerUnit: 1 / DWF_FLOOR_UNITS_PER_METRE, from: "printed" },
    unread: [...(forms ? [`${forms} גיליונות טפסים / חתימות לא נקראו`] : []), ...extraUnread],
    dwfUnits: listDwfUnits(strip),
  };
}
