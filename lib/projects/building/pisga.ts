import { floorPrimitives, inset, insidePolygon, parapet, slab, type FloorSpec, type Outline } from "@/lib/projects/building/assemble";
import type { BuildingModel, Primitive } from "@/lib/projects/building/model";
import { readPdfPage, transformPage, type PdfPage } from "@/lib/projects/building/pdf-paths";
import { findOpenings, footprintOf } from "@/lib/projects/building/plan-openings";
import { readPlanWalls } from "@/lib/projects/building/plan-walls";
import { furnishFloor } from "@/lib/projects/building/furnish";
import { readPlanFurniture } from "@/lib/projects/building/plan-furniture";
import { readPlanRooms, type RoomKind, type RoomLabel } from "@/lib/projects/building/plan-rooms";

/**
 * מרכז פסג"ה למורים, קריית ארבע — גוטליב אדריכלים, 09.09.25.
 *
 * Everything here is read off the booklet: which sheet is which floor, how
 * the sheets register on each other (by the plot boundary every one of them
 * draws), the levels the sections print, the window heights the north
 * elevation draws, and the site's spot heights. The walls and openings are
 * not written down here — they are read from each floor's sheet.
 *
 * Plan frame: metres from page point (500, 1030) of the floor −1 sheet, at
 * 32.04 points a metre (its 5287 cm dimension over 1694 points). x east, y
 * south; north is up the sheet, as the north elevation confirms (its window
 * groups are the plan's mirrored).
 */
const ORIGIN = { x: 500, y: 1030 };
const UPM = 32.04;

/** Each floor sheet mapped onto the floor −1 sheet: x' = s·x + tx. */
const SHEETS = {
  floorMinus1: { page: 5, s: 1, tx: 0, ty: 0 },
  floorMinus2: { page: 6, s: 1.00565, tx: 22.86, ty: 33.98 },
} as const;

const LEVEL = {
  floorMinus2: 8.29,
  floorMinus1: 12.77,
  roof: 17.25,
  parapet: 18.4,
  bulkhead: 20.32,
  courtyard: 8.2,
  street: 17.2,
  kindergartenRoof: 7.99,
};

const rect = (x0: number, y0: number, x1: number, y1: number): Outline => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** Floor −1 overhangs the courtyard on columns; floor −2 stops 3.4 m short of it. */
const OUTLINE_MINUS1: Outline = [
  [0.88, 1.02],
  [53.92, 1.02],
  [53.92, 16.58],
  [33.82, 16.58],
  [33.82, 18.2],
  [30.44, 18.2],
  [30.44, 16.58],
  [0.88, 16.58],
];
const OUTLINE_MINUS2: Outline = [
  [0.88, 1.02],
  [53.92, 1.02],
  [53.92, 13.2],
  [33.8, 13.2],
  [33.8, 15.0],
  [30.44, 15.0],
  [30.44, 13.2],
  [0.88, 13.2],
];

/**
 * The room names each sheet writes, where it writes them. The sheets set
 * them in a vector font, so they are read here off the drawing, not parsed.
 */
const L = (x: number, y: number, name: string, kind: RoomKind): RoomLabel => ({ x, y, name, kind });
const LABELS_MINUS1: RoomLabel[] = [
  L(10.3, 4.7, "עיצוב מרחבי למידה 109 מ\"ר", "design"),
  L(17.2, 7.2, "כיתה 50 מ\"ר", "classroom"),
  L(27.9, 3.4, "חלל כפול", "void"),
  L(30.7, 5.2, "מזכירות 17 מ\"ר", "lobby"),
  L(27.5, 8.7, "מבואה", "lobby"),
  L(50.2, 2.0, "אולם רב תכליתי 135 מ\"ר", "hall"),
  L(37.1, 12.4, "סדנא לגיל הרך 70 מ\"ר", "workshop"),
  L(36.8, 8.6, "פינת קפה מבקרים", "workshop"),
  L(42, 7, "שירותים", "wc"),
  L(39.5, 7.5, "שירותים", "wc"),
  L(40.8, 5.3, "שירותים", "wc"),
  L(42.5, 5.3, "שירותים", "wc"),
  L(4.4, 11.1, "מטבח צוות", "kitchen"),
  L(3.1, 14.5, "ממ\"ד", "mmd"),
  L(6.0, 14.5, "יציאת חרום", "corridor"),
  L(8.7, 14.7, "מפקחים 17 מ\"ר", "office"),
  L(12.6, 15.1, "סגן מנהל 10 מ\"ר", "office"),
  L(17.2, 14.7, "מנהל 14 מ\"ר", "office"),
  L(20.9, 14.4, "מדריכים 15 מ\"ר", "office"),
  L(27.3, 14.3, "מדרגות", "stair"),
  L(31.9, 14.5, "מעלית", "lift"),
  L(32, 16.8, "מבואת מעלית", "lobby"),
  L(12, 10.8, "מעבר", "corridor"),
];
const LABELS_MINUS2: RoomLabel[] = [
  L(4.1, 6.9, "מחשבים 50 מ\"ר", "computers"),
  L(14, 4.5, "מרחב לימוד פתוח / כיתה 50 מ\"ר", "classroom"),
  L(5.6, 12.3, "חדר עזר 40 מ\"ר", "office"),
  L(16.5, 12.3, "חדר עזר 40 מ\"ר", "office"),
  L(22.5, 10.3, "אב בית / ממ\"ד", "mmd"),
  L(25.9, 9.4, "שירותים", "wc"),
  L(27.8, 10.5, "שירותים", "wc"),
  L(27.6, 12.5, "שירותים", "wc"),
  L(31.2, 10.6, "מבואה", "lobby"),
  L(36.5, 10.3, "עמדת מחשבים / ממ\"ד", "mmd"),
  L(41.5, 4.5, "מחשבים 50 מ\"ר", "computers"),
  L(49.3, 6.7, "כיתה 50 מ\"ר", "classroom"),
  L(49.3, 10.6, "כיתה 50 מ\"ר", "classroom"),
  L(26, 2.8, "מבואה — חלל כפול", "lobby"),
  L(12, 7, "מעבר", "corridor"),
  L(45, 7, "מעבר", "corridor"),
  L(39.5, 10, "מעבר", "corridor"),
  L(42.5, 11, "מעבר", "corridor"),
];

/** The void over the lobby behind the curtain wall, floor −1's "חלל כפול". */
const VOID: Outline = [
  [22.5, 1.35],
  [32.3, 1.35],
  [32.3, 4.45],
  [26.0, 4.45],
  [26.0, 7.65],
  [20.5, 7.65],
  [20.5, 4.45],
  [22.5, 4.45],
];

/**
 * The north elevation: a stone surround from 0.69 to 3.27 above each floor
 * (+12.77 at 660 pt, +8.29 at 790 pt, 29 pt a metre on its sheet).
 */
const WINDOW = { sill: 0.69, head: 3.27, surround: 0.22 };

/** Spot heights along the plot, absolute metres, in plan metres. ±0.00 = 923.20. */
const SPOTS: Array<[number, number, number]> = [
  [20, -19.5, 923.99], [25.5, -19.5, 923.07], [37, -19.8, 922.58], [39, -11.5, 922.84], [45, -8.5, 922.74],
  [49, -9.5, 922.54], [58, -5, 922.58], [8, -17, 924.27], [3, -15, 924.94], [-2, -12, 925.7], [-4, -11, 925.74],
  [-12, -5.5, 926.62], [-10, -3.8, 926.44], [-12, -0.5, 926.98], [-12, 4, 928.86], [-12, 6.5, 932.0],
  [-13, 9.5, 933.95], [-12, 11.5, 936.69], [-12, 16, 938.59], [-12, 21, 940.66], [70, -2.5, 922.63], [69, 3, 924.39],
  [68, 7, 926.19], [68, 8.5, 928.48], [68, 10.5, 929.02], [68, 13.5, 928.45], [69, 16, 932.23], [66, 20, 935.5],
  [65, 22, 936.77], [68, 25, 938.13], [-3, 24, 940.58], [15, 23, 940.5], [27, 26, 940.43], [40, 27.5, 940.15],
  [48, 27.5, 940.29], [60, 27, 940.31], [30, -30, 921.5], [0, -28, 923.5], [60, -22, 921.2], [-14, -20, 925.0],
];

/**
 * The multi-purpose hall's seating as floor −1's sheet lays it out: a
 * speakers' table on a low stage at the north wall, nine rows of thirteen
 * seats facing it, 95 cm apart.
 */
function auditorium(level: number): Primitive[] {
  const out: Primitive[] = [];
  const tag = "floor-1:inside:furniture";
  out.push({ type: "box", centre: { x: 49.0, y: level + 0.12, z: 2.4 }, size: { x: 8.6, y: 0.24, z: 2.1 }, material: "floorWood", tag });
  out.push({ type: "box", centre: { x: 48.0, y: level + 0.24 + 0.375, z: 2.2 }, size: { x: 2.4, y: 0.75, z: 0.7 }, material: "timber", tag });
  // A projection screen over the stage, and the walls either side lined in
  // oak slats for the room's acoustics.
  out.push({ type: "box", centre: { x: 49.0, y: level + 2.0, z: 1.36 }, size: { x: 4.2, y: 2.4, z: 0.03 }, material: "whiteboard", tag });
  for (const x of [44.55, 53.43]) {
    for (let z = 1.6; z < 15.8; z += 0.12) {
      out.push({ type: "box", centre: { x, y: level + 1.6, z }, size: { x: 0.04, y: 2.8, z: 0.06 }, material: "timber", tag });
    }
  }
  for (let r = 0; r < 9; r++) {
    const z = 4.2 + r * 0.95;
    for (let i = 0; i < 13; i++) {
      const x = 45.5 + i * 0.58;
      // A theatre seat: a sprung pan, a raked back, arms either side.
      out.push({ type: "box", centre: { x, y: level + 0.44, z: z - 0.02 }, size: { x: 0.5, y: 0.1, z: 0.46 }, material: "seatFabric", tag });
      out.push({ type: "box", centre: { x, y: level + 0.78, z: z + 0.22 }, size: { x: 0.5, y: 0.62, z: 0.08 }, material: "seatFabric", tag });
      out.push({ type: "box", centre: { x: x - 0.28, y: level + 0.34, z }, size: { x: 0.05, y: 0.68, z: 0.5 }, material: "frame", tag });
    }
    out.push({ type: "box", centre: { x: 45.5 + 12 * 0.58 + 0.28, y: level + 0.34, z }, size: { x: 0.05, y: 0.68, z: 0.5 }, material: "frame", tag });
  }
  return out;
}

/**
 * The open stair in the double-height lobby, as both floor sheets draw it:
 * two flights side by side between x 21.4 and 25.9, a landing to the west,
 * a glass balustrade.
 */
function lobbyStair(): Primitive[] {
  const out: Primitive[] = [];
  const tag = "floor-2:inside:stair";
  const rise = LEVEL.floorMinus1 - LEVEL.floorMinus2;
  const n = 14;
  const r = rise / (2 * n);
  const run = (25.9 - 21.4) / n;
  for (let k = 0; k < n; k++) {
    // Up westward along the south flight: each step a solid block to the floor.
    const xa = 25.9 - (k + 1) * run;
    const ha = (k + 1) * r;
    out.push({ type: "box", centre: { x: xa + run / 2, y: LEVEL.floorMinus2 + ha / 2, z: 6.85 }, size: { x: run + 0.01, y: ha, z: 1.4 }, material: "stone", tag });
    // Then eastward along the north flight: treads on a stringer.
    const xb = 21.4 + k * run;
    const top = LEVEL.floorMinus2 + (n + k + 1) * r;
    out.push({ type: "box", centre: { x: xb + run / 2, y: top - 0.12, z: 5.4 }, size: { x: run + 0.01, y: 0.24, z: 1.4 }, material: "stone", tag });
  }
  out.push({ type: "box", centre: { x: 21.0, y: LEVEL.floorMinus2 + n * r - 0.12, z: 6.15 }, size: { x: 0.8, y: 0.24, z: 2.9 }, material: "stone", tag });
  for (const z of [4.68, 6.13, 7.57]) {
    out.push({ type: "box", centre: { x: 23.65, y: LEVEL.floorMinus2 + rise * 0.5 + 0.55, z }, size: { x: 4.5, y: rise * 0.62, z: 0.02 }, material: "glass", tag });
  }
  return out;
}

/** The secretariat's curved counter at the lobby, floor −1. */
function reception(): Primitive[] {
  const out: Primitive[] = [];
  const tag = "floor-1:inside:furniture";
  const cx = 31.6;
  const cz = 6.4;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.15 + (i / 8) * 0.7);
    const x = cx + Math.cos(a) * 1.6;
    const z = cz + Math.sin(a) * 1.1;
    out.push({ type: "box", centre: { x, y: LEVEL.floorMinus1 + 0.55, z }, size: { x: 0.62, y: 1.1, z: 0.12 }, material: "timber", rotY: -(a + Math.PI / 2), tag });
    out.push({ type: "box", centre: { x, y: LEVEL.floorMinus1 + 1.12, z }, size: { x: 0.66, y: 0.04, z: 0.34 }, material: "worktop", rotY: -(a + Math.PI / 2), tag });
  }
  return out;
}

/**
 * The covered accessible ramp along the south face, as the south elevation
 * draws it: from floor −1's +12.77 at the stair tower falling to +11.80 at
 * the building's east end, then rising to the plaza at +12.30; a steel
 * railing along its open side.
 */
function ramp(): Primitive[] {
  const out: Primitive[] = [];
  const tag = "site:ramp";
  const z0 = 16.62;
  const z1 = 18.9;
  const at = (x: number) => (x <= 53.9 ? 12.77 + ((x - 33.8) / (53.9 - 33.8)) * (11.8 - 12.77) : 11.8 + ((x - 53.9) / (62 - 53.9)) * (12.3 - 11.8));
  for (let x = 33.8; x < 62; x += 0.5) {
    const y = at(x + 0.25);
    out.push({ type: "box", centre: { x: x + 0.25, y: y - 0.15, z: (z0 + z1) / 2 }, size: { x: 0.51, y: 0.3, z: z1 - z0 }, material: "paving", tag });
    out.push({ type: "box", centre: { x: x + 0.25, y: y + 0.95, z: z1 - 0.03 }, size: { x: 0.51, y: 0.04, z: 0.05 }, material: "metal", tag });
    if (Math.round(x * 2) % 3 === 0) out.push({ type: "box", centre: { x: x + 0.25, y: y + 0.48, z: z1 - 0.03 }, size: { x: 0.03, y: 0.95, z: 0.03 }, material: "metal", tag });
    out.push({ type: "box", centre: { x: x + 0.25, y: y + 0.48, z: z1 - 0.02 }, size: { x: 0.51, y: 0.9, z: 0.012 }, material: "glass", tag });
  }
  return out;
}

export async function buildPisga(pdf: Uint8Array): Promise<BuildingModel> {
  const sheet = async (spec: { page: number; s: number; tx: number; ty: number }): Promise<PdfPage> =>
    transformPage(await readPdfPage(pdf, spec.page), spec.s, spec.tx, spec.ty);
  const region = { x: ORIGIN.x, y: ORIGIN.y, width: 1760, height: 680 };
  const pens = { colours: [0xff0000, 0x0000ff] };

  const floors: Array<{ spec: FloorSpec; page: PdfPage; labels: RoomLabel[] }> = [
    {
      labels: LABELS_MINUS2,
      page: await sheet(SHEETS.floorMinus2),
      spec: { id: "floor-2", level: LEVEL.floorMinus2, height: LEVEL.floorMinus1 - LEVEL.floorMinus2, outline: OUTLINE_MINUS2, window: WINDOW, facade: "stone", interior: "plaster" },
    },
    {
      labels: LABELS_MINUS1,
      page: await sheet(SHEETS.floorMinus1),
      // The curtain wall stops at +16.05, the head of the windows either side.
      spec: { id: "floor-1", level: LEVEL.floorMinus1, height: LEVEL.roof - LEVEL.floorMinus1, outline: OUTLINE_MINUS1, window: WINDOW, curtainHead: 3.28, facade: "stone", interior: "plaster" },
    },
  ];

  const prims: Primitive[] = [];
  for (const { spec, page, labels } of floors) {
    const walls = readPlanWalls(page, region, { unitsPerMetre: UPM, pens });
    const openings = findOpenings(walls, footprintOf(walls));
    prims.push(...floorPrimitives(walls, openings, spec));
    const rooms = readPlanRooms(walls, openings, spec.outline, labels);
    const items = readPlanFurniture(page, walls, {
      pens: [0x000000, 0xff0000, 0x0000ff, 0x474842].map((colour) => ({ colour, widths: [0.24, 0.48, 0.72] })),
    });
    // Under floor −1's double-height void (and its stair) floor −2 has no ceiling.
    const voids = spec.id === "floor-2" ? [{ x: 20.4, y: 1.35, w: 11.9, h: 6.3 }] : [];
    prims.push(...furnishFloor(rooms, items, { level: spec.level, tag: `${spec.id}:inside`, ceilingM: 3.3, voids }));
    if (spec.id === "floor-1") prims.push(...auditorium(spec.level), ...reception());
    if (spec.id === "floor-2") prims.push(...lobbyStair());
    // Planters in the lobby: tall green by the curtain wall, low by the stair.
    const planters: Array<[number, number, number]> = spec.id === "floor-2" ? [[31.6, 2.2, 1.8], [27.2, 2.2, 1.4], [20.9, 2.2, 1.6]] : [[33.6, 8.8, 1.5], [26.6, 9.4, 1.2]];
    for (const [x, z, h] of planters) {
      prims.push({ type: "cylinder", centre: { x, y: spec.level + 0.3, z }, radius: 0.32, height: 0.6, material: "planter", tag: `${spec.id}:inside:plant` });
      prims.push({ type: "tree", at: { x, y: spec.level + 0.55, z }, height: h, crown: 0.55, tag: `${spec.id}:inside:plant` });
    }
    // The floor: structure, and a finish on it.
    // The floor, behind the cladding: structure, and a finish on it. Floor
    // −1 has no floor behind the curtain wall — the double-height hall its
    // sheet marks "חלל כפול".
    const holes = spec.id === "floor-1" ? [VOID] : undefined;
    prims.push(slab(inset(spec.outline, 0.06), spec.level - 0.02, 0.3, "slab", `${spec.id}:slab`, holes));
    prims.push(slab(inset(spec.outline, 0.06), spec.level, 0.02, "floorStone", `${spec.id}:floor`, holes));
  }

  // Roof: the car park to the east, the roof plaza to the west.
  prims.push(slab(inset(OUTLINE_MINUS1, 0.06), LEVEL.roof, 0.35, "slab", "roof:slab"));
  prims.push(slab(rect(0.88, 1.02, 32.4, 16.58), LEVEL.roof + 0.03, 0.03, "paving", "roof:plaza"));
  prims.push(slab(rect(32.4, 2.4, 53.62, 16.28), LEVEL.roof + 0.03, 0.03, "asphalt", "roof:parking"));
  const line = (x0: number, z0: number, x1: number, z1: number) =>
    prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: LEVEL.roof + 0.04, z: (z0 + z1) / 2 }, size: { x: Math.max(0.1, x1 - x0), y: 0.01, z: Math.max(0.1, z1 - z0) }, material: "parkingLine", tag: "roof:lines" });
  for (let i = 0; i <= 7; i++) line(36.7 + i * 2.43, 2.6, 36.7 + i * 2.43, 7.6);
  line(33.0, 2.6, 33.0, 7.6);
  line(33.0, 7.6, 53.7, 7.6);
  for (let i = 0; i <= 5; i++) line(41.5 + i * 2.44, 11.5, 41.5 + i * 2.44, 16.3);
  line(41.5, 11.5, 53.7, 11.5);
  prims.push(...parapet(OUTLINE_MINUS1, LEVEL.roof, LEVEL.parapet, 0.3, "stone", "roof:parapet"));
  // The north band the sign is on: dark stone from 16.75 to the parapet's top.
  prims.push({ type: "box", centre: { x: 27.4, y: (16.75 + LEVEL.parapet) / 2, z: 1.02 - 0.03 }, size: { x: 53.04 + 0.1, y: LEVEL.parapet - 16.75, z: 0.06 }, material: "stoneDark", tag: "facade:band" });
  prims.push({ type: "text", text: "מרכז פסגה קרית ארבע", at: { x: 27.4, y: 17.58, z: 1.02 - 0.07 }, facing: { x: 0, z: -1 }, heightM: 1.0, material: "signage", tag: "facade:sign" });
  // The lift's bulkhead, to +20.32.
  prims.push({ type: "box", centre: { x: 32.15, y: (LEVEL.roof + LEVEL.bulkhead) / 2, z: 13.85 }, size: { x: 3.3, y: LEVEL.bulkhead - LEVEL.roof, z: 2.3 }, material: "stone", tag: "roof:bulkhead" });

  // The columns under floor −1's overhang, as floor −2's sheet draws them.
  for (const x of [7.5, 10.5, 13.7, 16.5, 21.5, 24.0, 30.8, 34.9, 38.1, 43.4, 48.4, 50.8]) {
    prims.push({ type: "cylinder", centre: { x, y: (LEVEL.courtyard + LEVEL.floorMinus1) / 2, z: 16.2 }, radius: 0.2, height: LEVEL.floorMinus1 - 0.3 - LEVEL.courtyard, material: "concrete", tag: "colonnade" });
  }

  // The kindergarten the centre is built on: existing stone, to its roofs.
  const kindergarten: Array<[Outline, number]> = [
    [rect(0.88, 1.02, 53.92, 13.2), LEVEL.kindergartenRoof],
    [rect(5.5, -7.5, 21.9, 1.02), 4.39],
    [rect(10.9, -9.2, 19.9, -7.5), 4.39],
    [rect(21.9, -8.4, 33.0, 1.02), 8.08],
    [rect(33.0, -4.3, 56.7, 1.02), 4.42],
    [rect(53.92, 1.02, 56.7, 8.0), 4.42],
  ];
  for (const [ring, top] of kindergarten) prims.push({ type: "prism", ring, y0: -1, y1: top, material: "existing", tag: "kindergarten" });
  // Its windows, a band on each north face.
  for (const [x0, x1, z, sill] of [[6, 21.4, -7.5, 1.2], [22.4, 32.5, -8.4, 1.2], [22.4, 32.5, -8.4, 5.2], [33.5, 56.2, -4.3, 1.2], [1.2, 21.6, 1.02, 5.4], [33.3, 53.6, 1.02, 5.4]] as const) {
    for (let x = x0 + 0.6; x + 1.6 <= x1; x += 3.2) {
      prims.push({ type: "box", centre: { x: x + 0.8, y: sill + 0.7, z: z - 0.02 }, size: { x: 1.6, y: 1.4, z: 0.06 }, material: "frame", tag: "kindergarten:window" });
      prims.push({ type: "box", centre: { x: x + 0.8, y: sill + 0.7, z: z - 0.05 }, size: { x: 1.48, y: 1.28, z: 0.02 }, material: "glass", tag: "kindergarten:window" });
    }
  }

  // The site: the sunken courtyard, the plazas either side, the street.
  prims.push(slab(rect(-10.5, 13.2, 32.4, 20.9), LEVEL.courtyard, 0.4, "paving", "site:courtyard"));
  // Under the overhang the paving runs the building's length, and east of
  // the stair on to the covered ramp.
  prims.push(slab(rect(32.4, 13.2, 53.92, 19.0), LEVEL.courtyard, 0.4, "paving", "site:colonnade"));
  prims.push({ type: "box", centre: { x: 43.1, y: (LEVEL.courtyard + LEVEL.street) / 2, z: 19.2 }, size: { x: 21.6, y: LEVEL.street - LEVEL.courtyard, z: 0.4 }, material: "stone", tag: "site:retaining" });
  prims.push(...ramp());
  prims.push(slab(rect(-10.5, -1, 0.88, 13.2), 8.6, 0.4, "paving", "site:west"));
  prims.push(slab(rect(53.92, 1.02, 64, 12), 8.27, 0.4, "paving", "site:east"));
  // The car park's way in from the street, over the covered ramp below.
  prims.push(slab(rect(32.4, 19.4, 54, 24.2), LEVEL.street, 9.2, "paving", "site:entrance"));
  prims.push({ type: "box", centre: { x: 11, y: (LEVEL.courtyard + LEVEL.street + 1) / 2, z: 21.15 }, size: { x: 43, y: LEVEL.street + 1 - LEVEL.courtyard, z: 0.5 }, material: "stone", tag: "site:retaining" });
  // The street: a sidewalk along the plot, the road, the far sidewalk.
  prims.push(slab(rect(-14, 21.4, 72, 24.2), LEVEL.street + 0.15, 1.15, "paving", "site:sidewalk"));
  prims.push(slab(rect(-14, 24.2, 72, 33.5), LEVEL.street, 1, "asphalt", "site:street"));
  prims.push(slab(rect(-14, 33.5, 72, 36.5), LEVEL.street + 0.15, 1.15, "paving", "site:sidewalk-far"));
  for (let x = -12; x < 70; x += 6) prims.push({ type: "box", centre: { x: x + 1.5, y: LEVEL.street + 0.01, z: 28.85 }, size: { x: 3, y: 0.01, z: 0.12 }, material: "parkingLine", tag: "site:lane" });

  // The stair down from the street to the courtyard: two flights side by
  // side, as the sheets draw it, 17 cm risers.
  const riser = 0.17;
  const steps = Math.round((LEVEL.street - LEVEL.courtyard) / 2 / riser);
  for (let k = 0; k < steps; k++) {
    // Down from the street along the east flight, back along the west one.
    const zA = 24.0 - (k + 1) * 0.3;
    prims.push({ type: "box", centre: { x: 28.85, y: LEVEL.street - (k + 0.5) * riser, z: zA + 0.15 }, size: { x: 2.9, y: riser, z: 0.3 }, material: "stone", tag: "site:stair" });
    const zB = 24.0 - steps * 0.3 + k * 0.3;
    prims.push({ type: "box", centre: { x: 25.85, y: LEVEL.street - (steps + k + 0.5) * riser, z: zB + 0.15 }, size: { x: 2.9, y: riser, z: 0.3 }, material: "stone", tag: "site:stair" });
  }
  prims.push({ type: "box", centre: { x: 27.35, y: (LEVEL.courtyard + LEVEL.street) / 2 - 0.5, z: 22.6 }, size: { x: 6.0, y: LEVEL.street - LEVEL.courtyard - 1, z: 2.8 }, material: "stone", tag: "site:stair" });

  // Trees where the site plan draws them: along the courtyard's retaining
  // wall, and on the plaza by the car park's entrance.
  for (const x of [-6.3, -2.2, 2.6, 7.4, 12.1, 16.4, 20.9]) prims.push({ type: "tree", at: { x, y: LEVEL.courtyard, z: 19.6 }, height: 6.5, crown: 2.4 });
  for (const [x, z] of [[44.6, 22.6], [52.4, 22.9], [59.2, 23.4]] as const) prims.push({ type: "tree", at: { x, y: LEVEL.street, z }, height: 6, crown: 2.2 });

  // Cars: most of the roof's bays taken, and the street's bays 13–18.
  const paint = [0xe8e8e6, 0x23262b, 0x8d9299, 0x6d1f23, 0xd5d7d9, 0x2c3e57, 0x5a5d61, 0xf0efe9];
  const upper = [1, 2, 4, 5, 7];
  upper.forEach((bay, i) => prims.push({ type: "car", at: { x: 36.7 + (bay - 1) * 2.43 + 1.215, y: LEVEL.roof + 0.05, z: 5.1 }, rotY: 0, colour: paint[i % paint.length]! }));
  [1, 3, 4].forEach((bay, i) => prims.push({ type: "car", at: { x: 41.5 + (bay - 1) * 2.44 + 1.22, y: LEVEL.roof + 0.05, z: 13.9 }, rotY: Math.PI, colour: paint[(i + 5) % paint.length]! }));
  [-6, 0, 6, 13, 19].forEach((x, i) => prims.push({ type: "car", at: { x, y: LEVEL.street, z: 25.4 }, rotY: Math.PI / 2, colour: paint[(i + 2) % paint.length]! }));

  // People, for scale: in the courtyard, on the roof plaza, at the entrance.
  const people: Array<[number, number, number, number]> = [[6, LEVEL.courtyard, 15.2, 0x2f4b6e], [7, LEVEL.courtyard, 15.6, 0x9b8a6a], [18, LEVEL.courtyard, 17.5, 0x5b3a3a], [12, LEVEL.roof + 0.05, 8, 0x333a44], [36, LEVEL.street + 0.15, 19, 0x6b6f4a]];
  people.forEach(([x, y, z, c], i) => prims.push({ type: "person", at: { x, y, z }, rotY: i * 1.3, colour: c, height: 1.72 }));

  // Ground: the spot heights, and the site's own levels where it is built.
  const x0 = -30;
  const z0 = -40;
  const dx = 1;
  const nx = 120;
  const nz = 80;
  const heights: number[] = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * dx;
      const z = z0 + j * dx;
      let wsum = 0;
      let hsum = 0;
      for (const [sx, sz, abs] of SPOTS) {
        const d2 = (x - sx) ** 2 + (z - sz) ** 2 + 4;
        const w = 1 / (d2 * d2);
        wsum += w;
        hsum += w * (abs - 923.2);
      }
      let h = hsum / wsum;
      if (insidePolygon(rect(-10.5, -10, 64, 36), x, z)) h = Math.min(h, 8.1);
      // East of the entrance the plot falls from the street to the east
      // plaza — the accessible ramp's slope.
      if (x > 53.92 && x < 66 && z > 12 && z < 24.2) h = 8.27 + ((z - 12) / (24.2 - 12)) * (LEVEL.street - 8.27);
      if (z > 21 && !(x > 46 && x < 66 && z < 24.2)) h = Math.max(h, LEVEL.street - 0.6);
      heights.push(h);
    }
  }
  prims.push({ type: "terrain", x0, z0, dx, nx, nz, heights, material: "soil", tag: "site:ground" });

  return {
    name: 'מרכז פסג"ה למורים — קריית ארבע',
    primitives: prims,
    extent: { x: -12, z: -20, width: 84, depth: 50, yMin: -1, yMax: LEVEL.bulkhead },
    north: { x: 0, z: -1 },
  };
}
