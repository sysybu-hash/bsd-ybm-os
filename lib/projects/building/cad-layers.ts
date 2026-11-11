/**
 * What an architect's layers and blocks are, office by office.
 *
 * A DXF says what each line is for, but every office says it in its own
 * words: one draws its outer walls on "A-WALL-EXT", another on "00-WL", and
 * a door is "A-DOOR" here and a block named "00-delet 80" there. A profile
 * maps those names onto the house's parts; the generic one knows the common
 * English and Hebrew names, and an office's own profile is added once its
 * drawings have been read against their sheets.
 */

export type CadKind =
  | "wall-ext"
  | "wall-int"
  | "door"
  | "window"
  | "parking"
  | "lawn"
  | "planting"
  | "tree"
  | "paving"
  | "fence"
  | "railing"
  | "stairs"
  | "plot"
  | "gate"
  | "bins"
  | "sanitary"
  | "furniture"
  | "overhead"
  | "text"
  | "dimension"
  /** A block that only groups others: its parts are read one by one. */
  | "group"
  | "ignore";

type Rule = { match: RegExp; kind: CadKind };

export type CadOfficeProfile = {
  id: string;
  label: string;
  /** Layers this office uses and other offices do not; a drawing that has them is this office's. */
  signature: RegExp[];
  layers: Rule[];
  blocks: Rule[];
  /** A hatch by its pattern name (and, where given, its layer). */
  hatches: Array<{ pattern?: RegExp; layer?: RegExp; kind: CadKind }>;
  /** A door block's nominal width in cm, from its name. */
  doorWidthCm?: (block: string) => number | null;
  /** The parts the office's plot style prints in a heavy pen (the strip readers take heavy black lines for walls' faces). */
  heavy?: CadKind[];
  /**
   * The office draws its windows and its doors as the same blocks on the same
   * layer, and only a door draws its leaf's swing: a door block with no swing
   * is a window (Breuer 21's anonymous blocks on "opens").
   */
  doorNeedsSwing?: boolean;
  /**
   * The office draws a wall as its two faces and fills nothing between them:
   * the sheet's reader fills the band between each pair of parallel wall
   * faces a wall's thickness apart, as a plot's poché (Breuer 21).
   */
  wallsAsFaces?: boolean;
  /**
   * The office fills its walls with a pattern hatch (by material), not a
   * solid one, in no particular colour: a wall-kind hatch's ring is the wall
   * whatever its fill (Revit exports).
   */
  patternedPoche?: boolean;
};

const DOOR_WIDTH = /(?:delet|door|דלת)[\s_-]*(\d{2,3})/i;

export const GENERIC_CAD_PROFILE: CadOfficeProfile = {
  id: "generic",
  label: "כללי",
  signature: [],
  layers: [
    { match: /(dim|מידות|מידה)/i, kind: "dimension" },
    { match: /(wall.?ext|ext.?wall|קיר.?חוץ|קירות.?חוץ|מעטפת)/i, kind: "wall-ext" },
    { match: /(^|[-_ ])(a-?wall|a-?wl|wall|walls|קיר|קירות|מחיצ)/i, kind: "wall-int" },
    { match: /(^|[-_ ])(a-?door|a-?dr|door|doors|dor|דלת|דלתות|delet|פתח)/i, kind: "door" },
    { match: /(^|[-_ ])(a-?glaz|window|windows|win|חלון|חלונות|halon)/i, kind: "window" },
    { match: /(park|חניה|חניות)/i, kind: "parking" },
    { match: /(grass|lawn|דשא|גינון)/i, kind: "lawn" },
    { match: /(tree|עצים|^עץ)/i, kind: "tree" },
    { match: /(plant|צמחי|שתיל)/i, kind: "planting" },
    { match: /(paving|pave|ריצוף.?חוץ|אבן.?משתלבת)/i, kind: "paving" },
    { match: /(rail|מעקה|מעקות)/i, kind: "railing" },
    { match: /(fence|גדר|גדרות)/i, kind: "fence" },
    { match: /(stair|מדרג|madreg)/i, kind: "stairs" },
    { match: /(plot|property|lot.?line|גבול.?מגרש|קו.?מגרש|migrash)/i, kind: "plot" },
    { match: /(gate|שער)/i, kind: "gate" },
    { match: /(bins?$|פחי|אשפה)/i, kind: "bins" },
    { match: /(plumb|sanit|סניטר|^sin$)/i, kind: "sanitary" },
    { match: /(furn|ריהוט|רהיט|rihut)/i, kind: "furniture" },
    { match: /(text|anno|טקסט|כיתוב|^txt$)/i, kind: "text" },
  ],
  blocks: [
    { match: DOOR_WIDTH, kind: "door" },
    { match: /(window|חלון|halon)/i, kind: "window" },
    { match: /(park|חניה)/i, kind: "parking" },
    { match: /(tree|עץ)/i, kind: "tree" },
    { match: /(gate|שער)/i, kind: "gate" },
    { match: /(bin|פח)/i, kind: "bins" },
    { match: /(toilet|sink|basin|bath|shower|wc|kiyor|ambatya|אסלה|כיור|אמבטיה|מקלחת)/i, kind: "sanitary" },
  ],
  hatches: [
    { pattern: /^(grass|gravel_grass)$/i, kind: "lawn" },
    { pattern: /^(ar-hbone|ar-brstd|ar-b816|ar-parq1|ar-rroof)$/i, kind: "paving" },
  ],
  doorWidthCm: (block) => {
    const n = Number(DOOR_WIDTH.exec(block)?.[1] ?? NaN);
    return Number.isFinite(n) && n >= 50 && n <= 250 ? n : null;
  },
  heavy: ["wall-ext", "wall-int"],
};

/**
 * Gottlieb's architect, as its DWG reads (scripts/_dwg-truth): walls on
 * "00-WL" (outer) and "00-WL pnimi" (inner), filled solid; doors are
 * "00-delet 70/80/90" blocks on "00-dor"; windows anonymous blocks on
 * "00-win"; a parking bay is the block "חניה"; the plot is a block on
 * "fair"; fences on "צ"; stairs on "00-madregot"; the upper floor's outline
 * over the ground floor on "00-mabat". A model's extension is the group
 * block "add on" / "B harchava".
 */
export const GOTTLIEB_ARCHITECT_PROFILE: CadOfficeProfile = {
  id: "gottlieb-architect",
  label: "משרד האדריכל של בית גוטליב",
  signature: [/^00-WL pnimi$/, /^00-dor$/, /^00-win$/, /^00-madregot$/, /^00-mabat$/],
  layers: [
    { match: /^00-DIM/i, kind: "dimension" },
    { match: /^00-WL$/, kind: "wall-ext" },
    { match: /^00-WL pnimi$/, kind: "wall-int" },
    { match: /^00-dor$/, kind: "door" },
    { match: /^00-win$/, kind: "window" },
    { match: /^00-m-yarok$/, kind: "lawn" },
    { match: /^צ.?$/, kind: "fence" },
    { match: /^00-madregot$/, kind: "stairs" },
    { match: /^00-mabat$/, kind: "overhead" },
    { match: /^00-SAN$/, kind: "sanitary" },
    { match: /^(fair|קו מגרש)$/, kind: "plot" },
    { match: /^00-text$/, kind: "text" },
  ],
  blocks: [
    { match: /^(add on|B harchava)$/, kind: "group" },
    { match: /delet\s*\d{2,3}/i, kind: "door" },
    { match: /^חניה$/, kind: "parking" },
    { match: /(kiyor|sherotim|mekarer|gaz|kvisa|ambatya)/i, kind: "sanitary" },
    { match: /^(text|knisat|Block_|block [56])/i, kind: "ignore" },
    { match: /^aron$/i, kind: "furniture" },
  ],
  hatches: [
    { pattern: /^GRASS$/i, kind: "lawn" },
    { pattern: /^AR-HBONE$/i, kind: "paving" },
    // The walls' poché: solid on "00-hatch" in pen 9, which the office's plot style prints in grey.
    { pattern: /^SOLID/i, layer: /^00-hatch$/, kind: "wall-int" },
  ],
  doorWidthCm: (block) => {
    const n = Number(/delet\s*(\d{2,3})/i.exec(block)?.[1] ?? NaN);
    return Number.isFinite(n) ? n : null;
  },
  // As its DWF plots: the walls' faces, the floor above's outline and the plot's line in the heavy pen.
  heavy: ["wall-ext", "wall-int", "overhead", "plot"],
};

/**
 * The Weinberg building's office, as its sale drawing "מכר סופי 29.10.26"
 * reads: walls drawn as faces on "a-wl" with their poché an ANSI31 hatch on
 * "a-ht" (the same layer holds the small ANSI31 masks behind room names, and
 * the balcony tiles as AR-BRSTD); doors are blocks on "00-dor", the sliding
 * balcony doors on "A-DR", "door 80" and "Dr070p07" on "00-win"; the safe
 * room's steel door is "Shltr02" on "op"; folding balcony doors are
 * "HARMONIKA" on "KAVIM"; balcony rails on "A-EL" and "2"; each flat's
 * number is an App_Nom block by its entrance.
 */
export const WEINBERG_ARCHITECT_PROFILE: CadOfficeProfile = {
  id: "weinberg-architect",
  label: "משרד האדריכל של בניין ויינברג",
  signature: [/^a-wl$/, /^a-ht$/, /^A-TX2$/, /^KAVIM$/, /^A-EL$/],
  layers: [
    { match: /^(00-DIM|MIDA$|a-dm$|dim$)/i, kind: "dimension" },
    { match: /^a-wl$/, kind: "wall-int" },
    // The poché layer: a hatch exploded on it is lines, and they are wall too.
    { match: /^a-ht$/, kind: "wall-int" },
    // "חלון" holds only the sliding balcony door A-DR draws in flat 14, mirrored for flat 15: missed, it left 15's kitchen an open hole.
    { match: /^(00-dor|A-DR|חלון)$/, kind: "door" },
    { match: /^(00-win|KAVIM|op)$/, kind: "window" },
    { match: /^(A-EL|2)$/, kind: "railing" },
    { match: /^00-madregot$/, kind: "stairs" },
    { match: /^00-mabat$/, kind: "overhead" },
    { match: /^00-SAN$/, kind: "sanitary" },
    { match: /^(A-TX2|KO-TEXT1|MABAT)$/, kind: "text" },
  ],
  blocks: [
    { match: /^(door\s*\d{2,3}|dr\d{2,3}|shltr)/i, kind: "door" },
    { match: /^HARMONIKA/i, kind: "window" },
    { match: /^(App_Nom|MIF_)/i, kind: "ignore" },
    { match: /(kiyor|sherotim|mekarer|gaz|kvisa|ambatya|bath)/i, kind: "sanitary" },
  ],
  hatches: [
    { pattern: /^ANSI31$/i, layer: /^a-ht$/, kind: "wall-int" },
    { pattern: /^AR-BRSTD$/i, kind: "paving" },
  ],
  doorWidthCm: (block) => {
    const n = Number(/^(?:door\s*|dr)(\d{2,3})/i.exec(block)?.[1] ?? NaN);
    return Number.isFinite(n) && n >= 50 && n <= 250 ? n : null;
  },
  heavy: ["wall-ext", "wall-int"],
};

/**
 * Breuer 21's office (Auerbach, ביצוע 22.10.2026), as its DWG reads: walls
 * as hairline faces on "wall" with no poché; demolished walls on "wall
 * harissa" and the existing building's hatches on "h kayam"; door leaves and
 * swings on "open door" inside "door mmd" blocks; windows as anonymous
 * blocks whose frames are on "opens" and glass on "open windows"; the floor
 * above on "mabat" / "mabat dak"; the floors themselves are group blocks
 * ("טיפוסית א-ג", "טיפוסית ד-ו", "חלונות").
 */
export const AUERBACH_ARCHITECT_PROFILE: CadOfficeProfile = {
  id: "auerbach-architect",
  label: "משרד האדריכל של ברויאר 21",
  signature: [/^mabat dak$/, /^line up$/, /^wall harissa$/, /^open windows$/, /^h kayam$/],
  layers: [
    { match: /^dim/i, kind: "dimension" },
    { match: /^(wall harissa|h kayam|hidden|H\d{3}|gvul|Defpoints)$/i, kind: "ignore" },
    { match: /^wall2?$/i, kind: "wall-int" },
    // A door and a window are both anonymous blocks on "opens"; the door's swing tells them apart (doorNeedsSwing).
    { match: /^(open door|-door|opens)$/i, kind: "door" },
    { match: /^open windows$/i, kind: "window" },
    { match: /^(mabat|mabat dak|line up)$/i, kind: "overhead" },
    { match: /^(sanitary|senitar)$/i, kind: "sanitary" },
    { match: /^ריהוט$/, kind: "furniture" },
    { match: /^text$/i, kind: "text" },
  ],
  blocks: [
    { match: /^(טיפוסית|חלונות$)/, kind: "group" },
    { match: /^door mmd$/i, kind: "door" },
    { match: /^חניה$/, kind: "parking" },
    { match: /^(dim open|צפון|מפלס|SH1$|xrd$|ntynb$)/i, kind: "ignore" },
  ],
  hatches: [{ layer: /^h kayam$/i, kind: "ignore" }],
  heavy: ["wall-ext", "wall-int"],
  doorNeedsSwing: true,
  wallsAsFaces: true,
};

/** "BW IntSgl - 100_210" → 100; "M_Single-Flush - 0915 x 2134mm" → 91.5 (Revit's family - type names). */
const REVIT_DOOR_WIDTH = /(?:\s-\s|^)(\d{2,3})_\d{2,3}\b|(\d{4})\s*x\s*\d{4}\s*mm/i;

/**
 * A plan exported from Revit with the AIA layer names (Damesek Eliezer,
 * מתי תכנון, 2023): walls' faces on "A_WALL_PRTN" with their poché a
 * patterned hatch (FP_n, not solid) on "A-WALL-PATT", columns hatched on
 * "S-COLS"; doors are family blocks "BW IntSgl - 100_210" on "A_DOOR";
 * windows "BW Standard …", "חלון קשת …", "__חלון עגול" on "A_SEEN_LT" (a
 * layer that also holds seen edges, so a window is known by its block's
 * name); stairs on "A-FLOR-STRS", rails on "A-FLOR-HRAL"; tags, grids, levels
 * and detail lines are annotation.
 */
export const REVIT_AIA_PROFILE: CadOfficeProfile = {
  id: "revit-aia",
  label: "יצוא Revit (שכבות AIA)",
  signature: [/^A_WALL_PRTN$/, /^A-WALL-PATT$/, /^A_SEEN_LT$/, /^A-ANNO-IDEN$/, /^S-GRID$/, /^A_FIXT_SANT$/],
  layers: [
    { match: /^A-ANNO-DIMS/i, kind: "dimension" },
    { match: /^(A-ANNO-(?!DIMS)|A-SECT|A-DETL|A-AREA|S-GRID|E-|G-|A-CLNG|Defpoints$|C-TOPO$|L-SITE$)/i, kind: "ignore" },
    { match: /^(A_WALL_PRTN|A-WALL-PATT|S-COLS)$/i, kind: "wall-int" },
    { match: /^(A_DOOR|A-DOOR)$/i, kind: "door" },
    { match: /^(A-GLAZ|A-GLAZ-CWMG|A-GLAZ-FRAM|A_OPEN)$/i, kind: "window" },
    { match: /^A-FLOR-STRS$/i, kind: "stairs" },
    { match: /^A-FLOR-HRAL$/i, kind: "railing" },
    { match: /^A_FIXT_SANT$/i, kind: "sanitary" },
    { match: /^A_FURN$/i, kind: "furniture" },
    { match: /^A_HIDN_UP$/i, kind: "overhead" },
  ],
  blocks: [
    { match: /^(Grid|Spot Elevations|Section|Elevation|Level|RC_MULTI_TAG|וונטה|__סימון|Drain Pipe|__צינורות|Tovna_Mamad_Zinor|צ_א_4|RvZ_Shaft|משטחי אזהרה|סימן נכים|Lighting|__תאורת)/i, kind: "ignore" },
    { match: /^RvZ_Service Cabinet Door/i, kind: "furniture" },
    { match: /^(BW IntSgl|BW Sliding Door|M_Single-Flush|mamad_door|Revolving_Door|M_Door-Curtain-Wall)/i, kind: "door" },
    { match: /^(BW Standard|חלון|__חלון|Window-|Tovna_Mamad_Window|System Panel)/i, kind: "window" },
    { match: /^(Railing|Handrail)/i, kind: "railing" },
    { match: /^(WC|Urinal|כיור|Bath|M_Shower|Floor_Drain|Grab Rail)/i, kind: "sanitary" },
  ],
  // Revit fills its walls with patterns by material (FP_1, FP_2 …), never solid: the hatch's ring is the wall.
  hatches: [
    { layer: /^(A-WALL-PATT|S-COLS)$/i, kind: "wall-int" },
    { layer: /^(A-ANNO|A-DETL|A_PATT|A-GENM|A_SEEN)/i, kind: "ignore" },
  ],
  doorWidthCm: (block) => {
    const m = REVIT_DOOR_WIDTH.exec(block);
    const n = m?.[1] ? Number(m[1]) : m?.[2] ? Number(m[2]) / 10 : NaN;
    return Number.isFinite(n) && n >= 50 && n <= 300 ? n : null;
  },
  heavy: ["wall-ext", "wall-int"],
  patternedPoche: true,
};

export const CAD_PROFILES: CadOfficeProfile[] = [GOTTLIEB_ARCHITECT_PROFILE, WEINBERG_ARCHITECT_PROFILE, AUERBACH_ARCHITECT_PROFILE, REVIT_AIA_PROFILE];

/** The office whose layers the drawing carries most of; the generic profile when none has half its signature. */
export function profileFor(layers: Iterable<string>): CadOfficeProfile {
  const names = [...layers];
  let best: { profile: CadOfficeProfile; share: number } | null = null;
  for (const profile of CAD_PROFILES) {
    const hits = profile.signature.filter((re) => names.some((n) => re.test(n))).length;
    const share = profile.signature.length ? hits / profile.signature.length : 0;
    if (share >= 0.5 && (!best || share > best.share)) best = { profile, share };
  }
  return best?.profile ?? GENERIC_CAD_PROFILE;
}

const first = (rules: Rule[], name: string): CadKind | null => rules.find((r) => r.match.test(name))?.kind ?? null;

/** A layer's part, by the office's names and then the generic ones. */
export function layerKind(profile: CadOfficeProfile, layer: string): CadKind | null {
  return first(profile.layers, layer) ?? (profile === GENERIC_CAD_PROFILE ? null : first(GENERIC_CAD_PROFILE.layers, layer));
}

/** A block reference's part: its name says more than its layer, so the name is asked first. */
export function blockKind(profile: CadOfficeProfile, block: string, layer: string): CadKind | null {
  const byName = first(profile.blocks, block) ?? (profile === GENERIC_CAD_PROFILE ? null : first(GENERIC_CAD_PROFILE.blocks, block));
  if (byName) return byName;
  const byLayer = layerKind(profile, layer);
  return byLayer === "door" || byLayer === "window" || byLayer === "sanitary" || byLayer === "furniture" || byLayer === "plot" || byLayer === "tree" || byLayer === "gate" || byLayer === "bins" || byLayer === "parking"
    ? byLayer
    : null;
}

/** A hatch's part: by its pattern first (a GRASS hatch is a lawn on any layer), then by its layer. */
export function hatchKind(profile: CadOfficeProfile, pattern: string, layer: string): CadKind | null {
  for (const p of [profile, GENERIC_CAD_PROFILE]) {
    const hit = p.hatches.find((h) => (!h.pattern || h.pattern.test(pattern)) && (!h.layer || h.layer.test(layer)));
    if (hit) return hit.kind;
  }
  return layerKind(profile, layer);
}

export function doorWidthCm(profile: CadOfficeProfile, block: string): number | null {
  return profile.doorWidthCm?.(block) ?? GENERIC_CAD_PROFILE.doorWidthCm?.(block) ?? null;
}
