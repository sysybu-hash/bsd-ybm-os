import { printedRooms, type DwfFloor } from "@/lib/projects/dwf-floor";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";
import type { BuiltFlat, DoorLeaf } from "@/lib/projects/floorplan-build";
import { findRectangles, type FurniturePiece } from "@/lib/projects/floorplan-furniture";
import { readDwfFurniture } from "@/lib/projects/dwf-furniture";
import { furnishBareRooms } from "@/lib/projects/dwf-room-furnish";
import { splitWetChambers } from "@/lib/projects/dwf-room-split";
import { readDwfSanitary } from "@/lib/projects/dwf-sanitary";
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
 * read here. `read` is the rooms whose kind was read off the drawing for a
 * sheet that names none (see readHouseRoomUses): taken as read, not guessed
 * again by size, and furnished where the sheet's furniture was not found.
 */
export function flatFromDwfFloor(
  floor: DwfFloor,
  sheet: DwfGeometry,
  unit: number,
  terraces?: DwfTerrace[],
  read?: ReadonlySet<number>,
  /**
   * `drawnOnly`: only the furniture the sheet draws, none made up for a room
   * whose drawn pieces were not read. A building's storey is painted from its
   * sheet (house-photoreal SHEET_FURNISHING): an open kitchen made up beside
   * a party wall the sheet leaves bare was a guess the painting then had to undo.
   */
  options?: { drawnOnly?: boolean },
): DwfFlat | null {
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
    const swing = swings.find((arc) => Math.hypot(arc.cx - cx, arc.cy - cy) <= arc.r * 0.75 + 0.1 * upm);
    const kind: OpeningKind = swing && widthM <= 1.3 ? "door" : "opening";
    // The leaf drawn open: the end of the arc square to the wall.
    let leaf: DoorLeaf | undefined;
    if (swing && kind === "door") {
      const across = (a: number) => Math.abs(orientation === "h" ? Math.sin(a) : Math.cos(a));
      const a = across(swing.start) >= across(swing.end) ? swing.start : swing.end;
      if (across(a) > 0.95) leaf = { x: swing.cx, y: swing.cy, dx: swing.r * Math.cos(a), dy: swing.r * Math.sin(a) };
    }
    openings.push({ ...opening, kind, ...(leaf ? { leaf } : {}) });
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
  // A private house's rooms are drawn without names. Size names the big ones,
  // and a pan names a bathroom, before the furniture is read — an unnamed
  // room would otherwise take every rectangle in it for a bath.
  const unlabelled = apartment.rooms.every((id) => (floor.rooms.find((r) => r.id === id)?.names.length ?? 0) === 0);
  const readHere = apartment.rooms.some((id) => read?.has(id));
  if (unlabelled) {
    const loose = apartment.rooms.filter((id) => {
      const r = floor.rooms.find((q) => q.id === id);
      return r != null && r.kind == null && r.areaM2 >= 6;
    });
    if (loose.length > 0) {
      const rects = findRectangles(sheet.segments, { unitsPerMetre: upm, minSideM: 0.4, maxSideM: 2 });
      const sanitary = readDwfSanitary(sheet, upm, kindAt, inside, rects);
      const baths = rects
        .filter((r) => {
          const s = (Math.min(r.w, r.h) / upm) * 100;
          const l = (Math.max(r.w, r.h) / upm) * 100;
          return s >= 50 && s <= 82 && l >= 130 && l <= 185 && inside(r.x + r.w / 2, r.y + r.h / 2) && !holdsBasin(r, sanitary);
        })
        .map((r): FurniturePiece => ({ ...r, kind: "fixture", fixture: "bath", widthCm: (r.w / upm) * 100, depthCm: (r.h / upm) * 100 }));
      const fixtures = [...sanitary, ...baths];
      for (const id of loose) splitWetChambers(floor, apartment.rooms, id, fixtures);
    }
  }
  nameUnlabelledHouse(floor, apartment.rooms, sheet, upm, kindAt, inside, readHere);
  const furniture = readDwfFurniture(sheet, upm, kindAt, inside, wallAt);
  // The drawing's own blocks need no twin's fixtures copied over: a phantom vanity stood by a bathroom door.
  if (!sheet.furniture?.length) mirrorTwinFixtures(floor, sheet, unit, furniture, upm, unitsPerPx);
  // A house's rooms whose use is known — read, or the living room and the
  // kitchen size names — with nothing of that use found in them are furnished
  // for it. A bedroom by size alone is not: one with no bed is a passage.
  if (unlabelled && !options?.drawnOnly) {
    const known = apartment.rooms.filter((id) => {
      const kind = floor.rooms.find((r) => r.id === id)?.kind;
      return read?.has(id) || kind === "living" || kind === "kitchen";
    });
    const { added, dropped } = furnishBareRooms(floor, apartment.rooms, furniture, new Set(known));
    for (const p of dropped) furniture.splice(furniture.indexOf(p), 1);
    furniture.push(...added);
  }

  // The rooms, named as the sheet names them.
  const counts = new Map<string, number>();
  const segmented: SegmentedRoom[] = [];
  const segmentedIds: number[] = [];
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
    const beds = contents.filter((p) => p.kind === "bed").length;
    const bw = ((b.x1 - b.x0 + 1) * unitsPerPx) / upm;
    const bh = ((b.y1 - b.y0 + 1) * unitsPerPx) / upm;
    const printedBed = printedRooms(sheet.texts).some(
      (t) =>
        (Math.abs(bw - t.w) <= 0.45 && Math.abs(bh - t.h) <= 0.45) ||
        (Math.abs(bw - t.h) <= 0.45 && Math.abs(bh - t.w) <= 0.45),
    );
    const kind: FloorplanRoomKind =
      wet && (info.kind == null || info.kind === "circulation")
        ? "bathroom"
        : info.kind === "bedroom" && beds === 0 && !printedBed && !read?.has(id)
          ? "circulation"
          : (info.kind === "circulation" || info.kind == null || info.kind === "other") && beds > 0 && info.areaM2 >= 7
            ? "bedroom"
            : info.kind !== "kitchen" && info.kind !== "living" && contents.some((p) => p.kind === "hob") && info.areaM2 >= 4
              ? "kitchen"
          : (info.kind ?? (info.areaM2 < 6 ? "circulation" : "other"));
    const base = NAME[kind];
    const seen = (counts.get(base) ?? 0) + 1;
    counts.set(base, seen);
    segmentedIds.push(id);
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
  // A room's kind as the sheet gives it — its contents first, then its
  // name, then the walls: a part with neither a name of its own nor a piece
  // that names it takes the kind of the room it is open to across a closed
  // gap (a wardrobe's line, a wide opening) — never through a door. Gottlieb
  // C's upper bedroom, cut at its wardrobe's line, was oak at its beds and
  // white tile at its wardrobe (13/10/2026).
  const decisive = (room: SegmentedRoom): FloorplanRoomKind | null =>
    room.contents.some((p) => p.kind === "hob" || p.kind === "sink")
      ? "kitchen"
      : room.contents.some((p) => p.kind === "fixture")
        ? "bathroom"
        : room.contents.some((p) => p.kind === "bed")
          ? "bedroom"
          : null;
  const named = (i: number) => (floor.rooms.find((r) => r.id === segmentedIds[i])?.names.length ?? 0) > 0;
  const index = new Map(segmentedIds.map((id, i) => [id, i]));
  const across = new Map<string, number>();
  const gapReach = Math.round(60 / floor.cm);
  for (let k = 0; k < n; k++) {
    if (floor.wall[k] !== 2) continue;
    const x = k % cols;
    const y = (k - x) / cols;
    for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
      const side = (sgn: number) => {
        for (let t = 1; t <= gapReach; t++) {
          const xx = x + sgn * dx * t, yy = y + sgn * dy * t;
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) return 0;
          const kk = yy * cols + xx;
          if (floor.wall[kk] === 2) continue;
          return floor.wall[kk] ? 0 : floor.room[kk]!;
        }
        return 0;
      };
      const [a, b] = [side(-1), side(1)];
      if (!a || !b || a === b || !index.has(a) || !index.has(b)) continue;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      across.set(key, (across.get(key) ?? 0) + 1);
    }
  }
  segmented.forEach((room, i) => {
    if (decisive(room) || named(i)) return;
    let best: { kind: FloorplanRoomKind; px: number } | null = null;
    for (const [key, px] of across) {
      const [a, b] = key.split(":").map(Number) as [number, number];
      const other = a === segmentedIds[i] ? b : b === segmentedIds[i] ? a : null;
      if (other == null || px * floor.cm < 60) continue;
      const j = index.get(other)!;
      const o = segmented[j]!;
      const kind = decisive(o) ?? (named(j) ? o.kind : null);
      if (kind && (!best || px > best.px)) best = { kind, px };
    }
    if (!best || best.kind === room.kind) return;
    room.kind = best.kind;
    const seen = (counts.get(NAME[best.kind]) ?? 0) + 1;
    counts.set(NAME[best.kind], seen);
    room.name = seen > 1 ? `${NAME[best.kind]} ${seen}` : NAME[best.kind];
  });
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
    areaError: printedFit(floor, sheet, apartment.rooms),
    svg: renderFlatSvg(bodies, bounds, { unitsPerMetre: upm, floor: floorRows, furniture, openings, terraces: terraceRows }),
  };
  return { flat, rooms: segmented };
}

/** A counter with a basin standing in it is a vanity, whatever its size says. */
function holdsBasin(r: { x: number; y: number; w: number; h: number }, sanitary: FurniturePiece[]): boolean {
  return sanitary.some((f) => {
    if (f.fixture !== "basin") return false;
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    return cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h;
  });
}

/**
 * The two houses of a pair are drawn as mirrors. A bath or a pan that closed
 * on one side and not the other is copied across the party wall, into the
 * room of the same size.
 */
function mirrorTwinFixtures(
  floor: DwfFloor,
  sheet: DwfGeometry,
  unit: number,
  furniture: FurniturePiece[],
  upm: number,
  unitsPerPx: number,
): void {
  if (floor.apartments.length !== 2) return;
  const own = floor.apartments.find((a) => a.unit === unit);
  const twin = floor.apartments.find((a) => a.unit !== unit);
  if (!own || !twin) return;
  const { cols, rows, cm, room } = floor;
  const box = (ids: number[]) => {
    const have = new Set(ids);
    let x0 = cols;
    let y0 = rows;
    let x1 = 0;
    let y1 = 0;
    let n = 0;
    for (let k = 0; k < room.length; k++) {
      if (!have.has(room[k]!)) continue;
      n++;
      const x = k % cols;
      const y = (k - x) / cols;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    return { x0, y0, x1, y1, n };
  };
  const a = box(own.rooms);
  const b = box(twin.rooms);
  if (!a.n || !b.n) return;
  const overlapY = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (overlapY < Math.min(a.y1 - a.y0, b.y1 - b.y0) * 0.5) return;
  const axisPx = a.x0 > b.x1 ? (b.x1 + a.x0) / 2 : b.x0 > a.x1 ? (a.x1 + b.x0) / 2 : -1;
  if (axisPx < 0 || Math.abs((a.x0 > b.x1 ? a.x0 - b.x1 : b.x0 - a.x1) * cm) > 80) return;
  const axis = axisPx * unitsPerPx;
  const ownIds = new Set(own.rooms);
  const idAt = (x: number, y: number) => {
    const px = Math.round(x / unitsPerPx);
    const py = Math.round(y / unitsPerPx);
    return px >= 0 && py >= 0 && px < cols && py < rows ? room[py * cols + px]! : 0;
  };
  const roomOf = (id: number) => floor.rooms.find((r) => r.id === id);
  const placed = new Set<number>();
  const put = (x: number, y: number, w: number, h: number, fixture: NonNullable<FurniturePiece["fixture"]>) => {
    const src = idAt(x + w / 2, y + h / 2);
    const srcRoom = roomOf(src);
    if (!srcRoom || ownIds.has(src) || srcRoom.areaM2 < 0.6 || srcRoom.areaM2 > 6) return;
    const mx = 2 * axis - (x + w / 2);
    const my = y + h / 2;
    const dest = idAt(mx, my);
    const destRoom = roomOf(dest);
    if (!destRoom || !ownIds.has(dest) || destRoom.areaM2 > 6) return;
    if (Math.abs(destRoom.areaM2 - srcRoom.areaM2) / srcRoom.areaM2 > 0.35) return;
    if (destRoom.kind === "living" || destRoom.kind === "bedroom" || destRoom.kind === "kitchen") return;
    if (placed.has(dest) && fixture === "bath") return;
    if (furniture.some((p) => p.fixture === fixture && Math.hypot(p.x + p.w / 2 - mx, p.y + p.h / 2 - my) < 0.45 * upm)) return;
    furniture.push({
      x: mx - w / 2,
      y: my - h / 2,
      w,
      h,
      kind: "fixture",
      fixture,
      widthCm: (w / upm) * 100,
      depthCm: (h / upm) * 100,
    });
    destRoom.kind = "bathroom";
    if (fixture === "bath") placed.add(dest);
  };
  const rects = findRectangles(sheet.segments, { unitsPerMetre: upm, minSideM: 0.4, maxSideM: 2 });
  const sanitary = readDwfSanitary(sheet, upm, () => null, () => true, rects);
  for (const r of rects) {
    const s = Math.min(r.w, r.h);
    const l = Math.max(r.w, r.h);
    const sw = (s / upm) * 100;
    const lw = (l / upm) * 100;
    // A tub is about 50 cm wide. A mattress is wider and must not be copied across.
    if (sw < 48 || sw > 60 || lw < 140 || lw > 180) continue;
    if (holdsBasin(r, sanitary)) continue;
    put(r.x, r.y, r.w, r.h, "bath");
  }
  for (const f of sanitary) {
    if (f.fixture === "toilet" || f.fixture === "basin") put(f.x, f.y, f.w, f.h, f.fixture);
  }
}

/**
 * The rooms whose drawing names their use. A hob is three or more burners —
 * whole circles 5–12 cm in radius — within half a metre of each other; a
 * mattress is a rectangle 80–105 by 195–205 cm. A stair's flight, 207 long,
 * and a sofa's seat, 191, are neither.
 */
function drawnUses(floor: DwfFloor, sheet: DwfGeometry, upm: number): { hobs: Set<number>; beds: Set<number> } {
  const unitsPerPx = (floor.unitsPerMetre * floor.cm) / 100;
  const idAt = (x: number, y: number) => {
    const px = Math.round(x / unitsPerPx);
    const py = Math.round(y / unitsPerPx);
    return px >= 0 && py >= 0 && px < floor.cols && py < floor.rows ? floor.room[py * floor.cols + px]! : 0;
  };
  const hobs = new Set<number>();
  const burners = sheet.arcs.filter((a) => {
    const r = (a.r / upm) * 100;
    return Math.abs(a.end - a.start) > 6 && r >= 5 && r <= 12;
  });
  for (const b of burners) {
    const near = burners.filter((q) => Math.abs(q.cx - b.cx) <= 0.5 * upm && Math.abs(q.cy - b.cy) <= 0.5 * upm);
    if (near.length < 3) continue;
    const id = idAt(near.reduce((s, q) => s + q.cx, 0) / near.length, near.reduce((s, q) => s + q.cy, 0) / near.length);
    if (id) hobs.add(id);
  }
  const beds = new Set<number>();
  for (const r of findRectangles(sheet.segments, { unitsPerMetre: upm, minSideM: 0.75, maxSideM: 2.1 })) {
    const s = (Math.min(r.w, r.h) / upm) * 100;
    const l = (Math.max(r.w, r.h) / upm) * 100;
    if (s < 80 || s > 105 || l < 195 || l > 205) continue;
    const id = idAt(r.x + r.w / 2, r.y + r.h / 2);
    if (id) beds.add(id);
  }
  return { hobs, beds };
}

/**
 * Names the rooms of a flat whose sheet prints none: the largest is the
 * living room, one with a hob drawn in it a kitchen and one with a mattress a
 * bedroom (see drawnUses), a wide one a bedroom, on a sheet drawn bare one of
 * a kitchen's size the kitchen, and
 * a small one with a pan or a basin the bathroom. A permit flat, which names
 * its rooms, is left as read. Where the drawing was read (`read`), what it
 * left is not guessed into a living room, a kitchen or a bedroom by size: an
 * upper floor of bedrooms has neither, and the largest room on it is the
 * landing.
 */
function nameUnlabelledHouse(
  floor: DwfFloor,
  ids: number[],
  sheet: DwfGeometry,
  upm: number,
  kindAt: (x: number, y: number) => FloorplanRoomKind | null,
  inside: (x: number, y: number) => boolean,
  read = false,
): void {
  const rooms = ids.map((id) => floor.rooms.find((r) => r.id === id)).filter((r) => r != null);
  if (rooms.length === 0 || rooms.some((r) => r.names.length > 0)) return;
  const open = () => rooms.filter((r) => r.kind == null);
  const unnamed = open();
  if (unnamed.length === 0) return;
  const span = (id: number) => {
    let x0 = floor.cols;
    let y0 = floor.rows;
    let x1 = 0;
    let y1 = 0;
    for (let k = 0; k < floor.room.length; k++) {
      if (floor.room[k] !== id) continue;
      const x = k % floor.cols;
      const y = (k - x) / floor.cols;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    return { w: ((x1 - x0 + 1) * floor.cm) / 100, h: ((y1 - y0 + 1) * floor.cm) / 100 };
  };
  const stairStrip = (id: number) => {
    const s = span(id);
    return Math.min(s.w, s.h) <= 3.4 && Math.max(s.w, s.h) >= 6;
  };
  if (!read) {
    const salon = unnamed.filter((r) => !stairStrip(r.id));
    const largest = (salon.length > 0 ? salon : unnamed).reduce((a, b) => (a.areaM2 >= b.areaM2 ? a : b));
    if (largest.areaM2 >= 15 && !rooms.some((r) => r.kind === "living")) largest.kind = "living";
    // What the sheet draws in a room says what it is, whatever its size: a
    // house's upper floor may have a kitchen of 12 m², and a bedroom of 8.
    const drawn = drawnUses(floor, sheet, upm);
    for (const r of open()) {
      if (drawn.hobs.has(r.id)) r.kind = "kitchen";
      else if (drawn.beds.has(r.id) && r.areaM2 >= 6 && !stairStrip(r.id)) r.kind = "bedroom";
    }
    // A sheet drawn furnished with no hob on this floor has no kitchen on it.
    const furnished = drawn.hobs.size > 0 || drawn.beds.size > 0;
    const kitchen = open()
      .filter((r) => r.areaM2 >= 6 && r.areaM2 < 10 && !stairStrip(r.id))
      .sort((a, b) => Math.abs(a.areaM2 - 9.1) - Math.abs(b.areaM2 - 9.1))[0];
    if (kitchen && !furnished && !rooms.some((r) => r.kind === "kitchen")) kitchen.kind = "kitchen";
    for (const r of open()) {
      if (r.areaM2 >= 10 && !stairStrip(r.id)) r.kind = "bedroom";
    }
  }
  for (const r of open()) {
    const s = span(r.id);
    const bath =
      (Math.abs(s.w - 2.1) <= 0.2 && Math.abs(s.h - 3.1) <= 0.2) ||
      (Math.abs(s.w - 3.1) <= 0.2 && Math.abs(s.h - 2.1) <= 0.2);
    if (bath && r.areaM2 < 9) r.kind = "bathroom";
  }
  const unitsPerPx = (floor.unitsPerMetre * floor.cm) / 100;
  const idAt = (x: number, y: number) => {
    const px = Math.round(x / unitsPerPx);
    const py = Math.round(y / unitsPerPx);
    return px >= 0 && py >= 0 && px < floor.cols && py < floor.rows ? floor.room[py * floor.cols + px]! : 0;
  };
  for (const f of readDwfSanitary(sheet, upm, kindAt, inside)) {
    if (f.fixture !== "toilet" && f.fixture !== "basin") continue;
    const room = rooms.find((r) => r.id === idAt(f.x + f.w / 2, f.y + f.h / 2));
    if (room && room.kind == null && room.areaM2 < 9) room.kind = "bathroom";
  }
  for (const r of rooms) if (r.kind == null) r.kind = "circulation";
}

/**
 * Worst gap between a printed room size and the room it belongs to.
 * A size written inside a room that already matches a larger size is a
 * sub-dimension and is not a miss. A size with no room near it within 8% is
 * a miss, and it counts even when the gap is wide — a floor that swallowed
 * its rooms must not report a perfect fit.
 */
function printedFit(floor: DwfFloor, sheet: DwfGeometry, ids: number[]): number {
  const own = new Set(ids);
  const others = new Set(floor.apartments.flatMap((a) => a.rooms).filter((id) => !own.has(id)));
  const pxPerUnit = 100 / floor.unitsPerMetre / floor.cm;
  const reach = Math.round(600 / floor.cm);
  const areaOf = (id: number) => floor.rooms.find((r) => r.id === id)?.areaM2 ?? 0;
  const hits: Array<{ id: number; printed: number; area: number }> = [];
  const loose: Array<{ id: number; printed: number; area: number }> = [];
  for (const t of printedRooms(sheet.texts)) {
    const printed = t.w * t.h;
    const px = Math.round(t.x * pxPerUnit);
    const py = Math.round(t.y * pxPerUnit);
    let id = 0;
    let best = reach * reach + 1;
    let theirs = reach * reach + 1;
    const seen = new Set<number>();
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const d = dx * dx + dy * dy;
        if (d > reach * reach) continue;
        const x = px + dx;
        const y = py + dy;
        if (x < 0 || y < 0 || x >= floor.cols || y >= floor.rows) continue;
        const here = floor.room[y * floor.cols + x]!;
        if (others.has(here)) theirs = Math.min(theirs, d);
        if (!own.has(here)) continue;
        seen.add(here);
        if (d < best) {
          id = here;
          best = d;
        }
      }
    }
    // A size printed in the next flat's room is that flat's to answer for.
    if (!id || theirs < best) continue;
    let area = areaOf(id);
    const nearErr = area ? Math.abs(area / printed - 1) : Infinity;
    if (nearErr > 0.02) {
      const choose = (limit: number) => {
        let closest = Math.abs(area / printed - 1);
        for (const r of floor.rooms) {
          if (!seen.has(r.id)) continue;
          const err = Math.abs(r.areaM2 / printed - 1);
          if (err > limit || err >= closest) continue;
          closest = err;
          id = r.id;
          area = r.areaM2;
        }
      };
      choose(0.08);
    }
    if (area && Math.abs(area / printed - 1) <= 0.08) hits.push({ id, printed, area });
    else if (area) loose.push({ id, printed, area });
  }
  const matched = new Set(hits.map((h) => h.id));
  const box = new Map<number, { w: number; h: number }>();
  const boxOf = (id: number) => {
    const have = box.get(id);
    if (have) return have;
    let x0 = floor.cols;
    let y0 = floor.rows;
    let x1 = 0;
    let y1 = 0;
    for (let k = 0; k < floor.room.length; k++) {
      if (floor.room[k] !== id) continue;
      const x = k % floor.cols;
      const y = (k - x) / floor.cols;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    const found = { w: x1 - x0 + 1, h: y1 - y0 + 1 };
    box.set(id, found);
    return found;
  };
  let worst = 0;
  let any = false;
  const take = (area: number, printed: number) => {
    const err = area / printed - 1;
    if (!any || Math.abs(err) > Math.abs(worst)) worst = err;
    any = true;
  };
  for (const h of hits) take(h.area, h.printed);
  const byRoom = new Map<number, Array<{ printed: number; area: number }>>();
  for (const u of loose) {
    if (matched.has(u.id) && u.printed < u.area * 0.5) continue;
    byRoom.set(u.id, [...(byRoom.get(u.id) ?? []), u]);
  }
  for (const [id, list] of byRoom) {
    const b = boxOf(id);
    const long = (Math.max(b.w, b.h) * floor.cm) / 100;
    const biggest = list.reduce((a, c) => (c.printed > a.printed ? c : a));
    // A small size inside one room is a sub-dimension. A room whose outline
    // is wider than a room got merged, and its largest size is the miss.
    if (biggest.printed < biggest.area * 0.7 && long <= 6) continue;
    take(biggest.area, biggest.printed);
  }
  return worst;
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
