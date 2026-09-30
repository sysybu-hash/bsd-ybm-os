import type { DwfFloor } from "@/lib/projects/dwf-floor";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";
import type { BuiltFlat } from "@/lib/projects/floorplan-build";
import { type FurniturePiece } from "@/lib/projects/floorplan-furniture";
import { readDwfFurniture } from "@/lib/projects/dwf-furniture";
import { type DwfTerrace, readDwfTerraces } from "@/lib/projects/dwf-terrace";
import type { FloorplanRoomKind } from "@/lib/projects/floorplan-layout";
import { renderFlatSvg } from "@/lib/projects/floorplan-render3d";
import type { SegmentedRoom } from "@/lib/projects/floorplan-segment";
import type { Opening, SpanRow, WallBody } from "@/lib/projects/floorplan-solid";
import type { OpeningKind } from "@/lib/projects/floorplan-wall-openings";

/**
 * One apartment of a permit plan, as the flat the render pipeline builds from.
 *
 * The sales-sheet builder finds walls as pairs of parallel faces and settles
 * the scale against the printed area, and on a permit plan neither holds: the
 * dimension chains inside the rooms pair into walls, and the scale is printed
 * in the title (1:100). The floor reader already has what the builder would
 * have to guess — the hatch mask, the openings closed in it, the rooms as the
 * sheet names them, and which rooms are this flat's — so the flat is taken
 * from it directly, in the sheet's own page units, and the scene is built from
 * that exactly as from a sales sheet.
 */
export type DwfFlat = { flat: BuiltFlat; rooms: SegmentedRoom[] };

/** How far past its rooms a flat's walls reach: the thickest wall on the sheet, a ממ"ד's. */
const WALL_REACH_CM = 40;

/**
 * `terraces` is the floor's, read once for all its flats; left out, it is
 * read here.
 */
export function flatFromDwfFloor(floor: DwfFloor, sheet: DwfGeometry, unit: number, terraces?: DwfTerrace[]): DwfFlat | null {
  const apartment = floor.apartments.find((a) => a.unit === unit);
  if (!apartment || apartment.rooms.length === 0) return null;
  const { cols, rows, cm, unitsPerMetre: upm } = floor;
  const n = cols * rows;
  const unitsPerPx = (upm * cm) / 100;
  const own = new Set(apartment.rooms);

  // The flat's rooms, and the band of wall round them.
  const inFlat = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (own.has(floor.room[k]!)) inFlat[k] = 1;
  const reach = Math.round(WALL_REACH_CM / cm);
  const near = grow(inFlat, cols, rows, reach);

  // Walls: each hatched pixel within reach goes to the direction its wall runs
  // in — longer across the page than down it is a horizontal wall — and each
  // connected run of one direction is a body.
  const solid = new Uint8Array(n);
  for (let k = 0; k < n; k++) if (near[k] && floor.wall[k] === 1) solid[k] = 1;
  const runX = runs(solid, cols, rows, true);
  const runY = runs(solid, cols, rows, false);
  const horizontal = new Uint8Array(n);
  const vertical = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    if (!solid[k]) continue;
    if (runX[k]! >= runY[k]!) horizontal[k] = 1;
    else vertical[k] = 1;
  }
  const bodies: WallBody[] = [];
  for (const [mask, orientation] of [
    [horizontal, "h"],
    [vertical, "v"],
  ] as const) {
    for (const box of boxes(mask, cols, rows)) {
      bodies.push(asBand(box, orientation, unitsPerPx, "hatch"));
    }
  }

  // Openings: the gaps the reader closed, where they bound this flat. A door
  // is one with a swing drawn at it; the rest the scene judges by what lies
  // either side — a window onto the street, a doorway between two rooms.
  const gap = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    const v = floor.wall[k]!;
    if (near[k] && (v === 2 || v === 4 || v === 5)) gap[k] = 1;
  }
  const swings = sheet.arcs.filter((arc) => {
    const rM = arc.r / upm;
    const sweep = arc.end - arc.start;
    return rM >= 0.45 && rM <= 1.4 && sweep >= 1.2 && sweep <= 1.95;
  });
  const openings: BuiltFlat["openings"] = [];
  for (const box of boxes(gap, cols, rows, true)) {
    if (!touches(box, inFlat, cols, rows, 2)) continue;
    const w = box.x1 - box.x0 + 1;
    const h = box.y1 - box.y0 + 1;
    const orientation = w >= h ? "h" : "v";
    const band = asBand(box, orientation, unitsPerPx);
    const opening: Opening = { ...band, thickness: Math.max(band.thickness, 0.1 * upm) };
    const widthM = (opening.to - opening.from) / upm;
    const mid = (opening.from + opening.to) / 2;
    const cx = orientation === "h" ? mid : opening.centre;
    const cy = orientation === "h" ? opening.centre : mid;
    const swung = swings.some((arc) => Math.hypot(arc.cx - cx, arc.cy - cy) <= arc.r * 0.75 + 0.1 * upm);
    const kind: OpeningKind = swung && widthM <= 1.3 ? "door" : "opening";
    openings.push({ ...opening, kind });
  }

  // The floor, a row of spans a pixel high, in page units.
  const floorRows = spanRows(inFlat, cols, rows, unitsPerPx);
  const pixelArea = (cm * cm) / 10_000;
  let floorPx = 0;
  for (let k = 0; k < n; k++) floorPx += inFlat[k]!;
  const floorM2 = floorPx * pixelArea;

  // The flat's terraces, each a mask on the floor's grid; the flat's extent
  // takes them in, so the render frames them.
  const ownTerraces = (terraces ?? readDwfTerraces(floor, sheet)).filter((t) => t.unit === unit);
  const terraceMasks = ownTerraces.map((t) => {
    const mask = new Uint8Array(n);
    for (const k of t.pixels) mask[k] = 1;
    return mask;
  });
  const framed = near.slice();
  for (const mask of terraceMasks) for (let k = 0; k < n; k++) if (mask[k]) framed[k] = 1;
  const ext = extent(framed, cols, rows);
  const bounds = {
    x: ext.x0 * unitsPerPx,
    y: ext.y0 * unitsPerPx,
    width: (ext.x1 - ext.x0 + 1) * unitsPerPx,
    height: (ext.y1 - ext.y0 + 1) * unitsPerPx,
  };

  // Furniture as the sheet draws it, standing in this flat.
  const inside = (x: number, y: number) => {
    const px = Math.round(x / unitsPerPx);
    const py = Math.round(y / unitsPerPx);
    return px >= 0 && py >= 0 && px < cols && py < rows && inFlat[py * cols + px] === 1;
  };
  const local = sheet.segments.filter((s) => {
    const x = (s.x1 + s.x2) / 2;
    const y = (s.y1 + s.y2) / 2;
    return x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height;
  });
  void local;
  const kindAt = (x: number, y: number) => {
    const px = Math.round(x / unitsPerPx);
    const py = Math.round(y / unitsPerPx);
    const id = floor.room[py * cols + px];
    return floor.rooms.find((r) => r.id === id)?.kind ?? null;
  };
  const wallAt = (x: number, y: number) => {
    const px = Math.round(x / unitsPerPx);
    const py = Math.round(y / unitsPerPx);
    const v = px >= 0 && py >= 0 && px < cols && py < rows ? floor.wall[py * cols + px] : 0;
    // A worktop stands against a wall or under a window.
    return v === 1 || v === 2;
  };
  const furniture = readDwfFurniture(sheet, upm, kindAt, inside, wallAt);

  // The rooms, named as the sheet names them.
  const counts = new Map<string, number>();
  const segmented: SegmentedRoom[] = [];
  for (const id of apartment.rooms) {
    const info = floor.rooms.find((r) => r.id === id);
    if (!info) continue;
    const mask = new Uint8Array(n);
    for (let k = 0; k < n; k++) if (floor.room[k] === id) mask[k] = 1;
    const roomRows = spanRows(mask, cols, rows, unitsPerPx);
    const b = extent(mask, cols, rows);
    const contents = furniture.filter((p) => {
      const px = Math.round((p.x + p.w / 2) / unitsPerPx);
      const py = Math.round((p.y + p.h / 2) / unitsPerPx);
      return floor.room[py * cols + px] === id;
    });
    // A WC or a bathroom the sheet leaves unnamed is still one: its pan or
    // its bath says so — in a room a bathroom's size. דירה 34's upper hall,
    // 11.7 m², holds a piece read as a fixture and is not a bathroom.
    const wet = info.areaM2 < 9 && contents.some((p) => p.kind === "fixture");
    const kind: FloorplanRoomKind = info.kind ?? (wet ? "bathroom" : info.areaM2 < 6 ? "circulation" : "other");
    const base = NAME[kind];
    const seen = (counts.get(base) ?? 0) + 1;
    counts.set(base, seen);
    segmented.push({
      rows: roomRows,
      bounds: {
        x: b.x0 * unitsPerPx,
        y: b.y0 * unitsPerPx,
        width: (b.x1 - b.x0 + 1) * unitsPerPx,
        height: (b.y1 - b.y0 + 1) * unitsPerPx,
      },
      areaM2: info.areaM2,
      kind,
      name: seen > 1 ? `${base} ${seen}` : base,
      bedCount: contents.filter((p: FurniturePiece) => p.kind === "bed").length,
      contents,
    });
  }
  // Numbered only where there are several: "ח.שינה", or "ח.שינה 1" and "ח.שינה 2".
  for (const room of segmented) {
    const base = room.name.replace(/ \d+$/, "");
    if ((counts.get(base) ?? 0) > 1 && room.name === base) room.name = `${base} 1`;
  }

  const terraceRows = terraceMasks.map((mask) => spanRows(mask, cols, rows, unitsPerPx));
  const flat: BuiltFlat = {
    unitsPerMetre: upm,
    bodies,
    floor: floorRows,
    furniture,
    openings,
    terraces: terraceRows,
    printedTerraceCount: ownTerraces.filter((t) => t.printedM2 != null).length,
    bounds,
    floorM2,
    areaError: 0,
    svg: renderFlatSvg(bodies, bounds, { unitsPerMetre: upm, floor: floorRows, furniture, openings, terraces: terraceRows }),
  };
  return { flat, rooms: segmented };
}

const NAME: Record<FloorplanRoomKind, string> = {
  living: "ח.מגורים",
  kitchen: "מטבח",
  bedroom: "ח.שינה",
  mmd: 'ממ"ד',
  bathroom: "ח.רחצה",
  balcony: "מרפסת",
  circulation: "מסדרון",
  utility: "ח.שירות",
  other: "חלל",
};

type Box = { x0: number; y0: number; x1: number; y1: number };

function asBand(box: Box, orientation: "h" | "v", unitsPerPx: number, source?: "hatch"): WallBody {
  const x0 = box.x0 * unitsPerPx;
  const x1 = (box.x1 + 1) * unitsPerPx;
  const y0 = box.y0 * unitsPerPx;
  const y1 = (box.y1 + 1) * unitsPerPx;
  return orientation === "h"
    ? { orientation, centre: (y0 + y1) / 2, thickness: y1 - y0, from: x0, to: x1, ...(source ? { source } : {}) }
    : { orientation, centre: (x0 + x1) / 2, thickness: x1 - x0, from: y0, to: y1, ...(source ? { source } : {}) };
}

/** The bounding box of each connected run of set pixels; eight-connected where asked. */
function boxes(mask: Uint8Array, cols: number, rows: number, diagonal = false): Box[] {
  const seen = new Uint8Array(mask.length);
  const out: Box[] = [];
  const stack: number[] = [];
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k] || seen[k]) continue;
    const box = { x0: cols, y0: rows, x1: -1, y1: -1 };
    seen[k] = 1;
    stack.push(k);
    while (stack.length) {
      const c = stack.pop()!;
      const x = c % cols;
      const y = (c - x) / cols;
      box.x0 = Math.min(box.x0, x);
      box.x1 = Math.max(box.x1, x);
      box.y0 = Math.min(box.y0, y);
      box.y1 = Math.max(box.y1, y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx === 0 && dy === 0) || (!diagonal && dx !== 0 && dy !== 0)) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const nk = ny * cols + nx;
          if (!mask[nk] || seen[nk]) continue;
          seen[nk] = 1;
          stack.push(nk);
        }
      }
    }
    out.push(box);
  }
  return out;
}

/** Whether a box lies within `pad` pixels of a set pixel of the mask. */
function touches(box: Box, mask: Uint8Array, cols: number, rows: number, pad: number): boolean {
  for (let y = Math.max(0, box.y0 - pad); y <= Math.min(rows - 1, box.y1 + pad); y++) {
    for (let x = Math.max(0, box.x0 - pad); x <= Math.min(cols - 1, box.x1 + pad); x++) {
      if (mask[y * cols + x]) return true;
    }
  }
  return false;
}

/** The mask grown by `r` pixels, square. */
function grow(src: Uint8Array, cols: number, rows: number, r: number): Uint8Array {
  const along = new Uint8Array(src.length);
  for (let y = 0; y < rows; y++) {
    let last = -Infinity;
    for (let x = 0; x < cols; x++) {
      if (src[y * cols + x]) last = x;
      if (x - last <= r) along[y * cols + x] = 1;
    }
    last = Infinity;
    for (let x = cols - 1; x >= 0; x--) {
      if (src[y * cols + x]) last = x;
      if (last - x <= r) along[y * cols + x] = 1;
    }
  }
  const out = new Uint8Array(src.length);
  for (let x = 0; x < cols; x++) {
    let last = -Infinity;
    for (let y = 0; y < rows; y++) {
      if (along[y * cols + x]) last = y;
      if (y - last <= r) out[y * cols + x] = 1;
    }
    last = Infinity;
    for (let y = rows - 1; y >= 0; y--) {
      if (along[y * cols + x]) last = y;
      if (last - y <= r) out[y * cols + x] = 1;
    }
  }
  return out;
}

/** How long a run of set pixels each pixel stands in, along rows or down columns. */
function runs(mask: Uint8Array, cols: number, rows: number, horizontal: boolean): Uint16Array {
  const out = new Uint16Array(mask.length);
  const len = horizontal ? cols : rows;
  const lines = horizontal ? rows : cols;
  const idx = (line: number, i: number) => (horizontal ? line * cols + i : i * cols + line);
  for (let line = 0; line < lines; line++) {
    let start = -1;
    for (let i = 0; i <= len; i++) {
      const on = i < len && mask[idx(line, i)];
      if (on && start < 0) start = i;
      else if (!on && start >= 0) {
        for (let j = start; j < i; j++) out[idx(line, j)] = Math.min(65535, i - start);
        start = -1;
      }
    }
  }
  return out;
}

function spanRows(mask: Uint8Array, cols: number, rows: number, unitsPerPx: number): SpanRow[] {
  const out: SpanRow[] = [];
  for (let y = 0; y < rows; y++) {
    const spans: Array<[number, number]> = [];
    let start = -1;
    for (let x = 0; x <= cols; x++) {
      const on = x < cols && mask[y * cols + x];
      if (on && start < 0) start = x;
      else if (!on && start >= 0) {
        spans.push([start * unitsPerPx, x * unitsPerPx]);
        start = -1;
      }
    }
    if (spans.length) out.push({ y: y * unitsPerPx, spans });
  }
  return out;
}

function extent(mask: Uint8Array, cols: number, rows: number): Box {
  const box = { x0: cols, y0: rows, x1: 0, y1: 0 };
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k]) continue;
    const x = k % cols;
    const y = (k - x) / cols;
    box.x0 = Math.min(box.x0, x);
    box.x1 = Math.max(box.x1, x);
    box.y0 = Math.min(box.y0, y);
    box.y1 = Math.max(box.y1, y);
  }
  return box;
}
