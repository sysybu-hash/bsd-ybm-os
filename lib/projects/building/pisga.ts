import { dxfSpotHeights, dxfTreadSets, stairPrims } from "@/lib/projects/building/pisga-stairs";
import { dxfKerbLines, dxfSurfaces, surfacePrims } from "@/lib/projects/building/pisga-surfaces";
import { floorPrimitives, inset, insidePolygon, parapet, slab, type FloorSpec, type Outline } from "@/lib/projects/building/assemble";
import type { BuildingModel, Primitive } from "@/lib/projects/building/model";
import { readPdfPage, transformPage, type PdfPage } from "@/lib/projects/building/pdf-paths";
import { findOpenings, footprintOf } from "@/lib/projects/building/plan-openings";
import { readPlanWalls } from "@/lib/projects/building/plan-walls";
import { furnishFloor } from "@/lib/projects/building/furnish";
import { pisgaStairs, pisgaStreet, pisgaPlotSouthZ, pisgaStreetBays } from "@/lib/projects/building/pisga-site";
import { drawLine } from "@/lib/projects/building/raster";
import { buildKindergarten, kindergartenOutline, KINDERGARTEN } from "@/lib/projects/building/pisga-kindergarten";
import { readPlanFurniture } from "@/lib/projects/building/plan-furniture";
import { readPlanRooms, type RoomKind, type RoomLabel } from "@/lib/projects/building/plan-rooms";
import { cutDxfWindows, dxfColumns, dxfFurnitureShapes, dxfFixtures, dxfHallSeats, furnitureFromShapes, dxfDividers, dxfEmergencyStair, exteriorDoorRects, glazedPartitions, dxfPartitions, dxfPlanPage, dxfRoof, dxfRoomLabels, dxfSymbols, openingsByDxfWindows, PISGA_DXF } from "@/lib/projects/building/pisga-dxf";
import type { DxfDrawing } from "@/lib/projects/dxf-drawing";

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
  futureMinus1: { page: 7, s: 1.10867, tx: -163.78, ty: -48.19 },
  floorMinus2: { page: 6, s: 1.00565, tx: 22.86, ty: 33.98 },
} as const;

export const LEVEL = {
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
export const OUTLINE_MINUS1: Outline = [
  [0.88, 1.02],
  [53.92, 1.02],
  [53.92, 16.58],
  [33.82, 16.58],
  [33.82, 18.2],
  [30.44, 18.2],
  [30.44, 16.58],
  [0.88, 16.58],
];
export const OUTLINE_MINUS2: Outline = [
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
export const LABELS_MINUS1: RoomLabel[] = [
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
export const LABELS_MINUS2: RoomLabel[] = [
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

/** The roof: floor −1's outline, and the car park deck out over the ramp. */
const ROOF: Outline = [
  [0.88, 1.02],
  [53.92, 1.02],
  [53.92, 19.4],
  [33.82, 19.4],
  [33.82, 18.2],
  [30.44, 18.2],
  [30.44, 16.58],
  [0.88, 16.58],
];

/**
 * The multi-purpose hall's floor, raked: section ב-ב steps it down from the
 * door at +12.77 to the stage at +11.57 (the plan's "+11.57" by the stage).
 */
const HALL: Outline = [
  [44.62, 1.36],
  [53.48, 1.36],
  [53.48, 16.2],
  [44.62, 16.2],
];
const HALL_FRONT = 11.57;
const HALL_RISE = 0.133;

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
/**
 * The north elevation of the architect's DXF draws each window as a stone
 * surround 2.60 × 2.86 m from 0.85 to 3.71 above the floor, the frame inside
 * it from 1.10 to 3.41 (the surround 30 cm at the sides and the head, 25 cm
 * under the sill): the same on both floors.
 */
export const WINDOW_DXF = { sill: 1.1, head: 3.41, surround: 0.28 };

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
function auditorium(level: number, seats = true, steps = { rows: 9, pitch: 0.95, z0: 3.72 }): Primitive[] {
  const out: Primitive[] = [];
  const tag = "floor-1:inside:furniture";
  // The floor: the stage's level at the front, a step a row, the door's
  // level behind the last row.
  const rowY = (r: number) => HALL_FRONT + (r + 1) * HALL_RISE;
  const floorBox = (z0: number, z1: number, y: number) =>
    out.push({ type: "box", centre: { x: 49.05, y: (HALL_FRONT - 0.3 + y) / 2, z: (z0 + z1) / 2 }, size: { x: 8.86, y: y - (HALL_FRONT - 0.3), z: z1 - z0 }, material: "floorWood", tag: "floor-1:slab" });
  floorBox(1.36, steps.z0, HALL_FRONT);
  for (let r = 0; r < steps.rows; r++) floorBox(steps.z0 + r * steps.pitch, steps.z0 + (r + 1) * steps.pitch, rowY(r));
  floorBox(steps.z0 + steps.rows * steps.pitch, 16.2, level);
  void level;
  out.push({ type: "box", centre: { x: 49.0, y: HALL_FRONT + 0.12, z: 2.4 }, size: { x: 8.6, y: 0.24, z: 2.1 }, material: "floorWood", tag });
  out.push({ type: "box", centre: { x: 48.0, y: HALL_FRONT + 0.24 + 0.73, z: 2.2 }, size: { x: 2.4, y: 0.04, z: 0.7 }, material: "timber", tag });
  for (const [dx, dz] of [[-1.1, -0.3], [1.1, -0.3], [-1.1, 0.3], [1.1, 0.3]] as const) out.push({ type: "box", centre: { x: 48.0 + dx, y: HALL_FRONT + 0.24 + 0.355, z: 2.2 + dz }, size: { x: 0.05, y: 0.71, z: 0.05 }, material: "frame", tag });
  // A projection screen over the stage, and the walls either side lined in
  // oak slats for the room's acoustics.
  out.push({ type: "box", centre: { x: 49.0, y: HALL_FRONT + 2.1, z: 1.4 }, size: { x: 4.2, y: 2.4, z: 0.03 }, material: "whiteboard", tag });
  for (const x of [44.55, 53.43]) {
    for (let z = 1.6; z < 15.8; z += 0.12) {
      out.push({ type: "box", centre: { x, y: level + 1.6, z }, size: { x: 0.04, y: 2.8, z: 0.06 }, material: "timber", tag });
    }
  }
  for (let r = 0; seats && r < 9; r++) {
    const z = 4.2 + r * 0.95;
    for (let i = 0; i < 13; i++) {
      const x = 45.5 + i * 0.58;
      // A theatre seat: a sprung pan, a raked back, arms either side.
      const f = rowY(r);
      out.push({ type: "box", centre: { x, y: f + 0.44, z: z - 0.02 }, size: { x: 0.5, y: 0.1, z: 0.46 }, material: "seatFabric", tag });
      out.push({ type: "box", centre: { x, y: f + 0.78, z: z + 0.22 }, size: { x: 0.5, y: 0.62, z: 0.08 }, material: "seatFabric", tag });
      out.push({ type: "box", centre: { x: x - 0.28, y: f + 0.34, z }, size: { x: 0.05, y: 0.68, z: 0.5 }, material: "frame", tag });
    }
    out.push({ type: "box", centre: { x: 45.5 + 12 * 0.58 + 0.28, y: rowY(r) + 0.34, z }, size: { x: 0.05, y: 0.68, z: 0.5 }, material: "frame", tag });
  }
  return out;
}

/**
 * The open stair in the double-height lobby, as both floor sheets draw it:
 * two flights side by side between x 21.4 and 25.9, a landing to the west,
 * a glass balustrade.
 */
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
  // Sheet 5's covered accessible ramp: 1.5 m wide along the south face from
  // the stair core to the building's east end, falling 2–6% from +12.73 to
  // +11.86, then bending south-east at 4.6% to the emergency exit at the
  // plot's corner, +12.30.
  const out: Primitive[] = [];
  const tag = "site:ramp";
  // The corridor's own lines (layer "מבט עבה", floor −1's sheet): north face z 16.38, south face z 17.88 from x 33.71, bending south-east at x 56.1 to the exit's door at (63.65, 19.55).
  // The levels are the sheet's marks: +12.76 at x 33.9 and +11.86 at x 52.8 (a 4.8% fall), then up to the emergency exit's +12.30.
  const path: Array<[number, number, number]> = [
    [33.71, 17.13, 12.77],
    [56.1, 17.13, 11.8],
    [63.65, 19.55, 12.3],
  ];
  const width = 1.5;
  for (let i = 1; i < path.length; i++) {
    const [ax, az, ay] = path[i - 1]!;
    const [bx, bz, by] = path[i]!;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(len / 0.5);
    const rot = -Math.atan2(bz - az, bx - ax);
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const y = ay + (by - ay) * t;
      const seg = len / n + 0.02;
      // Normal to the path, to the south: the railing's side.
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      out.push({ type: "box", centre: { x, y: y - 0.15, z }, size: { x: seg, y: 0.3, z: width }, rotY: rot, material: "paving", tag });
      const rx = x + nx * (width / 2 - 0.03);
      const rz = z + nz * (width / 2 - 0.03);
      out.push({ type: "box", centre: { x: rx, y: y + 0.95, z: rz }, size: { x: seg, y: 0.04, z: 0.05 }, rotY: rot, material: "metal", tag });
      out.push({ type: "box", centre: { x: rx, y: y + 0.48, z: rz }, size: { x: seg, y: 0.9, z: 0.012 }, rotY: rot, material: "glass", tag });
      if (k % 3 === 0) out.push({ type: "box", centre: { x: rx, y: y + 0.48, z: rz }, size: { x: 0.03, y: 0.95, z: 0.03 }, material: "metal", tag });
    }
  }
  return out;
}

/**
 * The future plan, sheet 7: the west wing of floor −1 becomes a 236 m² events
 * hall with a 60 m² kitchen and a ממ"ד; east of the lobby nothing changes.
 */
const WEST_OF_LOBBY = 24.4;
export const LABELS_FUTURE: RoomLabel[] = [
  L(12, 6, "אולם 236 מ\"ר", "hall"),
  L(15, 14.5, "מטבח 60 מ\"ר", "kitchen"),
  L(3, 14.5, "ממ\"ד", "mmd"),
  ...LABELS_MINUS1.filter((l) => l.x > WEST_OF_LOBBY || l.kind === "void"),
];

/**
 * The hand-set labels (read off the permit booklet) kept only where the DXF
 * names no room of that kind within 3 m: the DXF's own text wins.
 */
export function mergeLabels(fromDxf: RoomLabel[], byHand: RoomLabel[]): RoomLabel[] {
  const kept = byHand.filter((h) => !fromDxf.some((d) => d.kind === h.kind && Math.hypot(d.x - h.x, d.y - h.y) < 3));
  return [...fromDxf, ...kept];
}

/**
 * One floor read from the DXF: walls (a window the sheet draws in a solid wall
 * cut out of it), the openings (an outside gap is a window only where the
 * sheet draws one), the rooms named by the sheet's own text and the furniture
 * its fine pen draws. The same reading the verification script checks.
 */
export function readPisgaDxfFloor(dxf: DxfDrawing, id: "floor-2" | "floor-1", byHand: RoomLabel[], outline: Outline) {
  const page = dxfPlanPage(dxf, PISGA_DXF.sheets[id]);
  const region = { x: ORIGIN.x, y: ORIGIN.y, width: 7000, height: 2600 };
  const symbols = dxfSymbols(dxf, id);
  // The west elevation draws a window the floor −1 plan has no symbol for, beside the emergency stair's landing (z 13.69..15.09, 1.40 m wide): the plan frame's west wall.
  const windows = id === "floor-1" ? [...symbols.windows, { x0: 0.85, x1: 1.17, z0: 13.69, z1: 15.09, arcs: [] }] : symbols.windows;
  const doors = exteriorDoorRects(symbols.doors, outline, symbols.windows);
  const walls = cutDxfWindows(readPlanWalls(page, region, { unitsPerMetre: 100, pens: { colours: [0xff0000] }, closePx: 8 }), windows, doors);
  const openings = openingsByDxfWindows(findOpenings(walls, footprintOf(walls)), windows, outline, doors);
  const labels = mergeLabels(dxfRoomLabels(dxf, id), byHand);
  // The movable partitions split an open plan into the rooms the sheet prints; they are not walls.
  const roomMask = { ...walls.mask, data: new Uint8Array(walls.mask.data) };
  const cm = walls.cm / 100;
  for (const [ax, az, bx, bz] of dxfDividers(dxf, id, outline)) drawLine(roomMask, ax / cm, az / cm, bx / cm, bz / cm, 3);
  const rooms = readPlanRooms({ ...walls, mask: roomMask }, openings, outline, labels);
  const items = readPlanFurniture(page, walls, { pens: [{ colour: 0x000000, widths: [0.24] }] });
  return { page, walls, openings, rooms, items, windows, doors, labels };
}

/**
 * The building, from the permit booklet's PDF (`pdf`) or, where the
 * architect's DXF is given, from its drawing: the same readers either way —
 * the DXF's floor sheets are handed over as painted pages (pisga-dxf.ts).
 */
export async function buildPisga(pdf: Uint8Array | null, options?: { future?: boolean; dxf?: DxfDrawing; /** The plot's aerial photograph as a data URL, laid on the ground by a rough fit (a draft). */ groundPhoto?: string }): Promise<BuildingModel> {
  const dxf = options?.dxf;
  // The DXF has no future plan: floor −1 stays as drawn.
  const future = dxf ? false : options?.future === true;
  const sheet = async (spec: { page: number; s: number; tx: number; ty: number }, id: "floor-2" | "floor-1"): Promise<PdfPage> =>
    dxf ? dxfPlanPage(dxf, PISGA_DXF.sheets[id]) : transformPage(await readPdfPage(pdf!, spec.page), spec.s, spec.tx, spec.ty);
  // A DXF sheet is in centimetres a point, its walls in the one red pen.
  const upm = dxf ? 100 : UPM;
  const region = dxf ? { x: ORIGIN.x, y: ORIGIN.y, width: 7000, height: 2600 } : { x: ORIGIN.x, y: ORIGIN.y, width: 1760, height: 680 };
  const pens = { colours: dxf ? [0xff0000] : [0xff0000, 0x0000ff] };
  const furniturePens = dxf ? [{ colour: 0x000000, widths: [0.24] }] : [0x000000, 0xff0000, 0x0000ff, 0x474842].map((colour) => ({ colour, widths: [0.24, 0.48, 0.72] }));
  const labelsOf = (id: "floor-2" | "floor-1", byHand: RoomLabel[]) => (dxf ? mergeLabels(dxfRoomLabels(dxf, id), byHand) : byHand);

  const floors: Array<{ spec: FloorSpec; page: PdfPage; labels: RoomLabel[] }> = [
    {
      labels: labelsOf("floor-2", LABELS_MINUS2),
      page: await sheet(SHEETS.floorMinus2, "floor-2"),
      spec: { id: "floor-2", level: LEVEL.floorMinus2, height: LEVEL.floorMinus1 - LEVEL.floorMinus2, outline: OUTLINE_MINUS2, window: dxf ? WINDOW_DXF : WINDOW, facade: "stone", interior: "plaster" },
    },
    {
      labels: future ? LABELS_FUTURE : labelsOf("floor-1", LABELS_MINUS1),
      page: await sheet(future ? SHEETS.futureMinus1 : SHEETS.floorMinus1, "floor-1"),
      // The curtain wall stops at +16.05, the head of the windows either side.
      spec: { id: "floor-1", level: LEVEL.floorMinus1, height: LEVEL.roof - LEVEL.floorMinus1, outline: OUTLINE_MINUS1, window: dxf ? WINDOW_DXF : WINDOW, curtainHead: 3.28, facade: "stone", interior: "plaster" },
    },
  ];

  const prims: Primitive[] = [];
  for (const { spec, page, labels } of floors) {
    const read = dxf ? readPisgaDxfFloor(dxf, spec.id as "floor-2" | "floor-1", labels, spec.outline) : null;
    const walls = read?.walls ?? readPlanWalls(page, region, { unitsPerMetre: upm, pens });
    const openings = read?.openings ?? findOpenings(walls, footprintOf(walls));
    prims.push(...floorPrimitives(walls, openings, spec));
    const rooms = read?.rooms ?? readPlanRooms(walls, openings, spec.outline, labels);
    const items = read?.items ?? readPlanFurniture(page, walls, { pens: furniturePens });
    // Under floor −1's double-height void (and its stair) floor −2 has no ceiling.
    const voids = spec.id === "floor-2" ? [{ x: 20.4, y: 1.35, w: 11.9, h: 6.3 }] : [];
    // From the DXF the furniture is the sheet's own outlines, each extruded to what it is; the finishes, ceilings and lights stay the rooms'.
    prims.push(...furnishFloor(rooms, dxf ? [] : items, { level: spec.level, tag: `${spec.id}:inside`, ceilingM: 3.3, lowCeiling: spec.id === "floor-2" ? { x: 44.4, y: 1.3, w: 9.3, h: 15, m: HALL_FRONT - 0.32 - LEVEL.floorMinus2 } : undefined, voids, ownFloor: spec.id === "floor-1" ? ["hall"] : [] }));
    if (dxf) {
      // The fixtures the sheet draws in the WCs: a pan with its cistern, a basin on its stand, a counter's basins.
      for (const f of dxfFixtures(dxf, spec.id as "floor-2" | "floor-1")) {
        const c = Math.cos(f.angle);
        const sn = Math.sin(f.angle);
        const put = (u: number, v: number, sx: number, sy: number, sz: number, y0: number, material: "ceramic" | "cabinet" | "worktop" | "metal") =>
          prims.push({ type: "box", centre: { x: f.x + u * c - v * sn, y: spec.level + y0 + sy / 2, z: f.z + u * sn + v * c }, size: { x: sx, y: sy, z: sz }, rotY: -f.angle, material, tag: `${spec.id}:inside:fixture` });
        if (f.kind === "pan") {
          put(0.05, 0, f.length * 0.8, 0.4, f.width * 0.9, 0, "ceramic");
          put(-f.length / 2 + 0.1, 0, 0.18, 0.4, f.width * 0.8, 0.4, "ceramic");
        } else if (f.kind === "basin") {
          put(0, 0, f.length * 0.9, 0.12, f.width * 0.9, 0.8, "ceramic");
          put(0, 0, 0.1, 0.8, 0.1, 0, "metal");
        } else if (f.kind === "counter") {
          put(0, 0, f.length, 0.8, f.width, 0, "cabinet");
          put(0, 0, f.length + 0.02, 0.04, f.width + 0.02, 0.8, "worktop");
          const n = Math.max(1, Math.round(f.length / 0.6));
          for (let i = 0; i < n; i++) put(-f.length / 2 + ((i + 0.5) * f.length) / n, 0, 0.4, 0.06, Math.min(0.34, f.width - 0.1), 0.84, "ceramic");
        } else put(0, 0, f.length, 0.45, f.width, 0, "ceramic");
      }
      for (const b of furnitureFromShapes(dxfFurnitureShapes(dxf, spec.id as "floor-2" | "floor-1"), spec.level, spec.id)) {
        prims.push({ type: "box", centre: { x: b.cx, y: b.cy, z: b.cz }, size: { x: b.sx, y: b.sy, z: b.sz }, rotY: b.rotY, material: b.material, tag: `${spec.id}:inside:furniture` });
      }
    }
    if (spec.id === "floor-1") {
      prims.push(...auditorium(spec.level, !dxf, dxf ? { rows: 8, pitch: 1.0, z0: 4.1 } : undefined), ...(dxf ? [] : reception()));
      // The seats the sheet draws: each at its own place, on the raked floor's step under it.
      if (dxf) {
        const tag = "floor-1:inside:furniture";
        for (const st of dxfHallSeats(dxf)) {
          const row = Math.max(0, Math.min(7, Math.round((st.z - 4.6) / 1.0)));
          const f = HALL_FRONT + (row + 1) * HALL_RISE;
          prims.push({ type: "box", centre: { x: st.x, y: f + 0.44, z: st.z - 0.05 }, size: { x: 0.5, y: 0.1, z: 0.46 }, material: "seatFabric", tag });
          prims.push({ type: "box", centre: { x: st.x, y: f + 0.78, z: st.z + 0.18 }, size: { x: 0.5, y: 0.62, z: 0.08 }, material: "seatFabric", tag });
          prims.push({ type: "box", centre: { x: st.x - 0.28, y: f + 0.34, z: st.z }, size: { x: 0.05, y: 0.68, z: 0.5 }, material: "frame", tag });
          // The seat is carried: a pedestal from its row's step up to the pan, so none hangs over the edge of a step.
          prims.push({ type: "box", centre: { x: st.x, y: (HALL_FRONT - 0.3 + f) / 2, z: st.z - 0.02 }, size: { x: 0.24, y: f - (HALL_FRONT - 0.3), z: 0.3 }, material: "frame", tag });
        }
      }
    }
    // The WC stalls' partitions, 2.1 m of laminate panel a hand off the floor, from the DXF; and the glazed partitions its window symbols draw inside.
    if (dxf) {
      for (const w of glazedPartitions(read!.windows, spec.outline)) {
        const along = w.x1 - w.x0 >= w.z1 - w.z0;
        prims.push({ type: "box", centre: { x: (w.x0 + w.x1) / 2, y: spec.level + 1.3, z: (w.z0 + w.z1) / 2 }, size: { x: along ? w.x1 - w.x0 : 0.04, y: 2.4, z: along ? 0.04 : w.z1 - w.z0 }, material: "glass", tag: `${spec.id}:inside:glazing` });
      }
      for (const [x1, z1, x2, z2] of dxfPartitions(dxf, spec.id as "floor-2" | "floor-1")) {
        const len = Math.hypot(x2 - x1, z2 - z1);
        prims.push({ type: "box", centre: { x: (x1 + x2) / 2, y: spec.level + 0.15 + 1.05, z: (z1 + z2) / 2 }, size: { x: len, y: 2.1, z: 0.04 }, rotY: -Math.atan2(z2 - z1, x2 - x1), material: "plaster", tag: `${spec.id}:inside:partition` });
      }
    }

    // The doors the sheet swings: each leaf stands open at the arc's far end (the end off the wall's line), a 4 cm timber leaf from its hinge, as the plan draws it.
    if (dxf) {
      for (const d of dxfSymbols(dxf, spec.id as "floor-2" | "floor-1").doors) {
        if (d.x1 < 0 || d.x0 > 54.5) continue;
        // An exterior door (on the facade, in glass or a stone surround) is built by its opening; only the doors inside swing as leaves here.
        if (d.z1 > 16.0 || d.z0 < 1.45 || d.x0 < 1.3 || d.x1 > 53.4) continue;
        for (const a of d.arcs) {
          if (a.r < 0.5) continue;
          const [e0, e1] = a.ends;
          // The closed leaf lies along the wall: the end whose offset across the wall from the hinge is the smaller. The other end is the open leaf.
          const across = (e: [number, number]) => Math.min(Math.abs(e[0] - a.hinge[0]), Math.abs(e[1] - a.hinge[1]));
          const open = across(e0) > across(e1) ? e0 : e1;
          const len = Math.hypot(open[0] - a.hinge[0], open[1] - a.hinge[1]);
          if (len < 0.4) continue;
          prims.push({ type: "box", centre: { x: (open[0] + a.hinge[0]) / 2, y: spec.level + 1.05, z: (open[1] + a.hinge[1]) / 2 }, size: { x: len, y: 2.05, z: 0.04 }, rotY: -Math.atan2(open[1] - a.hinge[1], open[0] - a.hinge[0]), material: "timber", tag: `${spec.id}:door-leaf` });
        }
      }
    }

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
    const holes = spec.id === "floor-1" ? [VOID, HALL] : undefined;
    prims.push(slab(inset(spec.outline, 0.06), spec.level - 0.02, 0.3, "slab", `${spec.id}:slab`, holes));
    prims.push(slab(inset(spec.outline, 0.06), spec.level, 0.02, "floorStone", `${spec.id}:floor`, holes));
  }

  // Roof: the car park to the east, the roof plaza to the west.
  // The roof. East of the lift the car park deck runs on past the building
  // line to z 19.4, over the covered accessible ramp — the site plan's bays
  // 8–12 stand there, z 13.2 to 18.0.
  // From the DXF the roof is the sheet's own: the slab's edge (it overhangs the
  // north wall by 1.24 m), the car park's fill, its bays' lines, the lift's shaft.
  const dxfRf = dxf ? dxfRoof(dxf) : null;
  const roof: Outline = dxfRf?.outline ?? ROOF;
  const roofX0 = Math.min(...roof.map((q) => q[0]));
  const roofX1 = Math.max(...roof.map((q) => q[0]));
  const roofN = Math.min(...roof.map((q) => q[1]));
  const roofS = Math.max(...roof.map((q) => q[1]));
  prims.push(slab(inset(roof, 0.06), LEVEL.roof, 0.35, "slab", "roof:slab"));
  prims.push(slab(rect(0.88, dxfRf ? roofN + 0.1 : 1.02, dxfRf?.lift ? dxfRf.lift.x0 - 0.1 : 32.4, 16.58), LEVEL.roof + 0.03, 0.03, "paving", "roof:plaza"));
  prims.push(slab(dxfRf?.deck ?? rect(33.9, 2.4, 53.62, 19.1), LEVEL.roof + 0.03, 0.03, "asphalt", "roof:parking"));
  const line = (x0: number, z0: number, x1: number, z1: number) =>
    prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: LEVEL.roof + 0.04, z: (z0 + z1) / 2 }, size: { x: Math.max(0.1, x1 - x0), y: 0.01, z: Math.max(0.1, z1 - z0) }, material: "parkingLine", tag: "roof:lines" });
  if (dxfRf) {
    for (const [ax, az, bx, bz] of dxfRf.bayLines) line(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
  } else {
    for (let i = 0; i <= 7; i++) line(36.7 + i * 2.43, 2.6, 36.7 + i * 2.43, 7.6);
    line(33.0, 2.6, 33.0, 7.6);
    line(33.0, 7.6, 53.7, 7.6);
    for (let i = 0; i <= 5; i++) line(41.6 + i * 2.42, 13.2, 41.6 + i * 2.42, 18.0);
    line(41.6, 13.2, 53.7, 13.2);
    // The two-way drive's centre line, from the entrance north to the aisle.
    for (let z = 11.2; z < 19.2; z += 1.6) line(38.2, z, 38.2, z + 0.8);
  }
  // The parapet all round, but for the car park's way in: the site plan's
  // "כניסה מקורה לחניה", x 35.1 to 41.4 on the south edge.
  prims.push(
    ...parapet(roof, LEVEL.roof, LEVEL.parapet, 0.3, "stone", "roof:parapet").filter(
      (p) => !(p.type === "box" && Math.abs(p.centre.z - (roofS - 0.15)) < 0.05 && p.size.x > 10),
    ),
  );
  for (const [x0, x1] of [[Math.min(...roof.filter((q) => q[1] === roofS).map((q) => q[0])), 35.1], [41.4, roofX1]] as const) {
    prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: (LEVEL.roof + LEVEL.parapet) / 2, z: roofS - 0.15 }, size: { x: x1 - x0, y: LEVEL.parapet - LEVEL.roof, z: 0.3 }, material: "stone", tag: "roof:parapet" });
  }
  // The north band the sign is on: dark stone from 16.75 to the parapet's top, at the roof's edge.
  const bandZ = dxfRf ? roofN : 1.02;
  prims.push({ type: "box", centre: { x: (roofX0 + roofX1) / 2, y: (16.75 + LEVEL.parapet) / 2, z: bandZ - 0.03 }, size: { x: roofX1 - roofX0 + 0.1, y: LEVEL.parapet - 16.75, z: 0.06 }, material: "stoneDark", tag: "facade:band" });
  prims.push({ type: "text", text: "מרכז פסגה קרית ארבע", at: { x: (roofX0 + roofX1) / 2, y: 17.58, z: bandZ - 0.07 }, facing: { x: 0, z: -1 }, heightM: 1.0, material: "signage", tag: "facade:sign" });
  // The lift's bulkhead, to +20.32.
  const lift = dxfRf?.lift;
  prims.push({
    type: "box",
    centre: { x: lift ? (lift.x0 + lift.x1) / 2 : 32.15, y: (LEVEL.roof + LEVEL.bulkhead) / 2, z: lift ? (lift.z0 + lift.z1) / 2 : 13.85 },
    size: { x: lift ? lift.x1 - lift.x0 : 3.3, y: LEVEL.bulkhead - LEVEL.roof, z: lift ? lift.z1 - lift.z0 : 2.3 },
    material: "stone",
    tag: "roof:bulkhead",
  });

  // The emergency stair on the west face, from floor −1's door down to the courtyard: two flights, the one against the building first,
  // each tread as the sheet draws it, the rise shared evenly from +12.77 to +8.29.
  if (dxf) {
    const flights = dxfEmergencyStair(dxf);
    const steps = flights.reduce((n, f) => n + f.treads.length, 0);
    const riser = (LEVEL.floorMinus1 - LEVEL.courtyard - 0.09) / Math.max(1, steps);
    let level = LEVEL.floorMinus1;
    flights.forEach((f, i) => {
      // The first flight runs south from the door's landing, the next back north.
      const order = i % 2 === 0 ? f.treads : [...f.treads].reverse();
      const depth = 0.26;
      order.forEach((z, k) => {
        level -= riser;
        const zc = z + (i % 2 === 0 ? depth / 2 : -depth / 2);
        prims.push({ type: "box", centre: { x: (f.x0 + f.x1) / 2, y: level, z: zc }, size: { x: f.x1 - f.x0, y: 0.05, z: depth }, material: "metal", tag: "site:emergency-stair" });
        prims.push({ type: "box", centre: { x: (f.x0 + f.x1) / 2, y: level - riser / 2, z }, size: { x: f.x1 - f.x0, y: riser, z: 0.02 }, material: "metal", tag: "site:emergency-stair" });
        // The rail on the open side of each flight (the outer edge): a glass pane a step long, its handrail, a post every other step.
        const edge = i % 2 === 0 ? f.x0 : f.x0;
        prims.push({ type: "box", centre: { x: edge, y: level + 0.5, z: zc }, size: { x: 0.012, y: 0.9, z: depth }, material: "glass", tag: "site:emergency-stair" });
        prims.push({ type: "box", centre: { x: edge, y: level + 0.97, z: zc }, size: { x: 0.04, y: 0.04, z: depth }, material: "metal", tag: "site:emergency-stair" });
        if (k % 2 === 0) prims.push({ type: "box", centre: { x: edge, y: level + 0.5, z: zc }, size: { x: 0.04, y: 1.0, z: 0.04 }, material: "metal", tag: "site:emergency-stair" });
      });
    });
    if (flights.length >= 2) {
      const a = flights[0]!;
      const b = flights[1]!;
      const z = Math.max(...a.treads) + 0.26;
      prims.push({ type: "box", centre: { x: (b.x0 + a.x1) / 2, y: LEVEL.floorMinus1 - riser * a.treads.length - 0.04, z: z + 0.3 }, size: { x: a.x1 - b.x0, y: 0.08, z: 0.6 }, material: "concrete", tag: "site:emergency-stair" });
      const north = Math.min(...a.treads);
      prims.push({ type: "box", centre: { x: (b.x0 + a.x1) / 2, y: LEVEL.floorMinus1 - 0.04, z: north - 0.6 }, size: { x: a.x1 - b.x0, y: 0.08, z: 1.2 }, material: "concrete", tag: "site:emergency-stair" });
    }
  }

  // The columns under floor −1's overhang, as floor −2's sheet draws them.
  // From the DXF they are its circles: where it draws them, as wide as it draws them.
  const columns = dxf ? dxfColumns(dxf, "floor-2").filter((c) => c.z > 14) : [7.5, 10.5, 13.7, 16.5, 21.5, 24.0, 30.8, 34.9, 38.1, 43.4, 48.4, 50.8].map((x) => ({ x, z: 16.2, r: 0.2 }));
  for (const c of columns) {
    prims.push({ type: "cylinder", centre: { x: c.x, y: (LEVEL.courtyard + LEVEL.floorMinus1) / 2, z: c.z }, radius: c.r, height: LEVEL.floorMinus1 - 0.3 - LEVEL.courtyard, material: "concrete", tag: "colonnade" });
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
  // From the DXF it is a shell on the extents its plan and section blocks agree on, with the plan's walls inside as rooms; the ground
  // is dug to its box. Without it, the solid mass the permit booklet draws.
  const fromDxf = dxf != null;
  if (fromDxf) {
    prims.push(...buildKindergarten(dxf!));
    kindergarten.length = 0;
    kindergarten.push([kindergartenOutline(), KINDERGARTEN.roof]);
  } else for (const [ring, top] of kindergarten) prims.push({ type: "prism", ring, y0: -1, y1: top, material: "existing", tag: "kindergarten" });
  // Its windows, a band on each north face.
  if (!fromDxf) for (const [x0, x1, z, sill] of [[6, 21.4, -7.5, 1.2], [22.4, 32.5, -8.4, 1.2], [22.4, 32.5, -8.4, 5.2], [33.5, 56.2, -4.3, 1.2], [1.2, 21.6, 1.02, 5.4], [33.3, 53.6, 1.02, 5.4]] as const) {
    for (let x = x0 + 0.6; x + 1.6 <= x1; x += 3.2) {
      prims.push({ type: "box", centre: { x: x + 0.8, y: sill + 0.7, z: z - 0.02 }, size: { x: 1.6, y: 1.4, z: 0.06 }, material: "frame", tag: "kindergarten:window" });
      prims.push({ type: "box", centre: { x: x + 0.8, y: sill + 0.7, z: z - 0.05 }, size: { x: 1.48, y: 1.28, z: 0.02 }, material: "glass", tag: "kindergarten:window" });
    }
  }
  // And on its east and west ends, as sheet 9 draws them: a row on each storey.
  if (!fromDxf) for (const [x, z0, z1, out] of [[56.7, -4.3, 8.0, 1], [5.5, -7.5, 1.02, -1], [0.88, 1.02, 13.2, -1]] as const) {
    for (const sill of [1.2, 5.2]) {
      for (let z = z0 + 0.8; z + 1.6 <= z1 - 0.4; z += 3.4) {
        prims.push({ type: "box", centre: { x: x + out * 0.02, y: sill + 0.7, z: z + 0.8 }, size: { x: 0.06, y: 1.4, z: 1.6 }, material: "frame", tag: "kindergarten:window" });
        prims.push({ type: "box", centre: { x: x + out * 0.05, y: sill + 0.7, z: z + 0.8 }, size: { x: 0.02, y: 1.28, z: 1.48 }, material: "glass", tag: "kindergarten:window" });
      }
    }
  }

  // The site: the sunken courtyard, the plazas either side, the street.
  // On the DXF route the courtyard and colonnade paving are the sheets' own hatches (see `surfacePrims` below).
  if (!dxf) prims.push(slab(rect(-10.5, 13.2, 32.4, 20.9), LEVEL.courtyard, 0.4, "paving", "site:courtyard"));
  // Under the overhang the paving runs the building's length, and east of
  // the stair on to the covered ramp.
  if (!dxf) prims.push(slab(rect(32.4, 13.2, 53.92, 19.0), LEVEL.courtyard, 0.4, "paving", "site:colonnade"));
  // The wall holds the street's level back along the building's south side, but for the drive in (x 35.3–41.3).
  for (const [x0, x1] of [[32.3, 35.3], [41.3, 53.9]] as const) {
    prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: (LEVEL.courtyard + LEVEL.street) / 2, z: 19.2 }, size: { x: x1 - x0, y: LEVEL.street - LEVEL.courtyard, z: 0.4 }, material: "stone", tag: "site:retaining" });
  }
  prims.push(...ramp());
  // The booklet's west terrace and east landing: on the DXF route the sheets' own hatches (the paving and grated decks of pisga-surfaces) stand there instead.
  if (!dxf) prims.push(slab(rect(-10.5, -1, 0.88, 13.2), 8.6, 0.4, "paving", "site:west"));
  // East of the building (sheet 5): a grated deck at +5.73 and the
  // emergency exit's landing at +7.80. The DXF's spot heights +928.93 and +931.00 (5.73 and 7.80 over 923.2) stand at these two decks.
  if (!dxf) prims.push(slab(rect(53.92, 3.8, 60.4, 7.4), 5.73, 0.3, "metal", "site:east"));
  if (!dxf) prims.push(slab(rect(53.92, 7.4, 60.4, 12.0), 7.8, 0.4, "paving", "site:east"));
  prims.push({ type: "box", centre: { x: 11, y: (LEVEL.courtyard + LEVEL.street + 1) / 2, z: 21.15 }, size: { x: 43, y: LEVEL.street + 1 - LEVEL.courtyard, z: 0.5 }, material: "stone", tag: "site:retaining" });
  // Trees where the site plan draws them: along the courtyard's retaining
  // wall, and on the plaza by the car park's entrance.
  for (const x of [-6.3, -2.2, 2.6, 7.4, 12.1, 16.4, 20.9]) prims.push({ type: "tree", at: { x, y: LEVEL.courtyard, z: 19.6 }, height: 6.5, crown: 2.4, tag: "tree" });
  for (const [x, z] of [[44.6, 22.6], [52.4, 22.9], [59.2, 23.4]] as const) prims.push({ type: "tree", at: { x, y: LEVEL.street, z }, height: 6, crown: 2.2, tag: "tree" });

  // Cars: most of the roof's bays taken, and the street's bays 13–18.
  const paint = [0xe8e8e6, 0x23262b, 0x8d9299, 0x6d1f23, 0xd5d7d9, 0x2c3e57, 0x5a5d61, 0xf0efe9];
  const upper = [1, 2, 4, 5, 7];
  upper.forEach((bay, i) => prims.push({ type: "car", at: { x: 36.7 + (bay - 1) * 2.43 + 1.215, y: LEVEL.roof + 0.05, z: 5.1 }, rotY: 0, colour: paint[i % paint.length]!, tag: "car" }));
  [1, 3, 4].forEach((bay, i) => prims.push({ type: "car", at: { x: 41.6 + (bay - 1) * 2.42 + 1.21, y: LEVEL.roof + 0.05, z: 15.6 }, rotY: Math.PI, colour: paint[(i + 5) % paint.length]!, tag: "car" }));
  pisgaStreetBays().forEach((b, i) => prims.push({ type: "car", at: { x: b.x, y: LEVEL.street, z: b.z }, rotY: b.rotY, colour: paint[(i + 2) % paint.length]!, tag: "car" }));
  // The hand-set west stair (from the permit booklet) gives way to the one the DXF's tread lines build above.
  prims.push(...pisgaStreet(LEVEL), ...pisgaStairs(LEVEL).filter((p) => !(dxf && p.tag === "site:west-stair")));

  // People, for scale: in the courtyard, on the roof plaza, at the entrance.


  // Ground: the spot heights, and the site's own levels where it is built.
  // Far from the survey's spot heights the ground follows the site's overall
  // fall, a plane fitted to all of them — not their average, which raised a
  // plateau to the street's height north of the building.
  // The survey layers' vertices (dxfSurveyPoints) were tried as spot heights too: they are kerb and boundary lines at the street's +17.9 a metre from the courtyard's +8.2, and the ground rose in a ridge between. The booklet's spots stay the ground's.
  const spots = SPOTS;
  const plane = fitPlane(spots.map(([sx, sz, abs]) => [sx, sz, abs - 923.2] as [number, number, number]));
  const groundAt = (x: number, z: number, built: boolean) => {
    let wsum = 0;
    let hsum = 0;
    for (const [sx, sz, abs] of spots) {
      const d2 = (x - sx) ** 2 + (z - sz) ** 2 + 4;
      const w = 1 / (d2 * d2);
      wsum += w;
      hsum += w * (abs - 923.2);
    }
    const w0 = 1 / 20 ** 4;
    let h = (hsum + w0 * (plane[0] + plane[1] * x + plane[2] * z)) / (wsum + w0);
    if (!built) return h;
    if (insidePolygon(rect(-10.5, -10, 64, 36), x, z)) h = Math.min(h, 8.1);
    // The kindergarten stands on its ±0.00: sheet 9 draws its ground at
    // +0.70 to the north and east, and it is dug into the slope beneath the
    // courtyard.
    if (kindergarten.some(([ring]) => insidePolygon(ring, x, z))) h = Math.min(h, -0.2);
    // East of the entrance the plot falls from the street to the east
    // plaza — the accessible ramp's slope.
    // (The site sheet marks +8.27 at (54.6, 14.3): the plaza stays level to z 14.5 and the fall to the street starts there — scripts/verify-pisga-terrain.mts.)
    if (x > 53.92 && x < 66 && z > 12 && z < 24.2) h = 8.27 + (Math.max(0, z - 14.5) / (24.2 - 14.5)) * (LEVEL.street - 8.27);
    if (z > 21.45 && !(x > 46 && x < 66 && z < 24.2)) h = Math.max(h, LEVEL.street - 0.6);
    // Under the street's own band (plot line out to 13.5 m) the ground is the road's bed, not a mound the spot heights lift into it.
    { const pz = pisgaPlotSouthZ(x); if (z > pz + 0.45 && z < pz + 13.6) h = LEVEL.street - 0.6; }
    return h;
  };
  // The site itself, a metre a cell; and the hills round it to the horizon, six metres a cell, 0.6 m under the first so the two never meet in a seam.
  const fine = { x0: -90, z0: -80, dx: 1, nx: 240, nz: 170 };
  const heights: number[] = [];
  for (let j = 0; j < fine.nz; j++) for (let i = 0; i < fine.nx; i++) heights.push(groundAt(fine.x0 + i * fine.dx, fine.z0 + j * fine.dx, true));
  prims.push({ type: "terrain", x0: fine.x0, z0: fine.z0, dx: fine.dx, nx: fine.nx, nz: fine.nz, heights, material: "soil", tag: "site:ground" });
  // The aerial photograph of the plot, laid on the ground. Nothing in the DXF places it; the user drew the plot's outline on the photo (their marking of 2026-10-19: west edge at pixel column ~768,
  // south edge from (768, 387) to (980, 410), east edge at ~1004, top at row ~318) and the fit is a similarity through four plan/photo pairs: the plot's SW corner (−11, 21.3), SE (62, 29.3),
  // NW (−12, −1.3) and NE (67, 7.8) — the DXF's boundary lines (M2602, G110-10) — onto those pixels: 0.3346 m a pixel, turned 2.96°, residual up to 15 px (5 m) at the east corners, which were read by eye.
  if (options?.groundPhoto) {
    const ph = { src: options.groundPhoto, pw: 1812, ph: 747, s: 0.3346, cu: 884, cv: 403, cx: 27, cz: 29.4, rot: (2.956 * Math.PI) / 180 };
    prims.push({ type: "terrain", x0: fine.x0, z0: fine.z0, dx: fine.dx, nx: fine.nx, nz: fine.nz, heights: heights.map((h) => h + 0.03), material: "soil", tag: "site:ground-photo", photo: ph });
  }
  const far = { x0: -700, z0: -700, dx: 10, nx: 150, nz: 150 };
  const farHeights: number[] = [];
  for (let j = 0; j < far.nz; j++) {
    for (let i = 0; i < far.nx; i++) {
      const x = far.x0 + i * far.dx;
      const z = far.z0 + j * far.dx;
      // Where the fine grid stands the far one sinks out of sight.
      const under = x > fine.x0 - 12 && x < fine.x0 + fine.nx * fine.dx + 12 && z > fine.z0 - 12 && z < fine.z0 + fine.nz * fine.dx + 12;
      farHeights.push(groundAt(x, z, false) - (under ? 8 : 0.6));
    }
  }
  prims.push({ type: "terrain", x0: far.x0, z0: far.z0, dx: far.dx, nx: far.nx, nz: far.nz, heights: farHeights, material: "soil", tag: "site:ground-far" });

  // The covered ramp is a corridor on the street's level; where the ground falls away under it (the east slope) it stands on piers, one every four metres, not on air.
  {
    const slab = prims.filter((q): q is Extract<Primitive, { type: "box" }> => q.type === "box" && q.tag === "site:ramp" && q.material === "paving");
    slab.forEach((q, i) => {
      if (i % 8 !== 4) return;
      const bottom = q.centre.y - q.size.y / 2;
      const base = groundAt(q.centre.x, q.centre.z, true) - 0.4;
      if (bottom - base < 0.6) return;
      prims.push({ type: "box", centre: { x: q.centre.x, y: (bottom + base) / 2, z: q.centre.z }, size: { x: 0.35, y: bottom - base, z: 0.35 }, material: "concrete", tag: "site:ramp-pier" });
    });
  }

  // Every surface the plan sheets hatch (paving, concrete, grated decks), as the drawing's own polygons laid on the ground; the same hatch drawn on two sheets is one.
  if (dxf) {
    const seen = new Set<string>();
    const surfaces = (["floor-2", "floor-1", "roof"] as const)
      .flatMap((sheet) => dxfSurfaces(dxf, sheet))
      .filter((sf) => {
        const k = `${sf.kind}|${Math.round(Math.min(...sf.ring.map((q) => q[0])) / 2)}|${Math.round(Math.min(...sf.ring.map((q) => q[1])) / 2)}|${Math.round(sf.areaM2 / 3)}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    // North of the lobby: the terrace the sheets draw at +8.27 (+931.47), its wall rectangle measured off the DXF's block-wall lines (layer קיר בלוק): the long faces at z −3.64/−3.59 and 0.95
    // (the building's north wall), the west faces at x 22.04/22.09 (to z −2.25 only: the wall is cut, which the model keeps open), the east end at x 32.94. So 10.84 m along the facade and 4.55 m out.
    // The wall is a 0.2 m parapet 1.1 m over the floor. (An earlier reading took the lines at z −8.45 for the same terrace and made it twice as deep.)
    {
      const [nx0, nx1, nz0, nz1] = [22.04, 32.94, -3.64, 1.06];
      const t = 0.2, top = 8.27 + 1.1;
      prims.push({ type: "prism", ring: [[nx0, nz0], [nx1, nz0], [nx1, nz1], [nx0, nz1]], y0: 7.97, y1: 8.27, material: "paving", tag: "site:north-terrace" });
      for (const [x0, x1, z0, z1] of [[nx0, nx1, nz0, nz0 + t], [nx1 - t, nx1, nz0, nz1], [nx0, nx0 + t, nz0, -2.25]] as const) {
        prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: (8.27 + top) / 2, z: (z0 + z1) / 2 }, size: { x: x1 - x0, y: top - 8.27, z: z1 - z0 }, material: "stone", tag: "site:north-parapet" });
      }
    }
    // The kerbs and low walls the A4-10 layer draws apart from any hatch: 0.1 m wide, 0.3 m over the ground.
    for (const [ax, az, bx, bz] of dxfKerbLines(dxf, "floor-1", surfaces)) {
      const len = Math.hypot(bx - ax, bz - az);
      const gy = groundAt((ax + bx) / 2, (az + bz) / 2, true);
      prims.push({ type: "box", centre: { x: (ax + bx) / 2, y: gy + 0.1, z: (az + bz) / 2 }, size: { x: len, y: 0.5, z: 0.1 }, rotY: -Math.atan2(bz - az, bx - ax), material: "concrete", tag: "site:kerb-dxf" });
    }
    // (The sheet's 3-tread flight at x 52–53.5, z 13.5–14.2 is inside the building beside the east exit, within floor −1's wall; it is not built as a site stair.)
    // A grated deck stands at the level of the nearest spot height the sheet marks, within 6 m of its middle.
    const allSpots = (["floor-2", "floor-1", "roof"] as const).flatMap((sheet) => dxfSpotHeights(dxf, sheet));
    const deckLevel = (sf: { ring: Array<[number, number]> }) => {
      const cx = sf.ring.reduce((t, q) => t + q[0], 0) / sf.ring.length;
      const cz = sf.ring.reduce((t, q) => t + q[1], 0) / sf.ring.length;
      return allSpots.filter((q) => Math.hypot(q.x - cx, q.z - cz) < 6 && q.level < 12).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0]?.level;
    };
    // (A plane through the sheet's level marks was tried for the ramps and sent a patch up the wall behind it: the marks name levels of things beside the paving too. Paving lies on the ground until a mark is tied to its own polygon.)
    const flights = (["floor-2", "floor-1", "roof"] as const).flatMap((sheet) => dxfTreadSets(dxf, sheet));
    const nearStair = (x: number, z: number) => flights.some((f) => {
      const [ax, az, bx, bz] = [f.first[0], f.first[1], f.last[0], f.last[1]];
      const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
      return Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t)) < f.width / 2 + 1.2;
    });
    prims.push(...surfacePrims(surfaces, (x, z) => groundAt(x, z, true), "site:surface", 0.08, deckLevel, nearStair));
    // Every run of treads the sheets draw, but the two stairs built above from their own reading (the lobby's and the west exit's): the same run drawn on two sheets is one.
    const builtElsewhere = (x: number, z: number) => (x > -2 && x < 1.2 && z > 10 && z < 17) || (x > 22 && x < 31 && z > 9.5 && z < 17.2);
    const runs = new Set<string>();
    for (const sheet of ["floor-2", "floor-1", "roof"] as const) {
      const spots = dxfSpotHeights(dxf, sheet);
      for (const set of dxfTreadSets(dxf, sheet)) {
        const mx = (set.first[0] + set.last[0]) / 2;
        const mz = (set.first[1] + set.last[1]) / 2;
        const key = `${Math.round(mx / 3)}|${Math.round(mz / 3)}`;
        if (builtElsewhere(mx, mz) || runs.has(key)) continue;
        runs.add(key);
        const near = (p: [number, number]) => spots.filter((q) => Math.hypot(q.x - p[0], q.z - p[1]) < 5).sort((a, b) => Math.hypot(a.x - p[0], a.z - p[1]) - Math.hypot(b.x - p[0], b.z - p[1]))[0];
        const a = near(set.first);
        const b = near(set.last);
        let top = a?.level ?? groundAt(set.first[0], set.first[1], true);
        let bottom = b?.level ?? groundAt(set.last[0], set.last[1], true);
        if (Math.abs(top - bottom) < 0.3) bottom = top - set.n * 0.17;
        let use = set;
        if (top < bottom) {
          [top, bottom] = [bottom, top];
          use = { ...set, first: set.last, last: set.first, dir: [-set.dir[0], -set.dir[1]] };
        }
        console.warn(`stairs ${sheet}: ${set.n} treads at ${mx.toFixed(1)},${mz.toFixed(1)} ${bottom.toFixed(2)}..${top.toFixed(2)} (${set.layer})`);
        prims.push(...stairPrims(use, top, bottom, "site:stair-dxf"));
      }
    }
  }

  // Life round the building (DXF route): trees along the street's far side and the slopes, shrubs by the colonnade, and people for scale
  // where the sheets show people go — the entrance, the courtyard, the lobby, the hall.
  if (dxf) {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let x = -60; x < 130; x += 7 + rnd() * 4) { const z = 38 + (x > 20 ? (x - 20) * 0.28 : 0) + rnd() * 3; if (z < 30) continue; prims.push({ type: "tree", at: { x, y: groundAt(x, z, true), z }, height: 5 + rnd() * 2.5, crown: 1.8 + rnd(), tag: "tree" }); }
    // Only on the flanks: in front of the north face a tree hides the building, and one in a window ruins the lobby.
    for (let k = 0; k < 40; k++) { const east = rnd() < 0.5; const x = east ? 78 + rnd() * 45 : -75 + rnd() * 52; const z = -45 + rnd() * 60; prims.push({ type: "tree", at: { x, y: groundAt(x, z, false), z }, height: 4 + rnd() * 2, crown: 1.6 + rnd() * 0.8, tag: "tree" }); }
    const people: Array<[number, number, number, number]> = [[27.4, 18.5, LEVEL.courtyard, 1.72], [29.5, 17.6, LEVEL.courtyard, 1.66], [14, 15.4, LEVEL.courtyard, 1.75], [36, 22.3, LEVEL.street, 1.7], [38.2, 21.8, LEVEL.street, 1.62], [30, 8.2, LEVEL.floorMinus1, 1.7], [33, 6.9, LEVEL.floorMinus1, 1.64], [48, 12, LEVEL.floorMinus1, 1.7], [46.5, 12.4, LEVEL.floorMinus1, 1.6], [24, 9.5, LEVEL.floorMinus2, 1.7], [38, 9, LEVEL.floorMinus2, 1.68]];
    const shirts = [0x3d5a80, 0xb5543c, 0x5b7f5f, 0xd8c9a0, 0x6d4c7d, 0x2f2f33];
    people.forEach(([x, z, y, h], i) => prims.push({ type: "person", at: { x, y, z }, rotY: rnd() * 6.28, colour: shirts[i % shirts.length]!, height: h, tag: "person" }));
  }

  return {
    name: 'מרכז פסג"ה למורים — קריית ארבע',
    primitives: prims,
    extent: { x: -12, z: -20, width: 84, depth: 50, yMin: -1, yMax: LEVEL.bulkhead },
    north: { x: 0, z: -1 },
  };
}

/** Least-squares plane h = a + b·x + c·z through the points. */
function fitPlane(pts: Array<[number, number, number]>): [number, number, number] {
  let n = 0, sx = 0, sz = 0, sh = 0, sxx = 0, szz = 0, sxz = 0, sxh = 0, szh = 0;
  for (const [x, z, h] of pts) {
    n++; sx += x; sz += z; sh += h; sxx += x * x; szz += z * z; sxz += x * z; sxh += x * h; szh += z * h;
  }
  // Solve the 3×3 normal equations by Cramer's rule.
  const m = [[n, sx, sz], [sx, sxx, sxz], [sz, sxz, szz]];
  const r = [sh, sxh, szh];
  const det = (a: number[][]) =>
    a[0]![0]! * (a[1]![1]! * a[2]![2]! - a[1]![2]! * a[2]![1]!) -
    a[0]![1]! * (a[1]![0]! * a[2]![2]! - a[1]![2]! * a[2]![0]!) +
    a[0]![2]! * (a[1]![0]! * a[2]![1]! - a[1]![1]! * a[2]![0]!);
  const d = det(m);
  const col = (k: number) => det(m.map((row, i) => row.map((v, j) => (j === k ? r[i]! : v))));
  return [col(0) / d, col(1) / d, col(2) / d];
}
