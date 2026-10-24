import { PLAN_NORTH, type North, type Side } from "@/lib/projects/building/compass";
import { dxfFacades, dxfSheets, modelOf, readDxfHouse, storeyOf, type HouseInventory } from "@/lib/projects/building/dxf-house";
import { askDrawing } from "@/lib/projects/building/house-ai";
import type { ElevationLevels } from "@/lib/projects/building/house-levels";
import type { HouseSiteLevels } from "@/lib/projects/building/house-yard";
import { readDwfStrip } from "@/lib/projects/dwf-building";
import { readDxfDrawing } from "@/lib/projects/dxf-drawing";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { dwfSheetJpeg } from "@/lib/projects/floorplan-render-dwf";

/** One sheet of the house: a DWF file, or a layout tab of a DXF file. */
export type HouseSheetRef = { file: string; sheet?: string; /** A DXF that is one floor in model space: read whole, not by layout tab. */ whole?: boolean };

/** Floor to floor from ±0.00, metres: each storey's floor, the roof slab's top and its parapet's. */
export type HouseLevels = { floors: number[]; roof: number; parapet: number };

/**
 * A private house to stand up: which sheet is which, and what the hand knows
 * of it that the sheets do not draw in lines. Each optional field is read
 * off the sheets where they bear it out — the north arrow, the elevations'
 * level marks, the faces — and falls back to the standard where they do not.
 */
export type HouseProject = {
  models: Array<{ id: string; name: string; floors: HouseSheetRef[] }>;
  facades: HouseSheetRef;
  style: string;
  /**
   * The haredi switch, set by hand: single beds, and a kitchen's one drawn
   * sink built as a double sink (two drawn sinks stay two singles). Absent:
   * as the style's audience says.
   */
  haredi?: boolean;
  /** True north on the plans, set by hand. */
  north?: North;
  /** The facade sheet's drawings, top to bottom, by the plan's side each is seen from (compass.ts), where the sheet titles none and the vision model's is not verified. */
  faces?: Side[];
  /** The plot's levels, where the elevations' marks do not give them. */
  site?: HouseSiteLevels;
  /** The storeys' levels, set by hand. */
  levels?: HouseLevels;
};

export const HOUSE_STYLE = "haredi_classic";

/** A storey's height where neither the hand nor the elevations' marks give one. */
export const STANDARD_STOREY_M = 3.0;
/** A parapet's height over the roof slab, likewise. */
export const STANDARD_PARAPET_M = 1.0;
/** The land 15 cm under the ground floor all round, likewise. */
export const FLAT_SITE: HouseSiteLevels = { west: -0.15, east: -0.15 };
/**
 * The usual order of a house's facade sheet: the front (the plan's bottom,
 * the street), the side on the plan's left, the back. Used only to try the
 * faces against the plan where the vision model gave none.
 */
export const USUAL_FACES: Side[] = ["south", "west", "north", "east"];

export function standardLevels(storeys: number): HouseLevels {
  const floors = Array.from({ length: Math.max(1, storeys) }, (_, i) => i * STANDARD_STOREY_M);
  const roof = floors.length * STANDARD_STOREY_M;
  return { floors, roof, parapet: roof + STANDARD_PARAPET_M };
}

/**
 * The Gottlieb private house, as the architect's DWGs were read by hand: the
 * tender this booklet was built on, and the regression it is checked
 * against. Its sheets as they are uploaded: A/B/C-ground, -floor1, facades.
 */
export const GOTTLIEB_HOUSE: HouseProject = {
  models: ["A", "B", "C"].map((id) => ({ id, name: `דגם ${id}`, floors: [{ file: `${id}-ground.dwf` }, { file: `${id}-floor1.dwf` }] })),
  facades: { file: "facades.dwf" },
  style: HOUSE_STYLE,
  // The client's: a haredi home (15/10/2026).
  haredi: true,
  // The plans' right: the street, at the plans' bottom, is the east, as the DWG titles its facades and its north arrow says.
  north: { x: 1, z: 0 },
  // The sheet titles none: the parking and the street (the plans' bottom), that street on its right (the plans' left), the back.
  faces: ["south", "west", "north"],
  // From ±0.00 = 160.70, as the facades mark them: the land at 159.53–159.78 by the south facade and 161.80–161.85 at the
  // north end, the bays at −0.70 and +1.00, the street falling from 161.80 to 158.10 along the east facade.
  site: {
    west: -1.1,
    east: 1.1,
    parkingWest: -0.7,
    parkingEast: 1.0,
    street: [
      [-13.3, -2.6],
      [-10.48, -2.07],
      [-5.52, -1.73],
      [-4.27, -1.67],
      [-0.82, -1.45],
      [0.82, -0.95],
      [10.37, -0.37],
      [13.4, 1.1],
    ],
    sideFlights: { west: -1.37 },
  },
  levels: { floors: [0, 2.97], roof: 5.84, parapet: 6.94 },
};

const SHEET_FILE = /\.(dwf|dxf)$/i;
const FACADE_WORDS = /facade|elevation|חזית|חזיתות/i;

/**
 * Which uploaded sheet is which, from the files' names — "A-ground.dwf",
 * "A-floor1.dwf", "facades.dwf" — or a DXF's layout tabs ("A_קומת קרקע",
 * "חזיתות"). A model is the name less its storey; it needs a ground floor.
 */
export function projectFromSheets(sheets: Array<HouseSheetRef & { name: string }>, style = HOUSE_STYLE): { project: HouseProject | null; problems: string[] } {
  const problems: string[] = [];
  const facades = sheets.find((s) => FACADE_WORDS.test(s.name));
  const byModel = new Map<string, Array<{ storey: number; ref: HouseSheetRef }>>();
  for (const s of sheets) {
    if (s === facades) continue;
    const storey = storeyOf(s.name);
    if (typeof storey !== "number" || storey < 0) continue;
    const model = modelOf(s.name).replace(SHEET_FILE, "").trim() || "A";
    const list = byModel.get(model) ?? [];
    if (list.some((f) => f.storey === storey)) problems.push(`שני גיליונות לאותה קומה: ${s.name}`);
    else list.push({ storey, ref: { file: s.file, ...(s.sheet ? { sheet: s.sheet } : {}), ...(s.whole ? { whole: true } : {}) } });
    byModel.set(model, list);
  }
  if (!facades) problems.push("לא נמצא גיליון חזיתות (שם הקובץ או הלשונית צריך לכלול facades או חזיתות)");
  const models = [...byModel.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "he"))
    .flatMap(([id, floors]) => {
      floors.sort((a, b) => a.storey - b.storey);
      if (floors[0]?.storey !== 0) {
        problems.push(`לדגם ${id} אין קומת קרקע`);
        return [];
      }
      const gap = floors.findIndex((f, i) => f.storey !== i);
      if (gap > 0) problems.push(`לדגם ${id} חסרה קומה ${gap}`);
      const kept = gap > 0 ? floors.slice(0, gap) : floors;
      return [{ id, name: id.length <= 3 ? `דגם ${id}` : id, floors: kept.map((f) => f.ref) }];
    });
  if (!models.length) problems.push("לא נמצאו תוכניות קומה (למשל A-ground.dwf, A-floor1.dwf)");
  return { project: facades && models.length ? { models, facades: { file: facades.file, ...(facades.sheet ? { sheet: facades.sheet } : {}), ...(facades.whole ? { whole: true } : {}) }, style } : null, problems };
}

/** What the hand knows of a house, uploaded beside its sheets as `house.json`. */
export type HouseNotes = Pick<HouseProject, "north" | "faces" | "site" | "levels" | "haredi"> & { style?: string };

export const HOUSE_NOTES_FILE = /(^|[-_.])house\.json$/i;

const SIDES: Side[] = ["north", "south", "east", "west"];
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * A house's notes, each field checked: `north` the degrees the plans' north
 * arrow points clockwise from the sheet's up (or a vector), `faces` the facade
 * sheet's drawings by the plan's side each is seen from, `site` the plot's
 * levels, `levels` the storeys', `haredi` the haredi switch (true / false).
 * A field that does not hold is left out and named.
 */
export function houseNotesFrom(raw: unknown): { notes: HouseNotes; problems: string[] } {
  const problems: string[] = [];
  const notes: HouseNotes = {};
  if (!raw || typeof raw !== "object") return { notes, problems: ["house.json אינו אובייקט JSON"] };
  const r = raw as Record<string, unknown>;
  if (r.north != null) {
    const n = r.north as { x?: unknown; z?: unknown };
    if (finite(r.north)) notes.north = northOfDegrees(r.north);
    else if (finite(n.x) && finite(n.z) && Math.hypot(n.x, n.z) > 0.5) notes.north = { x: n.x, z: n.z };
    else problems.push("north: מעלות מהכיוון העליון של הגיליון, או {x, z}");
  }
  if (r.faces != null) {
    if (Array.isArray(r.faces) && r.faces.length && r.faces.every((f) => SIDES.includes(f as Side))) notes.faces = r.faces as Side[];
    else problems.push("faces: רשימה של north / south / east / west");
  }
  if (r.site != null) {
    const s = r.site as Record<string, unknown>;
    const street = s.street;
    const okStreet = street == null || (Array.isArray(street) && street.every((p) => Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1])));
    if (finite(s.west) && finite(s.east) && okStreet && [s.parkingWest, s.parkingEast].every((v) => v == null || finite(v))) {
      notes.site = {
        west: s.west,
        east: s.east,
        ...(finite(s.parkingWest) ? { parkingWest: s.parkingWest } : {}),
        ...(finite(s.parkingEast) ? { parkingEast: s.parkingEast } : {}),
        ...(street ? { street: street as Array<[number, number]> } : {}),
        ...(s.sideFlights && typeof s.sideFlights === "object" ? { sideFlights: Object.fromEntries(Object.entries(s.sideFlights).filter(([k, v]) => SIDES.includes(k as Side) && finite(v))) } : {}),
      };
    } else problems.push("site: west ו-east במטרים מ-±0.00 (ואופציונלית parkingWest, parkingEast, street)");
  }
  if (r.levels != null) {
    const l = r.levels as Record<string, unknown>;
    const floors = l.floors;
    if (Array.isArray(floors) && floors.length && floors.every(finite) && finite(l.roof) && finite(l.parapet) && l.roof > (floors[floors.length - 1] as number) && l.parapet >= l.roof) {
      notes.levels = { floors: floors as number[], roof: l.roof, parapet: l.parapet };
    } else problems.push("levels: { floors: [0, 2.97], roof, parapet } במטרים");
  }
  if (typeof r.style === "string" && r.style.trim()) notes.style = r.style.trim();
  if (typeof r.haredi === "boolean") notes.haredi = r.haredi;
  else if (r.haredi !== undefined) problems.push("haredi: true או false");
  return { notes, problems };
}

/** The uploaded files' sheets: a DWF is one, named by its file; a DXF one per layout tab, or one named by its file. */
export function sheetsOfFiles(files: Map<string, Buffer>, options?: { whole?: (file: string) => boolean }): Array<HouseSheetRef & { name: string }> {
  return [...files.entries()].flatMap(([file, bytes]) => {
    if (!SHEET_FILE.test(file)) return [];
    if (!/\.dxf$/i.test(file)) return [{ file, name: file }];
    if (options?.whole?.(file)) return [{ file, name: file, whole: true }];
    const drawing = readDxfDrawing(bytes);
    const tabs = drawing ? dxfSheets(drawing).filter((s) => s.storey != null || FACADE_WORDS.test(s.name)) : [];
    return tabs.length > 1 ? tabs.map((s) => ({ file, sheet: s.name, name: s.name })) : [{ file, name: file }];
  });
}

/**
 * Reads a project's sheets once each: a DWF's strip, a DXF tab's geometry and
 * its inventory (what the CAD layers say is there: the truth the model is
 * checked against).
 */
export function houseSheetReader(load: (file: string) => Promise<Buffer>) {
  const dxf = new Map<string, Promise<ReturnType<typeof readDxfHouse>>>();
  const dxfOf = (file: string, whole = false) => {
    const key = `${file}|${whole}`;
    let hit = dxf.get(key);
    if (!hit) dxf.set(key, (hit = load(file).then((b) => readDxfHouse(b, { whole }))));
    return hit;
  };
  const tab = async (ref: HouseSheetRef) => {
    const house = await dxfOf(ref.file, ref.whole);
    if (!house) throw new Error(`לא ניתן לקרוא את ${ref.file}`);
    const s = ref.sheet ? house.sheets.find((t) => t.name === ref.sheet) : house.sheets.length === 1 ? house.sheets[0] : house.sheets.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (!s) throw new Error(`לא נמצאה הלשונית ${ref.sheet ?? ""} ב-${ref.file}`);
    return s;
  };
  const geometry = async (ref: HouseSheetRef): Promise<DwfGeometry> => {
    if (/\.dxf$/i.test(ref.file)) return (await tab(ref)).geometry;
    const g = readDwfStrip(await load(ref.file));
    if (!g) throw new Error(`לא ניתן לקרוא את ${ref.file}`);
    return g;
  };
  return {
    geometry,
    async inventory(ref: HouseSheetRef): Promise<HouseInventory | null> {
      return /\.dxf$/i.test(ref.file) ? (await tab(ref)).inventory : null;
    },
    /** The facades: a DXF's each under its own title, else the sheet whole for its drawings to be cut apart. */
    async facades(ref: HouseSheetRef): Promise<DwfGeometry | Array<{ title: string; geometry: DwfGeometry }>> {
      if (/\.dxf$/i.test(ref.file) && !ref.sheet) {
        const house = await dxfOf(ref.file, ref.whole);
        const titled = house ? dxfFacades(house.drawing, house.profile) : [];
        if (titled.length) return titled;
      }
      return geometry(ref);
    },
  };
}

/**
 * The storeys' levels off the elevations' verified marks: the floors the
 * marks call floors, from ±0.00 up, one a storey; the roof and the parapet
 * the lowest and highest roof marks over the top floor. Null where the marks
 * do not give every storey.
 */
export function levelsFromMarks(readings: Array<ElevationLevels | null>, storeys: number): HouseLevels | null {
  const ok = readings.filter((r): r is ElevationLevels => r?.ok === true);
  const cluster = (values: number[]) =>
    [...values]
      .sort((a, b) => a - b)
      .reduce<number[]>((out, v) => (out.length && v - out[out.length - 1]! <= 0.05 ? out : [...out, v]), []);
  const floors = cluster(ok.flatMap((r) => r.marks.filter((m) => m.kind === "floor" && m.rel > -0.05 && m.rel < 30).map((m) => Math.max(0, m.rel))));
  if (floors.length < storeys || Math.abs(floors[0]!) > 0.05) return null;
  const mine = floors.slice(0, storeys);
  for (let i = 1; i < mine.length; i++) if (mine[i]! - mine[i - 1]! < 2.2 || mine[i]! - mine[i - 1]! > 5) return null;
  const top = mine[mine.length - 1]!;
  const roofs = cluster(ok.flatMap((r) => r.marks.filter((m) => m.kind === "roof" && m.rel > top + 2.2 && m.rel < top + 6).map((m) => m.rel)));
  const storey = mine.length > 1 ? (top - mine[0]!) / (mine.length - 1) : STANDARD_STOREY_M;
  const roof = roofs[0] ?? top + storey;
  const parapet = roofs.length > 1 && roofs[roofs.length - 1]! - roof <= 2 ? roofs[roofs.length - 1]! : roof + STANDARD_PARAPET_M;
  return { floors: mine, roof, parapet };
}

const NORTH_PROMPT = `This picture is an architectural floor plan of a private house.
Find its NORTH ARROW: the compass symbol showing where north is (an arrow, often in a circle, often marked "N" or "צ" or "צפון").
Answer JSON only: {"found": true, "box_2d": [ymin, xmin, ymax, xmax], "degrees": 90}
- "box_2d": the symbol's box, 0-1000 normalised to the picture;
- "degrees": where the arrow points, clockwise from the picture's up: 0 up, 90 right, 180 down, 270 left.
If there is no north arrow, answer {"found": false}.`;

/** North in the model's frame from where a plan's arrow points, clockwise from the sheet's up. */
export function northOfDegrees(degrees: number): North {
  const a = (degrees * Math.PI) / 180;
  const round = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e6) / 1e6);
  return { x: round(Math.sin(a)), z: round(-Math.cos(a)) };
}

/**
 * The plan's north arrow, as the vision model reads it, kept only where the
 * sheet draws something there: lines inside the box it gives, a symbol's
 * worth. Null where it found none, or none stands there.
 */
export async function readNorthArrow(plan: DwfGeometry): Promise<{ north: North; degrees: number } | null> {
  const box = { x: 0, y: 0, width: plan.pageWidth, height: plan.pageHeight };
  const raw = await askDrawing(NORTH_PROMPT, [await dwfSheetJpeg(plan, box, 2400)]);
  return raw ? northFromAnswer(raw, plan) : null;
}

export function northFromAnswer(raw: Record<string, unknown>, plan: DwfGeometry): { north: North; degrees: number } | null {
  if (raw.found !== true) return null;
  const degrees = Number(raw.degrees);
  const b = raw.box_2d;
  if (!Number.isFinite(degrees) || !Array.isArray(b) || b.length !== 4 || !b.every((v) => typeof v === "number")) return null;
  const [y0, x0, y1, x1] = (b as number[]).map((v) => v / 1000);
  const [left, right, top, bottom] = [x0! * plan.pageWidth, x1! * plan.pageWidth, y0! * plan.pageHeight, y1! * plan.pageHeight];
  const pad = 0.01 * Math.max(plan.pageWidth, plan.pageHeight);
  const inside = (x: number, y: number) => x >= left - pad && x <= right + pad && y >= top - pad && y <= bottom + pad;
  const strokes = [...plan.segments, ...plan.curves].filter((s) => inside(s.x1, s.y1) && inside(s.x2, s.y2)).length;
  if (strokes < 3) return null;
  const d = ((Math.round(degrees) % 360) + 360) % 360;
  return { north: northOfDegrees(d), degrees: d };
}

/**
 * The project the uploaded files make: their sheets, and the notes beside
 * them where there are any. Null, with what is wrong, where they make none.
 */
export function houseProjectFromFiles(files: Map<string, Buffer>, options?: { whole?: (file: string) => boolean }): { project: HouseProject | null; problems: string[] } {
  const notesFile = [...files.keys()].find((n) => HOUSE_NOTES_FILE.test(n));
  let notes: HouseNotes = {};
  const problems: string[] = [];
  if (notesFile) {
    try {
      const read = houseNotesFrom(JSON.parse(files.get(notesFile)!.toString("utf8")));
      notes = read.notes;
      problems.push(...read.problems.map((p) => `${notesFile}: ${p}`));
    } catch {
      problems.push(`${notesFile}: JSON לא תקין`);
    }
  }
  const made = projectFromSheets(sheetsOfFiles(files, options), notes.style ?? HOUSE_STYLE);
  const { style: _style, ...known } = notes;
  return { project: made.project ? { ...made.project, ...known } : null, problems: [...made.problems, ...problems] };
}

export { PLAN_NORTH };
