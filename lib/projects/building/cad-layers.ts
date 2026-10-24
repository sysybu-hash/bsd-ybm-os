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
};

const DOOR_WIDTH = /(?:delet|door|דלת)[\s_-]*(\d{2,3})/i;

export const GENERIC_CAD_PROFILE: CadOfficeProfile = {
  id: "generic",
  label: "כללי",
  signature: [],
  layers: [
    { match: /(dim|מידות|מידה)/i, kind: "dimension" },
    { match: /(wall.?ext|ext.?wall|קיר.?חוץ|קירות.?חוץ|מעטפת)/i, kind: "wall-ext" },
    { match: /(^|[-_ ])(a-?wall|wall|walls|קיר|קירות|מחיצ)/i, kind: "wall-int" },
    { match: /(^|[-_ ])(a-?door|door|doors|דלת|דלתות|delet)/i, kind: "door" },
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

export const CAD_PROFILES: CadOfficeProfile[] = [GOTTLIEB_ARCHITECT_PROFILE];

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
