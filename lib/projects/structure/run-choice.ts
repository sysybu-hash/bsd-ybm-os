import { identifyStructure } from "@/lib/projects/structure/identify";
import { pdfPage } from "@/lib/projects/structure/identify-pdf";
import {
  choiceRecordOf,
  recallStructure,
  rememberStructure,
  structureFingerprint,
  type StructureChoiceRecord,
} from "@/lib/projects/structure/report-cache";
import { structureKindSchema, type StructureKind } from "@/lib/validation/schemas/floorplan-structure";

/** What the person confirmed at the identify step, as the run applies it. */
export type ConfirmedChoice = {
  structure: StructureKind;
  /** The plan id as the report gave it ("dxf:2", "pdf:0", "dwf:5"). */
  planRef?: string;
  /** A DXF's plan, in readDxfPlans order. */
  planIndex?: number;
  /** A PDF page, 0-based; the run is given that page alone. */
  pdfPage?: number;
};

export type ChoiceResult =
  | { ok: true; choice: ConfirmedChoice | null; bytes: Buffer }
  | { ok: false; message: string; code: string };

/** Structures the run itself produces; a house is a booklet job, a site has no render yet. */
const RUN_STRUCTURES: ReadonlySet<StructureKind> = new Set(["apartment", "building", "commercial", "unknown"]);

/**
 * Check a confirmed structure and plan against what the file actually holds.
 *
 * The browser sends what the person chose; the server takes only what its
 * own reading of the same file lists. The fingerprint ties the choice to the
 * bytes: a choice made for one file is refused for another. Without a choice
 * (older callers), the run guesses as it always did.
 */
export async function resolveConfirmedChoice(input: {
  orgId: string;
  fileName: string;
  bytes: Buffer;
  structure: string;
  planRef: string;
  fingerprint: string;
}): Promise<ChoiceResult> {
  if (!input.structure) return { ok: true, choice: null, bytes: input.bytes };
  const parsed = structureKindSchema.safeParse(input.structure);
  if (!parsed.success) return { ok: false, message: "סוג המבנה אינו מוכר", code: "invalid_structure" };
  const structure = parsed.data;
  if (!RUN_STRUCTURES.has(structure)) {
    return {
      ok: false,
      message: structure === "house" ? "בית פרטי מופק כחוברת בית, לא כהדמיה בודדת" : "תוכנית פיתוח עוד לא נתמכת להפקה",
      code: "structure_not_produced_here",
    };
  }
  const files = [{ name: input.fileName, bytes: input.bytes }];
  const fingerprint = structureFingerprint(files);
  if (input.fingerprint && input.fingerprint !== fingerprint) {
    return { ok: false, message: "הבחירה נעשתה לקובץ אחר — יש לזהות את הקובץ מחדש", code: "structure_mismatch" };
  }
  let record: StructureChoiceRecord | null = await recallStructure(input.orgId, fingerprint);
  if (!record) {
    record = choiceRecordOf(await identifyStructure(files));
    await rememberStructure(input.orgId, fingerprint, record);
  }
  if (record.blockers.length > 0) return { ok: false, message: record.blockers[0]!, code: "structure_blocked" };
  const planRef = input.planRef.trim();
  if (planRef) {
    if (!record.planIds.includes(planRef)) {
      return { ok: false, message: "התוכנית שנבחרה אינה בקובץ", code: "plan_not_in_file" };
    }
    if (record.blockedPlanIds.includes(planRef)) {
      return { ok: false, message: "לא ניתן להפיק מהתוכנית שנבחרה — הקירות שלה לא סוגרים רצפה", code: "plan_blocked" };
    }
  }
  const [source, rawIndex] = planRef.split(":");
  const index = Number(rawIndex);
  const choice: ConfirmedChoice = { structure, ...(planRef ? { planRef } : {}) };
  let bytes = input.bytes;
  if (source === "dxf" && Number.isInteger(index) && index >= 0) choice.planIndex = index;
  if (source === "pdf" && Number.isInteger(index) && index >= 0) {
    const page = await pdfPage(new Uint8Array(input.bytes), index);
    if (!page) return { ok: false, message: "לא ניתן לקרוא את העמוד שנבחר", code: "plan_not_in_file" };
    choice.pdfPage = index;
    bytes = Buffer.from(page);
  }
  return { ok: true, choice, bytes };
}
