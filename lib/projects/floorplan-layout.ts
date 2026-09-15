import { z } from "zod";

/**
 * Where a room's figures came from.
 *
 * "cad" is measured off the drawing's own vectors rather than read by a model,
 * and it is the strongest of the four. It exists because labelling a geometric
 * measurement "אומת ב-OCR" in the booklet would be untrue.
 */
export const floorplanEvidenceSchema = z.enum([
  "cad",
  "ocr_verified",
  "consensus",
  "inferred",
]);
export type FloorplanEvidence = z.infer<typeof floorplanEvidenceSchema>;

export const floorplanRoomKindSchema = z.enum([
  "living",
  "kitchen",
  "bedroom",
  "mmd",
  "bathroom",
  "balcony",
  "circulation",
  "utility",
  "other",
]);
export type FloorplanRoomKind = z.infer<typeof floorplanRoomKindSchema>;

export const floorplanBboxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
});
export type FloorplanBbox = z.infer<typeof floorplanBboxSchema>;

export const floorplanRoomSchema = z.object({
  name: z.string().min(1),
  kind: floorplanRoomKindSchema.optional(),
  widthM: z.number().positive().optional(),
  lengthM: z.number().positive().optional(),
  areaM2: z.number().positive().optional(),
  adjacentTo: z.array(z.string()).optional(),
  finishNotes: z.string().optional(),
  bedCount: z.number().int().min(0).max(8).optional(),
  deskCount: z.number().int().min(0).max(8).optional(),
  contents: z.string().max(200).optional(),
  bbox: floorplanBboxSchema.optional(),
  instanceIndex: z.number().int().min(0).optional(),
  source: floorplanEvidenceSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  engineHits: z.number().int().min(0).optional(),
});

export const floorplanOpeningSchema = z.object({
  kind: z.enum(["door", "window", "opening"]),
  widthM: z.number().positive().optional(),
  heightM: z.number().positive().optional(),
  room: z.string().optional(),
  source: floorplanEvidenceSchema.optional(),
});

export const floorplanInternalStairSchema = z.object({
  present: z.boolean(),
  fromElevationM: z.number().optional(),
  toElevationM: z.number().optional(),
  insideUnit: z.boolean().optional(),
  notes: z.string().optional(),
  bbox: floorplanBboxSchema.optional(),
});
export type FloorplanInternalStair = z.infer<typeof floorplanInternalStairSchema>;

export const floorplanLayoutSchema = z.object({
  title: z.string().optional(),
  unitLabel: z.string().optional(),
  floor: z.string().optional(),
  ceilingHeightM: z.number().positive().optional(),
  north: z.string().optional(),
  grossAreaM2: z.number().positive().optional(),
  rooms: z.array(floorplanRoomSchema).optional().default([]),
  openings: z.array(floorplanOpeningSchema).optional().default([]),
  dimensionStrings: z.array(z.string()).optional().default([]),
  notes: z.array(z.string()).optional().default([]),
  islandStoolCount: z.number().int().min(0).max(12).optional(),
  internalStairs: floorplanInternalStairSchema.optional(),
  requiresReview: z.boolean().optional().default(true),
});

export type FloorplanRoom = z.infer<typeof floorplanRoomSchema>;
export type FloorplanOpening = z.infer<typeof floorplanOpeningSchema>;
export type FloorplanLayout = z.infer<typeof floorplanLayoutSchema>;

export type OcrGrounding = {
  engine: string;
  text: string;
  dimensionStrings: string[];
  roomNameHits: string[];
};

const KNOWN_ROOM_LABELS = [
  "סלון",
  "חדר מגורים",
  "ח. מגורים",
  "פינת אוכל",
  "מטבח",
  "חדר שינה",
  "ח. שינה",
  "חדר הורים",
  "יחידת הורים",
  "חדר ילדים",
  "חדר רחצה",
  "אמבטיה",
  "שירותים",
  "מקלחת",
  "מרפסת",
  'ממ"ד',
  "ממד",
  "מסדרון",
  "כניסה",
  "מחסן",
  "חניה",
  "מרפסת שירות",
  "חדר כביסה",
  "חדר עבודה",
  "מעלית",
  "מדרגות",
  "מדרגות פנים",
];

const KIND_BY_NEEDLE: Array<{ kind: FloorplanRoomKind; needles: string[] }> = [
  { kind: "mmd", needles: ['ממ"ד', "ממד", "מרחב מוגן"] },
  { kind: "kitchen", needles: ["מטבח"] },
  { kind: "living", needles: ["סלון", "מגורים", "פינת אוכל", "אוכל"] },
  { kind: "bedroom", needles: ["שינה", "הורים", "ילדים"] },
  { kind: "bathroom", needles: ["אמבטיה", "רחצה", "שירותים", "מקלחת", "שרותים"] },
  { kind: "balcony", needles: ["מרפסת", "שטח מרוצף", "שטח מקורה"] },
  { kind: "circulation", needles: ["מעלית", "מדרגות", "גרם מדרגות", "חדר מדרגות", "מדרגות פנים", "גרעין", "מסדרון", "פרוזדור", "כניסה"] },
  { kind: "utility", needles: ["מחסן", "כביסה", "חניה", "פיר", 'מא"', "חדר שירות", "חדר שרות", "ח.שרות", "ח.שירות", "ח. שרות", "ח. שירות"] },
];

const DWELLING_KINDS: FloorplanRoomKind[] = ["living", "kitchen", "bedroom", "mmd", "bathroom"];
const PLAN_ANNOTATION_RE =
  /שטח מקורה|קו בניין|מקרא|קנ["״']?מ|הערות?|גובה תקרה|צפון אמת|מידות כללי|חתך/;

export function inferRoomKind(name: string): FloorplanRoomKind {
  const n = name.replace(/\s+/g, " ");
  for (const row of KIND_BY_NEEDLE) {
    if (row.needles.some((needle) => n.includes(needle))) return row.kind;
  }
  return "other";
}

export function isPlanAnnotation(name: string): boolean {
  const n = name.replace(/\s+/g, " ").trim();
  if (/^דירה\s*\d+$/u.test(n)) return true;
  return PLAN_ANNOTATION_RE.test(n);
}

/** תווית יחידה מודפסת: «דירה 1», «דירה 14» */
export function extractUnitLabel(text: string): string | undefined {
  const m = text.match(/דירה\s*\d{1,4}/u);
  return m?.[0]?.replace(/\s+/g, " ").trim();
}

/** קומה מודפסת — לא סימון גובה כמו +9.64 */
export function extractFloorLabel(text: string): string | undefined {
  if (!text.trim()) return undefined;
  const m = text.match(/קומה\s*ה?(ראשונה|שנייה|שניה|שלישית|רביעית|חמישית|עליונה|קרקע|\d{1,2})/u);
  return m?.[0]?.replace(/\s+/g, " ").trim();
}

export function isElevationFloorToken(floor?: string): boolean {
  if (!floor?.trim()) return false;
  const t = floor.trim().replace(/\s+/g, "");
  return /^[+\-±]?\d+[.,]\d{2}\+?$/.test(t);
}

export function sanitizeFloorLabel(floor?: string, ocrText = ""): string | undefined {
  const fromOcr = extractFloorLabel(ocrText);
  if (fromOcr) return fromOcr;
  if (!floor?.trim()) return undefined;
  if (isElevationFloorToken(floor)) return undefined;
  if (/[+\-±]\s*\d+[.,]\d{2}/.test(floor) && !/קומה/u.test(floor)) return undefined;
  return floor.trim();
}

/** OCR ששמט אפס מוביל: 6.4 במקום 0.64 */
export function correctDroppedLeadingZero(value: number, ocrText: string): number {
  if (value < 3 || value > 12) return value;
  const tenth = Math.round((value / 10) * 100) / 100;
  if (tenth < 0.3 || tenth >= 2) return value;
  const token = tenth.toFixed(2).replace(".", "[.,]");
  const compact = ocrText.replace(/\s+/g, "");
  if (new RegExp(`(^|[^\\d])0${token.slice(1)}`).test(compact)) return tenth;
  return value;
}

const TINY_BALCONY_M2 = 1.2;

export function isGuestWcRoom(room: FloorplanRoom): boolean {
  const n = room.name.replace(/\s+/g, " ");
  return /שירותים|שרותים/.test(n) && !/רחצה|אמבטיה|מקלחת/.test(n);
}

export function printedBalconyKinds(text: string): Array<"living" | "gag" | "service"> {
  const kinds: Array<"living" | "gag" | "service"> = [];
  if (/שטח המרפסת|שטח מרוצף/.test(text)) kinds.push("living");
  if (/מרפסת\s*גג|שטח\s*מרפסת\s*גג/.test(text)) kinds.push("gag");
  if (/מרפסת\s*שירות/.test(text)) kinds.push("service");
  if (kinds.length === 0 && /מרפסת/.test(text)) kinds.push("living");
  return kinds;
}

function balconySlot(room: FloorplanRoom): "living" | "gag" | "service" {
  const n = room.name.replace(/\s+/g, " ");
  if (/גג/.test(n)) return "gag";
  if (/שירות/.test(n)) return "service";
  return "living";
}

export function ocrHasPrintedLabel(grounding: OcrGrounding, needles: string[]): boolean {
  const hay = `${grounding.text} ${grounding.roomNameHits.join(" ")}`;
  return needles.some((n) => hay.includes(n));
}

/** חלון ממ"ד is a window note — not a second protected room */
export function printedKitchenCount(grounding: OcrGrounding): number {
  const fromText = grounding.text.match(/מטבח/g)?.length ?? 0;
  if (fromText > 0) return fromText;
  return grounding.roomNameHits.filter((h) => h.includes("מטבח")).length;
}

export function printedStudyCount(grounding: OcrGrounding): number {
  const fromText = grounding.text.match(/ח\.?\s*עבודה|חדר עבודה|משרד/g)?.length ?? 0;
  if (fromText > 0) return fromText;
  return grounding.roomNameHits.filter((h) => /עבודה|משרד/.test(h)).length;
}

export function printedMmdCount(grounding: OcrGrounding): number {
  const hits = grounding.roomNameHits.filter((h) => /ממ"?ד/.test(h) && !/חלון/.test(h));
  if (hits.length >= 2) return 2;
  if (hits.length === 1) return 1;
  const stripped = grounding.text.replace(/חלון\s*ממ"?ד/gu, "");
  if (/ממ"?ד/.test(stripped) || /ממ"?ד/.test(grounding.text)) return 1;
  return 0;
}

export function maxMmdForUnit(grossAreaM2?: number): number {
  return (grossAreaM2 ?? 0) >= 160 ? 2 : 1;
}

/** דירה טיפוסית — ממ"ד אחד. חלון ממ"ד על חדר שינה לא יוצר ממ"ד שני */
export function capExtraMmdRooms(rooms: FloorplanRoom[], maxMmd: number): FloorplanRoom[] {
  const mmds = rooms.filter((r) => (r.kind ?? inferRoomKind(r.name)) === "mmd");
  if (mmds.length <= maxMmd) return rooms;
  const keep = new Set(
    [...mmds]
      .sort((a, b) => {
        const exact = (r: FloorplanRoom) => (/^\s*ממ"?ד\s*$/.test(r.name) ? 1 : 0);
        const d = mmdKeepRank(b) + exact(b) - (mmdKeepRank(a) + exact(a));
        return d;
      })
      .slice(0, Math.max(0, maxMmd)),
  );
  let bedN = rooms.filter((r) => (r.kind ?? inferRoomKind(r.name)) === "bedroom").length;
  return rooms.map((r) => {
    if ((r.kind ?? inferRoomKind(r.name)) !== "mmd" || keep.has(r)) return r;
    bedN += 1;
    return { ...r, kind: "bedroom" as const, name: bedN <= 1 ? "חדר שינה" : `חדר שינה (${bedN})` };
  });
}

function mmdKeepRank(room: FloorplanRoom): number {
  return roomKeepRank(room) + (room.bbox ? 0.15 : 0);
}

/** דירה טיפוסית — מטבח אחד. חדר עבודה עם שולחנות אינו מטבח שני */
export function capExtraKitchenRooms(rooms: FloorplanRoom[], maxKitchen: number): FloorplanRoom[] {
  const kitchens = rooms.filter((r) => (r.kind ?? inferRoomKind(r.name)) === "kitchen");
  if (kitchens.length <= maxKitchen) return rooms;
  const keep = new Set(
    [...kitchens]
      .sort((a, b) => {
        const exact = (r: FloorplanRoom) => (/^\s*מטבח\s*$/.test(canonicalRoomName(r.name)) ? 1 : 0);
        return kitchenKeepRank(b) + exact(b) - (kitchenKeepRank(a) + exact(a));
      })
      .slice(0, Math.max(0, maxKitchen)),
  );
  const hasStudy = rooms.some(isStudyRoom);
  return rooms.map((r) => {
    if ((r.kind ?? inferRoomKind(r.name)) !== "kitchen" || keep.has(r)) return r;
    if (hasStudy) {
      return { ...r, kind: "bedroom" as const, name: "חדר שינה" };
    }
    return { ...r, kind: "other" as const, name: "חדר עבודה" };
  });
}

/** חדר עבודה אחד. שכפול מהפרומפט / מטבחון לא יוצר משרד שני */
export function capExtraStudyRooms(rooms: FloorplanRoom[], maxStudy: number): FloorplanRoom[] {
  const studies = rooms.filter(isStudyRoom);
  if (studies.length <= maxStudy) return rooms;
  const keep = new Set(
    [...studies]
      .sort((a, b) => studyKeepRank(b) - studyKeepRank(a))
      .slice(0, Math.max(0, maxStudy)),
  );
  let bedN = rooms.filter((r) => (r.kind ?? inferRoomKind(r.name)) === "bedroom").length;
  return rooms.map((r) => {
    if (!isStudyRoom(r) || keep.has(r)) return r;
    bedN += 1;
    return { ...r, kind: "bedroom" as const, name: bedN <= 1 ? "חדר שינה" : `חדר שינה (${bedN})` };
  });
}

export function roomHasBedSymbol(room: FloorplanRoom): boolean {
  if ((room.bedCount ?? 0) >= 1) return true;
  return /bed|twin|מיטה/i.test(room.contents ?? "");
}

/** מיטה בשרטוט = חדר שינה, גם אם יש שולחן או שהמנוע קרא «עבודה» */
export function demoteStudyRoomsWithBeds(rooms: FloorplanRoom[]): FloorplanRoom[] {
  let bedN = rooms.filter((r) => (r.kind ?? inferRoomKind(r.name)) === "bedroom").length;
  return rooms.map((room) => {
    if (!isStudyRoom(room) || !roomHasBedSymbol(room)) return room;
    bedN += 1;
    const name = /שינה/.test(room.name) ? room.name : bedN <= 1 ? "חדר שינה" : `חדר שינה (${bedN})`;
    return { ...room, kind: "bedroom" as const, name };
  });
}

function studyKeepRank(room: FloorplanRoom): number {
  const exact = /עבודה|משרד/.test(room.name) ? 1 : 0;
  return roomKeepRank(room) + (room.bbox ? 0.2 : 0) + exact + (room.areaM2 ?? 0) * 0.01;
}

function kitchenKeepRank(room: FloorplanRoom): number {
  return roomKeepRank(room) + (room.bbox ? 0.2 : 0) + (room.areaM2 ?? 0);
}

/** כיור נטילת ידיים / WC בלי תווית / מרפסות עודפות שמנועי ראייה ממציאים */
export function pruneHallucinatedPlanRooms(
  rooms: FloorplanRoom[],
  grounding: OcrGrounding,
): FloorplanRoom[] {
  if (ocrGroundingEmpty(grounding)) return rooms;
  const hasWc = ocrHasPrintedLabel(grounding, ["שירותים", "שרותים"]);
  const hasBath = ocrHasPrintedLabel(grounding, ["רחצה", "אמבטיה", "מקלחת"]);
  const balconyKinds = printedBalconyKinds(grounding.text);
  const ocrMentionsBalcony = balconyKinds.length > 0;
  const ocrMeters = grounding.dimensionStrings.flatMap(metersFromDimensionToken);

  let next = rooms.filter((room) => {
    if (isGuestWcRoom(room) && !hasWc) return false;
    const kind = room.kind ?? inferRoomKind(room.name);
    if (kind === "balcony" && !ocrMentionsBalcony) return false;
    return true;
  });

  const baths = next.filter((r) => (r.kind ?? inferRoomKind(r.name)) === "bathroom" && !isGuestWcRoom(r));
  if (!hasBath && baths.length > 1) {
    const keepBath = [...baths].sort((a, b) => {
      const ab = a.bbox ? 1 : 0;
      const bb = b.bbox ? 1 : 0;
      if (bb !== ab) return bb - ab;
      return (b.areaM2 ?? 0) - (a.areaM2 ?? 0);
    })[0];
    next = next.filter((r) => (r.kind ?? inferRoomKind(r.name)) !== "bathroom" || isGuestWcRoom(r) || r === keepBath);
  }

  const printedKitchens = printedKitchenCount(grounding);
  const maxKitchens = printedKitchens >= 2 ? printedKitchens : 1;
  next = capExtraKitchenRooms(next, maxKitchens);

  if (ocrMentionsBalcony) {
    const allowed = new Set(balconyKinds);
    const chosen = new Map<string, FloorplanRoom>();
    const balcs = next.filter((r) => (r.kind ?? inferRoomKind(r.name)) === "balcony");
    const ranked = [...balcs].sort((a, b) => {
      const am = a.areaM2 != null && ocrContainsMeters(ocrMeters, a.areaM2) ? 1 : 0;
      const bm = b.areaM2 != null && ocrContainsMeters(ocrMeters, b.areaM2) ? 1 : 0;
      if (bm !== am) return bm - am;
      const as = a.source === "ocr_verified" ? 2 : a.source === "consensus" ? 1 : 0;
      const bs = b.source === "ocr_verified" ? 2 : b.source === "consensus" ? 1 : 0;
      if (bs !== as) return bs - as;
      return (b.areaM2 ?? 0) - (a.areaM2 ?? 0);
    });
    const tinies: FloorplanRoom[] = [];
    for (const room of ranked) {
      const slot = balconySlot(room);
      if (room.areaM2 != null && room.areaM2 < TINY_BALCONY_M2) {
        tinies.push(room);
        continue;
      }
      if (!allowed.has(slot)) continue;
      if (chosen.has(slot)) continue;
      chosen.set(slot, room);
    }
    const keep = new Set<FloorplanRoom>([...chosen.values(), ...tinies]);
    next = next.filter((r) => (r.kind ?? inferRoomKind(r.name)) !== "balcony" || keep.has(r));
  }

  return next;
}

export function isFixtureImpliedRoom(room: FloorplanRoom): boolean {
  const kind = room.kind ?? inferRoomKind(room.name);
  return kind === "living" || kind === "kitchen" || kind === "bathroom" || kind === "balcony";
}

/** מדרגות פנים של הדירה — לא מעלית ולא חדר מדרגות של הבניין */
export function isApartmentStairRoom(room: FloorplanRoom): boolean {
  const n = room.name.replace(/\s+/g, " ");
  if (/מעלית/.test(n)) return false;
  if (/חדר מדרגות/.test(n) && !/פנים|פנימי/.test(n)) return false;
  if (/מסדרון|פרוזדור|כניסה|גרעין/.test(n) && !/מדרג/.test(n)) return false;
  return (
    /מדרגות פנים|מדרגות פנימי|גרם מדרגות|internal stair/i.test(n) ||
    (/מדרג/.test(n) && (room.kind ?? inferRoomKind(n)) === "circulation")
  );
}

/** מעלית / חדר מדרגות של הבניין — לא חלל בתוך הדירה */
export function isBuildingCoreRoom(room: FloorplanRoom): boolean {
  if (isApartmentStairRoom(room)) return false;
  const n = room.name.replace(/\s+/g, " ");
  return /מעלית|חדר מדרגות|גרעין/.test(n);
}

export function layoutHasInternalStairs(layout: FloorplanLayout): boolean {
  if (layout.internalStairs?.present) return true;
  return layout.rooms.some(isApartmentStairRoom);
}

/** סימוני גובה בתוכנית: ±0.00, +1.26, -0.10 */
export function extractElevationMarkers(text: string): number[] {
  if (!text.trim()) return [];
  const found = new Set<number>();
  const re = /(?:±|[+\-−])\s*(\d+[.,]\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const mag = Number(m[1]!.replace(",", "."));
    if (!Number.isFinite(mag)) continue;
    const token = m[0];
    const negative = /[−-]/.test(token) && !token.includes("±");
    found.add(Math.round((negative ? -mag : mag) * 100) / 100);
  }
  return Array.from(found);
}

/**
 * Elevations locate a stair; they never prove one. Every flat sits at a
 * different level from its terrace, so דירה 18 — a +11.42 flat with a +12.79
 * מרפסת — read as a duplex and grew a phantom "מדרגות פנים" room. The sheet has
 * to actually say there is an internal stair before the markers mean anything.
 */
export function inferInternalStairsFromOcr(text: string): FloorplanInternalStair | undefined {
  // "חדר מדרגות" is the building stairwell, which says nothing about this flat.
  const withoutStairwell = text.replace(/חדר\s*מדרגות/g, " ");
  if (!/מדרג|stair/i.test(withoutStairwell)) return undefined;
  const elevs = extractElevationMarkers(text);
  // ‎-0.10 מרפסת / ‎-0.05 גרעין אינם קומה. נשארים 0.00 או קפיצה ≥0.8 מ' (יחסי או מוחלט כמו +8.06/+9.64).
  const floors = elevs.filter((e) => Math.abs(e) < 0.02 || Math.abs(e) >= 0.8);
  let bestFrom: number | undefined;
  let bestTo: number | undefined;
  let bestDelta = 0;
  for (let i = 0; i < floors.length; i++) {
    for (let j = i + 1; j < floors.length; j++) {
      const a = floors[i]!;
      const b = floors[j]!;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const delta = hi - lo;
      if (delta >= 0.8 && delta <= 3.6 && delta > bestDelta) {
        bestDelta = delta;
        bestFrom = lo;
        bestTo = hi;
      }
    }
  }
  if (bestFrom == null || bestTo == null) return undefined;
  return {
    present: true,
    fromElevationM: bestFrom,
    toElevationM: bestTo,
    insideUnit: true,
    notes: `internal stair ${bestFrom >= 0 ? "+" : ""}${bestFrom.toFixed(2)} to ${bestTo >= 0 ? "+" : ""}${bestTo.toFixed(2)}`,
  };
}

/**
 * שטח דירה מודפס (111.29 מ"ר) — לא שטח מרפסת קטן
 *
 * The decimal part is optional. Six of the ten sheets in this batch print a
 * decimal — 111.29, 114.11, 90.86 — but דירה 19 and דירה 23 both print a bare
 * "57 מ"ר", and requiring a decimal point returned undefined for them. The
 * 40-400 m² window is what keeps a bare integer from matching a terrace figure
 * or a dimension.
 */
export function extractGrossAreaM2(text: string): number | undefined {
  if (!text.trim()) return undefined;
  const re = /(\d{2,3}(?:[.,]\d{1,2})?)\s*מ["״']?ר/g;
  let best = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]!.replace(",", "."));
    if (Number.isFinite(n) && n >= 40 && n <= 400 && n > best) best = n;
  }
  return best > 0 ? Math.round(best * 100) / 100 : undefined;
}

export function isDwellingRoom(room: FloorplanRoom): boolean {
  const kind = room.kind ?? inferRoomKind(room.name);
  return DWELLING_KINDS.includes(kind) && !isPlanAnnotation(room.name);
}

export function isInteriorRoom(room: FloorplanRoom): boolean {
  return isDwellingRoom(room);
}

export function isStudyRoom(room: FloorplanRoom): boolean {
  return /עבודה|משרד/.test(room.name.replace(/\s+/g, " "));
}

/** מחסן / כביסה / חדר שירות — לא חניה, לא פיר, לא שירותים */
export function isStorageOrServiceRoom(room: FloorplanRoom): boolean {
  const n = room.name.replace(/\s+/g, " ");
  if (/חניה|פיר/.test(n)) return false;
  if (isGuestWcRoom(room)) return false;
  if (/מחסן|כביסה|ח\.?\s*שרות|חדר שירות|חדר שרות/.test(n)) return true;
  const kind = room.kind ?? inferRoomKind(n);
  return kind === "utility" && /מחסן|כביסה|שרות|שירות/.test(n);
}

const UTILITY_WET_FIXTURE_RE = /\b(toilets?|wcs?|bidets?|bathtubs?|baths?|showers?|vanit(?:y|ies)|basins?|sinks?)\b/gi;

/** חדר שירות is laundry — never keep a hallucinated pan in contents */
export function stripWetFixturesFromUtility(room: FloorplanRoom): FloorplanRoom {
  if (!isStorageOrServiceRoom(room)) return room;
  const cleaned = (room.contents ?? "")
    .replace(UTILITY_WET_FIXTURE_RE, " ")
    .replace(/[+,/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const shelves = /מחסן/.test(room.name.replace(/\s+/g, " "));
  return {
    ...room,
    kind: "utility",
    contents: cleaned || (shelves ? "shelves" : "washer"),
  };
}

export function isPlausiblePlanRoom(room: FloorplanRoom): boolean {
  if (!room.name.trim() || isPlanAnnotation(room.name)) return false;
  if (isStudyRoom(room) || isStorageOrServiceRoom(room)) return true;
  const kind = room.kind ?? inferRoomKind(room.name);
  return kind !== "other";
}

export function filterPlausibleRooms(rooms: FloorplanRoom[]): FloorplanRoom[] {
  return rooms.filter((room) => room.name.trim() && !isPlanAnnotation(room.name));
}

export function canonicalRoomName(name: string): string {
  const n = name
    .trim()
    .replace(/^ח\.\s*/u, "חדר ")
    .replace(/ממ"?ד/gu, 'ממ"ד')
    .replace(/שרותים/gu, "שירותים");
  if (inferRoomKind(n) === "mmd") return 'ממ"ד';
  if (/מרפסת\s*גג|שטח\s*מרפסת\s*גג/.test(n)) return "מרפסת גג";
  if (/שטח המרפסת|שטח מרוצף/.test(n)) return "מרפסת";
  return n;
}

export function normFloorplanKey(s: string): string {
  return canonicalRoomName(s)
    .replace(/[\s"'״׳,.\-–]/g, "")
    .replace(/ם$/u, "מ")
    .toLowerCase();
}

/** מידות מודפסות נפוצות בתוכניות ישראליות: 3.20, 3,20, 3.20×4.10, 245 ס"מ, 385 (ס"מ בלי יחידה) */
export function extractDimensionStrings(text: string): string[] {
  if (!text.trim()) return [];
  const found = new Set<string>();
  const patterns = [
    /\d+[.,]\d+\s*[x×]\s*\d+[.,]\d+/gi,
    /\d+[.,]\d+(?:\s*(?:מ['׳]|מטר|m))?/gi,
    /\b\d{2,3}\s*(?:ס["״]מ|cm)/gi,
    /(?<![\d.])([1-9]\d{2})(?![\d.])/g,
    /(?<![\d.])(1\d{3})(?![\d.])/g,
  ];
  for (const re of patterns) {
    for (const match of text.match(re) ?? []) {
      const cleaned = match.replace(/\s+/g, " ").trim();
      if (!cleaned) continue;
      if (/^\d{3}$/.test(cleaned)) {
        const n = Number(cleaned);
        if (n < 80 || n > 999) continue;
      }
      if (/^\d{4}$/.test(cleaned)) {
        const n = Number(cleaned);
        if (n < 1000 || n > 2000) continue;
      }
      found.add(cleaned);
    }
  }
  return Array.from(found);
}

function normalizePlanAbbrev(text: string): string {
  return text.replace(/\s+/g, " ").replace(/ח\.\s*/gu, "חדר ");
}

export function extractRoomNameHits(text: string): string[] {
  const hits: string[] = [];
  const hay = normalizePlanAbbrev(text);
  for (const label of KNOWN_ROOM_LABELS) {
    if (hay.includes(normalizePlanAbbrev(label)) && !hits.includes(label)) hits.push(label);
  }
  return hits;
}

export function parseMeters(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return raw;
  if (typeof raw !== "string") return undefined;
  const t = raw.replace(",", ".").replace(/[^\d.]/g, "");
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** ספירת סמלים בשרטוט (מיטות, שולחנות, שרפרפים) — כולל 0 לחדר ריק */
export function parseCount(raw: unknown, max = 8): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n)) return undefined;
  const i = Math.round(n);
  if (i < 0 || i > max) return undefined;
  return i;
}

/** בתוכניות מכר ישראליות רוחב/אורך ≥30 בדרך כלל בסנטימטרים */
export function parsePlanLengthM(raw: unknown): number | undefined {
  const n = parseMeters(raw);
  if (n == null) return undefined;
  if (n >= 30 && n <= 2000) return Math.round((n / 100) * 100) / 100;
  if (n < 30) return Math.round(n * 100) / 100;
  return undefined;
}

function metersFromDimensionToken(token: string): number[] {
  const nums: number[] = [];
  const cm = token.match(/(\d{2,3})\s*(?:ס["״]מ|cm)/i);
  if (cm) {
    const n = Number(cm[1]) / 100;
    if (n > 0) nums.push(n);
    return nums;
  }
  if (/^\d{3}$/.test(token.trim())) {
    const n = Number(token) / 100;
    if (n >= 0.8 && n <= 9.99) nums.push(n);
    return nums;
  }
  if (/^\d{4}$/.test(token.trim())) {
    const n = Number(token) / 100;
    if (n >= 10 && n <= 20) nums.push(n);
    return nums;
  }
  for (const part of token.split(/[x×]/i)) {
    const n = parseMeters(part);
    if (n != null && n < 80) nums.push(n);
  }
  return nums;
}

export function ocrContainsMeters(ocrMeters: number[], value: number, tolerance = 0.06): boolean {
  return ocrMeters.some((m) => Math.abs(m - value) <= tolerance);
}

function parseBbox(raw: unknown): FloorplanBbox | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const x = Number(r.x ?? r.left);
  const y = Number(r.y ?? r.top);
  const w = Number(r.w ?? r.width);
  const h = Number(r.h ?? r.height);
  const parsed = floorplanBboxSchema.safeParse({ x, y, w, h });
  return parsed.success ? parsed.data : undefined;
}

function parseKind(raw: unknown, name: string, finishNotes?: string): FloorplanRoomKind {
  if (finishNotes && /ממ"?ד/.test(finishNotes)) return "mmd";
  const fromName = inferRoomKind(name);
  if (fromName === "mmd") return "mmd";
  if (fromName !== "other") return fromName;
  const hit = floorplanRoomKindSchema.safeParse(String(raw ?? "").toLowerCase());
  return hit.success ? hit.data : "other";
}

function parseElevation(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return undefined;
  const t = raw.trim().replace("±", "+").replace("−", "-").replace(",", ".");
  const n = Number(t.replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function parseInternalStairs(raw: unknown): FloorplanInternalStair | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const toElevationM = parseElevation(r.toElevationM ?? r.to ?? r.upperM);
  const fromElevationM = parseElevation(r.fromElevationM ?? r.from ?? r.lowerM);
  // Two elevations a storey apart used to be enough to declare a stair. They are
  // not: a flat at +11.42 with its terrace at +12.79 is one floor, and reading
  // that pair as a duplex invented a "מדרגות פנים" room on דירה 18 — one the
  // extractor could not even place. Only an explicit present from the model
  // counts; the elevations stay as corroboration once it has said so.
  const present = r.present === true || r.present === "true" || r.present === 1;
  if (!present) return undefined;
  const parsed = floorplanInternalStairSchema.safeParse({
    present,
    fromElevationM,
    toElevationM,
    insideUnit: r.insideUnit === false ? false : true,
    notes: r.notes != null ? String(r.notes) : undefined,
    bbox: parseBbox(r.bbox),
  });
  return parsed.success ? parsed.data : undefined;
}

function parseEvidence(raw: unknown): FloorplanEvidence | undefined {
  const parsed = floorplanEvidenceSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export function parseFloorplanLayout(raw: Record<string, unknown>): FloorplanLayout {
  const roomsRaw = Array.isArray(raw.rooms) ? raw.rooms : [];
  const openingsRaw = Array.isArray(raw.openings) ? raw.openings : [];
  const dimsRaw = Array.isArray(raw.dimensionStrings) ? raw.dimensionStrings : [];

  const rooms = assignInstanceIds(
    roomsRaw
      .map((row) => {
        const r = row as Record<string, unknown>;
        const finishNotes = r.finishNotes != null ? String(r.finishNotes) : undefined;
        const rawName = String(r.name ?? r.room ?? r.label ?? "").trim();
        const name =
          finishNotes && /ממ"?ד/.test(finishNotes)
            ? 'ממ"ד'
            : canonicalRoomName(rawName);
        return {
          name,
          kind: parseKind(r.kind, name, finishNotes),
          widthM: parsePlanLengthM(r.widthM ?? r.width),
          lengthM: parsePlanLengthM(r.lengthM ?? r.length ?? r.depth),
          areaM2: parseMeters(r.areaM2 ?? r.area),
          adjacentTo: Array.isArray(r.adjacentTo) ? r.adjacentTo.map(String) : undefined,
          finishNotes,
          bedCount: parseCount(r.bedCount ?? r.beds, 8),
          deskCount: parseCount(r.deskCount ?? r.desks, 8),
          contents: r.contents != null ? String(r.contents).trim().slice(0, 200) || undefined : undefined,
          bbox: parseBbox(r.bbox),
          source: parseEvidence(r.source),
          confidence: r.confidence != null ? Number(r.confidence) : undefined,
        };
      })
      .filter((r) => r.name.length > 0),
  );

  return floorplanLayoutSchema.parse({
    title: raw.title != null ? String(raw.title) : undefined,
    unitLabel: raw.unitLabel != null ? String(raw.unitLabel) : raw.apartment != null ? String(raw.apartment) : undefined,
    floor: sanitizeFloorLabel(raw.floor != null ? String(raw.floor) : undefined),
    ceilingHeightM: parseMeters(raw.ceilingHeightM ?? raw.ceilingHeight),
    north: raw.north != null ? String(raw.north) : undefined,
    grossAreaM2: parseMeters(raw.grossAreaM2 ?? raw.areaGrossM2 ?? raw.grossArea),
    rooms,
    openings: openingsRaw
      .map((row) => {
        const r = row as Record<string, unknown>;
        const kindRaw = String(r.kind ?? r.type ?? "opening").toLowerCase();
        const kind =
          kindRaw.includes("door") || kindRaw.includes("דלת")
            ? "door"
            : kindRaw.includes("window") || kindRaw.includes("חלון")
              ? "window"
              : "opening";
        return {
          kind: kind as FloorplanOpening["kind"],
          widthM: parseMeters(r.widthM ?? r.width),
          heightM: parseMeters(r.heightM ?? r.height),
          room: r.room != null ? String(r.room) : undefined,
        };
      })
      .filter((o) => o.widthM != null || o.room),
    dimensionStrings: dimsRaw.map((d) => String(d).trim()).filter(Boolean),
    notes: Array.isArray(raw.notes) ? raw.notes.map((n) => String(n)) : [],
    islandStoolCount: parseCount(raw.islandStoolCount ?? raw.stoolCount, 12),
    internalStairs: parseInternalStairs(raw.internalStairs ?? raw.stairs),
    requiresReview: raw.requiresReview !== false,
  });
}

export function combineOcrGrounding(parts: OcrGrounding[]): OcrGrounding {
  const text = parts.map((p) => p.text).filter(Boolean).join("\n\n");
  const dimensionStrings = Array.from(new Set(parts.flatMap((p) => p.dimensionStrings)));
  const roomNameHits = Array.from(new Set(parts.flatMap((p) => p.roomNameHits)));
  return {
    engine: parts.map((p) => p.engine).join("+") || "ocr",
    text,
    dimensionStrings,
    roomNameHits,
  };
}

function roomNameInOcr(name: string, grounding: OcrGrounding): boolean {
  const n = normFloorplanKey(name);
  if (grounding.roomNameHits.some((h) => {
    const hn = normFloorplanKey(h);
    return hn === n || n.includes(hn) || hn.includes(n);
  })) {
    return true;
  }
  const hay = normFloorplanKey(grounding.text);
  return n.length >= 3 && hay.includes(n);
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid];
}

function medianCount(values: number[]): number | undefined {
  const m = median(values);
  if (m == null) return undefined;
  return Math.round(m);
}

function pickContents(hits: FloorplanRoom[]): string | undefined {
  const texts = hits
    .map((h) => h.contents?.trim())
    .filter((s): s is string => Boolean(s));
  if (texts.length === 0) return undefined;
  return [...texts].sort((a, b) => b.length - a.length)[0]!.slice(0, 200);
}

function bboxSortKey(room: FloorplanRoom, fallback: number): number {
  if (!room.bbox) return fallback;
  return room.bbox.y * 1000 + room.bbox.x;
}

/** אותה תווית בכמה חללים סגורים (שלושה «ח. שינה») נשארת כשלושה אובייקטים */
export function assignInstanceIds(rooms: FloorplanRoom[]): FloorplanRoom[] {
  const groups = new Map<string, number[]>();
  rooms.forEach((room, i) => {
    const key = normFloorplanKey(room.name);
    const list = groups.get(key) ?? [];
    list.push(i);
    groups.set(key, list);
  });
  const out = rooms.map((r) => ({ ...r }));
  for (const indexes of groups.values()) {
    const ordered = [...indexes].sort((a, b) => bboxSortKey(rooms[a]!, a) - bboxSortKey(rooms[b]!, b));
    ordered.forEach((idx, instanceIndex) => {
      out[idx] = { ...out[idx]!, instanceIndex };
    });
  }
  return out;
}

function mergeBbox(hits: FloorplanRoom[]): FloorplanBbox | undefined {
  const boxes = hits.map((h) => h.bbox).filter((b): b is FloorplanBbox => b != null);
  if (boxes.length === 0) return undefined;
  const x = median(boxes.map((b) => b.x));
  const y = median(boxes.map((b) => b.y));
  const w = median(boxes.map((b) => b.w));
  const h = median(boxes.map((b) => b.h));
  if (x == null || y == null || w == null || h == null) return undefined;
  const parsed = floorplanBboxSchema.safeParse({ x, y, w, h });
  return parsed.success ? parsed.data : undefined;
}

function ocrGroundingEmpty(grounding: OcrGrounding): boolean {
  return !grounding.text.trim() && grounding.roomNameHits.length === 0;
}

function bboxIou(a: FloorplanBbox, b: FloorplanBbox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function roomKeepRank(room: FloorplanRoom): number {
  const src = room.source === "ocr_verified" ? 4 : room.source === "consensus" ? 3 : 1;
  const kind = room.kind ?? inferRoomKind(room.name);
  const kindBit = kind === "mmd" ? 0.4 : kind === "kitchen" || kind === "bathroom" ? 0.2 : 0;
  return src + (room.confidence ?? 0) + kindBit + (room.engineHits ?? 0) * 0.05;
}

/** אותו חלל שדווח פעמיים (ממ"ד + חדר שינה חופפים) נשאר פעם אחת */
export function dedupeOverlappingRooms(rooms: FloorplanRoom[]): FloorplanRoom[] {
  const sorted = [...rooms].sort((a, b) => roomKeepRank(b) - roomKeepRank(a));
  const kept: FloorplanRoom[] = [];
  for (const room of sorted) {
    if (!room.bbox) {
      kept.push(room);
      continue;
    }
    const clash = kept.some((other) => other.bbox != null && bboxIou(room.bbox!, other.bbox) >= 0.55);
    if (!clash) kept.push(room);
  }
  return kept;
}

export function mergeFloorplanLayouts(
  layouts: FloorplanLayout[],
  grounding: OcrGrounding,
): FloorplanLayout {
  const ocrEmpty = ocrGroundingEmpty(grounding);
  const hasOcrLabels = grounding.roomNameHits.length > 0;
  const ocrMeters = grounding.dimensionStrings.flatMap(metersFromDimensionToken);
  const groups = new Map<string, FloorplanRoom[]>();

  for (const layout of layouts) {
    for (const room of assignInstanceIds(layout.rooms)) {
      const key = `${normFloorplanKey(room.name)}#${room.instanceIndex ?? 0}`;
      const list = groups.get(key) ?? [];
      list.push(room);
      groups.set(key, list);
    }
  }

  const rooms: FloorplanRoom[] = [];
  for (const [, hits] of groups) {
    const first = hits[0]!;
    const engineHits = hits.length;
    const ocrHit = roomNameInOcr(first.name, grounding);
    const fixture = isFixtureImpliedRoom(first);
    const stair = isApartmentStairRoom(first);
    const implied = fixture || stair || isStudyRoom(first) || isStorageOrServiceRoom(first);
    const ocrStairs = inferInternalStairsFromOcr(grounding.text);
    // תווית OCR או שני מנועים — אחרת רק חלל מדירה. סלון/מטבח/רחצה/מדרגות פנים מזוהים גם בלי תווית מודפסת.
    if (!ocrHit && engineHits < 2 && hasOcrLabels && !implied) continue;
    if (!ocrHit && engineHits < 2 && !isPlausiblePlanRoom(first) && !implied) continue;
    if (hasOcrLabels && implied && engineHits < 2 && !ocrHit && !first.bbox && !mergeBbox(hits) && !ocrStairs?.present) {
      continue;
    }
    if ((first.instanceIndex ?? 0) > 0 && !mergeBbox(hits) && engineHits < 2 && !ocrHit) continue;
    const kind = first.kind ?? inferRoomKind(first.name);
    if (kind === "circulation" && !ocrHit && engineHits < 2 && !stair) continue;

    const widths = hits.map((h) => h.widthM).filter((n): n is number => n != null);
    const lengths = hits.map((h) => h.lengthM).filter((n): n is number => n != null);
    const areas = hits.map((h) => h.areaM2).filter((n): n is number => n != null);
    const widthM = pickVerifiedMeasure(median(widths), ocrMeters, engineHits, ocrEmpty);
    const lengthM = pickVerifiedMeasure(median(lengths), ocrMeters, engineHits, ocrEmpty);
    let areaM2 = pickVerifiedMeasure(median(areas), ocrMeters, engineHits, ocrEmpty);
    if (areaM2 == null && widthM != null && lengthM != null) {
      areaM2 = Math.round(widthM * lengthM * 100) / 100;
    }
    if (kind === "balcony") {
      if (areaM2 != null) {
        areaM2 = correctDroppedLeadingZero(areaM2, grounding.text);
      } else {
        const rawArea = median(areas);
        if (rawArea != null) {
          const fixed = correctDroppedLeadingZero(rawArea, grounding.text);
          if (fixed !== rawArea) areaM2 = fixed;
        }
      }
    }

    const source: FloorplanEvidence = ocrHit ? "ocr_verified" : engineHits >= 2 ? "consensus" : "inferred";
    rooms.push({
      name: displayRoomName(first.name, first.instanceIndex, hits.length > 0),
      kind,
      widthM,
      lengthM,
      areaM2,
      adjacentTo: first.adjacentTo,
      finishNotes: first.finishNotes,
      bedCount: medianCount(hits.map((h) => h.bedCount).filter((n): n is number => n != null)),
      deskCount: medianCount(hits.map((h) => h.deskCount).filter((n): n is number => n != null)),
      contents: pickContents(hits),
      bbox: mergeBbox(hits),
      instanceIndex: first.instanceIndex,
      source,
      confidence: ocrHit ? Math.min(1, 0.7 + engineHits * 0.1) : engineHits >= 2 ? 0.55 : 0.3,
      engineHits,
    });
  }

  const mergedStairs = mergeInternalStairs(layouts, grounding, rooms);
  const withMmd = ensureMmdFromOcr(
    ensureInternalStairRoom(dedupeOverlappingRooms(filterPlausibleRooms(rooms)), mergedStairs),
    grounding,
  );
  const printedMmd = printedMmdCount(grounding);
  const hasMmd = withMmd.some((r) => (r.kind ?? inferRoomKind(r.name)) === "mmd");
  const maxMmd = Math.min(maxMmdForUnit(extractGrossAreaM2(grounding.text)), Math.max(printedMmd, hasMmd ? 1 : 0));
  const printedKitchens = printedKitchenCount(grounding);
  const printedStudies = printedStudyCount(grounding);
  const keptRooms = demoteStudyRoomsWithBeds(
    capExtraStudyRooms(
      capExtraKitchenRooms(
        pruneHallucinatedPlanRooms(capExtraMmdRooms(withMmd, maxMmd), grounding),
        printedKitchens >= 2 ? printedKitchens : 1,
      ),
      printedStudies >= 2 ? printedStudies : 1,
    ),
  );
  keptRooms.sort((a, b) => {
    const ay = a.bbox?.y ?? 0;
    const by = b.bbox?.y ?? 0;
    if (ay !== by) return ay - by;
    return (b.areaM2 ?? 0) - (a.areaM2 ?? 0);
  });

  const openingGroups = new Map<string, FloorplanOpening[]>();
  for (const layout of layouts) {
    for (const opening of layout.openings) {
      const key = `${opening.kind}|${normFloorplanKey(opening.room ?? "")}|${opening.widthM ?? ""}`;
      const list = openingGroups.get(key) ?? [];
      list.push(opening);
      openingGroups.set(key, list);
    }
  }
  const openings: FloorplanOpening[] = [];
  for (const [, hits] of openingGroups) {
    const first = hits[0]!;
    const engineHits = hits.length;
    const widthM = pickVerifiedMeasure(
      median(hits.map((h) => h.widthM).filter((n): n is number => n != null)),
      ocrMeters,
      engineHits,
      ocrEmpty,
    );
    const heightM = pickVerifiedMeasure(
      median(hits.map((h) => h.heightM).filter((n): n is number => n != null)),
      ocrMeters,
      engineHits,
      ocrEmpty,
    );
    if (engineHits < 2 && !(widthM != null && ocrContainsMeters(ocrMeters, widthM))) continue;
    openings.push({
      ...first,
      widthM,
      heightM,
      source: engineHits >= 2 || (widthM != null && ocrContainsMeters(ocrMeters, widthM)) ? "consensus" : "inferred",
    });
  }

  const best = layouts.reduce(
    (acc, cur) => (cur.rooms.length > acc.rooms.length ? cur : acc),
    layouts[0] ?? floorplanLayoutSchema.parse({}),
  );

  const grossAreaM2 =
    pickVerifiedMeasure(
      median(layouts.map((l) => l.grossAreaM2).filter((n): n is number => n != null)),
      ocrMeters,
      layouts.length,
      ocrEmpty,
    ) ?? extractGrossAreaM2(grounding.text);

  const merged: FloorplanLayout = {
    title: best.title,
    unitLabel:
      layouts.map((l) => l.unitLabel).find((v) => v?.trim()) ?? extractUnitLabel(grounding.text),
    floor: sanitizeFloorLabel(best.floor, grounding.text),
    ceilingHeightM: pickVerifiedMeasure(
      median(layouts.map((l) => l.ceilingHeightM).filter((n): n is number => n != null)),
      ocrMeters,
      layouts.length,
      ocrEmpty,
    ),
    north: best.north,
    grossAreaM2,
    rooms: keptRooms.map((room) => stripImplausibleRoomMeasure(room, grossAreaM2)),
    openings,
    dimensionStrings: grounding.dimensionStrings,
    notes: Array.from(new Set(layouts.flatMap((l) => l.notes))),
    islandStoolCount: medianCount(
      layouts.map((l) => l.islandStoolCount).filter((n): n is number => n != null),
    ),
    internalStairs: mergedStairs,
    requiresReview: true,
  };
  return canonicalizeFloorplanLayout(merged);
}

function mergeInternalStairs(
  layouts: FloorplanLayout[],
  grounding: OcrGrounding,
  rooms: FloorplanRoom[],
): FloorplanInternalStair | undefined {
  const ocr = inferInternalStairsFromOcr(grounding.text);
  const vis = layouts.map((l) => l.internalStairs).filter((s): s is FloorplanInternalStair => s != null);
  const visPresent = vis.filter((s) => s.present);
  // A stair room with no bbox is a name the extractor could not put anywhere —
  // the same phantom that drove the bogus duplex on דירה 18.
  const fromRoom = rooms.some((room) => isApartmentStairRoom(room) && room.bbox != null);
  // Vision alone copies +8.06/+9.64 from the extract prompt. Require OCR pair or a stair drawn in the unit.
  if (!ocr?.present && !fromRoom) return undefined;
  const toVals = [...visPresent, ocr]
    .map((s) => s?.toElevationM)
    .filter((n): n is number => n != null);
  const fromVals = [...visPresent, ocr]
    .map((s) => s?.fromElevationM)
    .filter((n): n is number => n != null);
  let fromElevationM = fromVals.length ? Math.min(...fromVals) : undefined;
  let toElevationM = toVals.length ? Math.max(...toVals) : undefined;
  const pairOk = (a?: number, b?: number) =>
    a != null && b != null && b - a >= 0.8 && b - a <= 3.6;
  if (!pairOk(fromElevationM, toElevationM) && pairOk(ocr?.fromElevationM, ocr?.toElevationM)) {
    fromElevationM = ocr!.fromElevationM;
    toElevationM = ocr!.toElevationM;
  }
  if (fromElevationM != null && toElevationM != null && toElevationM - fromElevationM < 0.8) {
    fromElevationM = undefined;
    toElevationM = undefined;
  }
  return {
    present: true,
    insideUnit: true,
    fromElevationM,
    toElevationM,
    notes: ocr?.notes ?? visPresent[0]?.notes ?? (fromRoom ? "stair room on plan" : undefined),
    bbox: visPresent.find((s) => s.bbox)?.bbox ?? ocr?.bbox,
  };
}

function promoteMmdRoom(room: FloorplanRoom): FloorplanRoom {
  const blob = `${room.name} ${room.finishNotes ?? ""}`;
  if (!/ממ"?ד/.test(blob)) return room;
  const kind = room.kind ?? inferRoomKind(room.name);
  if (kind === "mmd") return { ...room, name: 'ממ"ד', kind: "mmd" };
  if (kind === "bedroom") return { ...room, name: 'ממ"ד', kind: "mmd" };
  return room;
}

function ensureMmdFromOcr(rooms: FloorplanRoom[], grounding: OcrGrounding): FloorplanRoom[] {
  const promoted = rooms.map(promoteMmdRoom);
  if (promoted.some((r) => (r.kind ?? inferRoomKind(r.name)) === "mmd")) return promoted;
  const ocrHasMmd =
    /ממ"?ד/.test(grounding.text) || grounding.roomNameHits.some((h) => /ממ"?ד|ממד/.test(h));
  if (!ocrHasMmd) return promoted;
  const beds = promoted.filter((r) => (r.kind ?? inferRoomKind(r.name)) === "bedroom");
  // 4+ "bedrooms" with printed ממ"ד and no mmd room → one of them is the protected room.
  if (beds.length < 4) return promoted;
  const target = beds[beds.length - 1]!;
  return promoted.map((r) => (r === target ? { ...r, name: 'ממ"ד', kind: "mmd" as const } : r));
}

function ensureInternalStairRoom(
  rooms: FloorplanRoom[],
  stairs: FloorplanInternalStair | undefined,
): FloorplanRoom[] {
  if (!stairs?.present) return rooms;
  if (rooms.some(isApartmentStairRoom)) return rooms;
  const elev =
    stairs.fromElevationM != null &&
    stairs.toElevationM != null &&
    stairs.toElevationM - stairs.fromElevationM >= 0.8
      ? `${stairs.fromElevationM >= 0 ? "+" : ""}${stairs.fromElevationM.toFixed(2)} → ${stairs.toElevationM >= 0 ? "+" : ""}${stairs.toElevationM.toFixed(2)}`
      : "to another floor of this unit";
  return [
    ...rooms,
    {
      name: "מדרגות פנים",
      kind: "circulation",
      finishNotes: `internal stair ${elev}`,
      source: "inferred",
      confidence: 0.55,
      engineHits: 1,
    },
  ];
}

function displayRoomName(name: string, instanceIndex: number | undefined, _any: boolean): string {
  const base = canonicalRoomName(name);
  if (instanceIndex != null && instanceIndex > 0) return `${base} (${instanceIndex + 1})`;
  return base;
}

function pickVerifiedMeasure(
  value: number | undefined,
  ocrMeters: number[],
  engineHits: number,
  ocrEmpty = false,
): number | undefined {
  if (value == null) return undefined;
  if (ocrContainsMeters(ocrMeters, value) || engineHits >= 2 || (ocrEmpty && engineHits >= 1)) {
    return Math.round(value * 100) / 100;
  }
  return undefined;
}

export function roomsForVisualization(layout: FloorplanLayout): FloorplanRoom[] {
  return layout.rooms.filter((room) => {
    if (isPlanAnnotation(room.name)) return false;
    if (isBuildingCoreRoom(room)) return false;
    const kind = room.kind ?? inferRoomKind(room.name);
    if (kind === "balcony" && room.areaM2 != null && room.areaM2 < TINY_BALCONY_M2) return false;
    if (isApartmentStairRoom(room)) return true;
    if (isStudyRoom(room) || isStorageOrServiceRoom(room)) return true;
    return (
      kind === "living" ||
      kind === "kitchen" ||
      kind === "bedroom" ||
      kind === "mmd" ||
      kind === "bathroom" ||
      kind === "balcony"
    );
  });
}

export function roomsForInteriorViz(layout: FloorplanLayout): FloorplanRoom[] {
  return roomsForVisualization(layout).filter(isInteriorRoom);
}

export function capLayoutMmdRooms(layout: FloorplanLayout): FloorplanLayout {
  return {
    ...layout,
    rooms: capExtraMmdRooms(layout.rooms, maxMmdForUnit(layout.grossAreaM2)),
  };
}

function roundPlanMetric(n: number | undefined, digits: number): number | undefined {
  if (n == null || !Number.isFinite(n)) return undefined;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function canonicalizeBbox(bbox?: FloorplanBbox): FloorplanBbox | undefined {
  if (!bbox) return undefined;
  return {
    x: roundPlanMetric(bbox.x, 4) ?? 0,
    y: roundPlanMetric(bbox.y, 4) ?? 0,
    w: roundPlanMetric(bbox.w, 4) ?? 0,
    h: roundPlanMetric(bbox.h, 4) ?? 0,
  };
}

function compareRoomsForLock(a: FloorplanRoom, b: FloorplanRoom): number {
  const ay = a.bbox?.y ?? 0;
  const by = b.bbox?.y ?? 0;
  if (ay !== by) return ay < by ? -1 : 1;
  const ax = a.bbox?.x ?? 0;
  const bx = b.bbox?.x ?? 0;
  if (ax !== bx) return ax < bx ? -1 : 1;
  const name = a.name.localeCompare(b.name, "he");
  if (name !== 0) return name;
  return (a.instanceIndex ?? 0) - (b.instanceIndex ?? 0);
}

/** Stable room order and rounded numbers so the same extract always builds the same viz prompt. */
export function canonicalizeFloorplanLayout(layout: FloorplanLayout): FloorplanLayout {
  return {
    ...layout,
    ceilingHeightM: roundPlanMetric(layout.ceilingHeightM, 2),
    grossAreaM2: roundPlanMetric(layout.grossAreaM2, 2),
    rooms: layout.rooms
      .map((room) => ({
        ...room,
        widthM: roundPlanMetric(room.widthM, 2),
        lengthM: roundPlanMetric(room.lengthM, 2),
        areaM2: roundPlanMetric(room.areaM2, 2),
        adjacentTo: room.adjacentTo
          ? [...room.adjacentTo].sort((x, y) => x.localeCompare(y, "he"))
          : undefined,
        bbox: canonicalizeBbox(room.bbox),
      }))
      .sort(compareRoomsForLock),
    openings: [...layout.openings]
      .map((opening) => ({
        ...opening,
        widthM: roundPlanMetric(opening.widthM, 2),
        heightM: roundPlanMetric(opening.heightM, 2),
      }))
      .sort((a, b) => `${a.kind}|${a.room ?? ""}`.localeCompare(`${b.kind}|${b.room ?? ""}`)),
    dimensionStrings: [...layout.dimensionStrings].sort((a, b) => a.localeCompare(b)),
    notes: [...layout.notes].sort((a, b) => a.localeCompare(b)),
    internalStairs: layout.internalStairs
      ? {
          ...layout.internalStairs,
          fromElevationM: roundPlanMetric(layout.internalStairs.fromElevationM, 2),
          toElevationM: roundPlanMetric(layout.internalStairs.toElevationM, 2),
          bbox: canonicalizeBbox(layout.internalStairs.bbox),
        }
      : layout.internalStairs,
  };
}

export function layoutForVisualization(layout: FloorplanLayout): FloorplanLayout {
  const capped = capLayoutMmdRooms(layout);
  const kitchenN = capped.rooms.filter((r) => (r.kind ?? inferRoomKind(r.name)) === "kitchen").length;
  const afterKitchen = kitchenN > 1 ? capExtraKitchenRooms(capped.rooms, 1) : capped.rooms;
  const afterBeds = demoteStudyRoomsWithBeds(afterKitchen);
  const afterUtility = afterBeds.map(stripWetFixturesFromUtility);
  const studyN = afterUtility.filter(isStudyRoom).length;
  const rooms = studyN > 1 ? capExtraStudyRooms(afterUtility, 1) : afterUtility;
  return canonicalizeFloorplanLayout({
    ...capped,
    rooms: rooms.map((room) => stripImplausibleRoomMeasure(room, capped.grossAreaM2)),
  });
}

/** מידות מודפסות של קיר אחד לא אמורות לכווץ סלון של דירה גדולה */
export function stripImplausibleRoomMeasure(room: FloorplanRoom, grossAreaM2?: number): FloorplanRoom {
  const kind = room.kind ?? inferRoomKind(room.name);
  const area = room.areaM2 ?? (room.widthM != null && room.lengthM != null ? room.widthM * room.lengthM : undefined);
  const drop =
    (grossAreaM2 != null &&
      grossAreaM2 >= 70 &&
      kind === "living" &&
      area != null &&
      area < Math.max(25, grossAreaM2 * 0.18)) ||
    (kind === "bathroom" && area != null && area > 7 && (grossAreaM2 ?? 0) >= 80);
  if (!drop) return room;
  return { ...room, widthM: undefined, lengthM: undefined, areaM2: undefined };
}

export type FloorplanVizViewId = "overview" | "isometric" | "interior";

export type FloorplanVizStillOrigin = "generate" | "edit" | "cad";

export type FloorplanVizImage = {
  id?: string;
  viewId: FloorplanVizViewId;
  labelHe: string;
  roomName?: string;
  mimeType: string;
  base64: string;
  src?: string;
  selected?: boolean;
  parentStillId?: string;
  origin?: FloorplanVizStillOrigin;
  attemptIndex?: number;
  createdAt?: string;
  editPrompt?: string;
  /** English audit hard-failure strings — drive "שפר תמונה" repair. */
  auditIssues?: string[];
};
