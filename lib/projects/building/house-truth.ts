import type { HouseInventory } from "@/lib/projects/building/dxf-house";
import { leavesOf, type DwfBuilding } from "@/lib/projects/building/from-dwf";
import { readFloorSheet } from "@/lib/projects/building/from-dwf-sheet";
import { askDrawing } from "@/lib/projects/building/house-ai";
import type { Primitive } from "@/lib/projects/building/model";
import { cutFramedWindows, hangLeaves, houseOpenings, type PlanOpening, type PlanSwing } from "@/lib/projects/building/plan-openings";
import { namedRoomCount } from "@/lib/projects/building/room-labels";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";

/**
 * What a sheet holds, counted, and the model checked against it item by item.
 *
 * The truth comes from the drawing's meaning where there is one — a DXF's
 * inventory (dxf-house.ts), or one written from a DWG (scripts/_dwg-truth) —
 * and otherwise from a second reader: the vision model counting the plotted
 * sheet. A DXF's count is the truth and a gap is a fault; the vision model's
 * is a second opinion and a gap is a question for the review page.
 */

export type HouseCounts = {
  /** Doorways, inside and out. */
  doors: number;
  windows: number;
  /** Parking bays. */
  parking: number;
  /** Rooms the sheet labels. */
  rooms: number;
  lawnM2: number;
  trees: number;
  gates: number;
  /** Whether the sheet draws a fence, and stairs. */
  fence: boolean;
  stairs: boolean;
};

/**
 * The model's counts: null where the model holds nothing to count it by —
 * rooms its sheet does not name in text, stairs inside it does not stand up.
 * An item the model cannot count is not compared.
 */
export type ModelCounts = { [K in keyof HouseCounts]: HouseCounts[K] | null };

export type HouseTruthSource = "dxf" | "dwg" | "ai";

export type HouseTruth = {
  source: HouseTruthSource;
  sheet: string;
  model: string;
  storey: number | "roof" | null;
  counts: HouseCounts;
  /** Door widths in cm, how many of each (a DXF's door blocks name them). */
  doorWidths?: Record<string, number>;
  rooms: Array<{ name: string | null; dims: string | null; statedM2: number | null }>;
};

export type TruthItem = keyof HouseCounts;

export type TruthFinding = {
  sheet: string;
  item: TruthItem;
  truth: number | boolean;
  model: number | boolean;
  /** "fault": the drawing says otherwise; "check": the second reader does, someone should look. */
  verdict: "ok" | "fault" | "check";
  source: HouseTruthSource;
};

/** How far a count may stray and still be the same, per item: absolute, and as a share of the truth. */
const TOLERANCE: Record<Exclude<TruthItem, "fence" | "stairs">, { abs: number; rel: number }> = {
  doors: { abs: 1, rel: 0.1 },
  windows: { abs: 1, rel: 0.1 },
  parking: { abs: 0, rel: 0 },
  rooms: { abs: 1, rel: 0.1 },
  lawnM2: { abs: 2, rel: 0.15 },
  trees: { abs: 1, rel: 0.2 },
  gates: { abs: 0, rel: 0 },
};

/** A sheet's truth from its DXF inventory. */
export function truthFromInventory(inv: HouseInventory): HouseTruth {
  return {
    source: "dxf",
    sheet: inv.sheet,
    model: inv.model,
    storey: inv.storey,
    counts: {
      doors: inv.counts.doors,
      windows: inv.counts.windows,
      parking: inv.counts.parking,
      // As the model counts its rooms: the named ones, each once, and no balcony.
      rooms: namedRoomCount(inv.rooms),
      lawnM2: inv.counts.lawnM2,
      trees: inv.counts.trees,
      gates: inv.counts.gates,
      // Gottlieb's office names its fences in text alone, their lines on a layer of no kind.
      fence: inv.counts.fenceSegments > 0 || inv.fenceTexts.some((t) => /גדר/.test(t.text)),
      stairs: inv.counts.stairsLines > 0,
    },
    doorWidths: inv.counts.doorWidths,
    rooms: inv.rooms.map((r) => ({ name: r.name, dims: r.dims, statedM2: r.statedM2 })),
  };
}

/**
 * The model's counts for one storey: its openings (plan-openings.ts) and its
 * rooms as read, the yard's pieces from its primitives.
 */
export function countsFromModel(input: {
  /** `door`: the opening has a leaf's swing — what a drawing's door is. A doorway without one is a passage. */
  openings: Array<Pick<PlanOpening, "kind" | "exterior" | "door" | "sliding">>;
  /** The rooms the sheet names; null where it names none in text (the names are read later, or not at all). */
  rooms: number | null;
  primitives?: Primitive[];
  /** The yard is the ground floor's: a storey above has none of its own. */
  yard?: boolean;
}): ModelCounts {
  const prims = input.yard === false ? [] : (input.primitives ?? []);
  const tagged = (tag: string) => prims.filter((p) => p.tag === tag);
  const lawnM2 = tagged("yard:lawn").reduce((s, p) => s + (p.type === "prism" ? ringAreaM2(p.ring) : 0), 0);
  // A stair inside the house is not stood up as a flight; the yard's are.
  const stairs = prims.some((p) => typeof p.tag === "string" && /^yard:stairs$/.test(p.tag));
  return {
    doors: input.openings.filter((o) => o.door && !o.sliding).length,
    windows: input.openings.filter((o) => o.exterior && o.kind !== "doorway" && !o.door).length,
    parking: tagged("yard:car").length,
    rooms: input.rooms,
    lawnM2: Math.round(lawnM2 * 10) / 10,
    // The plot's trees: the neighbours' gardens beyond it (house-finish.ts) are scenery.
    trees: prims.filter((p) => p.type === "tree" && typeof p.tag === "string" && p.tag.startsWith("yard:")).length,
    gates: tagged("yard:gate").length,
    fence: tagged("yard:fence").length > 0,
    stairs: stairs || null,
  };
}

/** Every opening a leaf swings in, inside or out, marked a door (plan-openings.ts). */
export function hingedOpenings(openings: PlanOpening[], swings: PlanSwing[]): PlanOpening[] {
  return hangLeaves(openings, swings).openings;
}

/**
 * A built house's counts, storey by storey from the ground up: each floor's
 * sheet read again as buildingFromDwf reads it (its framed windows cut, a
 * door carved wherever it swings a leaf, every door marked), its labelled
 * rooms, and the yard on the ground floor.
 */
export function countsFromBuilding(b: DwfBuilding): Array<{ id: string; level: number; counts: ModelCounts }> {
  const metres = (v: number) => v / DWF_FLOOR_UNITS_PER_METRE;
  return b.floors
    .filter((f) => !f.roof)
    .sort((p, q) => p.level - q.level)
    .flatMap((f, i) => {
      const sheet = f.sheet;
      const rf = readFloorSheet(sheet, { x: 0, y: 0, width: sheet.pageWidth, height: sheet.pageHeight }, [], false, f.level);
      if (!rf) return [];
      const lines = sheet.segments.map((s) => ({ x1: metres(s.x1), y1: metres(s.y1), x2: metres(s.x2), y2: metres(s.y2) }));
      // As stood up where the building holds them; else read again as it reads them.
      const openings = f.openings ?? houseOpenings(cutFramedWindows(rf.walls, lines), { mask: rf.footprint, cm: rf.floor.cm }, leavesOf(sheet), lines).openings;
      const named = rf.floor.rooms.filter((r) => r.names.length > 0).length;
      const rooms = named > 0 ? named : null;
      return [{ id: f.id, level: f.level, counts: countsFromModel({ openings, rooms, primitives: b.model.primitives, yard: i === 0 }) }];
    });
}

function ringAreaM2(ring: Array<[number, number]>): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i]!;
    const [bx, bz] = ring[(i + 1) % ring.length]!;
    s += ax * bz - bx * az;
  }
  return Math.abs(s) / 2;
}

/** Item by item: what the model has against what the sheet says. A storey above the ground is not held to the yard's items. */
export function compareToTruth(truth: HouseTruth, model: ModelCounts, options?: { yard?: boolean }): TruthFinding[] {
  const yard = options?.yard ?? truth.storey === 0;
  const items: TruthItem[] = ["doors", "windows", "rooms", "stairs", ...(yard ? (["parking", "lawnM2", "trees", "gates", "fence"] as const) : [])];
  const miss: TruthFinding["verdict"] = truth.source === "ai" ? "check" : "fault";
  return items.flatMap((item): TruthFinding[] => {
    const t = truth.counts[item];
    const m = model[item];
    if (m == null) return [];
    let same: boolean;
    if (typeof t === "boolean") same = t === m;
    else {
      const tol = TOLERANCE[item as keyof typeof TOLERANCE];
      same = Math.abs((m as number) - t) <= Math.max(tol.abs, tol.rel * t);
    }
    return [{ sheet: truth.sheet, item, truth: t, model: m, verdict: same ? "ok" : miss, source: truth.source }];
  });
}

const HEBREW_ITEM: Record<TruthItem, string> = {
  doors: "דלתות",
  windows: "חלונות",
  parking: "חניות",
  rooms: "חדרים",
  lawnM2: 'דשא (מ"ר)',
  trees: "עצים",
  gates: "שערים",
  fence: "גדר",
  stairs: "מדרגות",
};

/** A finding as a line on the review page. */
export function describeFinding(f: TruthFinding): string {
  const v = (x: number | boolean) => (typeof x === "boolean" ? (x ? "יש" : "אין") : String(x));
  const who = f.source === "ai" ? "לפי קריאת ה-AI" : "בשרטוט";
  return `${f.sheet}: ${HEBREW_ITEM[f.item]} — ${who} ${v(f.truth)}, במודל ${v(f.model)}`;
}

const AI_PROMPT = `You are reading one sheet of an architect's permit drawing of a private house (Hebrew labels). Count what the sheet draws — do not guess what is not drawn.
Return JSON only:
{"doors": <door leaves drawn with a swing arc>, "windows": <window openings in walls>, "parking": <parking bays>, "rooms": [{"name": "<label as written>", "dims": "<W*L as written or null>"}], "lawnM2": <rough lawn area in m², 0 if none>, "trees": <trees drawn>, "gates": <gates in the fence>, "fence": <true|false>, "stairs": <true|false>}`;

/**
 * The second reader, where there is no DXF: the vision model counts the
 * plotted sheet (text out, no picture made). Null when there is no key or no
 * usable answer.
 */
export async function readTruthByAi(sheetImage: Buffer, sheet: { name: string; model: string; storey: number | "roof" | null }): Promise<HouseTruth | null> {
  const raw = await askDrawing(AI_PROMPT, [sheetImage]);
  return raw ? truthFromAiAnswer(raw, sheet) : null;
}

/** The vision model's answer as a truth, every number checked to be one. */
export function truthFromAiAnswer(raw: Record<string, unknown>, sheet: { name: string; model: string; storey: number | "roof" | null }): HouseTruth | null {
  const n = (k: string) => {
    const v = Number(raw[k]);
    return Number.isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : null;
  };
  const rooms = Array.isArray(raw.rooms)
    ? raw.rooms.flatMap((r) => {
        if (!r || typeof r !== "object") return [];
        const { name, dims } = r as { name?: unknown; dims?: unknown };
        const d = typeof dims === "string" && /^\d+(\.\d+)?\s*\*\s*\d+(\.\d+)?$/.test(dims.trim()) ? dims.trim() : null;
        const [w, l] = d ? d.split("*").map(Number) : [NaN, NaN];
        return [{ name: typeof name === "string" && name.trim() ? name.trim() : null, dims: d, statedM2: d ? Math.round(w! * l! * 100) / 100 : null }];
      })
    : [];
  const counts = { doors: n("doors"), windows: n("windows"), parking: n("parking"), lawnM2: n("lawnM2"), trees: n("trees"), gates: n("gates") };
  if (counts.doors == null || counts.windows == null) return null;
  return {
    source: "ai",
    sheet: sheet.name,
    model: sheet.model,
    storey: sheet.storey,
    counts: {
      doors: counts.doors,
      windows: counts.windows,
      parking: counts.parking ?? 0,
      rooms: rooms.length,
      lawnM2: counts.lawnM2 ?? 0,
      trees: counts.trees ?? 0,
      gates: counts.gates ?? 0,
      fence: raw.fence === true,
      stairs: raw.stairs === true,
    },
    rooms,
  };
}
