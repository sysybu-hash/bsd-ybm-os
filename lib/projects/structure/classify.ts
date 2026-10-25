import type { PlanSheetKind, StructureKind } from "@/lib/validation/schemas/floorplan-structure";

/**
 * What a drawing is, decided from what it prints and how it is drawn — never
 * from a model. Each rule that fires leaves a line for the person to read, and
 * anything short of one clear answer is marked not sure: the window then asks
 * instead of guessing. A shop floor once went through as a flat, unasked, and
 * came out a strip of beige.
 */

/** Words only a dwelling prints; a shop has toilets and stairs as well. */
export const DWELLING_WORDS = /שינה|הורים|ממ["״']?ד|דירה\s*\d|bed\s*room|master/iu;
/** Words a shop, an office floor or a public building prints. */
export const COMMERCIAL_WORDS =
  /חנו(?:ת|יות)|מסחר|משרד(?:ים)?|לובי|אולם|בית\s*כנסת|קניון|מסעד[הת]|גן\s*ילדים|כית(?:ה|ות)|מרפא[הת]|קליניק|\bshops?\b|retail|offices?\b|lobby|hall\b/iu;
/**
 * Words a site or development plan prints. Not "העמדה": a permit set's
 * תכנית העמדה is the site placement, an interior designer's is the furniture
 * layout of a flat (Adler's).
 */
export const SITE_WORDS = /פיתוח|גבול\s*(?:ה)?מגרש|קו\s*בניין|תכנית\s*מגרש|site\s*plan/iu;

/** A floor plan with no dwelling word is taken as commercial past this size. */
export const COMMERCIAL_MIN_M2 = 300;
/** A plan whose walls close less than this share of its extent is not a plan the pipeline can build. */
export const MIN_CLOSED_SHARE = 0.05;

export type PlanEvidence = {
  id: string;
  kind: PlanSheetKind;
  widthM: number;
  heightM: number;
  closedM2?: number;
  units: number[];
  /** How many of its texts name a dwelling, a shop or office, or a site. */
  dwelling: number;
  commercial: number;
  site: number;
  /** The storey its name or title says, when it says one. */
  storey: number | "roof" | null;
};

export type FileEvidence = {
  fileKind: "pdf" | "dxf" | "dwg" | "dwf" | "image" | "files";
  /** An image that is a photograph, not a drawing. */
  photo?: boolean;
  plans: PlanEvidence[];
  /** Layout tabs or files named for storeys (dxf-house storeyOf). */
  storeySheets: number;
  /** Facade sheets: tabs, titles or files named חזית. */
  facadeSheets: number;
  /** DWF: floor sheets numbered with apartments; house sheets marked at their living rooms. */
  numberedFloorSheets: number;
  houseSheets: number;
};

export type Classification = {
  structure: StructureKind;
  sure: boolean;
  reasons: string[];
  blockers: string[];
  /** Per plan id: why it cannot be produced. */
  blockedPlans: Map<string, string>;
};

const m2 = (v: number) => `${Math.round(v).toLocaleString("he-IL")} מ״ר`;

/** Why a single plan cannot be produced, if it cannot. */
export function planBlock(plan: PlanEvidence): string | undefined {
  if (plan.kind !== "floor") return undefined;
  if (plan.closedM2 == null) return undefined;
  const extent = plan.widthM * plan.heightM;
  if (!(extent > 0)) return undefined;
  if (plan.closedM2 <= 0) return "הקירות לא סוגרים שום רצפה בתוכנית הזו";
  if (plan.closedM2 / extent < MIN_CLOSED_SHARE) {
    return `נסגרו רק ${m2(plan.closedM2)} מתוך שרטוט של ${Math.round(plan.widthM)} × ${Math.round(plan.heightM)} מ׳`;
  }
  return undefined;
}

export function classifyStructure(e: FileEvidence): Classification {
  const reasons: string[] = [];
  const blockers: string[] = [];
  const blockedPlans = new Map<string, string>();

  if (e.fileKind === "image") {
    blockers.push(
      e.photo
        ? "זהו צילום, לא שרטוט. ההדמיה נמדדת מהקווים שבקובץ — העלו PDF, DXF או DWF."
        : "זו תמונה של שרטוט. ההדמיה נמדדת מהקווים שבקובץ — העלו PDF, DXF או DWF.",
    );
    return { structure: "unknown", sure: false, reasons, blockers, blockedPlans };
  }

  for (const plan of e.plans) {
    const why = planBlock(plan);
    if (why) blockedPlans.set(plan.id, why);
  }
  const floors = e.plans.filter((p) => p.kind === "floor");
  const usable = floors.filter((p) => !blockedPlans.has(p.id));
  if (floors.length === 0 && e.storeySheets === 0 && e.houseSheets === 0) {
    const sitesOnly = e.plans.length > 0 && e.plans.every((p) => p.kind === "site" || p.site > 0);
    if (sitesOnly) {
      reasons.push("בקובץ רק תוכנית פיתוח / העמדה");
      return { structure: "site", sure: true, reasons, blockers, blockedPlans };
    }
    blockers.push(
      e.plans.length > 0
        ? "לא נמצאה בקובץ תוכנית קומה — רק חזיתות, חתכים או פרטים"
        : "לא נמצא בקובץ שרטוט קירות שאפשר לקרוא",
    );
    return { structure: "unknown", sure: false, reasons, blockers, blockedPlans };
  }
  if (floors.length > 0 && usable.length === 0) {
    blockers.push("באף תוכנית קומה הקירות לא סוגרים רצפה שאפשר לבנות ממנה הדמיה");
  }

  const candidates: StructureKind[] = [];
  const unitNumbers = new Set(floors.flatMap((p) => p.units));

  // 1. A permit strip with numbered apartments: a building.
  if (e.numberedFloorSheets > 0 && unitNumbers.size >= 2) {
    candidates.push("building");
    reasons.push(`נמצאו ${unitNumbers.size} מספרי דירות ב־${e.numberedFloorSheets} גיליונות קומה`);
  }
  // 2. Storeys named, or a strip of house plans: a private house.
  // A building's permit strip names storeys and draws facades too; only
  // sheets with no numbered flat on them say house.
  const namedStoreys = e.numberedFloorSheets === 0 && (e.storeySheets >= 2 || (e.storeySheets >= 1 && e.facadeSheets >= 1));
  if (e.houseSheets > 0 || namedStoreys) {
    candidates.push("house");
    if (e.houseSheets > 0) reasons.push(`נמצאו ${e.houseSheets} גיליונות של בית פרטי (בלי מספרי דירות)`);
    if (e.storeySheets > 0) reasons.push(`נמצאו ${e.storeySheets} גיליונות עם שם קומה${e.facadeSheets ? ` ו־${e.facadeSheets} חזיתות` : ""}`);
  }
  const dwelling = floors.reduce((n, p) => n + p.dwelling, 0);
  const commercial = floors.reduce((n, p) => n + p.commercial, 0);
  // 3. A dwelling's words on the floor plan: an apartment.
  if (dwelling > 0 && !candidates.includes("building") && !candidates.includes("house")) {
    candidates.push("apartment");
    reasons.push(`בתוכנית מופיעים חדרי מגורים (שינה / ממ״ד) — ${dwelling} כיתובים`);
  }
  // 4. A shop's or an office's words, or a large floor with no dwelling word.
  let commercialBySizeOnly = false;
  if (commercial > 0) {
    candidates.push("commercial");
    reasons.push(`בתוכנית מופיעים שימושים מסחריים או ציבוריים — ${commercial} כיתובים`);
  } else if (dwelling === 0 && candidates.length === 0) {
    const largest = Math.max(0, ...usable.map((p) => p.closedM2 ?? 0));
    if (largest >= COMMERCIAL_MIN_M2) {
      candidates.push("commercial");
      commercialBySizeOnly = true;
      reasons.push(`אין חדרי מגורים בתוכנית, והקומה הגדולה סוגרת ${m2(largest)}`);
    }
  }

  const unique = [...new Set(candidates)];
  if (unique.length === 0) {
    // A sales sheet draws its room names in outline, so it prints no word to
    // read: one floor plan, not large, is most likely a flat — offered as that,
    // and asked.
    const largest = Math.max(0, ...usable.map((p) => p.closedM2 ?? 0));
    if (usable.length >= 1 && largest < COMMERCIAL_MIN_M2) {
      reasons.push("לא נמצאו כיתובים בתוכנית; לפי המבנה והגודל היא נראית תוכנית דירה");
      return { structure: "apartment", sure: false, reasons, blockers, blockedPlans };
    }
    reasons.push("לא נמצא סימן ברור לסוג המבנה");
    return { structure: "unknown", sure: false, reasons, blockers, blockedPlans };
  }
  // One sign far outweighing the other decides: Pisga prints eleven shop and
  // classroom names and one word a flat might print. A building's strip
  // prints dwelling words too; that is not a conflict.
  const dominant = (a: number, b: number) => a >= 3 && a >= 3 * b;
  let structure = unique[0]!;
  let rest = unique.filter((k) => !(k === "apartment" && unique.includes("building")));
  if (rest.includes("commercial") && rest.includes("apartment")) {
    if (dominant(commercial, dwelling)) rest = rest.filter((k) => k !== "apartment");
    else if (dominant(dwelling, commercial)) rest = rest.filter((k) => k !== "commercial");
  }
  // Numbers on a strip with shop words and not one dwelling word are room or
  // shop numbers, not flats (the Pisga permit strip).
  if (rest.includes("building") && rest.includes("commercial") && dwelling === 0) {
    structure = "commercial";
    reasons.push("המספרים בגיליונות הם כנראה מספרי חנויות או חדרים — אין בהם אף חדר מגורים");
  } else {
    structure = rest[0] ?? structure;
  }
  const conflict = rest.length > 1;
  if (conflict) reasons.push("הסימנים סותרים זה את זה — יש לבחור את סוג המבנה");
  return {
    structure,
    sure: !conflict && !commercialBySizeOnly && blockers.length === 0,
    reasons,
    blockers,
    blockedPlans,
  };
}

/** How many of these texts match a word list. */
export function countMatches(texts: Iterable<string>, re: RegExp): number {
  let n = 0;
  for (const text of texts) if (re.test(text)) n += 1;
  return n;
}
