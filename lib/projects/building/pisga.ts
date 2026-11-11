import { kindergartenExitDoors, kindergartenExits, kindergartenExitsGround, kindergartenWestLink, insideKindergartenYard, kindergartenWestWell } from "@/lib/projects/building/pisga-kg-exits";
import { dxfCourtyardWall, dxfEntrancePrims, dxfNotes, dxfSpotHeights, dxfTreadSets, railingPrims, slopedTopRail, stairPrims } from "@/lib/projects/building/pisga-stairs";
import { dxfKerbLines, dxfSurfaces, surfacePrims } from "@/lib/projects/building/pisga-surfaces";
import { floorPrimitives, inset, insidePolygon, parapet, slab, type FloorSpec, type Outline } from "@/lib/projects/building/assemble";
import type { BuildingModel, Primitive } from "@/lib/projects/building/model";
import { readPdfPage, transformPage, type PdfPage } from "@/lib/projects/building/pdf-paths";
import { findOpenings, footprintOf } from "@/lib/projects/building/plan-openings";
import { readPlanWalls } from "@/lib/projects/building/plan-walls";
import { furnishFloor } from "@/lib/projects/building/furnish";
import { entranceGapPaving, pisgaHandContext, pisgaHardscapeBed, pisgaStairs, pisgaStreet, pisgaPlotSouthZ, pisgaStreetBays } from "@/lib/projects/building/pisga-site";
import { drawLine } from "@/lib/projects/building/raster";
import { buildKindergarten, kindergartenDoorPads, kindergartenOutline, KINDERGARTEN } from "@/lib/projects/building/pisga-kindergarten";
import { readPlanFurniture } from "@/lib/projects/building/plan-furniture";
import { readPlanRooms, type PlanRoom, type RoomKind, type RoomLabel } from "@/lib/projects/building/plan-rooms";
import { cutDxfWindows, dxfColumns, dxfFurnitureShapes, dxfFixtures, dxfHallSeats, furnitureFromShapes, type FurniturePart, type FurnitureShape, dxfAcousticPartitions, dxfDividers, dxfEmergencyStair, exteriorDoorRects, glazedPartitions, dxfPartitions, dxfPlanPage, dxfRoof, dxfRoomLabels, dxfSymbols, openingsByDxfWindows, PISGA_DXF, dxfDoorLeaves, dxfFloorDetails, liftShafts, dxfCeilingGrid, dxfCeilingTiles, dxfLayerLines, dxfSitePlants } from "@/lib/projects/building/pisga-dxf";
import { noteDrop } from "@/lib/projects/drop-log";
import type { DxfDrawing } from "@/lib/projects/dxf-drawing";
import { surveyFurniturePrims } from "@/lib/projects/building/pisga-survey-furniture";
import { readPisgaSurvey, surveyGround, surveyPlot, WALL_SPOT_LAYER } from "@/lib/projects/building/pisga-survey";
import { pisgaNeighbourBoxes, pisgaNeighbours } from "@/lib/projects/building/pisga-neighbours";
import { surveyStreet, surveyStreetPrims } from "@/lib/projects/building/pisga-survey-street";
import { hull, nearLink, type StairLink, surveyStairCarve, surveyStairPrims, surveyStairs, surveyStairTerraces } from "@/lib/projects/building/pisga-survey-stairs";

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

/** Where the upper road leaves the plot's line and starts to climb with the hill (plan x). */
const UPPER_ROAD_FROM = 70;

/** A ring cut to one side of the line x = at (Sutherland–Hodgman). */
function clipRingX(ring: Array<[number, number]>, at: number, east: boolean): Array<[number, number]> {
  const inside = (p: [number, number]) => (east ? p[0] >= at : p[0] <= at);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < ring.length; i++) {
    const [a, b] = [ring[i]!, ring[(i + 1) % ring.length]!];
    if (inside(a)) out.push(a);
    if (inside(a) !== inside(b)) { const t = (at - a[0]) / (b[0] - a[0]); out.push([at, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}

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

/** A rectangular bite out of a south edge, so a slab does not span the entrance stair (x 24.25–30.45, down to z 14.2). */
function biteSouth(ring: Outline, xL: number, xR: number, zNorth: number): Outline {
  const out: Outline = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    out.push(a);
    const zEdge = (a[1] + b[1]) / 2;
    if (Math.abs(a[1] - b[1]) > 0.35 || zEdge < zNorth + 1 || zEdge > 18) continue;
    if (Math.min(a[0], b[0]) >= xL || Math.max(a[0], b[0]) <= xR) continue;
    if (a[0] > b[0]) out.push([xR, a[1]], [xR, zNorth], [xL, zNorth], [xL, b[1]]);
    else out.push([xL, a[1]], [xL, zNorth], [xR, zNorth], [xR, b[1]]);
  }
  return out;
}

/** A partition inside, floor to the rooms' ceiling (furnishFloor's 3.3 m), less the floor's finish below it. */
const PARTITION_H = 3.25;

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
/**
 * The hall as floor −1's sheet draws it: +12.77 at the north (the wheelchair bays and the first row by the door), down 15 cm at each of
 * its eight "PROIEZIONI" lines to +11.57 in front of the stage; the stage +12.20 at the south behind the line at z 13.52, its five
 * armchairs facing the rows; in the SE corner three treads up to the exit's +11.87. The rows face south, down to the stage.
 */
const HALL_STEPS = [4.54, 5.55, 6.56, 7.57, 8.58, 9.59, 10.6, 11.61];
const HALL_STAGE = { x1: 51.96, z0: 13.52, y: 12.2 };
const HALL_SE = { x0: 51.96, z0: 13.52, tread: 0.22, y: 11.87 };
function hallFloorAt(x: number, z: number): number {
  if (z >= HALL_STAGE.z0 && x < HALL_STAGE.x1) return HALL_STAGE.y;
  if (z >= HALL_SE.z0) return Math.min(HALL_SE.y, HALL_FRONT + 0.1 * (1 + Math.floor((z - HALL_SE.z0) / HALL_SE.tread)));
  return LEVEL.floorMinus1 - 0.15 * HALL_STEPS.filter((s) => z >= s).length;
}
/** Is a point in the hall's room, where things stand on its own floor rather than on floor −1's. */
const inHall = (x: number, z: number) => x > HALL[0]![0] && x < HALL[1]![0] && z > HALL[0]![1] && z < HALL[2]![1];

/** The hall's floor, its handrails and its wall slats, from the sheet. */
function hallFromSheet(): Primitive[] {
  const out: Primitive[] = [];
  const tag = "floor-1:inside:furniture";
  const [x0, x1] = [HALL[0]![0], HALL[1]![0]];
  const bottom = HALL_FRONT - 0.3;
  const floorBox = (a: number, b: number, z0: number, z1: number, y: number) =>
    out.push({ type: "box", centre: { x: (a + b) / 2, y: (bottom + y) / 2, z: (z0 + z1) / 2 }, size: { x: b - a, y: y - bottom, z: z1 - z0 }, material: "floorWood", tag: "floor-1:slab" });
  const edges = [HALL[0]![1], ...HALL_STEPS, HALL_STAGE.z0];
  for (let i = 0; i + 1 < edges.length; i++) floorBox(x0, x1, edges[i]!, edges[i + 1]!, hallFloorAt(x0 + 0.1, edges[i]! + 0.01));
  floorBox(x0, HALL_STAGE.x1, HALL_STAGE.z0, HALL[2]![1], HALL_STAGE.y);
  for (let k = 0; HALL_SE.z0 + k * HALL_SE.tread < HALL[2]![1]; k++) {
    const z = HALL_SE.z0 + k * HALL_SE.tread;
    const y = hallFloorAt(HALL_SE.x0 + 0.1, z + 0.01);
    floorBox(HALL_SE.x0, x1, z, y >= HALL_SE.y ? HALL[2]![1] : z + HALL_SE.tread, y);
    if (y >= HALL_SE.y) break;
  }
  // The stage's front edge, an oak nosing, so its 63 cm rise reads.
  out.push({ type: "box", centre: { x: (x0 + HALL_STAGE.x1) / 2, y: HALL_STAGE.y - 0.01, z: HALL_STAGE.z0 + 0.02 }, size: { x: HALL_STAGE.x1 - x0, y: 0.02, z: 0.04 }, material: "timber", tag });
  // "מאחז יד" at each side wall: a rail over the steps' nosings, 90 cm up, from the first line to the last.
  const first = HALL_STEPS[0]!;
  const last = HALL_STEPS[HALL_STEPS.length - 1]!;
  for (const x of [x0 + 0.08, x1 - 0.08]) out.push(...slopedTopRail([x, first - 0.3], [x, last + 0.3], LEVEL.floorMinus1, HALL_FRONT, "floor-1:inside:rail", 0.9, 0.045));
  // The walls either side lined in oak slats for the room's acoustics, each from its own step to 3 m over floor −1.
  for (const x of [x0 - 0.07, x1 - 0.05]) {
    for (let z = 1.6; z < 15.8; z += 0.12) {
      const f = hallFloorAt(x + 0.1, z);
      const top = LEVEL.floorMinus1 + 3.0;
      out.push({ type: "box", centre: { x, y: (f + 0.1 + top) / 2, z }, size: { x: 0.04, y: top - f - 0.1, z: 0.06 }, material: "timber", tag });
    }
  }
  return out;
}

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
/**
 * The plaza east of the building dug out of the hill to its +8.27: x 53.92 to this x (the ramp's platform's east end), z 8 (its railing over
 * the kindergarten) to this z (the ramp's north edge).
 */
const EAST_CUT = { x0: 62.1, z0: 16.38 };
/** East of the entrance the plot falls from the street to the east plaza, the ramp's slope: level at +8.27 to z 14.5 (the site sheet's mark at (54.6, 14.3)). */
const eastPlazaFall = (z: number) => 8.27 + (Math.max(0, z - 14.5) / (24.2 - 14.5)) * (LEVEL.street - 8.27);

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
    // The slab is one sloped piece per run: a level box every 50 cm read as a flight of 2 cm steps (jn-e-ramp10).
    out.push({ type: "custom-mesh", stations: Array.from({ length: n + 1 }, (_, k) => ({ x: ax + ((bx - ax) * k) / n, z: az + ((bz - az) * k) / n, yTop: ay + ((by - ay) * k) / n, yFoot: ay + ((by - ay) * k) / n - 0.3 })), thick: width, material: "paving", tag });
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const y = ay + (by - ay) * t;
      const seg = len / n + 0.02;
      // Normal to the path, to the south: the railing's side.
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const rx = x + nx * (width / 2 - 0.03);
      const rz = z + nz * (width / 2 - 0.03);
      out.push({ type: "box", centre: { x: rx, y: y + 0.95, z: rz }, size: { x: seg, y: 0.04, z: 0.05 }, rotY: rot, material: "metal", tag });
      out.push({ type: "box", centre: { x: rx, y: y + 0.48, z: rz }, size: { x: seg, y: 0.9, z: 0.012 }, rotY: rot, material: "glass", tag });
      if (k % 3 === 0) out.push({ type: "box", centre: { x: rx, y: y + 0.48, z: rz }, size: { x: 0.03, y: 0.95, z: 0.03 }, material: "metal", tag });
    }
  }
  // The two slabs of a bend meet at an angle and leave a wedge on its outside, and the last one ended in the air short of the landing it meets
  // (jn-e-ramp): a square pad fills each, and a pier carries the foot.
  const [bx0, bz0, by0] = path[1]!;
  out.push({ type: "box", centre: { x: bx0, y: by0 - 0.15, z: bz0 }, size: { x: width, y: 0.3, z: width }, material: "paving", tag });
  // The last slab runs on, in its own direction and without a rail, 0.75 m onto the landing the survey draws at its foot (x 63.7–66.4,
  // z 19.4–21.5, +12.30): a square pad turned the wrong way read as a block hanging at the corner (the user's mark, 2026-11-01).
  const [ex, ez, ey] = path[2]!;
  {
    const [sx, sz] = path[1]!;
    // A centimetre under the landing's top: level with it, the two pavings fought and the joint read as a patch of crossed tiles (jn-e-ramp5).
    const L = Math.hypot(ex - sx, ez - sz), run = 0.75, ux = (ex - sx) / L, uz = (ez - sz) / L;
    out.push({ type: "box", centre: { x: ex + (ux * run) / 2, y: ey - 0.16, z: ez + (uz * run) / 2 }, size: { x: run + 0.02, y: 0.3, z: width }, rotY: -Math.atan2(uz, ux), material: "paving", tag });
  }
  out.push({ type: "box", centre: { x: ex, y: ey - 1.5, z: ez }, size: { x: 0.4, y: 2.7, z: 0.4 }, material: "concrete", tag: "site:ramp-pier" });
  // The pit dug under the ramp's north edge (groundAt) is walled: along the edge up to the slab's foot while the slab is over it (to x 56.85,
  // the bend's pad), then to the hill behind; and across its east end, its top the hill's fall.
  const { x0: cx, z0: cz } = EAST_CUT, t = 0.45, foot = 8.17;
  const wallBox = (x0: number, x1: number, top: number) => out.push({ type: "box", centre: { x: (x0 + x1) / 2, y: (foot + top) / 2, z: cz + t / 2 }, size: { x: x1 - x0, y: top - foot, z: t }, material: "stone", tag: "site:retaining-east-cut" });
  wallBox(53.92, 56.85, 11.5);
  // The whole plaza is paved as a passage, from its railing over the kindergarten's terrace and yard (z 7.97, +8.27, x to 61.8 where the
  // stair down to the yard begins) to the pit's wall, level with the site's hatches (8 cm over the ground); bare, it read as grass and as a
  // bank falling to +5 under the railing (east-end, the user's mark, 2026-11-01). Half a centimetre under the hatches where the two overlap.
  // (Under the plaza's own hatches, +8.29–8.35, its concrete and paving where the sheet draws them: level with them, the two fought.)
  out.push({ type: "prism", ring: [[53.7, 7.97], [61.8, 7.97], [61.8, 11.2], [cx, 11.2], [cx, cz], [53.7, cz]], y0: 8.15, y1: 8.31, material: "paving", tag: "site:east-cut-floor" });
  // Its north edge stands on a wall down to the kindergarten's terrace (+4.54) and the yard's wall: the earth fell there in a bank under the railing.
  // (Not tagged a retaining wall: those stand in for the railing beside them, and the plaza's railing over the 3.7 m drop went.)
  out.push({ type: "box", centre: { x: (53.7 + 61.8) / 2, y: (4.54 + 8.19) / 2, z: (7.97 + 8.55) / 2 }, size: { x: 61.8 - 53.7, y: 8.19 - 4.54, z: 0.58 }, material: "stone", tag: "site:east-cut-wall" });
  wallBox(56.85, cx + t, eastPlazaFall(cz + t) + 0.05);
  const n = 8;
  out.push({ type: "custom-mesh", stations: Array.from({ length: n + 1 }, (_, k) => { const z = 14.5 + ((cz + t - 14.5) * k) / n; return { x: cx + t / 2, z, yTop: eastPlazaFall(z) + 0.05, yFoot: foot }; }), thick: t, material: "stone", tag: "site:retaining-east-cut" });
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
/** The room whose floor a plan point is on, if any. */
function roomAt(rooms: PlanRoom[], x: number, z: number): PlanRoom | undefined {
  return rooms.find((r) => {
    const row = r.rows.reduce<PlanRoom["rows"][number] | undefined>((best, q) => (!best || Math.abs(q.y - z) < Math.abs(best.y - z) ? q : best), undefined);
    return !!row && Math.abs(row.y - z) < 0.1 && row.spans.some(([a, b]) => x >= a && x <= b);
  });
}

/**
 * Chairs the sheets leave out (the user's call, 2026-10-27: "the plan's furniture is short; add and arrange the classrooms' as they
 * need, and make it look good"). A round table in a classroom, learning space or workshop with no chair drawn within 60 cm of its
 * edge gets its chairs, round it at 75 cm a seat, facing it; a seat goes only where its four corners stand on the room's floor and it
 * clears every other piece. Built apart from the sheet's own (tag …:inside:furniture-added), so the checks against the sheet keep them apart.
 */
export function chairsForBareTables(shapes: FurnitureShape[], rooms: PlanRoom[]): FurnitureShape[] {
  const out: FurnitureShape[] = [];
  for (const t of shapes) {
    if (t.kind !== "round-table" || t.length < 0.85) continue;
    const room = roomAt(rooms, t.x, t.z);
    if (!room || !["classroom", "design", "workshop"].includes(room.kind)) continue;
    const r = t.length / 2;
    if (shapes.some((c) => c.kind === "chair" && Math.hypot(c.x - t.x, c.z - t.z) < r + 0.6)) continue;
    const ring = r + 0.32;
    const n = Math.min(8, Math.max(4, Math.round((2 * Math.PI * ring) / 0.75)));
    for (let k = 0; k < n; k++) {
      const th = (2 * Math.PI * (k + 0.5)) / n;
      const c: FurnitureShape = { x: t.x + ring * Math.cos(th), z: t.z + ring * Math.sin(th), length: 0.45, width: 0.45, angle: th + Math.PI / 2, round: false, kind: "chair" };
      const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [c.x + a! * 0.3, c.z + b! * 0.3] as const);
      if (!corners.every(([x, z]) => roomAt(rooms, x, z) === room)) continue;
      const clear = [...shapes, ...out].every((o) => o === t || Math.hypot(o.x - c.x, o.z - c.z) > Math.max(o.length, o.width) / 2 + 0.3);
      if (clear) out.push(c);
    }
  }
  return out;
}

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
/** The grid's tile (between two lines 50–70 cm apart) holding `v`, as its middle; null between other lines. */
function tileMiddle(v: number, lines: number[]): number | null {
  for (let k = 1; k < lines.length; k++) {
    const a = lines[k - 1]!, b = lines[k]!;
    if (a <= v && v < b && b - a > 0.5 && b - a < 0.7) return (a + b) / 2;
  }
  return null;
}

/** The grid's line positions: x of the north–south lines, z of the east–west ones. */
function gridLines(segs: Array<[number, number, number, number]>): { gx: number[]; gz: number[] } {
  const gx = [...new Set(segs.filter((s) => Math.abs(s[0] - s[2]) < 0.01).map((s) => +s[0].toFixed(2)))].sort((a, b) => a - b);
  const gz = [...new Set(segs.filter((s) => Math.abs(s[1] - s[3]) < 0.01).map((s) => +s[1].toFixed(2)))].sort((a, b) => a - b);
  return { gx, gz };
}

/**
 * The edges of the electrical sheet's small tiles (the WCs' 30 cm), merged into one segment per run on each line: the bars the 60 cm grid
 * does not draw there.
 */
export function smallTileEdges(tiles: Array<{ x0: number; x1: number; z0: number; z1: number; size: number }>): Array<[number, number, number, number]> {
  const runs = new Map<string, Array<[number, number]>>();
  const add = (k: string, a: number, b: number) => (runs.get(k) ?? runs.set(k, []).get(k)!).push([a, b]);
  for (const s of tiles) {
    if (s.size > 0.45) continue;
    for (const z of [s.z0, s.z1]) add(`z${z.toFixed(2)}`, s.x0, s.x1);
    for (const x of [s.x0, s.x1]) add(`x${x.toFixed(2)}`, s.z0, s.z1);
  }
  const out: Array<[number, number, number, number]> = [];
  for (const [k, list] of runs) {
    const at = Number(k.slice(1));
    list.sort((p, q) => p[0] - q[0]);
    let [a, b] = list[0]!;
    const emit = () => out.push(k[0] === "z" ? [a, at, b, at] : [at, a, at, b]);
    for (const [c, d] of list.slice(1)) {
      if (c <= b + 0.02) b = Math.max(b, d);
      else { emit(); [a, b] = [c, d]; }
    }
    emit();
  }
  return out;
}

/** In a WC's 30 cm tiles a light is the tile it lies in; elsewhere it goes into its 60 cm tile. */
function snapToSmallOr(p: Primitive & { type: "box" }, segs: Array<[number, number, number, number]>, inTile: (x: number, z: number) => { x0: number; x1: number; z0: number; z1: number; size: number } | undefined): Primitive {
  const s = inTile(p.centre.x, p.centre.z);
  if (s && s.size < 0.45) return { ...p, centre: { ...p.centre, x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2 }, size: { ...p.size, x: s.size - 0.02, z: s.size - 0.02 } };
  return snapToTile(p, segs);
}

/**
 * A canopy hung on a wall, as the kindergarten's door has one today (photograph 8): a thin dark steel slab from the wall face a→b out `depth`
 * metres along `out`, its top at `top`, a fascia along its front, and two tie rods from the wall 1.3 m over it down to its front corners'
 * inner points. The site has these, not pergolas on posts (the user, 2026-11-09).
 */
function hungCanopy(a: [number, number], b: [number, number], out: [number, number], depth: number, top: number, tag: string): Primitive[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.3) return [];
  const [ux, uz] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const rotY = -Math.atan2(uz, ux);
  const [mx, mz] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const t = 0.1;
  const prims: Primitive[] = [
    { type: "box", centre: { x: mx + (out[0] * depth) / 2, y: top - t / 2, z: mz + (out[1] * depth) / 2 }, size: { x: len, y: t, z: depth }, rotY, material: "darkSteel", tag },
    { type: "box", centre: { x: mx + out[0] * (depth - 0.02), y: top - 0.09, z: mz + out[1] * (depth - 0.02) }, size: { x: len, y: 0.18, z: 0.04 }, rotY, material: "darkSteel", tag },
  ];
  const inset = Math.min(0.5, len / 4);
  for (const s of [inset, len - inset]) {
    const [wx, wz] = [a[0] + ux * s, a[1] + uz * s];
    const start = { x: wx + out[0] * 0.02, y: top + 1.3, z: wz + out[1] * 0.02 };
    const end = { x: wx + out[0] * (depth - 0.08), y: top, z: wz + out[1] * (depth - 0.08) };
    prims.push({ type: "box", centre: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2, z: (start.z + end.z) / 2 }, size: { x: 0.03, y: 0.03, z: 0.03 }, span: { start, end }, material: "darkSteel", tag });
    prims.push({ type: "box", centre: { x: wx + out[0] * 0.01, y: top + 1.3, z: wz + out[1] * 0.01 }, size: { x: 0.12, y: 0.16, z: 0.02 }, rotY, material: "darkSteel", tag });
  }
  return prims;
}

/** A light panel moved into the grid tile its middle falls in, a little under the tile's size so the T-bars frame it. */
function snapToTile(p: Primitive & { type: "box" }, segs: Array<[number, number, number, number]>): Primitive {
  const { gx, gz } = gridLines(segs);
  const cx = tileMiddle(p.centre.x, gx), cz = tileMiddle(p.centre.z, gz);
  if (cx == null || cz == null) return p;
  return { ...p, centre: { ...p.centre, x: cx, z: cz }, size: { ...p.size, x: 0.58, z: 0.58 } };
}

/**
 * The suspended ceiling the sheet's ceiling plan draws where the rooms laid none: wherever its grid runs inside the floor's outline, but
 * over no stair or lift. The rooms' reading leaves gaps — floor −1's open plan (the classroom, the secretariat, the lobby) is one region
 * that the "חלל כפול" label makes a void, so it had no ceiling at all, and floor −2's corridors had none between the rooms' panels.
 * Light panels follow furnishFloor's rule (60 cm, every 2.4 m), on the sheet's own tiles.
 */
export function ceilingFromGrid(
  grid: { segs: Array<[number, number, number, number]>; under: (x: number, z: number) => boolean },
  furnished: Primitive[],
  rooms: PlanRoom[],
  outline: Outline,
  level: number,
  heightAt: (x: number, z: number) => number,
  tag: string,
): Primitive[] {
  if (!grid.segs.length) return [];
  const S = 0.1;
  const panels = furnished.flatMap((p) => (p.type === "box" && p.material === "ceiling" ? [{ x0: p.centre.x - p.size.x / 2, x1: p.centre.x + p.size.x / 2, z0: p.centre.z - p.size.z / 2, z1: p.centre.z + p.size.z / 2 }] : []));
  const roomAt = (x: number, z: number) =>
    rooms.find((r) => {
      let best: (typeof r.rows)[number] | undefined;
      for (const row of r.rows) if (!best || Math.abs(row.y - z) < Math.abs(best.y - z)) best = row;
      return !!best && Math.abs(best.y - z) <= 0.02 && best.spans.some(([a, b]) => x >= a && x < b);
    });
  const xs = grid.segs.flatMap((s) => [s[0], s[2]]), zs = grid.segs.flatMap((s) => [s[1], s[3]]);
  const X0 = Math.min(...xs), Z0 = Math.min(...zs);
  const cols = Math.ceil((Math.max(...xs) - X0) / S), rowsN = Math.ceil((Math.max(...zs) - Z0) / S);
  const need: boolean[] = new Array(cols * rowsN).fill(false);
  for (let j = 0; j < rowsN; j++) for (let i = 0; i < cols; i++) {
    const x = X0 + (i + 0.5) * S, z = Z0 + (j + 0.5) * S;
    if (!grid.under(x, z) || !insidePolygon(outline, x, z)) continue;
    if (panels.some((p) => x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1)) continue;
    const room = roomAt(x, z);
    if (room && (room.kind === "stair" || room.kind === "lift")) continue;
    need[j * cols + i] = true;
  }
  // Runs per row, merged down while a run repeats exactly.
  const out: Primitive[] = [];
  const open = new Map<string, { i0: number; i1: number; j0: number; j1: number }>();
  const flush = (r: { i0: number; i1: number; j0: number; j1: number }) => {
    const x0 = X0 + r.i0 * S, x1 = X0 + r.i1 * S, z0 = Z0 + r.j0 * S, z1 = Z0 + r.j1 * S;
    const h = heightAt((x0 + x1) / 2, (z0 + z1) / 2);
    out.push({ type: "box", centre: { x: (x0 + x1) / 2, y: level + h + 0.01, z: (z0 + z1) / 2 }, size: { x: x1 - x0 + 0.02, y: 0.02, z: z1 - z0 + 0.02 }, material: "ceiling", tag: `${tag}:ceiling` });
  };
  for (let j = 0; j <= rowsN; j++) {
    const runs: Array<[number, number]> = [];
    if (j < rowsN) for (let i = 0; i < cols; ) {
      if (!need[j * cols + i]) { i++; continue; }
      const i0 = i;
      while (i < cols && need[j * cols + i]) i++;
      runs.push([i0, i]);
    }
    const seen = new Set<string>();
    for (const [i0, i1] of runs) {
      const k = `${i0}:${i1}`;
      seen.add(k);
      const r = open.get(k);
      if (r) r.j1 = j + 1;
      else open.set(k, { i0, i1, j0: j, j1: j + 1 });
    }
    for (const [k, r] of [...open]) if (!seen.has(k)) { flush(r); open.delete(k); }
  }
  // Lights on the sheet's own tiles: the cell between grid lines nearest each 2.4 m step, inside the new ceiling.
  const filled = out.map((p) => (p.type === "box" ? { x0: p.centre.x - p.size.x / 2, x1: p.centre.x + p.size.x / 2, z0: p.centre.z - p.size.z / 2, z1: p.centre.z + p.size.z / 2 } : null)).filter((b): b is NonNullable<typeof b> => !!b);
  const { gx, gz } = gridLines(grid.segs);
  const tileOf = tileMiddle;
  const lit = new Set<string>();
  for (let z = Z0 + 1.2; z < Z0 + rowsN * S - 0.6; z += 2.4) for (let x = X0 + 1.2; x < X0 + cols * S - 0.6; x += 2.4) {
    const cx = tileOf(x, gx), cz = tileOf(z, gz);
    if (cx == null || cz == null) continue;
    if (!filled.some((b) => cx - 0.3 >= b.x0 - 0.01 && cx + 0.3 <= b.x1 + 0.01 && cz - 0.3 >= b.z0 - 0.01 && cz + 0.3 <= b.z1 + 0.01)) continue;
    const k = `${cx.toFixed(2)},${cz.toFixed(2)}`;
    if (lit.has(k)) continue;
    lit.add(k);
    out.push({ type: "box", centre: { x: cx, y: level + heightAt(cx, cz) - 0.005, z: cz }, size: { x: 0.58, y: 0.012, z: 0.58 }, material: "lightPanel", tag: `${tag}:light` });
  }
  return out;
}

/**
 * The ceiling grid's T-bars: each sheet line on an axis, cut to the ceiling panels furnishFloor laid (so no bar hangs over a stair or a
 * void), at each panel's own underside (the hall's lower ceiling included). A line or a stretch of one with no ceiling over it is counted.
 */
export function ceilingGridBars(segs: Array<[number, number, number, number]>, furnished: Primitive[], tag: string): Primitive[] {
  const panels = furnished.flatMap((p) => (p.type === "box" && p.material === "ceiling" ? [{ x0: p.centre.x - p.size.x / 2, x1: p.centre.x + p.size.x / 2, z0: p.centre.z - p.size.z / 2, z1: p.centre.z + p.size.z / 2, under: p.centre.y - p.size.y / 2 }] : []));
  const out: Primitive[] = [];
  const W = 0.024, T = 0.012;
  // One bar per panel stretch; a line on a panel's edge (two rooms meeting) is laid once, by the first panel.
  const laid = new Set<string>();
  for (const [x1, z1, x2, z2] of segs) {
    const eastWest = Math.abs(z1 - z2) < 0.01;
    if (!eastWest && Math.abs(x1 - x2) >= 0.01) { noteDrop("pisga:ceiling-grid-off-axis", `(${x1.toFixed(1)}, ${z1.toFixed(1)})`); continue; }
    const at = eastWest ? (z1 + z2) / 2 : (x1 + x2) / 2;
    const [a0, a1] = eastWest ? [Math.min(x1, x2), Math.max(x1, x2)] : [Math.min(z1, z2), Math.max(z1, z2)];
    let covered = 0;
    for (const p of panels) {
      const [lo, hi, c0, c1] = eastWest ? [p.x0, p.x1, p.z0, p.z1] : [p.z0, p.z1, p.x0, p.x1];
      if (at < c0 - 0.005 || at > c1 + 0.005) continue;
      const s0 = Math.max(a0, lo), s1 = Math.min(a1, hi);
      if (s1 - s0 < 0.05) continue;
      const key = `${eastWest ? "x" : "z"}${at.toFixed(2)}:${s0.toFixed(2)}:${s1.toFixed(2)}:${p.under.toFixed(2)}`;
      if (laid.has(key)) continue;
      laid.add(key);
      covered += s1 - s0;
      const mid = (s0 + s1) / 2;
      out.push({
        type: "box",
        centre: eastWest ? { x: mid, y: p.under - T / 2, z: at } : { x: at, y: p.under - T / 2, z: mid },
        size: eastWest ? { x: s1 - s0, y: T, z: W } : { x: W, y: T, z: s1 - s0 },
        material: "ceilingGrid",
        tag,
      });
    }
    if (covered < 0.05) noteDrop("pisga:ceiling-grid-line-without-ceiling", () => `${eastWest ? "E–W" : "N–S"} at ${at.toFixed(2)}, ${a0.toFixed(1)}..${a1.toFixed(1)}`);
  }
  return out;
}

export async function buildPisga(pdf: Uint8Array | null, options?: { future?: boolean; dxf?: DxfDrawing; /** The plot's aerial photograph as a data URL, laid on the ground by a rough fit (a draft). */ groundPhoto?: string; /** The 2022 site survey (pisga-survey.ts): the existing ground, stairs and walls round the plot. */ survey?: DxfDrawing }): Promise<BuildingModel> {
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
    const lowCeiling = spec.id === "floor-2" ? { x: 44.4, y: 1.3, w: 9.3, h: 15, m: HALL_FRONT - 0.32 - LEVEL.floorMinus2 } : undefined;
    const gridLines60 = dxf ? dxfCeilingGrid(dxf, spec.id as "floor-2" | "floor-1") : null;
    // The electrical sheet's tiles (E24-10, OFF in the DXF) say the same ceiling room by room, and where the WCs take 30 cm tiles.
    const tiles = dxf ? dxfCeilingTiles(dxf, spec.id as "floor-2" | "floor-1") : [];
    const inTile = (x: number, z: number) => tiles.find((s) => x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1);
    const grid = gridLines60 ? { ...gridLines60, under: (x: number, z: number) => gridLines60.under(x, z) || !!inTile(x, z) } : null;
    // The stairs the ceiling plan draws are holes in the ceiling, as the double-height void is.
    const ceilingVoids = [...voids, ...(grid?.stairs ?? []).map((s) => ({ x: s.x0, y: s.z0, w: s.x1 - s.x0, h: s.z1 - s.z0 }))];
    const furnishedRaw = furnishFloor(rooms, dxf ? [] : items, { level: spec.level, tag: `${spec.id}:inside`, ceilingM: 3.3, lowCeiling, voids: ceilingVoids, ownFloor: spec.id === "floor-1" ? ["hall"] : [] });
    // The rooms' light panels, set every 2.4 m from each room's corner, straddled the sheet's T-bars: each goes into the tile it falls in.
    const furnished = grid ? furnishedRaw.map((p) => (p.type === "box" && p.material === "lightPanel" ? snapToSmallOr(p, grid.segs, inTile) : p)) : furnishedRaw;
    prims.push(...furnished);
    // The suspended ceiling as the sheet's ceiling plan draws it ("הנמכת תקרה", a layer left OFF in the DXF): panels where the rooms laid
    // none, then the 60 cm grid line for line under every panel.
    if (grid) {
      const heightAt = (x: number, z: number) => (lowCeiling && x > lowCeiling.x && x < lowCeiling.x + lowCeiling.w && z > lowCeiling.y && z < lowCeiling.y + lowCeiling.h ? lowCeiling.m : 3.3);
      const filled = ceilingFromGrid(grid, furnished, rooms, spec.outline, spec.level, heightAt, `${spec.id}:inside`);
      prims.push(...filled);
      prims.push(...ceilingGridBars([...grid.segs, ...smallTileEdges(tiles)], [...furnished, ...filled], `${spec.id}:inside:ceiling-grid`));
    }
    const details = dxf ? dxfFloorDetails(dxf, spec.id as "floor-2" | "floor-1") : { counters: [], warnings: [], warningLabels: [], locators: [] };
    if (dxf) {
      // The fixtures the sheet draws in the WCs: a pan with its cistern, a basin on its stand, a counter's basins.
      for (const f of dxfFixtures(dxf, spec.id as "floor-2" | "floor-1")) {
        const c = Math.cos(f.angle);
        const sn = Math.sin(f.angle);
        const put = (u: number, v: number, sx: number, sy: number, sz: number, y0: number, material: "ceramic" | "cabinet" | "worktop" | "metal") =>
          prims.push({ type: "box", centre: { x: f.x + u * c - v * sn, y: spec.level + y0 + sy / 2, z: f.z + u * sn + v * c }, size: { x: sx, y: sy, z: sz }, rotY: -f.angle, material, tag: `${spec.id}:inside:fixture` });
        // A sink in a worktop the sheet draws: steel let into the top. By its size alone the kitchen's 60 × 40 sink read as a WC pan.
        const top = details.counters.find((k) => f.x > k.x0 && f.x < k.x1 && f.z > k.z0 && f.z < k.z1);
        if (top && f.kind !== "counter") {
          put(0, 0, f.length * 0.9, 0.012, f.width * 0.9, top.height - 0.006, "metal");
          continue;
        }
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
      const shapes = dxfFurnitureShapes(dxf, spec.id as "floor-2" | "floor-1");
      // On the hall's stage (in front of its first row, z < 4.1) the sheet draws the speaker's table as two 1.2 × 0.8 pieces side by side,
      // which read as sofas and stood there as a beige lump: they are the table.
      // Those two pieces are the two wheelchair bays beside the first row, each drawn with its wheelchair and sitter: a bay is open floor.
      if (spec.id === "floor-1") for (let i = shapes.length - 1; i >= 0; i--) if (shapes[i]!.kind === "sofa" && inHall(shapes[i]!.x, shapes[i]!.z) && shapes[i]!.z < HALL_STEPS[0]!) shapes.splice(i, 1);
      // In the hall a piece stands on the hall's own floor: the stage's armchairs at +12.20, not at floor −1's +12.77.
      const lift = (b: FurniturePart) => (spec.id === "floor-1" && inHall(b.cx, b.cz) ? hallFloorAt(b.cx, b.cz) - spec.level : 0);
      const put = (b: FurniturePart, tag: string) => {
        const cy = b.cy + lift(b);
        prims.push(b.round ? { type: "cylinder", centre: { x: b.cx, y: cy, z: b.cz }, radius: b.sx / 2, height: b.sy, material: b.material, tag } : { type: "box", centre: { x: b.cx, y: cy, z: b.cz }, size: { x: b.sx, y: b.sy, z: b.sz }, rotY: b.rotY, material: b.material, tag });
      };
      for (const b of furnitureFromShapes(shapes, spec.level, spec.id)) put(b, `${spec.id}:inside:furniture`);
      for (const b of furnitureFromShapes(chairsForBareTables(shapes, rooms), spec.level, spec.id)) put(b, `${spec.id}:inside:furniture-added`);
    }
    if (spec.id === "floor-1") {
      prims.push(...(dxf ? hallFromSheet() : [...auditorium(spec.level), ...reception()]));
      // The seats the sheet draws: each at its own place, on the raked floor's step under it.
      if (dxf) {
        const tag = "floor-1:inside:furniture";
        const hallSeats = dxfHallSeats(dxf);
        for (const st of hallSeats) {
          // The sheet draws each seat's back, just behind its step's edge: the pan is in front of it, to the south, the stage's way.
          const f = hallFloorAt(st.x, st.z);
          prims.push({ type: "box", centre: { x: st.x, y: f + 0.44, z: st.z + 0.26 }, size: { x: 0.5, y: 0.1, z: 0.44 }, material: "seatFabric", tag });
          prims.push({ type: "box", centre: { x: st.x, y: f + 0.78, z: st.z }, size: { x: 0.5, y: 0.62, z: 0.08 }, material: "seatFabric", tag });
          prims.push({ type: "box", centre: { x: st.x - 0.28, y: f + 0.34, z: st.z + 0.22 }, size: { x: 0.05, y: 0.68, z: 0.5 }, material: "frame", tag });
          // Each seat carries the arm on its west side; the last seat of a row (none beside it to the east) carries its east arm too.
          if (!hallSeats.some((o) => o !== st && Math.abs(o.z - st.z) < 0.3 && o.x > st.x + 0.3 && o.x < st.x + 0.8)) prims.push({ type: "box", centre: { x: st.x + 0.28, y: f + 0.34, z: st.z + 0.22 }, size: { x: 0.05, y: 0.68, z: 0.5 }, material: "frame", tag });
          // The seat is carried: a pedestal on its step up to the pan.
          prims.push({ type: "box", centre: { x: st.x, y: f + 0.2, z: st.z + 0.2 }, size: { x: 0.24, y: 0.4, z: 0.3 }, material: "frame", tag });
        }
      }
    }
    // The WC stalls' partitions, 2.1 m of laminate panel a hand off the floor, from the DXF; and the glazed partitions its window symbols draw inside.
    if (dxf) {
      // A glazed partition stands in a line of acoustic partitions, so it runs floor to ceiling as they do.
      for (const w of glazedPartitions(read!.windows, spec.outline)) {
        const along = w.x1 - w.x0 >= w.z1 - w.z0;
        prims.push({ type: "box", centre: { x: (w.x0 + w.x1) / 2, y: spec.level + 0.03 + PARTITION_H / 2, z: (w.z0 + w.z1) / 2 }, size: { x: along ? w.x1 - w.x0 : 0.04, y: PARTITION_H, z: along ? 0.04 : w.z1 - w.z0 }, material: "glass", tag: `${spec.id}:inside:glazing` });
      }
      // The acoustic partitions the sheet draws dashed, floor to ceiling. Each door in them gets a head over its doorway and a timber leaf, standing open as drawn.
      const acoustic = dxfAcousticPartitions(dxf, spec.id as "floor-2" | "floor-1", spec.outline);
      for (const { seg: [ax, az, bx, bz], thick } of acoustic.walls) {
        prims.push({ type: "box", centre: { x: (ax + bx) / 2, y: spec.level + 0.03 + PARTITION_H / 2, z: (az + bz) / 2 }, size: { x: Math.hypot(bx - ax, bz - az), y: PARTITION_H, z: thick }, rotY: -Math.atan2(bz - az, bx - ax), material: "plaster", tag: `${spec.id}:inside:acoustic` });
      }
      for (const { hinge, open, along } of acoustic.leaves) {
        const head = PARTITION_H - 2.1;
        prims.push({ type: "box", centre: { x: (hinge[0] + along[0]) / 2, y: spec.level + 0.03 + 2.1 + head / 2, z: (hinge[1] + along[1]) / 2 }, size: { x: Math.hypot(along[0] - hinge[0], along[1] - hinge[1]), y: head, z: 0.1 }, rotY: -Math.atan2(along[1] - hinge[1], along[0] - hinge[0]), material: "plaster", tag: `${spec.id}:inside:acoustic` });
        prims.push({ type: "box", centre: { x: (open[0] + hinge[0]) / 2, y: spec.level + 1.05, z: (open[1] + hinge[1]) / 2 }, size: { x: Math.hypot(open[0] - hinge[0], open[1] - hinge[1]), y: 2.05, z: 0.04 }, rotY: -Math.atan2(open[1] - hinge[1], open[0] - hinge[0]), material: "timber", tag: `${spec.id}:door-leaf` });
      }
      for (const [x1, z1, x2, z2] of dxfPartitions(dxf, spec.id as "floor-2" | "floor-1")) {
        const len = Math.hypot(x2 - x1, z2 - z1);
        prims.push({ type: "box", centre: { x: (x1 + x2) / 2, y: spec.level + 0.15 + 1.05, z: (z1 + z2) / 2 }, size: { x: len, y: 2.1, z: 0.04 }, rotY: -Math.atan2(z2 - z1, x2 - x1), material: "plaster", tag: `${spec.id}:inside:partition` });
      }
    }

    // The doors the sheet swings: each leaf stands open where the sheet draws it, a 4 cm timber leaf from its hinge. Picking the open end
    // from the arc alone (the end off the wall's line) was a coin toss on a square door, and a box round the facade dropped the hall's
    // emergency door 30 cm in from it: the leaf drawn decides, and a door is the facade's when its doorway lies on the outline.
    if (dxf) {
      const inner = inset(spec.outline, 0.35);
      for (const { hinge, open, shut } of dxfDoorLeaves(dxf, spec.id as "floor-2" | "floor-1")) {
        if (!insidePolygon(inner, (hinge[0] + shut[0]) / 2, (hinge[1] + shut[1]) / 2)) continue;
        const len = Math.hypot(open[0] - hinge[0], open[1] - hinge[1]);
        prims.push({ type: "box", centre: { x: (open[0] + hinge[0]) / 2, y: spec.level + 1.05, z: (open[1] + hinge[1]) / 2 }, size: { x: len, y: 2.05, z: 0.04 }, rotY: -Math.atan2(open[1] - hinge[1], open[0] - hinge[0]), material: "timber", tag: `${spec.id}:door-leaf` });
      }
      // A worktop the sheet writes its height by: white cabinets under a quartz top, a steel sink let into it where the sheet draws one.
      for (const c of details.counters) {
        const [cx, cz, sx, sz] = [(c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2, c.x1 - c.x0, c.z1 - c.z0];
        prims.push({ type: "box", centre: { x: cx, y: spec.level + (c.height - 0.04) / 2, z: cz }, size: { x: sx - 0.02, y: c.height - 0.04, z: sz - 0.02 }, material: "cabinet", tag: `${spec.id}:inside:counter` });
        prims.push({ type: "box", centre: { x: cx, y: spec.level + c.height - 0.02, z: cz }, size: { x: sx, y: 0.04, z: sz }, material: "quartz", tag: `${spec.id}:inside:counter` });
      }
      // A warning surface in a dark ribbed tile, a locator strip in yellow: laid flush on the finish, a centimetre proud.
      for (const [list, material] of [[details.warnings, "tactile"], [details.locators, "tactileYellow"]] as const) {
        for (const b of list) prims.push({ type: "box", centre: { x: (b.x0 + b.x1) / 2, y: spec.level + 0.035, z: (b.z0 + b.z1) / 2 }, size: { x: b.x1 - b.x0, y: 0.01, z: b.z1 - b.z0 }, material, tag: `${spec.id}:inside:tactile` });
      }
      // The lift's landing door, steel in the shaft's north face: floor −2 draws its gap in the concrete, floor −1 the same shaft closed.
      const liftDoor = liftShafts(dxf, spec.id as "floor-2" | "floor-1").door ?? liftShafts(dxf, "floor-2").door;
      if (liftDoor) {
        const faces = prims.filter((p): p is Extract<Primitive, { type: "box" }> => p.type === "box" && !p.rotY && p.tag === spec.id && p.centre.x - p.size.x / 2 < liftDoor.x0 && p.centre.x + p.size.x / 2 > liftDoor.x1 && Math.abs(p.centre.z - p.size.z / 2 - liftDoor.z) < 0.1);
        const face = Math.min(liftDoor.z, ...faces.map((p) => p.centre.z - p.size.z / 2));
        const w = liftDoor.x1 - liftDoor.x0;
        const mid = (liftDoor.x0 + liftDoor.x1) / 2;
        const tag = `${spec.id}:inside:lift-door`;
        prims.push({ type: "box", centre: { x: mid, y: spec.level + 1.05, z: face - 0.015 }, size: { x: w, y: 2.1, z: 0.03 }, material: "metal", tag });
        // Its two leaves' meeting line and the frame round it.
        prims.push({ type: "box", centre: { x: mid, y: spec.level + 1.05, z: face - 0.032 }, size: { x: 0.012, y: 2.1, z: 0.006 }, material: "frame", tag });
        for (const [x, sx, y, sy] of [[liftDoor.x0 - 0.03, 0.06, 1.1, 2.2], [liftDoor.x1 + 0.03, 0.06, 1.1, 2.2], [mid, w + 0.12, 2.17, 0.06]] as const) {
          prims.push({ type: "box", centre: { x, y: spec.level + y, z: face - 0.02 }, size: { x: sx, y: sy, z: 0.04 }, material: "frame", tag });
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
  // The entrance well (two flights and the landing between them) comes up through this roof. The slab and its paving were one piece across it, so the street saw a single slope running under a beam.
  const wellX0 = 24.25;
  const wellX1 = 30.2;
  // Its north edge is the stair's head as both roof sheets draw it, open to the sky from z 12.60 with the guard's +18.40 at its edge (z 14.2 by eye
  // from the PDF roofed over the top six treads).
  const wellZ = dxfRf?.wellZ ?? 14.2;
  prims.push(slab(biteSouth(inset(roof, 0.06), wellX0, wellX1, wellZ), LEVEL.roof, 0.35, "slab", "roof:slab"));
  const plazaEast = dxfRf?.lift ? dxfRf.lift.x0 - 0.1 : 32.4;
  prims.push(slab(biteSouth(rect(0.88, dxfRf ? roofN + 0.1 : 1.02, plazaEast, 16.58), wellX0, Math.min(wellX1, plazaEast - 0.15), wellZ), LEVEL.roof + 0.03, 0.03, "paving", "roof:plaza"));
  prims.push(slab(dxfRf?.deck ?? rect(33.9, 2.4, 53.62, 19.1), LEVEL.roof + 0.03, 0.03, "asphalt", "roof:parking"));
  const line = (x0: number, z0: number, x1: number, z1: number) =>
    prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: LEVEL.roof + 0.04, z: (z0 + z1) / 2 }, size: { x: Math.max(0.1, x1 - x0), y: 0.01, z: Math.max(0.1, z1 - z0) }, material: "parkingLine", tag: "roof:lines" });
  if (dxfRf) {
    for (const [ax, az, bx, bz] of dxfRf.bayLines) line(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
    // The roof sheet (frame 194453) draws a double TNUA line the roof's whole width, z 2.41 and 2.58 from x 1.16 to 53.45, labelled
    // "אבן שפה" at (39.67, 2.27): a kerb 17 cm wide at the bays' head, keeping the cars a metre off the north parapet.
    prims.push({ type: "box", centre: { x: (1.16 + 53.45) / 2, y: LEVEL.roof + 0.03 + 0.075, z: (2.41 + 2.58) / 2 }, size: { x: 53.45 - 1.16, y: 0.15, z: 0.17 }, material: "concrete", tag: "roof:kerb" });
    // A concrete canopy the sheet names and levels: a slab 20 cm deep to its top. Under it the plaza runs on; it stands on the roof's slab.
    const isLift = (r: Array<[number, number]>) => !!dxfRf.lift && r.every((q) => q[0] >= dxfRf.lift!.x0 - 0.05 && q[0] <= dxfRf.lift!.x1 + 0.05 && q[1] >= dxfRf.lift!.z0 - 0.05 && q[1] <= dxfRf.lift!.z1 + 0.05);
    for (const { ring, top } of dxfRf.canopies.filter((c) => !isLift(c.ring))) prims.push({ type: "prism", ring, y0: LEVEL.roof + 0.03, y1: top, material: "concrete", tag: "roof:canopy" });
    // The accessible bay: a blue square painted on the asphalt with the white wheelchair in it, and its sign on a steel post at the bay's head.
    const { squares, figures, signs } = dxfRf.accessible;
    for (const ring of squares) prims.push({ type: "prism", ring, y0: LEVEL.roof + 0.03, y1: LEVEL.roof + 0.042, material: "lineBlue", tag: "roof:lines" });
    for (const ring of figures) prims.push({ type: "prism", ring, y0: LEVEL.roof + 0.042, y1: LEVEL.roof + 0.046, material: "parkingLine", tag: "roof:lines" });
    for (const { post, plate: [ax, az, bx, bz] } of signs) {
      prims.push({ type: "cylinder", centre: { x: post[0], y: LEVEL.roof + 0.03 + 1.1, z: post[1] }, radius: 0.03, height: 2.2, material: "metal", tag: "roof:sign" });
      // The plate faces along the sheet's line, 60 cm wide: the line is drawn longer than a plate is (1.3 m), as a symbol's mark.
      prims.push({ type: "box", centre: { x: post[0], y: LEVEL.roof + 0.03 + 2.0, z: post[1] + 0.03 }, size: { x: 0.6, y: 0.6, z: 0.02 }, rotY: -Math.atan2(bz - az, bx - ax), material: "lineBlue", tag: "roof:sign" });
    }
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
    ...parapet(biteSouth(roof, wellX0, wellX1, wellZ), LEVEL.roof, LEVEL.parapet, 0.3, "stone", "roof:parapet").filter(
      (p) => !(p.type === "box" && Math.abs(p.centre.z - (roofS - 0.15)) < 0.05 && p.size.x > 10),
    ),
  );
  for (const [x0, x1] of [[Math.min(...roof.filter((q) => q[1] === roofS).map((q) => q[0])), 35.1], [41.4, roofX1]] as const) {
    prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: (LEVEL.roof + LEVEL.parapet) / 2, z: roofS - 0.15 }, size: { x: x1 - x0, y: LEVEL.parapet - LEVEL.roof, z: 0.3 }, material: "stone", tag: "roof:parapet" });
  }
  // The north band the sign is on: dark stone from 16.75 to the parapet's top, at the roof's edge.
  const bandZ = dxfRf ? roofN : 1.02;
  prims.push({ type: "box", centre: { x: (roofX0 + roofX1) / 2, y: (16.75 + LEVEL.parapet) / 2, z: bandZ - 0.03 }, size: { x: roofX1 - roofX0 + 0.1, y: LEVEL.parapet - 16.75, z: 0.06 }, material: "stoneDark", tag: "facade:band" });
  // The band frames the north face down both its ends: the facades sheet's north elevation draws an outer and an inner rectangle, 35 cm apart
  // at each end, from +7.79 to the parapet's top. The band stands out from the wall (z 1.02) as far as the roof's edge, so each end's strip is
  // a fin as deep as that — from the band's face back to the wall — and the band is closed under, its soffit dark as well. (A strip along the
  // foot as well, and strips 6 cm thick at the band's face, stood off the wall in the air: the user's marks on aerial-ne, 2026-11-01.)
  if (bandZ < 1.02) {
    const deep = 1.02 - (bandZ - 0.06);
    for (const [x0, x1] of [[roofX0 - 0.05, roofX0 + 0.35], [roofX1 - 0.35, roofX1 + 0.05]] as const) {
      prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: (7.79 + 16.75) / 2, z: bandZ - 0.06 + deep / 2 }, size: { x: x1 - x0, y: 16.75 - 7.79, z: deep }, material: "stoneDark", tag: "facade:band" });
    }
    prims.push({ type: "box", centre: { x: (roofX0 + roofX1) / 2, y: (16.75 + LEVEL.roof) / 2, z: bandZ - 0.06 + deep / 2 }, size: { x: roofX1 - roofX0 + 0.1, y: LEVEL.roof - 16.75, z: deep }, material: "stoneDark", tag: "facade:band" });
  }
  prims.push({ type: "text", text: "מרכז פסגה קרית ארבע", at: { x: (roofX0 + roofX1) / 2, y: 17.58, z: bandZ - 0.07 }, facing: { x: 0, z: -1 }, heightM: 1.0, material: "signage", tag: "facade:sign" });
  // The lift's bulkhead: the upper roof sheet's concrete roof at +19.82 (its "גגון בטון" in the shaft's ring), and round it a 30 cm parapet — the
  // sheet's inner ring — to the elevation's +20.32. Without the sheet, one stone block to +20.32.
  const lift = dxfRf?.lift;
  const liftRoof = dxfRf?.canopies.find((c) => lift && c.ring.every((q) => q[0] >= lift.x0 - 0.05 && q[0] <= lift.x1 + 0.05 && q[1] >= lift.z0 - 0.05 && q[1] <= lift.z1 + 0.05))?.top;
  const bx0 = lift ? lift.x0 : 30.5, bx1 = lift ? lift.x1 : 33.8, bz0 = lift ? lift.z0 : 12.7, bz1 = lift ? lift.z1 : 15.0;
  const bodyTop = liftRoof ?? LEVEL.bulkhead;
  prims.push({ type: "box", centre: { x: (bx0 + bx1) / 2, y: (LEVEL.roof + bodyTop) / 2, z: (bz0 + bz1) / 2 }, size: { x: bx1 - bx0, y: bodyTop - LEVEL.roof, z: bz1 - bz0 }, material: "stone", tag: "roof:bulkhead" });
  if (liftRoof && liftRoof < LEVEL.bulkhead) {
    const t = 0.3, h = LEVEL.bulkhead - liftRoof, y = (liftRoof + LEVEL.bulkhead) / 2;
    for (const [cx, cz, sx, sz] of [[(bx0 + bx1) / 2, bz0 + t / 2, bx1 - bx0, t], [(bx0 + bx1) / 2, bz1 - t / 2, bx1 - bx0, t], [bx0 + t / 2, (bz0 + bz1) / 2, t, bz1 - bz0 - 2 * t], [bx1 - t / 2, (bz0 + bz1) / 2, t, bz1 - bz0 - 2 * t]] as const)
      prims.push({ type: "box", centre: { x: cx, y, z: cz }, size: { x: sx, y: h, z: sz }, material: "stone", tag: "roof:bulkhead" });
  }

  // A raised sill the sheet names ("סף מוגבה", the hall's wheelchair bay): the thin rectangle under its name, 5 cm proud of the floor it
  // stands on (the highest floor surface under it, the hall's tiers included).
  if (dxf) {
    for (const sheet of ["floor-2", "floor-1"] as const) {
      const lines = dxfLayerLines(dxf, sheet, /./);
      for (const n of dxfNotes(dxf, sheet).filter((q) => /סף מוגבה/.test(q.text))) {
        const rects = lines.flatMap((l) => {
          // Closed by its flag or by its last point back on its first (the hall's is an open five-point polyline that comes home).
          const home = l.pts.length >= 4 && Math.hypot(l.pts[0]![0] - l.pts[l.pts.length - 1]![0], l.pts[0]![1] - l.pts[l.pts.length - 1]![1]) < 0.01;
          if (!(l.closed || home) || l.pts.length < 4 || l.pts.length > 5) return [];
          const xs = l.pts.map((p) => p[0]), zs = l.pts.map((p) => p[1]);
          const b = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
          const [w, d] = [b.x1 - b.x0, b.z1 - b.z0];
          if (Math.min(w, d) > 0.15 || Math.max(w, d) < 0.6 || Math.max(w, d) > 3) return [];
          const dist = Math.hypot(Math.max(b.x0 - n.x, 0, n.x - b.x1), Math.max(b.z0 - n.z, 0, n.z - b.z1));
          return dist < 0.3 ? [{ b, dist }] : [];
        });
        const r = rects.sort((p, q) => p.dist - q.dist)[0];
        if (!r) { noteDrop("pisga:raised-sill-without-outline", `${sheet} (${n.x.toFixed(1)}, ${n.z.toFixed(1)})`); continue; }
        const { x0, x1, z0, z1 } = r.b;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const storey = sheet === "floor-1" ? LEVEL.floorMinus1 : LEVEL.floorMinus2;
        const floorTop = Math.max(storey, ...prims.flatMap((p) => {
          if (!(p.tag ?? "").startsWith(sheet) || /:inside:(ceiling|light|furniture)/.test(p.tag ?? "")) return [];
          if (p.type === "box" && !p.rotY && Math.abs(p.centre.x - cx) < p.size.x / 2 && Math.abs(p.centre.z - cz) < p.size.z / 2) { const top = p.centre.y + p.size.y / 2; return top <= storey + 0.05 && top > storey - 3 ? [top] : []; }
          return [];
        }));
        prims.push({ type: "box", centre: { x: cx, y: floorTop + 0.025, z: cz }, size: { x: x1 - x0, y: 0.05, z: z1 - z0 }, material: "stone", tag: `${sheet}:inside:raised-sill` });
      }
    }
  }

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
      const ends: Array<{ z: number; y: number }> = [];
      order.forEach((z, k) => {
        level -= riser;
        const zc = z + (i % 2 === 0 ? depth / 2 : -depth / 2);
        // Each tread a folded steel plate, its riser and 25 cm under the nosing (the stepped stringer of the kindergarten's exit stair): thin
        // plates alone read as steps floating in the air.
        prims.push({ type: "box", centre: { x: (f.x0 + f.x1) / 2, y: level + 0.025 - (riser + 0.25) / 2, z: zc }, size: { x: f.x1 - f.x0, y: riser + 0.25, z: depth }, material: "frame", tag: "site:emergency-stair" });
        // The rail on the open (west) side of each flight: upright bars 13 cm apart, a handrail over them, a post every other step.
        const edge = f.x0 + 0.03;
        for (const dz of [-depth / 4, depth / 4]) prims.push({ type: "box", centre: { x: edge, y: level + 0.5, z: zc + dz }, size: { x: 0.018, y: 0.95, z: 0.018 }, material: "frame", tag: "site:emergency-stair-rail" });
        if (k % 2 === 0) prims.push({ type: "box", centre: { x: edge, y: level + 0.5, z: zc }, size: { x: 0.05, y: 1.0, z: 0.05 }, material: "frame", tag: "site:emergency-stair-rail" });
        if (k === 0 || k === order.length - 1) ends.push({ z: zc, y: level });
      });
      // One handrail down the flight over the bars, and a steel stringer each side under the treads' ends: a level bar over each tread drew a
      // saw (jn-w-top), and the treads alone read as loose blocks.
      const [p, q] = [ends[0]!, ends[ends.length - 1]!];
      const run = Math.sign(q.z - p.z) * depth / 2;
      prims.push(...slopedTopRail([f.x0 + 0.03, p.z - run], [f.x0 + 0.03, q.z + run], p.y + riser, q.y, "site:emergency-stair-rail", 0.99, 0.05));
      for (const x of [f.x0 + 0.03, f.x1 - 0.03]) {
        prims.push({ type: "custom-mesh", stations: [{ x, z: p.z - run, yTop: p.y + 0.05, yFoot: p.y - 0.35 }, { x, z: q.z + run, yTop: q.y + 0.05, yFoot: q.y - 0.35 }], thick: 0.06, material: "frame", tag: "site:emergency-stair" });
      }
    });
    if (flights.length >= 2) {
      const a = flights[0]!;
      const b = flights[1]!;
      const z = Math.max(...a.treads) + 0.26;
      const mid = LEVEL.floorMinus1 - riser * a.treads.length;
      prims.push({ type: "box", centre: { x: (b.x0 + a.x1) / 2, y: mid - 0.1, z: z + 0.3 }, size: { x: a.x1 - b.x0, y: 0.2, z: 0.6 }, material: "frame", tag: "site:emergency-stair" });
      const north = Math.min(...a.treads);
      prims.push({ type: "box", centre: { x: (b.x0 + a.x1) / 2, y: LEVEL.floorMinus1 - 0.1, z: north - 0.6 }, size: { x: a.x1 - b.x0, y: 0.2, z: 1.2 }, material: "frame", tag: "site:emergency-stair" });
      // The landings' free edges railed as the flights: the half landing's far end and outer side, the door's landing's north end and outer
      // side, and its south edge over the lower flight's foot.
      prims.push(
        ...railingPrims([b.x0 + 0.03, z + 0.57], [a.x1, z + 0.57], mid, "site:emergency-stair-rail", 1.0),
        ...railingPrims([b.x0 + 0.03, z], [b.x0 + 0.03, z + 0.57], mid, "site:emergency-stair-rail", 1.0),
        ...railingPrims([b.x0 + 0.03, north - 1.17], [a.x1, north - 1.17], LEVEL.floorMinus1, "site:emergency-stair-rail", 1.0),
        ...railingPrims([b.x0 + 0.03, north - 1.17], [b.x0 + 0.03, north], LEVEL.floorMinus1, "site:emergency-stair-rail", 1.0),
        ...railingPrims([b.x0 + 0.03, north - 0.03], [b.x1, north - 0.03], LEVEL.floorMinus1, "site:emergency-stair-rail", 1.0),
      );
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
  const doorPads = fromDxf ? kindergartenDoorPads(dxf!) : [];
  for (const ring of doorPads) prims.push({ type: "prism", ring, y0: -0.3, y1: 0, material: "paving", tag: "kindergarten:door-pad" });
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
  // The courtyard's south wall, holding the street back with a parapet over it: where the survey draws it (DXF route), else straight along z 21.15.
  const courtyardWall = dxf ? dxfCourtyardWall(dxf) : [];
  if (courtyardWall.length >= 2) {
    const last = courtyardWall[courtyardWall.length - 1]!;
    if (last[0] < 24.15) courtyardWall.push([24.15, last[1] + ((24.15 - last[0]) * (last[1] - courtyardWall[courtyardWall.length - 2]![1])) / (last[0] - courtyardWall[courtyardWall.length - 2]![0] || 1)]);
    for (let i = 1; i < courtyardWall.length; i++) {
      const [ax, az] = courtyardWall[i - 1]!;
      const [bx, bz] = courtyardWall[i]!;
      const len = Math.hypot(bx - ax, bz - az);
      const ang = Math.atan2(bz - az, bx - ax);
      // The line is the wall's outer (street) face: the wall is 35 cm thick to the north of it.
      const nx = Math.sin(ang) * -0.175;
      const nz = Math.cos(ang) * -0.175;
      prims.push({ type: "box", centre: { x: (ax + bx) / 2 + nx, y: (LEVEL.courtyard + LEVEL.street + 1.1) / 2, z: (az + bz) / 2 + nz }, size: { x: len + 0.02, y: LEVEL.street + 1.1 - LEVEL.courtyard, z: 0.35 }, rotY: -ang, material: "stone", tag: "site:retaining" });
    }
  } else prims.push({ type: "box", centre: { x: 11, y: (LEVEL.courtyard + LEVEL.street + 1) / 2, z: 21.15 }, size: { x: 43, y: LEVEL.street + 1 - LEVEL.courtyard, z: 0.5 }, material: "stone", tag: "site:retaining" });
  // South of that wall the ground is the street's, from its street face. The terrain's metre cells, though, would lay a bank of earth up the
  // wall's courtyard face across the cell the wall stands in: for them (`cell`) the street's ground starts a metre out, under the sidewalk.
  const streetEdgeZ = (x: number, cell = false) => {
    for (let i = 1; i < courtyardWall.length; i++) {
      const [ax, az] = courtyardWall[i - 1]!;
      const [bx, bz] = courtyardWall[i]!;
      if (x >= ax && x <= bx) return az + ((bz - az) * (x - ax)) / (bx - ax || 1) + (cell ? 1.0 : 0);
    }
    return 21.45;
  };
  // Trees where the site plan draws them: along the courtyard's retaining
  // wall, and on the plaza by the car park's entrance.
  // The bed along the courtyard's south wall (floor −2's sheet): from the paving's edge, (−7.6, 18.3) → (15.7, 18.5) → (24.15, 19.4), to the wall,
  // raised to the site sheet's +9.27 at (13.4, 20.4) behind a stone kerb; the trees stand in it.
  const BED_LEVEL = 9.27;
  const bedEdgeZ = (x: number) => (x < 15.7 ? 18.3 + ((x + 7.6) * 0.2) / 23.3 : 18.5 + ((x - 15.7) * 0.9) / 8.45);
  const inBed = (x: number, z: number, cell = false) => courtyardWall.length >= 2 && x > -7.6 && x < 24.15 && z > bedEdgeZ(x) && z < streetEdgeZ(x, cell);
  if (courtyardWall.length >= 2) {
    for (const [ax, bx] of [[-7.6, 15.7], [15.7, 24.15]] as const) {
      const az = bedEdgeZ(ax);
      const bz = bedEdgeZ(bx);
      const ang = Math.atan2(bz - az, bx - ax);
      prims.push({ type: "box", centre: { x: (ax + bx) / 2, y: (LEVEL.courtyard + BED_LEVEL + 0.1) / 2, z: (az + bz) / 2 + 0.1 }, size: { x: Math.hypot(bx - ax, bz - az), y: BED_LEVEL + 0.1 - LEVEL.courtyard, z: 0.2 }, rotY: -ang, material: "stone", tag: "site:bed-kerb" });
    }
  }
  // From the PDF the trees stand where its site plan draws them (read by hand); from the DXF the site sheet's own symbols are read, with
  // the shrubs and the west strip's trees the hand list left out (built with the life round the building, once the ground is known).
  if (!dxf) {
    for (const x of [-6.3, -2.2, 2.6, 7.4, 12.1, 16.4, 20.9]) prims.push({ type: "tree", at: { x, y: inBed(x, 19.6) ? BED_LEVEL : LEVEL.courtyard, z: 19.6 }, height: 6.5, crown: 2.4, tag: "tree" });
    for (const [x, z] of [[44.6, 22.6], [52.4, 22.9], [59.2, 23.4]] as const) prims.push({ type: "tree", at: { x, y: LEVEL.street, z }, height: 6, crown: 2.2, tag: "tree" });
  }

  // Cars: most of the roof's bays taken, and the street's bays 13–18.
  const paint = [0xe8e8e6, 0x23262b, 0x8d9299, 0x6d1f23, 0xd5d7d9, 0x2c3e57, 0x5a5d61, 0xf0efe9];
  const upper = [1, 2, 4, 5, 7];
  upper.forEach((bay, i) => prims.push({ type: "car", at: { x: 36.7 + (bay - 1) * 2.43 + 1.215, y: LEVEL.roof + 0.05, z: 5.1 }, rotY: 0, colour: paint[i % paint.length]!, tag: "car" }));
  [1, 3, 4].forEach((bay, i) => prims.push({ type: "car", at: { x: 41.6 + (bay - 1) * 2.42 + 1.21, y: LEVEL.roof + 0.05, z: 15.6 }, rotY: Math.PI, colour: paint[(i + 5) % paint.length]!, tag: "car" }));
  pisgaStreetBays().forEach((b, i) => prims.push({ type: "car", at: { x: b.x, y: LEVEL.street, z: b.z }, rotY: b.rotY, colour: paint[(i + 2) % paint.length]!, tag: "car" }));
  // The hand-set west stair (from the permit booklet) gives way to the one the DXF's tread lines build above, and the hand-set
  // entrance flights to the ones the floor −1 sheet draws.
  const entrance = dxf ? dxfEntrancePrims(dxf, LEVEL.floorMinus1, LEVEL.street) : null;
  const handGone = (tag: string | undefined) => (dxf && tag === "site:west-stair") || (entrance && (tag === "site:entry-stair" || tag === "floor-1:inside:stair"));
  prims.push(...pisgaStreet(LEVEL, dxf), ...pisgaStairs(LEVEL).filter((p) => !handGone(p.tag)), ...(entrance ?? []));
  // The sidewalk starts south of the courtyard wall, so a trench runs along the facade and a grass wedge sits east of the entrance stair.
  if (courtyardWall.length >= 2) prims.push(...entranceGapPaving(courtyardWall, LEVEL.street));
  // Floor −1's south wall is one stone across the entrance opening (x 24.35–30.35, z ≈ 16.3). The flights and their rails were buried in it.
  for (const p of prims) {
    if (p.type !== "box" || p.tag !== "floor-1" || (p.material !== "stone" && p.material !== "plaster")) continue;
    if (!(p.size.z < 0.5 && p.size.x > 2)) continue;
    const x0 = p.centre.x - p.size.x / 2;
    const x1 = p.centre.x + p.size.x / 2;
    const z0 = p.centre.z - p.size.z / 2;
    const z1 = p.centre.z + p.size.z / 2;
    if (z1 < 16.0 || z0 > 16.7 || x1 < 24.35 || x0 > 30.35) continue;
    if (x0 >= 24.35 - 0.05) continue;
    p.size.x = 24.35 - x0;
    p.centre.x = x0 + p.size.x / 2;
  }

  // People, for scale: in the courtyard, on the roof plaza, at the entrance.


  // Ground: the spot heights, and the site's own levels where it is built.
  // Far from the survey's spot heights the ground follows the site's overall
  // fall, a plane fitted to all of them — not their average, which raised a
  // plateau to the street's height north of the building.
  // The survey layers' vertices (dxfSurveyPoints) were tried as spot heights too: they are kerb and boundary lines at the street's +17.9 a metre from the courtyard's +8.2, and the ground rose in a ridge between. The booklet's spots stay the ground's.
  // With the survey, its ground spots (the TIN of them inside their hull, the same weighting outside it) stand in for the booklet's.
  const survey = options?.survey ? readPisgaSurvey(options.survey) : null;
  const tin = survey ? surveyGround(survey) : null;
  const plot = survey ? surveyPlot(survey) : null;
  const sideStairs = survey ? surveyStairs(survey) : [];
  const carve = survey ? surveyStairCarve(survey, sideStairs, PISGA_STAIR_LINKS) : null;
  const terraces = survey && carve ? surveyStairTerraces(survey, sideStairs, carve) : null;
  const street = survey ? surveyStreet(survey, (x, z) => pastSurvey(x, z)) : null;
  // The hand-set street (pisga-site) stands in for the survey's where there is none.
  const hardscapeBed = (x: number, z: number) => (street ? street.surfaceAt(x, z) : pisgaHardscapeBed(x, z));
  const spots: Array<[number, number, number]> = survey ? survey.spots.filter((s) => s.layer !== WALL_SPOT_LAYER).map((s) => [s.x, s.z, s.level + 923.2]) : SPOTS;
  const plane = fitPlane(spots.map(([sx, sz, abs]) => [sx, sz, abs - 923.2] as [number, number, number]));
  // Past the survey's hull the slope goes on: the spots' plane, and their departures from it spread by inverse square distance and fading
  // to nothing 30 m out. Weighted by the fourth power, the nearest spot's level held over a whole strip and stood up as a cliff of earth at
  // the hull's edge (east of the east stair, 9 m at z 22).
  const residuals = spots.map(([sx, sz, abs]) => [sx, sz, abs - 923.2 - (plane[0] + plane[1] * sx + plane[2] * sz)] as const);
  const beyondSurvey = (x: number, z: number) => {
    let w = 1 / 30 ** 2, r = 0;
    for (const [sx, sz, d] of residuals) { const k = 1 / ((x - sx) ** 2 + (z - sz) ** 2 + 1); w += k; r += k * d; }
    return plane[0] + plane[1] * x + plane[2] * z + r / w;
  };
  // Past the spots' hull the ground goes on from the TIN at the nearest point of its edge, changing as the far-field slope does: taken
  // outright, the far field met the TIN with a step of metres and the TIN's edge stood up as a sawn cliff (east of the east stair, x 72–73).
  const spotHull = survey ? hull(spots.map(([sx, sz]) => [sx, sz] as [number, number])) : null;
  const [hcx, hcz] = spotHull ? [spotHull.reduce((t, q) => t + q[0], 0) / spotHull.length, spotHull.reduce((t, q) => t + q[1], 0) / spotHull.length] : [0, 0];
  // The upper road's level past the plot: the street's own level, or the natural ground on its middle line where the hill rises over it.
  // A metre a step, it rises no more than 12 cm a metre (the ground on its line jumps where the survey's edge meets the far field) and is
  // smoothed over 15 m, so it reads as one climb and not a step of earth across it (road-upper-east).
  let upperProfile: number[] | null = null;
  const upperRoad = (x: number) => {
    if (x <= UPPER_ROAD_FROM) return LEVEL.street;
    if (!upperProfile) {
      const raw = Array.from({ length: 220 }, (_, i) => {
        const xi = UPPER_ROAD_FROM + i, zc = pisgaPlotSouthZ(xi) + 6.5;
        return Math.max(LEVEL.street, tin?.(xi, zc) ?? (tin ? pastSurvey(xi, zc) : LEVEL.street));
      });
      raw[0] = LEVEL.street;
      for (let i = 1; i < raw.length; i++) raw[i] = Math.min(raw[i]!, raw[i - 1]! + 0.12);
      upperProfile = raw.map((_, i) => {
        let t = 0, n = 0;
        const r = Math.min(7, i, raw.length - 1 - i);
        for (let k = i - r; k <= i + r; k++) { t += raw[k]!; n++; }
        return Math.max(LEVEL.street, t / n);
      });
      upperProfile[0] = LEVEL.street;
    }
    const f = Math.min(upperProfile.length - 1.001, x - UPPER_ROAD_FROM), i = Math.floor(f);
    return upperProfile[i]! + (upperProfile[i + 1]! - upperProfile[i]!) * (f - i);
  };
  const pastSurvey = (x: number, z: number) => {
    if (!spotHull || !tin) return beyondSurvey(x, z);
    let best: [number, number] = spotHull[0]!, bd = Infinity;
    for (let i = 0; i < spotHull.length; i++) {
      const [q, r] = [spotHull[i]!, spotHull[(i + 1) % spotHull.length]!];
      const l2 = (r[0] - q[0]) ** 2 + (r[1] - q[1]) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((x - q[0]) * (r[0] - q[0]) + (z - q[1]) * (r[1] - q[1])) / l2));
      const p: [number, number] = [q[0] + (r[0] - q[0]) * t, q[1] + (r[1] - q[1]) * t];
      const d = Math.hypot(x - p[0], z - p[1]);
      if (d < bd) { bd = d; best = p; }
    }
    const d = Math.hypot(hcx - best[0], hcz - best[1]) || 1;
    const edge = tin(best[0] + ((hcx - best[0]) / d) * 0.05, best[1] + ((hcz - best[1]) / d) * 0.05);
    return edge == null ? beyondSurvey(x, z) : edge + beyondSurvey(x, z) - beyondSurvey(best[0], best[1]);
  };
  const groundAt = (x: number, z: number, built: boolean, cell = false) => {
    let wsum = 0;
    let hsum = 0;
    for (const [sx, sz, abs] of spots) {
      const d2 = (x - sx) ** 2 + (z - sz) ** 2 + 4;
      const w = 1 / (d2 * d2);
      wsum += w;
      hsum += w * (abs - 923.2);
    }
    const w0 = 1 / 20 ** 4;
    let h = tin?.(x, z) ?? (tin ? pastSurvey(x, z) : (hsum + w0 * (plane[0] + plane[1] * x + plane[2] * z)) / (wsum + w0));
    if (!built) return h;
    // Outside the lot the ground is as surveyed: the side stairs' parcels, the streets, the slopes, linear between the surveyor's spots (a
    // flat band between each two terrace walls found by rays, tried on 2026-10-31, stood up as spikes where the rays found different walls a
    // metre apart; the corridors' beds below are found by a spread that the walls stop instead).
    // The design below is the lot's. Where a side stair's flight or landing lies the ground is cut to the path, 8 cm under its stone.
    // In the side stairs' corridors the ground is their beds, each at its own measured level between the walls.
    const bed = terraces?.(x, z);
    if (bed != null) h = bed;
    const cut = carve?.(x, z);
    if (cut != null) h = Math.min(h, cut - 0.08);
    // Under the surveyed street the ground is its bed, a hand under the asphalt and the paving.
    const paved = street?.surfaceAt(x, z);
    if (paved != null) h = Math.min(h, paved - 0.12);
    // (The kindergarten's walled east yard keeps its floor at ±0.00: the survey's slope filled it to its walls' head, a stone block with no
    // windows.) Past the lot's own width it stays so beyond the survey too: the lot's street rules below (its upper road held at the street's level)
    // once ran on past the survey's edge and stood a flat 17 m terrace over the slope east of the east stair.
    // East of the plot the upper road climbs with the hill it turns into (pisgaUpperRoad): held flat at the street's level it sank into the
    // slope past x 90 and the neighbours' blocks stood over it (aerial-ne, the user's mark, 2026-11-01). Its band is its bed.
    // Six metres either side the ground eases from the road's bed to its own, a bank and not a stepped cliff along the band's edge.
    // (From x 66: the lot's own street rule below stops at x 68, and between the two a metre of the slope stood across the road as a ridge.)
    if (x > UPPER_ROAD_FROM - 4) {
      const pz = pisgaPlotSouthZ(x), off = z < pz - 0.5 ? pz - 0.5 - z : z > pz + 14 ? z - pz - 14 : 0, road = upperRoad(x) - 0.05;
      if (off === 0) return road;
      if (off < 6) { const w = (off / 6) ** 2 * (3 - 2 * (off / 6)); h = road * (1 - w) + h * w; }
    }
    if (plot && !insidePolygon(plot, x, z) && (tin?.(x, z) != null || x < -14 || x > 68) && !(fromDxf && insideKindergartenYard(x, z))) return h;
    if (insidePolygon(rect(-10.5, -10, 64, 36), x, z)) h = Math.min(h, 8.1);
    // The kindergarten stands on its ±0.00: sheet 9 draws its ground at
    // +0.70 to the north and east, and it is dug into the slope beneath the
    // courtyard.
    if (kindergarten.some(([ring]) => insidePolygon(ring, x, z))) h = Math.min(h, -0.2);
    // Round its north and west faces the ground is the level its facades draw (blocks 321-F2 north, 321-F1 west): +0.70 (=923.90) along the
    // west face and the north face to the middle wing (x 24.5), down to ±0.00 at the east end (x 55.7). Two metres out at that level, then the
    // slope over three more (the hand spots had it 1.4–6.4 m up the west wing's windows; wider, it lifted the site sheet's ±0.00 at (26.8, −12) by
    // half a metre). Not past z 7.5, where the west platform stands on the ground.
    else if (fromDxf && x < 53 && z < 7.5) {
      const d = Math.min(...kindergarten.flatMap(([ring]) => ring.map((p, i) => {
        const q = ring[(i + 1) % ring.length]!;
        const l2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((x - p[0]) * (q[0] - p[0]) + (z - p[1]) * (q[1] - p[1])) / l2));
        return Math.hypot(x - p[0] - (q[0] - p[0]) * t, z - p[1] - (q[1] - p[1]) * t);
      })));
      if (d < 5) {
        // Along the north face the yard is at the doors' sill, ±0.00 (photographs 7–8: a level play yard behind the fence, the doors at grade):
        // at +0.70 each door's pad sat in a pit (kg-upper-nw, the user's mark, 2026-11-01). It rises to the fence's foot (+0.7) past 2 m.
        const face = z < -4 && x > -3 ? 0 : x <= 24.5 ? 0.7 : 0.7 * Math.max(0, 55.7 - x) / (55.7 - 24.5);
        const w = d <= 2 ? 1 : 1 - ((d - 2) / 3) ** 2 * (3 - 2 * ((d - 2) / 3));
        h = h * (1 - w) + face * w;
      }
    }
    // Its two emergency stairs and the east service yard keep the ground their drawings give (pisga-kg-exits.ts).
    if (fromDxf) {
      const exit = kindergartenExitsGround(x, z);
      if (exit) h = h * (1 - exit[1]) + exit[0] * exit[1];
      // Its outer doors open onto pads at its floor's level.
      if (doorPads.some((r) => insidePolygon(r, x, z))) h = Math.min(h, -0.04);
    }
    // East of the entrance the plot falls from the street to the east
    // plaza — the accessible ramp's slope.
    // (The site sheet marks +8.27 at (54.6, 14.3): the plaza stays level to z 14.5 and the fall to the street starts there — scripts/verify-pisga-terrain.mts.)
    // Under the accessible ramp's north edge the hill is dug out to the plaza's level, held by a wall (EAST_CUT, built in ramp()): the slope
    // rose against the building's east face (east-corner, the user's mark, 2026-11-01). Level to inside the walls: cut at their faces, the
    // grid's next row rose from the pit's floor to the hill in front of them, a grass hump in the way.
    if (x > 53.92 && x < 66 && z > 12 && z < 24.2) h = x < EAST_CUT.x0 + 0.4 && z < EAST_CUT.z0 + 0.4 ? 8.27 : eastPlazaFall(z);
    // North of z 12 to the plaza's railing too (its wall at z 7.97–8.55), short of the stair down to the yard at x 61.8.
    else if (x > 53.92 && x < 61.8 && z > 8.3 && z <= 12) h = 8.27;
    // (East of x 50, between the sidewalk's curved wall and the east stair's head, the walk leaves this ground bare, and at 60 cm under the
    // street it stood as pits beside the paving: there it is the street's level.)
    if (z > streetEdgeZ(x, cell) && !(x > 46 && x < 66 && z < 24.2)) h = Math.max(h, LEVEL.street - (x > 50 ? 0.1 : 0.6));
    // The bowl between the sidewalk's curved wall and the east stair's top flight (x 54–64.5, z 24.5–30.5) is the street's level too.
    if (x > 54 && x < 64.5 && z > 24.5 && z < 30.5) h = Math.max(h, LEVEL.street - 0.1);
    if (inBed(x, z, cell)) h = BED_LEVEL;
    // Under the street's own band (plot line out to 13.5 m) the ground is the road's bed, not a mound the spot heights lift into it.
    // (East of x 46, 5 cm under the asphalt: where the drawn walk leaves the band bare, beside the east stair's head, the bed stood as a 60 cm pit.)
    { const pz = pisgaPlotSouthZ(x); if (z > pz + 0.45 && z < pz + 13.6) h = LEVEL.street - (x > 46 ? 0.05 : 0.6); }
    return h;
  };
  // Photo context. The low road is a flat terrace; the mesh under it is held down to that terrace so the hill does not rise through the paving.
  const hand = pisgaHandContext((x, z) => groundAt(x, z, true));
  if (street && survey) {
    // The survey's street replaces the hand-set road, its kerbs, walls, fence and cars; the plaza across it (the photographs', which the
    // survey does not reach) moves clear of the surveyed road, raised 60 cm over it with its steps as the photographs show.
    // The hand-set neighbour rows and rock ledges were guesses; the aerial's neighbours stand instead (pisga-neighbours.ts).
    const handStreet = /^site:hand-(lower-road|crossing|retain|curb|front-bars|neighbor|rock)/;
    const plazaTags = /^site:hand-(plaza|palm|lamp)/;
    const from = { x: 24, z: -25.6, y: 0.36 };
    const dx = street.plaza.x - from.x, dz = street.plaza.z - from.z, dy = street.levelAt(street.plaza.x - 5.2, street.plaza.z) + 0.6 - from.y;
    for (const p of hand) {
      if (handStreet.test(p.tag ?? "") || (p.type === "car" && p.tag === "car")) continue;
      if (!plazaTags.test(p.tag ?? "")) { prims.push(p); continue; }
      if (p.type === "box" || p.type === "cylinder") prims.push({ ...p, centre: { x: p.centre.x + dx, y: p.centre.y + dy, z: p.centre.z + dz } });
      else if (p.type === "prism") prims.push({ ...p, ring: p.ring.map(([x, z]) => [x + dx, z + dz] as [number, number]), y0: p.y0 + dy, y1: p.y1 + dy });
      else if (p.type === "plant" || p.type === "tree") prims.push({ ...p, at: { x: p.at.x + dx, y: p.at.y + dy, z: p.at.z + dz } });
      else prims.push(p);
    }
    prims.push(...pisgaNeighbours((x, z) => groundAt(x, z, true)));
    prims.push(...surveyStreetPrims(survey, street, (x, z) => groundAt(x, z, true), (x, z) => [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]].some(([dx, dz]) => carve?.(x + dx!, z + dz!) != null)));
  } else prims.push(...hand);
  // Within a metre behind the road's south edge the drawn ground comes down to the road: a metre grid's cell straddling the edge drew the
  // bank as a slope reaching out over the asphalt, a row of earth teeth in front of the street wall (photo-east-stair). Behind the wall
  // (pisga-survey-street) the slope stays out of sight.
  const behindRoad = (x: number, z: number): number | null => {
    const run = street?.southRun;
    if (!run) return null;
    for (let i = 1; i < run.length; i++) {
      const [a, b] = [run[i - 1]!, run[i]!];
      if (x < Math.min(a[0], b[0]) - 1.1 || x > Math.max(a[0], b[0]) + 1.1) continue;
      const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / l2));
      const [px, pz] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (z > pz - 0.01 && Math.hypot(x - px, z - pz) < 1.05) return street!.levelAt(px, pz) + 0.02;
    }
    return null;
  };
  const cellHeight = (x: number, z: number) => {
    const h = groundAt(x, z, true, true);
    const bed = hardscapeBed(x, z);
    if (bed != null) return h > bed ? bed - 0.06 : h;
    const road = carve?.(x, z) == null ? behindRoad(x, z) : null;
    return road != null && h > road ? road : h;
  };
  // The site itself, a metre a cell; and the hills round it to the horizon, six metres a cell, 0.6 m under the first so the two never meet in a seam.
  // North it reaches z −330, past the road's arm down the valley (to −320): stopping at −80, the arm ran on over the far grid's coarse ground,
  // and where the arm stopped short of a view's edge it ended in the valley's middle (site).
  const fine = { x0: -90, z0: -330, dx: 1, nx: 240, nz: 420 };
  const heights: number[] = [];
  // Where walls stand between metre samples with the ground a storey apart on their two sides, a quarter-metre grid draws the ground instead and
  // the metre grid leaves those cells out: west of the kindergarten, its cross wall at x −9.5 and the long wall at z 4.17. With the survey, the two
  // side stairs too: their terraces are a metre or two deep between walls, and a metre grid smears them into a slope the walls stand proud of.
  // And the pit dug under the ramp east of the building (EAST_CUT): a metre cell from its floor to the hill behind its wall stood as a grass
  // ramp in front of the wall (east-corner, 2026-11-01).
  const detail = survey ? [{ x0: -26, z0: -8, x1: -2, z1: 27 }, { x0: 56, z0: -5, x1: 82, z1: 33 }, { x0: 53, z0: 13, x1: 56, z1: 19 }] : [{ x0: -16, z0: -6, x1: -2, z1: 12 }];
  for (let j = 0; j < fine.nz; j++) for (let i = 0; i < fine.nx; i++) heights.push(cellHeight(fine.x0 + i * fine.dx, fine.z0 + j * fine.dx));
  prims.push({ type: "terrain", x0: fine.x0, z0: fine.z0, dx: fine.dx, nx: fine.nx, nz: fine.nz, heights, material: "hillside", tag: "site:ground", holes: detail });
  for (const d of detail) {
    const dx = 0.1, nx = Math.round((d.x1 - d.x0) / dx) + 1, nz = Math.round((d.z1 - d.z0) / dx) + 1;
    const patch: number[] = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) patch.push(cellHeight(d.x0 + i * dx, d.z0 + j * dx));
    // In the side stairs' corridors, no ridge of earth narrower than a metre and a quarter: between a wall and a parapet the beds' grid left
    // strips a cell or two wide at the higher side's level, and they stood as teeth of earth in front of the stone (the user's mark,
    // 2026-11-01). An opening (the lowest within two cells, then the highest of those) takes them down and keeps every wider terrace and step.
    if (terraces) {
      const r = Math.round(0.5 / dx);
      const pass = (src: number[], pick: (a: number, b: number) => number) => src.map((_, k) => {
        const i = k % nx, j = Math.floor(k / nx);
        let v = src[k]!;
        for (let b = Math.max(0, j - r); b <= Math.min(nz - 1, j + r); b++) for (let a = Math.max(0, i - r); a <= Math.min(nx - 1, i + r); a++) v = pick(v, src[b * nx + a]!);
        return v;
      });
      const opened = pass(pass(patch, Math.min), Math.max);
      for (let k = 0; k < patch.length; k++) {
        const x = d.x0 + (k % nx) * dx, z = d.z0 + Math.floor(k / nx) * dx;
        if (terraces(x, z) != null && carve?.(x, z) == null) patch[k] = opened[k]!;
      }
    }
    prims.push({ type: "terrain", x0: d.x0, z0: d.z0, dx, nx, nz, heights: patch, material: "hillside", tag: "site:ground" });
  }
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
      // Well inside the fine grid the far one sinks out of sight. Within a cell of the fine grid's edge it stays at the ground, under the lowest
      // ground about it so it does not poke through: sunk there too, every far cell across the edge fell metres from the fine ground's rim and
      // the site stood on a cliff at the world's edge, the road's arm running out over it (site).
      const [fx1, fz1] = [fine.x0 + fine.nx * fine.dx, fine.z0 + fine.nz * fine.dx];
      const inside = Math.min(x - fine.x0, fx1 - x, z - fine.z0, fz1 - z);
      if (inside > far.dx) farHeights.push(groundAt(x, z, false) - 8);
      else if (inside > -far.dx) farHeights.push(Math.min(...[-1, 0, 1].flatMap((a) => [-1, 0, 1].map((b) => groundAt(x + a * far.dx, z + b * far.dx, false)))) - 0.6);
      else farHeights.push(groundAt(x, z, false) - 0.6);
    }
  }
  prims.push({ type: "terrain", x0: far.x0, z0: far.z0, dx: far.dx, nx: far.nx, nz: far.nz, heights: farHeights, material: "hillside", tag: "site:ground-far" });
  // The upper road's slabs past UPPER_ROAD_FROM climb with it: each is cut there, its east part laid on the road's level as a drape at the
  // slab's own height over the asphalt.
  for (let i = prims.length - 1; i >= 0; i--) {
    const p = prims[i]!;
    if (p.type !== "prism" || !/^site:(street|sidewalk|sidewalk-far|kerb)$/.test(p.tag ?? "") || Math.max(...p.ring.map((q) => q[0])) <= UPPER_ROAD_FROM) continue;
    const west = clipRingX(p.ring, UPPER_ROAD_FROM, false), east = clipRingX(p.ring, UPPER_ROAD_FROM, true);
    const xs = east.map((q) => q[0]), zs = east.map((q) => q[1]);
    const [gx0, gz0] = [Math.floor(Math.min(...xs)) - 1, Math.floor(Math.min(...zs)) - 1];
    const [gnx, gnz] = [Math.ceil(Math.max(...xs)) + 2 - gx0, Math.ceil(Math.max(...zs)) + 2 - gz0];
    const heights: number[] = [];
    for (let j = 0; j < gnz; j++) for (let k = 0; k < gnx; k++) heights.push(upperRoad(gx0 + k));
    const parts: Primitive[] = [];
    if (west.length >= 3) parts.push({ ...p, ring: west });
    if (east.length >= 3) parts.push({ type: "drape", ring: east, grid: { x0: gx0, z0: gz0, dx: 1, nx: gnx, nz: gnz, heights }, lift: p.y1 - LEVEL.street, material: p.material, tag: p.tag });
    prims.splice(i, 1, ...parts);
  }

  // The covered ramp is a corridor on the street's level; where the ground falls away under it (the east slope) it stands on piers, one every four metres, not on air.
  {
    const slab = prims.flatMap((q) => (q.type === "custom-mesh" && q.tag === "site:ramp" && q.material === "paving" ? q.stations.slice(0, -1) : []));
    slab.forEach((q, i) => {
      if (i % 8 !== 4) return;
      const bottom = q.yFoot;
      const base = groundAt(q.x, q.z, true) - 0.4;
      if (bottom - base < 0.6) return;
      prims.push({ type: "box", centre: { x: q.x, y: (bottom + base) / 2, z: q.z }, size: { x: 0.35, y: bottom - base, z: 0.35 }, material: "concrete", tag: "site:ramp-pier" });
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
      })
      // The paving's ring runs out east past the A4-40 stair along a band (z 11–13, to x 66) that floor −1's sheet shows is the north wall of
      // the tilted structure marked +13.33, not paving: built flat at the platform's level it hung 2.5 m over the slope with a railing round it.
      .map((sf) => (sf.ring.length > 20 && sf.ring.some(([x, z]) => x > 65.5 && z > 11 && z < 13.5) ? { ...sf, ring: sf.ring.filter(([x, z]) => !(x > 62.5 && z > 10.5 && z < 14)) } : sf));
    // North of the lobby: the terrace the sheets draw at +8.27 (+931.47), its wall rectangle measured off the DXF's block-wall lines (layer קיר בלוק): the long faces at z −3.64/−3.59 and 0.95
    // (the building's north wall), the west faces at x 22.04/22.09 (to z −2.25 only: the wall is cut, which the model keeps open), the east end at x 32.94. So 10.84 m along the facade and 4.55 m out.
    // The wall is a 0.2 m parapet 1.1 m over the floor. (An earlier reading took the lines at z −8.45 for the same terrace and made it twice as deep.)
    {
      const [nx0, nx1, nz0, nz1] = [22.04, 32.94, -3.64, 1.06];
      const t = 0.2, top = 8.27 + 1.1;
      prims.push({ type: "prism", ring: [[nx0, nz0], [nx1, nz0], [nx1, nz1], [nx0, nz1]], y0: 7.97, y1: 8.27, material: "paving", tag: "site:north-terrace" });
      // The west side's block wall is cut in the DXF from z −2.25 to the building, a 3.9 m drop beside the terrace; it is closed here in the same stone as the other sides (the user's call, 2026-10-21: the rest of the fence is stone).
      for (const [x0, x1, z0, z1] of [[nx0, nx1, nz0, nz0 + t], [nx1 - t, nx1, nz0, nz1], [nx0, nx0 + t, nz0, nz1]] as const) {
        prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: (8.27 + top) / 2, z: (z0 + z1) / 2 }, size: { x: x1 - x0, y: top - 8.27, z: z1 - z0 }, material: "stone", tag: "site:north-parapet" });
      }
    }
    // Under the terrace and round it, on the kindergarten's roof terrace (+4.52): the built mass whose roofs floor −2's sheet draws in its thin view
    // lines (מבט דק), a 35 cm parapet's two lines — x 21.75–33.29 out to z −8.46, and a strip west to x 5.06 from z −2.6 — labelled "גג טכני
    // לא בשימוש" at +931.28 (+8.08), the parapet's head +932.57 (+9.37). It stands 1.1 m out past the kindergarten's north wall (z −7.37), over
    // its door. Without it the terrace floated 3.4 m over the kindergarten's roof (aerial-ne, the user's mark, 2026-11-01).
    // What stands under that roof is the kindergarten's north facade's (block 321-F2, its x read off the ground floor's windows, which it
    // matches to 3 cm: x = (153264 − fx)/100): a stone-faced block over the ground floor's middle wing, x 24.34–30.72 out to its face (z −7.22),
    // with one wide window (x 25.2–29.8, +5.45 … +7.35); west of it a plain wall at the strip's face with two window bands (x 10.26–14.13 and
    // 19.0–21.56, heads +6.6, their feet behind the terrace's parapet); the roof itself a stone band, +7.69 to the parapet's head. The roof's
    // edge reaching out past the block (x 21.75–24.34, 30.72–33.29 and the 1.24 m past its face) is an overhang the kindergarten's plan draws
    // as "קו קצה גג" — open under it, the terrace and the court go on beneath.
    // The site sheet (x 256000–268000 in the DXF, its survey of the existing kindergarten in layers M2200 outer face / M2205 inner face, 35 cm
    // apart; model x = (X − 258571)/100, z = (644749 − Y)/100, which puts its thin-view lines on this ring to the centimetre) draws round it
    // at the kindergarten's roof: the roof terrace "+927.58" (+4.38), x 5.44–18.65 out to z −7.45, walled 35 cm on its free sides and back
    // to z −4.20 between x 18.65 and the block's overhang at 21.75 (the porch below is open there); and north of it the concrete canopy
    // "סוכך בטון" "+927.59", x 10.67–19.74 out to z −9.32, its east side running back to z −4.20 — the dark band of photograph 8 (16.37.48).
    // (A roofed loggia and a wall built out to the block's face, read off the distant photograph, are not there: the user's mark, 2026-11-01.)
    {
      const ring: Array<[number, number]> = [[33.29, 0.95], [33.29, -8.46], [21.75, -8.46], [21.75, -2.6], [5.06, -2.6], [5.06, 0.95]];
      const body: Array<[number, number]> = [[30.72, 0.95], [30.72, -7.22], [24.34, -7.22], [24.34, -2.6], [5.06, -2.6], [5.06, 0.95]];
      const [base, soffit, roof, head, t] = [KINDERGARTEN.terrace, 7.69, 8.08, 9.37, 0.35];
      // The terrace's own walls replace the railing its plan outline gave it here (west of the block's overhang, north of z −2.6).
      const TERRACE_WEST: Array<[number, number]> = [[5.06, -2.6], [5.06, -7.8], [21.75, -7.8], [21.75, -2.6]];
      for (let i = prims.length - 1; i >= 0; i--) {
        const p = prims[i]!;
        const c = p.type === "box" ? p.centre : p.type === "tree" || p.type === "plant" || p.type === "person" ? p.at : null;
        if (!c || c.y < base - 0.3 || c.y > head) continue;
        const walled = insidePolygon(body, c.x, c.z) && (p.type !== "box" || /^kindergarten:railing/.test(p.tag ?? ""));
        if (walled || (p.type === "box" && /^kindergarten:railing/.test(p.tag ?? "") && insidePolygon(TERRACE_WEST, c.x, c.z))) prims.splice(i, 1);
      }
      // Its walls: stone to +5.62, glass to +6.17, a rail to +6.22 (321-F2), on the survey's two faces.
      const wall = (x0: number, x1: number, z0: number, z1: number) => {
        const [cx, cz, sx, sz] = [(x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0];
        prims.push({ type: "box", centre: { x: cx, y: (base + 5.62) / 2, z: cz }, size: { x: sx, y: 5.62 - base, z: sz }, material: "existing", tag: "kindergarten:railing" });
        const [gx, gz] = sx > sz ? [sx, 0.02] : [0.02, sz];
        prims.push({ type: "box", centre: { x: cx, y: (5.62 + 6.17) / 2, z: cz }, size: { x: gx, y: 6.17 - 5.62, z: gz }, material: "glass", tag: "kindergarten:railing" });
        prims.push({ type: "box", centre: { x: cx, y: 6.195, z: cz }, size: { x: sx > sz ? sx : 0.05, y: 0.05, z: sx > sz ? 0.05 : sz }, material: "frame", tag: "kindergarten:railing" });
      };
      wall(5.44, 18.65, -7.45, -7.10);
      wall(5.44, 5.79, -7.10, -2.6);
      wall(18.30, 18.65, -7.10, -4.20);
      wall(18.30, 21.75, -4.20, -3.85);
      // (On under the block's overhang to the block, over the porch's open end: a roof survey cannot see it, the plan's outline has it.)
      wall(21.75, 24.34, -4.20, -3.85);
      // The canopy: its slab level with the terrace's floor, 64 cm deep, dark (photograph 8), its 35 cm edge on the survey's lines.
      const canopy: Array<[number, number]> = [[10.67, -7.45], [10.67, -9.32], [19.74, -9.32], [19.74, -4.20], [18.65, -4.20], [18.65, -7.45]];
      prims.push({ type: "prism", ring: canopy, y0: 3.75, y1: 4.39, material: "stoneDark", tag: "site:kg-canopy" });
      for (const [x0, x1, z0, z1] of [[10.67, 19.74, -9.32, -8.97], [10.67, 11.02, -8.97, -7.45], [19.39, 19.74, -8.97, -4.20]] as const)
        prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: 4.49, z: (z0 + z1) / 2 }, size: { x: x1 - x0, y: 0.2, z: z1 - z0 }, material: "stoneDark", tag: "site:kg-canopy" });
      // Photograph 8 close up: over the door under the block's east half a thin dark canopy, 1.2 m out at +2.9, hung on two tie rods from the
      // wall. It hangs on the ground floor's face (z −7.22), which ends at x 30.72 (east of it the face steps back to −4.01): run on to 34.5 as
      // first read, its east end and a rod hung in the air (the user's mark, 2026-11-09).
      prims.push(...hungCanopy([27.9, -7.22], [30.72, -7.22], [0, -1], 1.2, 3.0, "site:kg-door-canopy"));
      prims.push({ type: "prism", ring: body, y0: base, y1: soffit, material: "existing", tag: "site:kg-upper" });
      // The block over the middle wing is faced in stone (its hatch on 321-F2); the strip's wall is the kindergarten's plain one.
      prims.push({ type: "prism", ring: [[30.74, -2.6], [30.74, -7.24], [24.32, -7.24], [24.32, -2.6]], y0: base, y1: soffit, material: "stone", tag: "site:kg-upper" });
      prims.push({ type: "prism", ring, y0: soffit, y1: roof - 0.06, material: "stone", tag: "site:kg-upper-roof" });
      prims.push({ type: "prism", ring, y0: roof - 0.06, y1: roof, material: "concrete", tag: "site:kg-upper-roof" });
      // The windows, on the north faces (outward −z): glass a little proud of the face, a frame round it and its mullions and transom.
      const pane = (x0: number, x1: number, y0: number, y1: number, z: number, mullions: number[], transoms: number[]) => {
        const f = 0.06, zc = z - 0.04;
        prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: zc }, size: { x: x1 - x0, y: y1 - y0, z: 0.03 }, material: "glass", tag: "site:kg-upper-window" });
        for (const x of [x0 + f / 2, ...mullions, x1 - f / 2]) prims.push({ type: "box", centre: { x, y: (y0 + y1) / 2, z: zc - 0.02 }, size: { x: f, y: y1 - y0, z: 0.08 }, material: "frame", tag: "site:kg-upper-window" });
        for (const y of [y0 + f / 2, ...transoms, y1 - f / 2]) prims.push({ type: "box", centre: { x: (x0 + x1) / 2, y, z: zc - 0.02 }, size: { x: x1 - x0, y: f, z: 0.08 }, material: "frame", tag: "site:kg-upper-window" });
      };
      // The block's two windows (photograph 8): a wide one of three lights with a transom (x 25.0–27.5) and a narrow pair at the east (28.8–30.3).
      pane(25.0, 27.5, 5.2, 7.1, -7.24, [25.83, 26.67], [6.55]);
      pane(28.8, 30.3, 5.2, 7.1, -7.24, [29.55], []);
      pane(19.0, 21.56, 5.5, 6.6, -2.6, [20.28], []);
      pane(10.26, 14.13, 5.5, 6.6, -2.6, [11.43, 12.69], []);
      // Two glass doors onto the terrace (photographs 14 and 16): one at its west end, one in the pocket at its east end.
      pane(6.2, 7.8, KINDERGARTEN.terrace, 6.78, -2.6, [7.0], []);
      pane(22.3, 23.9, KINDERGARTEN.terrace, 6.78, -2.6, [23.1], []);
      // The parapet round its outer edge, not along the building's own face (z 0.95).
      for (let i = 0; i < ring.length - 1; i++) {
        const [a, b] = [ring[i]!, ring[i + 1]!], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const [ux, uz] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], [nx, nz] = [-uz, ux];
        // Inward is the side the ring's inside lies on.
        const s = insidePolygon(ring, (a[0] + b[0]) / 2 + nx * 0.5, (a[1] + b[1]) / 2 + nz * 0.5) ? 1 : -1;
        prims.push({ type: "box", centre: { x: (a[0] + b[0]) / 2 + nx * s * (t / 2), y: (roof + head) / 2, z: (a[1] + b[1]) / 2 + nz * s * (t / 2) }, size: { x: len + (i > 0 && i < ring.length - 2 ? t : 0), y: head - roof, z: t }, rotY: -Math.atan2(uz, ux), material: "stone", tag: "site:kg-upper-parapet" });
      }
    }
    // The kerbs and low walls the A4-10 layer draws apart from any hatch: 0.1 m wide, 0.3 m over the ground.
    // But a frame the sheet labels "מצללה RHS" is a pergola of steel sections, its top at the level marked beside the label (+3.20): the lines joined to it
    // (an end within 35 cm of another line), from those within 4 m of the label, are its beams, each 0.1 × 0.15 m, with a post at each corner of its box down to the ground.
    // (Read as kerbs they lay on the slope east of the hall as white frames.)
    let kerbs = dxfKerbLines(dxf, "floor-1", surfaces);
    const notes = dxfNotes(dxf, "floor-1");
    const segDist = (x: number, z: number, [ax, az, bx, bz]: [number, number, number, number]) => {
      const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
      return Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t);
    };
    for (const label of notes.filter((n) => /מצללה/.test(n.text))) {
      const frameLines = kerbs.filter((k) => segDist(label.x, label.z, k) < 4);
      for (let grew = true; grew; ) {
        grew = false;
        for (const k of kerbs) {
          if (frameLines.includes(k)) continue;
          if (frameLines.some((f) => segDist(k[0], k[1], f) < 0.35 || segDist(k[2], k[3], f) < 0.35)) { frameLines.push(k); grew = true; }
        }
      }
      if (frameLines.length < 3) continue;
      kerbs = kerbs.filter((k) => !frameLines.includes(k));
      const xs = frameLines.flatMap((k) => [k[0], k[2]]), zs = frameLines.flatMap((k) => [k[1], k[3]]);
      const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
      const mark = notes.map((n) => ({ n, m: /^\+(\d+\.\d\d)$/.exec(n.text.trim()) })).filter((q) => q.m && Math.hypot(q.n.x - label.x, q.n.z - label.z) < 4).sort((a, b) => Math.hypot(a.n.x - label.x, a.n.z - label.z) - Math.hypot(b.n.x - label.x, b.n.z - label.z))[0];
      const top = mark ? Number(mark.m![1]) : groundAt((x0 + x1) / 2, (z0 + z1) / 2, true) + 2.8;
      // A pergola with a slab under it and one over it stands inside a storey (the kindergarten's block as the model has it, 3 m further north than
      // the sheet draws its face east of x 33): not built, the sheet and the model disagree there.
      const over = prims.filter((p): p is Extract<Primitive, { type: "prism" }> => p.type === "prism" && insidePolygon(p.ring, (x0 + x1) / 2, (z0 + z1) / 2));
      if (over.some((p) => p.y1 <= top && p.y1 > top - 4) && over.some((p) => p.y0 >= top && p.y0 < top + 3)) {
        console.warn(`pergola at ${((x0 + x1) / 2).toFixed(1)},${((z0 + z1) / 2).toFixed(1)} (+${top.toFixed(2)}) falls inside a built mass: not built`);
        continue;
      }
      // What stands on site is a canopy hung on the wall, not a pergola on posts (the user, 2026-11-09): the frame's box gives its plan, and
      // the side of it a wall stands behind (built mass 5–40 cm past the side's middle, a metre under the top) is the one it hangs on.
      const solidAt = (x: number, y: number, z: number) =>
        prims.some((p) => {
          if (p.type === "prism") return y >= p.y0 && y <= p.y1 && insidePolygon(p.ring, x, z);
          if (p.type !== "box" || p.span || !/^(kindergarten|site:kg)/.test(p.tag ?? "")) return false;
          const [c, s] = [Math.cos(p.rotY ?? 0), Math.sin(p.rotY ?? 0)];
          const [dx, dz] = [x - p.centre.x, z - p.centre.z];
          const [lx, lz] = [dx * c - dz * s, dx * s + dz * c];
          return Math.abs(lx) <= p.size.x / 2 && Math.abs(y - p.centre.y) <= p.size.y / 2 && Math.abs(lz) <= p.size.z / 2;
        });
      const sides: Array<{ a: [number, number]; b: [number, number]; out: [number, number]; depth: number }> = [
        { a: [x0, z1], b: [x1, z1], out: [0, -1], depth: z1 - z0 },
        { a: [x0, z0], b: [x1, z0], out: [0, 1], depth: z1 - z0 },
        { a: [x0, z0], b: [x0, z1], out: [1, 0], depth: x1 - x0 },
        { a: [x1, z0], b: [x1, z1], out: [-1, 0], depth: x1 - x0 },
      ];
      const wallSide = sides.find(({ a, b, out }) => [0.05, 0.15, 0.3, 0.4].some((d) => solidAt((a[0] + b[0]) / 2 - out[0] * d, top - 1, (a[1] + b[1]) / 2 - out[1] * d)));
      if (!wallSide) {
        noteDrop("pisga:canopy-without-a-wall", () => `${label.text} at ${((x0 + x1) / 2).toFixed(1)},${((z0 + z1) / 2).toFixed(1)}`);
        continue;
      }
      prims.push(...hungCanopy(wallSide.a, wallSide.b, wallSide.out, wallSide.depth, top, "site:canopy"));
    }
    for (const [ax, az, bx, bz] of kerbs) {
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
      // A mark inside the deck names it, the highest of them: under a grating the sheet marks the ground below too (the east deck's +4.22 on
      // floor −2's sheet beside its +5.73 on all three). Else the nearest mark within 6 m.
      // (On it or within 30 cm of its edge: a mark's anchor often sits on the deck's edge line.)
      const onRing = (x: number, z: number) => insidePolygon(sf.ring, x, z) || sf.ring.some((p, i) => {
        const q = sf.ring[(i + 1) % sf.ring.length]!;
        const l2 = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((x - p[0]) * (q[0] - p[0]) + (z - p[1]) * (q[1] - p[1])) / l2));
        return Math.hypot(x - p[0] - (q[0] - p[0]) * t, z - p[1] - (q[1] - p[1]) * t) < 0.3;
      });
      // Marks strictly inside come first: one on the edge line can name the thing beside it (the east grating's +5.73 is the yard wall's top
      // by the kindergarten's facade; its own +4.22 lies inside).
      const strictly = allSpots.filter((q) => q.level < 12 && insidePolygon(sf.ring, q.x, q.z));
      const inside = strictly.length ? strictly : allSpots.filter((q) => q.level < 12 && onRing(q.x, q.z));
      if (inside.length) return Math.max(...inside.map((q) => q.level));
      return allSpots.filter((q) => Math.hypot(q.x - cx, q.z - cz) < 6 && q.level < 12).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz))[0]?.level;
    };
    // (A plane through the sheet's level marks was tried for the ramps and sent a patch up the wall behind it: the marks name levels of things beside the paving too. Paving lies on the ground until a mark is tied to its own polygon.)
    const flights = (["floor-2", "floor-1", "roof"] as const).flatMap((sheet) => dxfTreadSets(dxf, sheet));
    const nearStair = (x: number, z: number) => flights.some((f) => {
      const [ax, az, bx, bz] = [f.first[0], f.first[1], f.last[0], f.last[1]];
      const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
      return Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t)) < f.width / 2 + 0.1;
    });
    // The east landing and the grated deck below it are raised on fill with the bank behind: every free edge of theirs is railed, drop or not (the user marked them missing, 2026-10-21).
    // (Not the grating over the kindergarten's service yard: walled to +5.62 round it, 1.4 m over the grating — pisga-kg-exits.ts.)
    const eastLanding = (x: number, z: number) => x > 53.8 && x < 67 && z > 3.5 && z < 14.2 && !(x < 65.7 && z < 8.2);
    // An edge a retaining wall or a parapet already guards stands no railing of its own beside it; nor does the bed's, under a metre over the courtyard's paving,
    // nor any hatch's edge inside the bed (the bed's hatch is drawn in pieces whose edges cross it).
    prims.push(...kindergartenExits((x, z) => groundAt(x, z, true)));
    kindergartenExitDoors(prims);
    const guards = prims.filter((p): p is Extract<Primitive, { type: "box" }> => p.type === "box" && /^(site:retaining|roof:parapet|site:bed-kerb)/.test(p.tag ?? ""));
    // (Only a guard reaching the edge's level: the kindergarten's long wall at +5.64 does not guard the grating at +9.15 over it.)
    const nearGuard = (x: number, z: number, level: number) => guards.some((b) => b.centre.y + b.size.y / 2 > level - 0.5 && b.centre.y - b.size.y / 2 < level + 1.2 && Math.abs(x - b.centre.x) < b.size.x / 2 + 0.6 && Math.abs(z - b.centre.z) < b.size.z / 2 + 0.6);
    // What an edge drops to counts the slabs and roofs already built beside it (the kindergarten's roof against the west platform), those up to half a metre over the edge.
    const slabs = prims.filter((p): p is Extract<Primitive, { type: "prism" }> => p.type === "prism");
    const builtTop = (x: number, z: number, level: number) => Math.max(-Infinity, ...slabs.filter((p) => p.y1 <= level + 0.5 && insidePolygon(p.ring, x, z) && !(p.holes ?? []).some((h) => insidePolygon(h, x, z))).map((p) => p.y1));
    // Concrete hatches under the street sidewalk (x 39–62, z 20.8–27.2, top about +16.68) were built as platforms and grew a railing through the paving. That paving is the sidewalk.
    const underStreetWalk = (x: number, z: number, level: number) => level > 16.2 && level < 17.1 && x > 39 && x < 62 && z > 20.8 && z < 27.2;
    // Hatches over a leveled pad take that pad's elevation. Everywhere else they still read groundAt, including the east ramp south of z 14.5.
    const terraceAt = (x: number, z: number) => {
      const bed = hardscapeBed(x, z);
      return bed != null ? bed : groundAt(x, z, true);
    };
    prims.push(...surfacePrims(surfaces, terraceAt, "site:surface", 0.08, deckLevel, (x, z, level) => nearStair(x, z) || nearGuard(x, z, level) || inBed(x, z) || underStreetWalk(x, z, level), eastLanding, builtTop));
    // Under the building east of x 35.5 the kindergarten's terrace runs on, roofed by it, on columns, to a wall at z 7.96 (section B-B; see
    // pisga-kindergarten.ts OPEN_X): the earth is south of that wall only. A platform's fill reaching north of it (the court's, from z 2.58)
    // stood between the columns as a stone wall (east-end, the user's mark, 2026-11-01): it stops at the wall.
    {
      const OPEN = { x0: 35.5, x1: 53.7, back: 7.96 };
      const clipZ = (ring: Array<[number, number]>) => clipRingX(ring.map(([x, z]) => [z, x] as [number, number]), OPEN.back, true).map(([z, x]) => [x, z] as [number, number]);
      for (let i = 0; i < prims.length; i++) {
        const p = prims[i]!;
        if (p.type !== "prism" || !/platform-fill$/.test(p.tag ?? "") || p.y1 < KINDERGARTEN.floor + 0.5) continue;
        const xs = p.ring.map((q) => q[0]);
        if (Math.max(...xs) < OPEN.x0 || Math.min(...xs) > OPEN.x1 || Math.min(...p.ring.map((q) => q[1])) >= OPEN.back) continue;
        const ring = clipZ(p.ring);
        const holes = p.holes?.map(clipZ).filter((h) => h.length >= 3);
        prims[i] = { ...p, ring, holes: holes?.length ? holes : undefined };
      }
    }
    // The hatches the sheets draw under the street itself (x 17–26, z 24–26, the road's own concrete at +17.2 to +17.4) stood through the
    // asphalt of the parking bays as a white patch (road-from-west): the road and its sidewalk are that finish, so the skin sinks under them.
    {
      const streetSlabs = prims.filter((p): p is Extract<Primitive, { type: "prism" }> => p.type === "prism" && (p.tag === "site:street" || p.tag === "site:sidewalk"));
      for (const p of prims) {
        if (p.type !== "terrain" || !/^site:surface:/.test(p.tag ?? "")) continue;
        for (let j = 0; j < p.nz; j++) for (let i = 0; i < p.nx; i++) {
          const k = j * p.nx + i, h = p.heights[k]!, x = p.x0 + i * p.dx, z = p.z0 + j * p.dx;
          const slab = streetSlabs.find((q) => insidePolygon(q.ring, x, z) && h > q.y1 - 1.2 && h < q.y1 + 0.4);
          if (slab) p.heights[k] = Math.min(h, slab.y1 - 0.1);
        }
      }
    }
    kindergartenWestWell(prims);
    kindergartenWestLink(prims, (x, z) => groundAt(x, z, true));
    // Every run of treads the sheets draw, but the stairs built above from their own reading (the lobby's, the entrance's and the west exit's): the same run drawn on two sheets is one.
    // The hall builds its own SE treads, from its floor to the exit's +11.87 (hallFromSheet).
    const builtElsewhere = (x: number, z: number) => (x > -2 && x < 1.2 && z > 10 && z < 17) || (x > 22 && x < 31 && z > 9.5 && z < 23) || inHall(x, z);
    const runs = new Set<string>();
    const placedWarnings = new Set<string>();
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
        // Its head meets the floor it lands on: a platform built within 0.6 m of the mark (the A4-40's +7.80 against the paving at +8.18).
        const len = Math.hypot(use.dir[0], use.dir[1]) || 1;
        const [ux, uz] = [use.dir[0] / len, use.dir[1] / len];
        const head: [number, number] = [use.first[0] - ux * use.pitch, use.first[1] - uz * use.pitch];
        const floorAt = prims.find((p): p is Extract<Primitive, { type: "prism" }> => p.type === "prism" && /^site:surface/.test(p.tag ?? "") && Math.abs(p.y1 - top) < 0.6 && insidePolygon(p.ring, head[0], head[1]));
        if (floorAt) top = floorAt.y1;
        // Its mass goes down to the lowest ground under it: on a falling slope the default (0.4 m under the bottom tread) leaves it hanging. Stone-clad, as the site's walls.
        const under = Array.from({ length: 9 }, (_, k) => groundAt(use.first[0] + ((use.last[0] - use.first[0]) * k) / 8, use.first[1] + ((use.last[1] - use.first[1]) * k) / 8, true));
        const base = Math.min(bottom - 0.4, ...under.map((g) => g - 0.2));
        // The sheets draw the run between two walls (A4-40's double lines): stone, a metre over each tread, or a metre over the paving beside
        // it where that stands higher (the +8.18 platform south of the A4-40) — its parapet, so the paving's edge stands no railing of its own.
        const rise = (top - bottom) / use.n;
        for (const side of [-1, 1]) {
          const [px, pz] = [-uz * side, ux * side];
          for (let k = 0; k < use.n; k++) {
            const t = k / Math.max(1, use.n - 1);
            const [cx, cz] = [use.first[0] + (use.last[0] - use.first[0]) * t, use.first[1] + (use.last[1] - use.first[1]) * t];
            const h = top - k * rise;
            const [ox, oz] = [cx + px * (use.width / 2 + 0.6), cz + pz * (use.width / 2 + 0.6)];
            const beside = prims.find((p): p is Extract<Primitive, { type: "prism" }> => p.type === "prism" && /^site:surface/.test(p.tag ?? "") && !/-fill$/.test(p.tag ?? "") && insidePolygon(p.ring, ox, oz));
            const wallTop = Math.max(h + 1.0, beside ? beside.y1 + 1.0 : groundAt(ox, oz, true) + 0.3);
            prims.push({ type: "box", centre: { x: cx + px * (use.width / 2 + 0.1), y: (wallTop + base) / 2, z: cz + pz * (use.width / 2 + 0.1) }, size: { x: use.pitch + 0.01, y: wallTop - base, z: 0.2 }, rotY: -Math.atan2(uz, ux), material: "stone", tag: "site:retaining-stair" });
          }
        }
        // A warning surface the sheet names at this run's head or foot without drawing it: 60 cm deep across the run, on the landing past its end tread.
        {
          const l = Math.hypot(use.dir[0], use.dir[1]) || 1;
          const [vx, vz] = [use.dir[0] / l, use.dir[1] / l];
          for (const [end, sign, level] of [[use.first, -1, top], [use.last, 1, bottom]] as const) {
            const label = sheet === "roof" ? undefined : dxfFloorDetails(dxf, sheet).warningLabels.find((q) => Math.hypot(q[0] - end[0], q[1] - end[1]) < 2.0);
            if (!label) continue;
            const d = use.pitch / 2 + 0.3;
            prims.push({ type: "box", centre: { x: end[0] + sign * vx * d, y: level + 0.005, z: end[1] + sign * vz * d }, size: { x: 0.6, y: 0.01, z: use.width }, rotY: -Math.atan2(vz, vx), material: "tactile", tag: "site:tactile" });
            placedWarnings.add(`${sheet}|${label[0].toFixed(2)}|${label[1].toFixed(2)}`);
          }
        }
        // Between its walls the handrail is one sloped bar on each wall, 5 cm off it: stairPrims' rail came out as a dotted row of chips up
        // the wall (jn-e-exit).
        prims.push(...stairPrims(use, top, bottom, "site:stair-dxf", "stone", base, true).filter((p) => !(p.tag ?? "").endsWith("-rail")));
        for (const side of [-1, 1]) {
          const off = use.width / 2 - 0.05;
          const [px, pz] = [-uz * side * off, ux * side * off];
          const a: [number, number] = [use.first[0] - ux * use.pitch * 0.5 + px, use.first[1] - uz * use.pitch * 0.5 + pz];
          const b: [number, number] = [use.last[0] + ux * use.pitch * 0.5 + px, use.last[1] + uz * use.pitch * 0.5 + pz];
          prims.push(...slopedTopRail(a, b, top, bottom, "site:stair-dxf-rail", 0.9, 0.045));
        }
        // Its foot lands on a landing ("משטח אחרה" at the A4-40's +5.82) where nothing is laid and the ground lies under it: 1.4 m on, filled to the ground.
        const foot: [number, number] = [use.last[0] + ux * use.pitch * 0.5, use.last[1] + uz * use.pitch * 0.5];
        const far: [number, number] = [foot[0] + ux * 1.4, foot[1] + uz * 1.4];
        const covered = prims.some((p) => p.type === "prism" && /^site:surface/.test(p.tag ?? "") && insidePolygon(p.ring, far[0], far[1]));
        const low = Math.min(groundAt(foot[0], foot[1], true), groundAt(far[0], far[1], true));
        if (!covered && low < bottom - 0.3) {
          const [px, pz] = [-uz * use.width / 2, ux * use.width / 2];
          prims.push({ type: "prism", ring: [[foot[0] + px, foot[1] + pz], [far[0] + px, far[1] + pz], [far[0] - px, far[1] - pz], [foot[0] - px, foot[1] - pz]], y0: low - 0.3, y1: bottom, material: "stone", tag: "site:stair-dxf-landing" });
          prims.push(...railingPrims([foot[0] + px * 0.96, foot[1] + pz * 0.96], [far[0] + px * 0.96, far[1] + pz * 0.96], bottom, "site:stair-dxf-rail"), ...railingPrims([far[0] + px * 0.96, far[1] + pz * 0.96], [far[0] - px * 0.96, far[1] - pz * 0.96], bottom, "site:stair-dxf-rail"));
        }
      }
    }
    // The labels left name no run and the sheet draws no outline for them. Floor −2's six along the platform's south edge come in pairs
    // 1.8–3.0 m apart, along the edge: each pair the two ends of one strip, 60 cm deep, laid on the paving at the nearest level mark's surface
    // (the user left it to judgement, 2026-11-09). A label with no partner is counted.
    for (const sheet of ["floor-2", "floor-1"] as const) {
      const left = dxfFloorDetails(dxf, sheet).warningLabels.filter((q) => !placedWarnings.has(`${sheet}|${q[0].toFixed(2)}|${q[1].toFixed(2)}`)).sort((a, b) => a[0] - b[0]);
      const spots = dxfSpotHeights(dxf, sheet);
      const used = new Set<number>();
      for (let i = 0; i < left.length; i++) {
        if (used.has(i)) continue;
        const p = left[i]!;
        let j = -1, best = 3.2;
        for (let k = i + 1; k < left.length; k++) {
          const d = Math.hypot(left[k]![0] - p[0], left[k]![1] - p[1]);
          if (!used.has(k) && d < best) { best = d; j = k; }
        }
        if (j < 0) {
          noteDrop("pisga:warning-label-alone", () => `${sheet} (${p[0].toFixed(2)}, ${p[1].toFixed(2)})`);
          continue;
        }
        used.add(i).add(j);
        const q = left[j]!;
        const [mx, mz] = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        const mark = [...spots].sort((a, b) => Math.hypot(a.x - mx, a.z - mz) - Math.hypot(b.x - mx, b.z - mz))[0];
        const tops = prims.filter((s): s is Extract<Primitive, { type: "prism" }> => s.type === "prism" && /^site:surface/.test(s.tag ?? "") && !/-fill$/.test(s.tag ?? "") && insidePolygon(s.ring, mx, mz)).map((s) => s.y1);
        const level = tops.length ? tops.sort((a, b) => Math.abs(a - (mark?.level ?? a)) - Math.abs(b - (mark?.level ?? b)))[0]! : groundAt(mx, mz, true);
        prims.push({ type: "box", centre: { x: mx, y: level + 0.005, z: mz }, size: { x: best + 0.6, y: 0.01, z: 0.6 }, rotY: -Math.atan2(q[1] - p[1], q[0] - p[0]), material: "tactile", tag: "site:tactile-pair" });
      }
    }
    // A paving edge's railing beside a stair's side wall that stands as high is the wall's to guard (the walls come after the paving, which
    // needs their levels): its pieces within 0.6 m of a wall reaching over them go.
    const stairWalls = prims.filter((p): p is Extract<Primitive, { type: "box" }> => p.type === "box" && p.tag === "site:retaining-stair");
    // (A top rail is one long bar: most of its length must lie by the walls.)
    const byWall = (p: Primitive) => {
      if (p.type !== "box" || p.tag !== "site:surface-rail") return false;
      const n = Math.max(1, Math.round(p.size.x / 0.3));
      const [cx, sx] = [Math.cos(-(p.rotY ?? 0)), Math.sin(-(p.rotY ?? 0))];
      let near = 0;
      for (let k = 0; k <= n; k++) {
        const d = (k / n - 0.5) * p.size.x;
        const [x, z] = [p.centre.x + cx * d, p.centre.z + sx * d];
        if (stairWalls.some((w) => Math.hypot(x - w.centre.x, z - w.centre.z) < w.size.x / 2 + 0.6 && w.centre.y + w.size.y / 2 >= p.centre.y + p.size.y / 2 - 0.3)) near++;
      }
      return near >= 0.7 * (n + 1);
    };
    for (let i = prims.length - 1; i >= 0; i--) if (byWall(prims[i]!)) prims.splice(i, 1);
  }

  // Life round the building (DXF route): trees along the street's far side and the slopes, shrubs by the colonnade, and people for scale
  // where the sheets show people go — the entrance, the courtyard, the lobby, the hall.
  // The survey's street furniture (lights, covers, signs, the barrier, garden kerbs), each on the surface the model has at its point:
  // the highest site surface over it (pavings, the street's drape, terrain), the building's own slabs left out.
  if (survey) {
    const surfaces = prims.filter((p) => !/^(floor-|roof:|kindergarten:slab)/.test(p.tag ?? "") && (p.type === "terrain" || p.type === "drape" || p.type === "prism"));
    const topAt = (x: number, z: number) => {
      let best = -Infinity;
      for (const p of surfaces) {
        if (p.type === "terrain") {
          const i = Math.round((x - p.x0) / p.dx), j = Math.round((z - p.z0) / p.dx);
          if (i >= 0 && j >= 0 && i < p.nx && j < p.nz) best = Math.max(best, p.heights[j * p.nx + i]!);
        } else if (p.type === "drape") {
          if (!insidePolygon(p.ring, x, z) || p.holes?.some((h) => insidePolygon(h, x, z))) continue;
          const g = p.grid, i = Math.round((x - g.x0) / g.dx), j = Math.round((z - g.z0) / g.dx);
          if (i >= 0 && j >= 0 && i < g.nx && j < g.nz) best = Math.max(best, g.heights[j * g.nx + i]! + p.lift);
        } else if (p.type === "prism" && insidePolygon(p.ring, x, z)) best = Math.max(best, p.y1);
      }
      return Number.isFinite(best) ? best : groundAt(x, z, true);
    };
    prims.push(...surveyFurniturePrims(survey, topAt));
  }
  if (dxf) {
    // The planting the site sheet draws: trees in the courtyard's bed, on the west strip and along the south street; shrubs between.
    for (const pl of dxfSitePlants(dxf)) {
      const y = inBed(pl.x, pl.z) ? BED_LEVEL : groundAt(pl.x, pl.z, true);
      prims.push(pl.kind === "tree"
        ? { type: "tree", at: { x: pl.x, y, z: pl.z }, height: pl.z > 21 && pl.x > 35 ? 6 : 6.5, crown: pl.z > 21 && pl.x > 35 ? 2.2 : 2.4, tag: "tree" }
        : { type: "tree", kind: "scrub", at: { x: pl.x, y: y - 0.05, z: pl.z }, height: 1.2, crown: pl.size, tag: "site:plan-shrub" });
    }
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let x = -60; x < 130; x += 7 + rnd() * 4) { const z = 38 + (x > 20 ? (x - 20) * 0.28 : 0) + rnd() * 3; if (z < 30) continue; prims.push({ type: "tree", at: { x, y: groundAt(x, z, true), z }, height: 5 + rnd() * 2.5, crown: 1.8 + rnd(), tag: "tree" }); }
    // Only on the flanks: in front of the north face a tree hides the building, and one in a window ruins the lobby.
    // The open hillside round the site as its photographs show it: dense dark scrub in clumps over dry grass, an olive here and there; none
    // in the lot (the design's), on a road, its sidewalk or the south street's band, nor on a side stair.
    const plotRing = survey ? surveyPlot(survey) : null;
    const clump = (x: number, z: number) => Math.sin(x * 0.21 + 1.3) * Math.sin(z * 0.17 + 0.4) + 0.6 * Math.sin(x * 0.07 - z * 0.11);
    for (let gx = -75; gx < 125; gx += 2.6) {
      for (let gz = -45; gz < 45; gz += 2.6) {
        const x = gx + rnd() * 2, z = gz + rnd() * 2;
        if (plotRing ? insidePolygon(plotRing, x, z) : x > -12 && x < 71) continue;
        if (hardscapeBed(x, z) != null || (carve && [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].some(([dx, dz]) => carve(x + dx!, z + dz!) != null))) continue;
        // Nor on the surveyed road or its north arm, a crown's width clear of their edges.
        if (street && [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]].some(([dx, dz]) => insidePolygon(street.road, x + dx!, z + dz!) || insidePolygon(street.arm, x + dx!, z + dz!))) continue;
        const pz = pisgaPlotSouthZ(x);
        if (z > pz - 1 && z < pz + 14) continue;
        if (clump(x, z) < 0.15 - rnd() * 0.5) continue;
        const olive = rnd() < 0.08;
        prims.push(olive
          ? { type: "tree", kind: "olive", at: { x, y: groundAt(x, z, true), z }, height: 3.6 + rnd() * 1.4, crown: 1.8 + rnd() * 0.6, tag: "tree" }
          : { type: "tree", kind: "scrub", at: { x, y: groundAt(x, z, true) - 0.1, z }, height: 0.9 + rnd() * 1.3, crown: 0.9 + rnd() * 0.8, tag: "tree" });
      }
    }
    const people: Array<[number, number, number, number]> = [[27.4, 18.5, LEVEL.courtyard, 1.72], [29.5, 17.6, LEVEL.courtyard, 1.66], [14, 15.4, LEVEL.courtyard, 1.75], [36, 22.3, LEVEL.street, 1.7], [38.2, 21.8, LEVEL.street, 1.62], [30, 8.2, LEVEL.floorMinus1, 1.7], [33, 6.9, LEVEL.floorMinus1, 1.64], [48, 12, LEVEL.floorMinus1, 1.7], [46.5, 12.4, LEVEL.floorMinus1, 1.6], [24, 9.5, LEVEL.floorMinus2, 1.7], [38, 9, LEVEL.floorMinus2, 1.68]];
    const shirts = [0x3d5a80, 0xb5543c, 0x5b7f5f, 0xd8c9a0, 0x6d4c7d, 0x2f2f33];
    people.forEach(([x, z, y, h], i) => prims.push({ type: "person", at: { x, y, z }, rotY: rnd() * 6.28, colour: shirts[i % shirts.length]!, height: h, tag: "person" }));
    // Olive trees on the slopes just past the plot's two ends, as round the site in its photographs (olive terraces west and south): low,
    // wide crowns, clear of the kindergarten's paths (west to x −15, east from x 71).
    let olive = 31;
    const orand = () => ((olive = (olive * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let k = 0; k < 16; k++) {
      const east = k % 2 === 1;
      const x = east ? 71.5 + orand() * 7 : -16 - orand() * 7;
      const z = -16 + orand() * 22;
      if (hardscapeBed(x, z) != null || hardscapeBed(x + 2, z) != null || hardscapeBed(x - 2, z) != null || hardscapeBed(x, z + 2) != null || hardscapeBed(x, z - 2) != null) continue;
      prims.push({ type: "tree", kind: "olive", at: { x, y: groundAt(x, z, true), z }, height: 3.4 + orand() * 1.2, crown: 1.7 + orand() * 0.5, tag: "tree" });
    }
    // Whatever placed it (the hand site's olive row north of the street included), no tree stands on the surveyed road or its north arm.
    if (street) {
      const onRoad = (x: number, z: number) => insidePolygon(street.road, x, z) || insidePolygon(street.arm, x, z);
      for (let i = prims.length - 1; i >= 0; i--) {
        const p = prims[i]!;
        if (p.type === "tree" && p.tag === "tree" && [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]].some(([dx, dz]) => onRoad(p.at.x + dx!, p.at.z + dz!))) prims.splice(i, 1);
      }
    }
  }

  // With the survey, both side stairs are its own (pisga-survey-stairs.ts): the hand-set ones and the kindergarten's west link and exit
  // flights that stood in for the west stair (x < −9) go.
  if (survey) {
    // The west exit's six treads up from the walkway's end (x −9.3 to −10.8) stay: they climb to the stair's landing at +5.66 through the
    // link below. Its flight down north and its head path's guards are the survey's flight and walls.
    const handStair = /^site:(stair-hand-(east|west)|stair-cheek-east|hand-cheek-(east|west))/;
    const westLink = /^site:(stair-kg-link|retaining-link|stair-kg-exit|kg-exit-path|kg-exit-landing|kg-exit-post|retaining-kg)/;
    const centre = (p: Primitive): [number, number] | null => p.type === "box" ? [p.centre.x, p.centre.z] : p.type === "prism" ? [p.ring.reduce((t, q) => t + q[0], 0) / p.ring.length, p.ring.reduce((t, q) => t + q[1], 0) / p.ring.length] : p.type === "custom-mesh" ? [p.stations[0]!.x, p.stations[0]!.z] : null;
    for (let i = prims.length - 1; i >= 0; i--) {
      const p = prims[i]!, c = centre(p), tag = p.tag ?? "";
      if (!c) continue;
      const keepSix = /^site:stair-kg-exit/.test(tag) && c[0] > -11;
      const westOf = /^site:retaining-kg/.test(tag) ? c[0] < -11.5 : c[0] < -9;
      if (handStair.test(tag) || (westLink.test(tag) && westOf && !keepSix) || PISGA_LINK_CLEAR.some((r) => insidePolygon(r, c[0], c[1]))) prims.splice(i, 1);
    }
    // The ramp's foot: the paving hatch under it draped a skin of paving up the slope beside the emergency exit's landing (x 61.25–64.5,
    // z 18–20.75, 4 m of fall), the white block hanging off the ramp's end in jn-e-ramp (the user's mark, 2026-11-01). The ramp and the landing are the floor there.
    for (let i = prims.length - 1; i >= 0; i--) {
      const p = prims[i]!;
      if (p.type === "terrain" && p.tag === "site:surface:paving" && p.x0 > 61 && p.x0 < 62 && p.z0 > 17.5 && p.z0 < 18.5 && Math.max(...p.heights) - Math.min(...p.heights) > 3) prims.splice(i, 1);
    }
    // The ramp's last stretch (x 56.1 to the landing at 64.4) runs along the hill with earth rising on its south side to 1.5 m over the slab, so
    // its glass rail stood buried in the slope and the slab hung over the fall on the other side as a wedge with nothing under it (jn-e-ramp,
    // the user's mark, 2026-11-01). There the rail goes; a stone fill carries the slab down to the ground, a stone wall holds the earth on
    // the south side (a metre over the slab at least) and a low stone cheek closes the north side, so the ramp reads as cut into the slope
    // and meets the landing as one piece.
    {
      const [sx, sz, sy] = [56.1, 17.13, 11.8], [ex, ez, ey] = [63.65, 19.55, 12.3];
      const L = Math.hypot(ex - sx, ez - sz), [ux, uz] = [(ex - sx) / L, (ez - sz) / L], [nx, nz] = [-uz, ux], rot = -Math.atan2(uz, ux);
      for (let i = prims.length - 1; i >= 0; i--) {
        const p = prims[i]!;
        if (p.tag === "site:ramp" && p.type === "box" && (p.material === "glass" || p.material === "metal") && p.centre.x >= 57) prims.splice(i, 1);
        // The paving hatch's own edge rail ran 17 cm beside the cheek's guard, two rails side by side (jn-e-ramp10, the fence check).
        else if (p.tag === "site:surface-rail" && p.type === "box") {
          const [rx, rz] = [p.centre.x - sx, p.centre.z - sz], along = rx * ux + rz * uz, across = rx * nx + rz * nz;
          if (along > -0.5 && along < L + 1.5 && Math.abs(across) < 1.4) prims.splice(i, 1);
        }
      }
      const stretch = L + 0.75, step = 0.25;
      // The survey stair's green rail starts at (64.72, 19.63), 65 cm in from the cheek's line and 33 cm on along it. The cheek runs on past
      // the slab, along the landing's north edge, to that rail's line and turns there to meet it: one guard from the ramp to the stairs, on the
      // landing's edge and so clear of the way on (a block standing on the landing, and then a rail ending in the air short of the green one
      // as a gate of two posts, were the user's marks, 2026-11-01).
      const green: [number, number] = [64.72, 19.63], [cnx, cnz] = [sx - nx * 0.9, sz - nz * 0.9];
      const turn = (green[0] - cnx) * ux + (green[1] - cnz) * uz, back = (green[0] - cnx) * nx + (green[1] - cnz) * nz;
      const corner: [number, number] = [cnx + ux * turn, cnz + uz * turn];
      const slabTop = (s: number) => (s <= L ? sy + ((ey - sy) * Math.max(0, s)) / L : ey);
      const foot = (x: number, z: number, s: number) => Math.min(groundAt(x, z, true) - 0.3, slabTop(s) - 0.6);
      for (let s = 0; s < stretch - 1e-6; s += step) {
        const len = Math.min(step, stretch - s), mid = s + len / 2;
        const [cx, cz] = [sx + ux * mid, sz + uz * mid];
        const bottom = slabTop(mid) - 0.3;
        const low = Math.min(groundAt(cx, cz, true), groundAt(cx + nx * 0.75, cz + nz * 0.75, true), groundAt(cx - nx * 0.75, cz - nz * 0.75, true)) - 0.3;
        // Between the walls, not flush with their outer faces: there the two fought as a row of teeth (east-side).
        if (low < bottom - 0.02) prims.push({ type: "box", centre: { x: cx, y: (low + bottom) / 2, z: cz }, size: { x: len + 0.02, y: bottom - low, z: 1.8 }, rotY: rot, material: "stone", tag: "site:ramp-wall" });
      }
      // The walls are each one piece with a straight top, not a box per 25 cm (their tops stepped like a saw, jn-e-ramp9). The south wall
      // holds the earth: a metre over the slab and 25 cm over the ground behind it, its top the upper hull of that need so it runs in straight
      // lines. It stops where the slab does, short of the stairs. The north cheek stands 45 cm over the floor.
      const stations = (from: number, to: number): number[] => {
        const n = Math.max(1, Math.round((to - from) / step));
        return Array.from({ length: n + 1 }, (_, k) => from + ((to - from) * k) / n);
      };
      {
        const pts = stations(0, L).map((s) => {
          const [x, z] = [sx + ux * s + nx * 0.9, sz + uz * s + nz * 0.9];
          return { s, x, z, need: Math.max(slabTop(s) + 1.05, groundAt(sx + ux * s + nx, sz + uz * s + nz, true) + 0.25), yFoot: foot(x, z, s) };
        });
        const hull: typeof pts = [];
        for (const p of pts) {
          while (hull.length >= 2) {
            const [o, q] = [hull[hull.length - 2]!, hull[hull.length - 1]!];
            if ((q.s - o.s) * (p.need - o.need) - (q.need - o.need) * (p.s - o.s) >= 0) hull.pop();
            else break;
          }
          hull.push(p);
        }
        const topAt = (s: number) => {
          for (let i = 1; i < hull.length; i++) if (s <= hull[i]!.s + 1e-9) { const [o, q] = [hull[i - 1]!, hull[i]!]; return o.need + ((q.need - o.need) * (s - o.s)) / (q.s - o.s || 1); }
          return hull[hull.length - 1]!.need;
        };
        // Its end turns 20 cm into the up-flight's west wall, which starts there (63.41, 20.60): a slot between the two read as a pier.
        const last = pts[pts.length - 1]!, joint = { x: 63.41, z: 20.6, yTop: topAt(L), yFoot: last.yFoot };
        prims.push({ type: "custom-mesh", stations: [...pts.map((p) => ({ x: p.x, z: p.z, yTop: topAt(p.s), yFoot: p.yFoot })), joint], thick: 0.3, material: "stone", tag: "site:ramp-wall" });
      }
      {
        const run = stations(0, turn + 0.15).map((s) => {
          const [x, z] = [cnx + ux * s, cnz + uz * s];
          return { x, z, yTop: slabTop(s) + 0.45, yFoot: foot(x, z, s) };
        });
        prims.push({ type: "custom-mesh", stations: run, thick: 0.3, material: "stone", tag: "site:ramp-wall" });
        const ret = stations(0.15, back).map((d) => {
          const [x, z] = [corner[0] + nx * d, corner[1] + nz * d];
          return { x, z, yTop: ey + 0.45, yFoot: foot(x, z, L) };
        });
        prims.push({ type: "custom-mesh", stations: ret, thick: 0.3, material: "stone", tag: "site:ramp-wall" });
      }
      // One guard on the cheek, a rail 65 cm over its top and bars every 12 cm, slim posts at the corners and every 2 m: sloped up the ramp,
      // level along the landing's edge, and turned in to end at the green rail's first post (the user's mark, 2026-11-01: "one long fence,
      // aesthetic", "in one straight line with the ramp's and the stairs'").
      {
        // Bars 58 cm over the cheek put the rail's top at the green rail's, 13.38, where the two meet (a 7 cm jog there otherwise).
        const rail = "site:stair-ramp-rail", y0 = sy + 0.45, y1 = ey + 0.45, bar = 0.58;
        const line: Array<[number, number, number]> = [[cnx + ux * 0.2, cnz + uz * 0.2, y0], [cnx + ux * L, cnz + uz * L, y1], [corner[0], corner[1], y1], [corner[0] + nx * (back - 0.06), corner[1] + nz * (back - 0.06), y1]];
        let count = 0;
        for (let i = 1; i < line.length; i++) {
          const [a, b] = [line[i - 1]!, line[i]!], len = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(len / 0.12));
          prims.push(...slopedTopRail([a[0], a[1]], [b[0], b[1]], a[2], b[2], rail, bar, 0.05));
          for (let k = i === 1 ? 0 : 1; k <= n; k++, count++) {
            const t = k / n, post = (k === 0 && i === 1) || k === n || count % 17 === 0, y = a[2] + (b[2] - a[2]) * t;
            prims.push({ type: "box", centre: { x: a[0] + (b[0] - a[0]) * t, y: y + bar / 2, z: a[1] + (b[1] - a[1]) * t }, size: { x: post ? 0.04 : 0.018, y: bar, z: post ? 0.04 : 0.018 }, material: "frame", tag: rail });
          }
        }
      }
      // The opening under the ramp's landing (the survey's second emergency exit, 63.7–66.4 × 19.4–21.5): the landing's prism stands 60 cm thick
      // on nothing, a slot through to the street's far side. Closed in stone down to the ground, the user's call (2026-11-01).
      {
        const g = Math.min(groundAt(64.2, 19.4, true), groundAt(66.3, 19.4, true), groundAt(64.2, 21.5, true), groundAt(66.3, 21.5, true)) - 0.4;
        prims.push({ type: "prism", ring: [[63.72, 19.36], [66.38, 19.36], [66.38, 21.54], [63.72, 21.54]], y0: g, y1: 11.72, material: "stone", tag: "site:ramp-wall" });
        const g2 = Math.min(groundAt(63.0, 18.4, true), groundAt(64.7, 18.4, true), groundAt(63.0, 20.7, true), groundAt(64.7, 20.7, true)) - 0.4;
        prims.push({ type: "prism", ring: [[62.9, 18.3], [64.7, 18.3], [64.7, 20.7], [62.9, 20.7]], y0: g2, y1: 11.65, material: "stone", tag: "site:ramp-wall" });
      }
      // The hill is cut away for it: the earth between the walls, from the slab's underside down, so nothing of the slope stands on the floor
      // or leans over the cheek (the user's mark, 2026-11-01: "to cut into the mountain").
      for (const t of prims) {
        if (t.type !== "terrain" || t.tag !== "site:ground" || t.dx > 0.25) continue;
        for (let k = 0; k < t.heights.length; k++) {
          const [x, z] = [t.x0 + (k % t.nx) * t.dx, t.z0 + Math.floor(k / t.nx) * t.dx];
          const [rx, rz] = [x - sx, z - sz], along = rx * ux + rz * uz, across = rx * nx + rz * nz;
          if (along < -0.2 || along > Math.max(stretch, turn) + 0.2 || Math.abs(across) > 1.05) continue;
          if (t.heights[k]! > slabTop(along) - 0.4) t.heights[k] = slabTop(along) - 0.4;
        }
      }
    }
    prims.push(...surveyStairPrims(survey, (x, z) => groundAt(x, z, true), sideStairs, PISGA_STAIR_LINKS));
    // The kindergarten's path: from the gap the survey leaves in its fence (x 33.0–38.3, the gate) to its entrance door's pad (x 30.6–33.3,
    // z −5.6), 2 m of paving on the yard's ground. It stood as bare earth from the sidewalk to the door (north-facade).
    {
      const from: [number, number] = [35.6, -14.6], to: [number, number] = [31.95, -5.4];
      const n = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.5);
      const stations = Array.from({ length: n + 1 }, (_, k) => {
        const x = from[0] + ((to[0] - from[0]) * k) / n, z = from[1] + ((to[1] - from[1]) * k) / n, y = groundAt(x, z, true) + 0.05;
        return { x, z, yTop: y, yFoot: y - 0.3 };
      });
      prims.push({ type: "custom-mesh", stations, thick: 2, material: "paving", tag: "site:kg-entrance-path" });
    }
    // The +8.18 platform's east edge where the A4-40's south wall stops (its corner at x 64.31, z 10.78): the wall is the edge's parapet
    // as far as it stands, and past it the edge fell 5 m open (jn-e-exit, the fence check). A railing along the edge's first 1.8 m.
    {
      const corner: [number, number] = [64.31, 10.78], far: [number, number] = [62.24, 18.11];
      const len = Math.hypot(far[0] - corner[0], far[1] - corner[1]);
      const [ux, uz] = [(far[0] - corner[0]) / len, (far[1] - corner[1]) / len];
      const a: [number, number] = [corner[0] - uz * 0.05 + ux * 0.1, corner[1] + ux * 0.05 + uz * 0.1];
      prims.push(...railingPrims(a, [a[0] + ux * 1.8, a[1] + uz * 1.8], 8.18, "site:platform-rail", 1.1));
    }
    // A platform the sheets draw at a link (the west exit's at +8.57, its link +8.80) stood a step under the link's paving, the link a slab
    // floating over it (kg-west-link-top): the platform takes the link's level.
    for (const l of PISGA_STAIR_LINKS) {
      const near = (r: Array<[number, number]>) => r.some(([x, z]) => nearLink([l], x, z, 0.6)) || l.ring.some(([x, z]) => insidePolygon(r, x, z));
      for (const p of prims) {
        if (p.type !== "prism" || !/^site:surface:.*-platform$/.test(p.tag ?? "") || Math.abs(p.y1 - l.level) > 0.35 || !near(p.ring)) continue;
        const d = l.level - p.y1;
        p.y0 += d; p.y1 += d;
        for (const f of prims) if (f.type === "prism" && f.tag === `${p.tag}-fill` && f.ring === p.ring) f.y1 += d;
      }
    }
    // The step of earth a stair wall holds falls on the wall's middle line: the beds' grid put it a cell to one side, and on the
    // quarter-metre ground a step beside the stone instead of in it drew a saw of earth teeth up the wall's face (the user's mark, 2026-11-01).
    // Every ground point within 40 cm of a wall's line takes the ground 45 cm out on its own side, or the lower side's within 30 cm.
    const lines: Array<[[number, number], [number, number]]> = [];
    for (const p of prims) if (p.type === "custom-mesh" && /^site:survey-(wall|parapet)/.test(p.tag ?? "")) for (let i = 1; i < p.stations.length; i++) lines.push([[p.stations[i - 1]!.x, p.stations[i - 1]!.z], [p.stations[i]!.x, p.stations[i]!.z]]);
    for (const t of prims) {
      if (t.type !== "terrain" || t.dx > 0.25 || t.tag !== "site:ground") continue;
      const src = t.heights.slice();
      const at = (x: number, z: number) => {
        const fi = Math.max(0, Math.min(t.nx - 1.001, (x - t.x0) / t.dx)), fj = Math.max(0, Math.min(t.nz - 1.001, (z - t.z0) / t.dx));
        const i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, h = (a: number, b: number) => src[b * t.nx + a]!;
        return (h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v;
      };
      for (let k = 0; k < src.length; k++) {
        const x = t.x0 + (k % t.nx) * t.dx, z = t.z0 + Math.floor(k / t.nx) * t.dx;
        let best: { d: number; nx: number; nz: number } | null = null;
        for (const [a, b] of lines) {
          if (Math.abs(x - a[0]) > 3 && Math.abs(x - b[0]) > 3) continue;
          const l2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
          if (l2 < 1e-6) continue;
          const q = Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / l2));
          const [px, pz] = [a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q], d = Math.hypot(x - px, z - pz);
          if (d < 0.4 && (!best || d < best.d)) best = d > 1e-4 ? { d, nx: (x - px) / d, nz: (z - pz) / d } : { d, nx: -(b[1] - a[1]) / Math.sqrt(l2), nz: (b[0] - a[0]) / Math.sqrt(l2) };
        }
        if (!best || carve?.(x, z) != null) continue;
        const own = at(x + best.nx * (0.45 - best.d), z + best.nz * (0.45 - best.d)), other = at(x - best.nx * (0.45 + best.d), z - best.nz * (0.45 + best.d));
        // Within 30 cm of the line both sides take the lower ground: a step across a diagonal of the grid spans a cell's diagonal, more than
        // the wall's half thickness, and on the low side it stood out of the face; on the high side it falls behind the coping, out of sight.
        t.heights[k] = best.d < 0.3 ? Math.min(own, other) : own;
      }
    }
    // No tree stands on a side stair's path or within 2 m of it.
    const onPath = (x: number, z: number) => [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2]].some(([dx, dz]) => carve!(x + dx!, z + dz!) != null);
    for (let i = prims.length - 1; i >= 0; i--) {
      const p = prims[i]!;
      if (p.type === "tree" && onPath(p.at.x, p.at.z)) prims.splice(i, 1);
    }
    // Nor inside a neighbour.
    const houses = pisgaNeighbourBoxes(prims);
    for (let i = prims.length - 1; i >= 0; i--) {
      const p = prims[i]!;
      if (p.type === "tree" && houses.some((b) => p.at.x > b.x0 && p.at.x < b.x1 && p.at.z > b.z0 && p.at.z < b.z1)) prims.splice(i, 1);
    }
  }

  // No ground stands through the upper street's paving: under the road and its sidewalk every ground sample is held 5 cm under the slab
  // (west of x 20 the surveyed ground rose over the parking bays and the road's edge as earth, road-wide / west-side).
  {
    const slabs = prims.filter((p): p is Extract<Primitive, { type: "prism" }> => p.type === "prism" && (p.tag === "site:street" || p.tag === "site:sidewalk"));
    for (const p of prims) {
      if (p.type !== "terrain" || p.tag !== "site:ground") continue;
      for (let j = 0; j < p.nz; j++) for (let i = 0; i < p.nx; i++) {
        const x = p.x0 + i * p.dx, z = p.z0 + j * p.dx, k = j * p.nx + i;
        for (const q of slabs) if (p.heights[k]! > q.y1 - 0.05 && p.heights[k]! < q.y1 + 3 && insidePolygon(q.ring, x, z)) p.heights[k] = q.y1 - 0.05;
      }
    }
  }

  return {
    name: 'מרכז פסג"ה למורים — קריית ארבע',
    primitives: prims,
    extent: { x: -12, z: -20, width: 84, depth: 50, yMin: -1, yMax: LEVEL.bulkhead },
    north: { x: 0, z: -1 },
  };
}

/**
 * Where the side stairs meet the building, as the sheets draw it. East: the kindergarten exit's path at +1.08 (its plan, A4-40) runs onto
 * the stair's landing at +1.19, and the flight the plan draws down north from it is the survey's own; the A4-40 emergency stair's landing
 * at +5.82 ("משטח" 929.02) meets the stair's landing at +5.82 through the plot's wall; the ramp's foot (+12.28, the second "יציאת חירום"
 * with its door in the wall at z 20.5) meets the landing at +12.30. West: the kindergarten walkway's six treads (+4.54 to +5.6) reach the
 * landing at +5.66 through the plot's wall; the west platform's emergency exit (+931.85, the door swing at z 5.6–6.6) opens onto the
 * landing at +8.84 (the link stair's head, so the platform and the stair top share one level).
 */
const PISGA_STAIR_LINKS: StairLink[] = [
  { ring: [[68.3, 2.7], [69.5, 2.7], [69.5, 3.8], [68.3, 3.8]], level: 1.19, guards: [[[67.9, 2.8], [69.05, 2.8]]] },
  { ring: [[65.44, 10.79], [67.0, 11.28], [67.45, 9.83], [65.89, 9.34]], level: 5.82, guards: [[[65.5, 10.68], [66.25, 10.92]], [[65.95, 9.45], [67.36, 9.9]], [[67.36, 9.9], [67.5, 10.36]]] },
  { ring: [[63.79, 18.8], [64.6, 19.06], [64.15, 20.49], [63.34, 20.23]], level: 12.3 },
  { ring: [[-12.25, 2.95], [-10.75, 2.95], [-10.75, 4.17], [-12.25, 4.17]], level: 5.66, guards: [[[-12.1, 3.05], [-10.8, 3.05]]] },
  { ring: [[-12.1, 5.1], [-11.3, 5.1], [-11.3, 6.1], [-12.1, 6.1]], level: 8.84 },
];
/** And what of the building's own goes there: the kindergarten exit's flight down north and its rails past the path's end, the A4-40 landing's railing across its east edge, the west platform's railing at the exit. */
const PISGA_LINK_CLEAR: Array<Array<[number, number]>> = [
  [[67.9, 0.2], [69.8, 0.2], [69.8, 3.75], [67.9, 3.75]],
  [[66.48, 11.11], [66.93, 9.67], [67.51, 9.85], [67.06, 11.29]],
  [[-12.0, 5.0], [-10.9, 5.0], [-10.9, 6.2], [-12.0, 6.2]],
];

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
