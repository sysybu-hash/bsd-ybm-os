import {
  extractFloorLabel,
  extractGrossAreaM2,
  extractUnitLabel,
  inferRoomKind,
  isBuildingCoreRoom,
  parseFloorplanLayout,
  type FloorplanLayout,
  type FloorplanRoom,
} from "@/lib/projects/floorplan-layout";
import type { PlacedNumber } from "@/lib/projects/floorplan-vector";

export type PrintedTerrace = { m2: number; levelM?: number };

export type PrintedUnitTruth = {
  grossM2: number;
  bedrooms: number;
  mmd: number;
  bathrooms: number;
  /** ⊕ of the flat. A terrace at another elevation is a roof terrace, not this floor. */
  levelM?: number;
  terraces: PrintedTerrace[];
};

/** Terraces that sit on the flat's own floor plate. */
export function floorPlateTerraces(truth: PrintedUnitTruth): PrintedTerrace[] {
  const floor = truth.levelM;
  if (floor == null) return truth.terraces;
  return truth.terraces.filter(
    (terrace) => terrace.levelM == null || Math.abs(terrace.levelM - floor) < 0.01,
  );
}

/**
 * Every printed מרפסת on the sales sheet — including pockets labeled at a
 * different ⊕ (דירה 22/23: flat ⊕11.42, מרפסת ⊕14.36). Photoreal overview must
 * still show those hatches; floorPlateTerraces alone stripped them and the
 * model invented a sealed flat that "passed" counts.
 */
export function sheetTerracesForViz(truth: PrintedUnitTruth): PrintedTerrace[] {
  return truth.terraces.length ? truth.terraces : floorPlateTerraces(truth);
}

export function floorPlateTerraceM2(truth: PrintedUnitTruth): number {
  return floorPlateTerraces(truth).reduce((sum, terrace) => sum + terrace.m2, 0);
}

/** A CAD box that is a corridor-thin sliver or a merged multi-room blob. */
export function isUnusableCadRoom(room: FloorplanRoom, grossM2?: number): boolean {
  if (room.widthM && room.lengthM && Math.min(room.widthM, room.lengthM) > 0) {
    const ratio = Math.max(room.widthM, room.lengthM) / Math.min(room.widthM, room.lengthM);
    if (ratio > 4) return true;
  }
  if (
    grossM2 &&
    room.areaM2 &&
    room.areaM2 > grossM2 * 0.28 &&
    room.kind !== "living"
  ) {
    return true;
  }
  return false;
}

export function dropUnusableCadRooms(
  rooms: FloorplanRoom[],
  grossM2?: number,
): FloorplanRoom[] {
  return rooms.filter((room) => !isUnusableCadRoom(room, grossM2));
}

export function stripUnusableRoomMeasures(
  room: FloorplanRoom,
  grossM2?: number,
): FloorplanRoom {
  if (!isUnusableCadRoom(room, grossM2)) return room;
  const kind = room.kind ?? inferRoomKind(room.name);
  const keepArea = kind === "balcony" && room.areaM2 != null && room.areaM2 >= 2 && room.areaM2 <= 16;
  return {
    ...room,
    widthM: undefined,
    lengthM: undefined,
    areaM2: keepArea ? room.areaM2 : undefined,
  };
}

export function printedTruthFromRooms(
  rooms: FloorplanRoom[],
  grossM2?: number,
): PrintedUnitTruth | null {
  let bedrooms = 0;
  let mmd = 0;
  let bathrooms = 0;
  const terraces: Array<{ m2: number }> = [];
  for (const room of rooms) {
    const kind = room.kind ?? inferRoomKind(room.name);
    if (kind === "bedroom") bedrooms += 1;
    else if (kind === "mmd") mmd += 1;
    else if (kind === "bathroom") bathrooms += 1;
    else if (kind === "balcony" && room.areaM2 != null && room.areaM2 >= 2 && room.areaM2 <= 16) {
      terraces.push({ m2: room.areaM2 });
    }
  }
  if (bedrooms + mmd + bathrooms === 0) return null;
  return { grossM2: grossM2 ?? 0, bedrooms, mmd, bathrooms, terraces };
}

function countKind(rooms: FloorplanRoom[], kind: FloorplanRoom["kind"]): number {
  return rooms.filter((room) => (room.kind ?? inferRoomKind(room.name)) === kind).length;
}

/** True when CAD/OCR rooms are a thinner list than the printed sales program. */
export function sheetProgramIncomplete(
  rooms: FloorplanRoom[],
  truth: PrintedUnitTruth,
): boolean {
  const living = rooms.filter((room) => !isBuildingCoreRoom(room));
  const want = bookletRoomsFromPrintedTruth(truth);
  if (living.length < want.length) return true;
  if (countKind(living, "bedroom") !== truth.bedrooms) return true;
  if (countKind(living, "bathroom") !== truth.bathrooms) return true;
  if (countKind(living, "mmd") !== truth.mmd) return true;
  if (countKind(living, "balcony") !== floorPlateTerraces(truth).length) return true;
  if (countKind(living, "living") < 1 || countKind(living, "kitchen") < 1) return true;
  return false;
}

/** Sales-sheet table: keep names, drop merged CAD numbers, fall back to printed counts. */
export function roomsForBookletTable(
  layout: FloorplanLayout,
  truth?: PrintedUnitTruth,
): FloorplanRoom[] {
  const living = layout.rooms.filter((room) => !isBuildingCoreRoom(room));
  const known = truth;
  // דירה 18: CAD remasure returned kitchen + bedroom + ממ"ד and wiped living,
  // bath and terraces. The printed program wins whenever the list is thinner.
  if (known && sheetProgramIncomplete(living, known)) {
    return mergeOpenPlanLivingKitchen(
      applyCadMeasuresToBookletRooms(
        bookletRoomsFromPrintedTruth(known),
        living,
        known.grossM2,
      ),
      known.grossM2,
    );
  }
  const measured = living.filter((room) => {
    const kind = room.kind ?? inferRoomKind(room.name);
    return kind !== "balcony" && room.widthM != null && room.lengthM != null;
  }).length;
  if (measured >= 2) return mergeOpenPlanLivingKitchen(living, layout.grossAreaM2);
  const usable = dropUnusableCadRooms(living, layout.grossAreaM2);
  const habitable = usable.filter((room) => {
    const kind = room.kind ?? inferRoomKind(room.name);
    return kind === "living" || kind === "kitchen" || kind === "bedroom" || kind === "mmd" || kind === "bathroom";
  }).length;
  if (usable.length >= 4 && habitable >= 3) {
    const kinds = new Set(usable.map((room) => room.kind ?? inferRoomKind(room.name)));
    const extras: FloorplanRoom[] = [];
    if (!kinds.has("living")) extras.push({ name: "מגורים", kind: "living", source: "ocr_verified" });
    if (!kinds.has("kitchen")) extras.push({ name: "מטבח", kind: "kitchen", source: "ocr_verified" });
    return mergeOpenPlanLivingKitchen(
      extras.length > 0 ? [...extras, ...usable] : usable,
      layout.grossAreaM2,
    );
  }

  const counted = printedTruthFromRooms(living, layout.grossAreaM2);
  if (counted && counted.bedrooms + counted.bathrooms + counted.mmd >= 3) {
    return mergeOpenPlanLivingKitchen(
      applyCadMeasuresToBookletRooms(
        bookletRoomsFromPrintedTruth(counted),
        living,
        layout.grossAreaM2,
      ),
      layout.grossAreaM2,
    );
  }
  return mergeOpenPlanLivingKitchen(
    living.map((room) => stripUnusableRoomMeasures(room, layout.grossAreaM2)),
    layout.grossAreaM2,
  );
}

function roomKindOf(room: FloorplanRoom) {
  return room.kind ?? inferRoomKind(room.name);
}

/**
 * CAD often labels a second bedroom as ממ"ד when the sheet has no shelter.
 * Re-tag those boxes so they stamp onto חדר שינה rows instead of vanishing.
 */
export function alignCadRoomsToProgram(
  program: FloorplanRoom[],
  cadRooms: FloorplanRoom[],
): FloorplanRoom[] {
  const need = (kind: FloorplanRoom["kind"]) =>
    program.filter((room) => roomKindOf(room) === kind).length;
  let spareMmd = cadRooms.filter((room) => roomKindOf(room) === "mmd").length - need("mmd");
  let needBed =
    need("bedroom") - cadRooms.filter((room) => roomKindOf(room) === "bedroom").length;
  if (spareMmd <= 0 || needBed <= 0) return cadRooms;
  return cadRooms.map((room) => {
    if (roomKindOf(room) !== "mmd" || spareMmd <= 0 || needBed <= 0) return room;
    spareMmd -= 1;
    needBed -= 1;
    return { ...room, kind: "bedroom" as const, name: "חדר שינה" };
  });
}

/** Keep large living/kitchen open-plan boxes — they are the measure source. */
function cadPoolForBooklet(cadRooms: FloorplanRoom[], grossM2?: number): FloorplanRoom[] {
  return cadRooms.filter((room) => {
    if (isBuildingCoreRoom(room)) return false;
    if (!isUnusableCadRoom(room, grossM2)) return true;
    const kind = roomKindOf(room);
    return kind === "living" || kind === "kitchen";
  });
}

function roomHasMeasure(room: FloorplanRoom): boolean {
  return room.widthM != null || room.lengthM != null || room.areaM2 != null;
}

/** Leftover CAD boxes → program rows still empty, closest area first. */
function fillUnmatchedCadByArea(
  program: FloorplanRoom[],
  unusedCad: FloorplanRoom[],
): FloorplanRoom[] {
  if (unusedCad.length === 0) return program;
  const taken = new Set<FloorplanRoom>();
  return program.map((room) => {
    if (roomKindOf(room) === "balcony") return room;
    if (roomHasMeasure(room)) return room;
    const target = room.areaM2;
    let best: FloorplanRoom | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const cad of unusedCad) {
      if (taken.has(cad) || cad.areaM2 == null) continue;
      const delta = target != null ? Math.abs(cad.areaM2 - target) : cad.areaM2;
      if (delta < bestDelta) {
        best = cad;
        bestDelta = delta;
      }
    }
    if (!best) {
      best = unusedCad.find((cad) => !taken.has(cad) && roomHasMeasure(cad)) ?? null;
    }
    if (!best) return room;
    taken.add(best);
    return {
      ...room,
      widthM: best.widthM ?? room.widthM,
      lengthM: best.lengthM ?? room.lengthM,
      areaM2: room.areaM2 ?? best.areaM2,
      source: best.source === "cad" ? "cad" : room.source,
    };
  });
}

/**
 * One CAD polygon for living+kitchen: one booklet row with that measure, not
 * two rows where one is empty.
 */
export function mergeOpenPlanLivingKitchen(
  rooms: FloorplanRoom[],
  grossM2?: number,
): FloorplanRoom[] {
  const living = rooms.find((room) => roomKindOf(room) === "living");
  const kitchen = rooms.find((room) => roomKindOf(room) === "kitchen");
  if (!living || !kitchen) return rooms;
  const kitchenBox = kitchen.widthM != null && kitchen.lengthM != null;
  const livingBox = living.widthM != null && living.lengthM != null;
  if (kitchenBox && livingBox) return rooms;
  const kitchenLarge =
    kitchen.areaM2 != null && grossM2 != null && kitchen.areaM2 > grossM2 * 0.22;
  const open =
    (kitchenBox && !livingBox) ||
    (livingBox && !kitchenBox) ||
    (kitchenLarge && !livingBox) ||
    (living.areaM2 != null && !livingBox && !kitchenBox);
  if (!open) return rooms;
  const src =
    kitchenBox || (kitchen.areaM2 ?? 0) >= (living.areaM2 ?? 0) ? kitchen : living;
  const merged: FloorplanRoom = {
    name: "מגורים ומטבח",
    kind: "living",
    widthM: src.widthM ?? living.widthM ?? kitchen.widthM,
    lengthM: src.lengthM ?? living.lengthM ?? kitchen.lengthM,
    areaM2: src.areaM2 ?? living.areaM2 ?? kitchen.areaM2,
    source: src.source ?? living.source,
  };
  const out: FloorplanRoom[] = [];
  for (const room of rooms) {
    const kind = roomKindOf(room);
    if (kind === "kitchen") continue;
    if (kind === "living") {
      out.push(merged);
      continue;
    }
    out.push(room);
  }
  return out;
}

/** Printed program names, filled with CAD width/length/area when the box is usable. */
export function applyCadMeasuresToBookletRooms(
  program: FloorplanRoom[],
  cadRooms: FloorplanRoom[],
  grossM2?: number,
): FloorplanRoom[] {
  const aligned = alignCadRoomsToProgram(program, cadRooms);
  const poolRooms = cadPoolForBooklet(aligned, grossM2);
  const pool = new Map<string, FloorplanRoom[]>();
  for (const room of poolRooms) {
    const kind = roomKindOf(room);
    const list = pool.get(kind) ?? [];
    list.push(room);
    pool.set(kind, list);
  }
  const usedCad = new Set<FloorplanRoom>();
  const used = new Map<string, number>();
  const stamped = program.map((room) => {
    const kind = roomKindOf(room);
    const i = used.get(kind) ?? 0;
    used.set(kind, i + 1);
    const cad = (pool.get(kind) ?? [])[i];
    if (!cad) return stripUnusableRoomMeasures(room, grossM2);
    usedCad.add(cad);
    const widthM = cad.widthM ?? room.widthM;
    const lengthM = cad.lengthM ?? room.lengthM;
    // Printed terrace m² stay; indoor figures come from the CAD box, not a
    // vision guess that happened to sit on the same name.
    const areaM2 =
      kind === "balcony" && room.areaM2 != null ? room.areaM2 : (cad.areaM2 ?? room.areaM2);
    if (widthM == null && lengthM == null && areaM2 == null) return room;
    return {
      ...room,
      widthM,
      lengthM,
      areaM2,
      source: cad.source === "cad" ? "cad" : room.source,
    };
  });
  const unused = poolRooms.filter((room) => !usedCad.has(room));
  const filled = fillUnmatchedCadByArea(stamped, unused);
  return mergeOpenPlanLivingKitchen(applyOpenPlanArea(filled, aligned, grossM2), grossM2);
}

/** Open-plan living+kitchen is one CAD polygon — keep the area, drop the L-bbox. */
function applyOpenPlanArea(
  program: FloorplanRoom[],
  cadRooms: FloorplanRoom[],
  grossM2?: number,
): FloorplanRoom[] {
  const living = program.find((room) => roomKindOf(room) === "living");
  if (!living || living.areaM2 != null) return program;
  const kitchen = program.find((room) => roomKindOf(room) === "kitchen");
  // Kitchen already carries the open-plan measure — do not copy it onto living.
  if (kitchen && roomHasMeasure(kitchen)) return program;
  const blob = cadRooms.find((room) => {
    const kind = roomKindOf(room);
    return (kind === "kitchen" || kind === "living") && isUnusableCadRoom(room, grossM2) && room.areaM2 != null;
  });
  if (!blob?.areaM2) return program;
  return program.map((room) => {
    if (roomKindOf(room) !== "living" || room.areaM2 != null) return room;
    return {
      ...room,
      areaM2: blob.areaM2,
      widthM: undefined,
      lengthM: undefined,
      source: "cad",
    };
  });
}

export function cadMeasureCount(rooms: FloorplanRoom[]): number {
  return rooms.filter(
    (room) => room.widthM != null || room.lengthM != null || (room.source === "cad" && room.areaM2 != null),
  ).length;
}

/** Width×length from room boxes when the export never received CAD metres. */
export function applyBboxMeasuresToLayout(layout: FloorplanLayout): FloorplanLayout {
  const boxed = layout.rooms.filter((room) => room.bbox && !isBuildingCoreRoom(room));
  if (boxed.length < 2) return layout;
  const sumNorm = boxed.reduce((sum, room) => sum + room.bbox!.w * room.bbox!.h, 0);
  const scale =
    layout.grossAreaM2 && layout.grossAreaM2 > 0 && sumNorm > 0
      ? Math.sqrt(layout.grossAreaM2 / sumNorm)
      : null;
  return parseFloorplanLayout({
    ...layout,
    rooms: layout.rooms.map((room) => {
      if (!room.bbox || (room.widthM != null && room.lengthM != null)) return room;
      const bw = room.bbox.w;
      const bh = room.bbox.h;
      if (!(bw > 0 && bh > 0)) return room;
      let widthM = room.widthM;
      let lengthM = room.lengthM;
      let areaM2 = room.areaM2;
      if (areaM2 && areaM2 > 0) {
        const aspect = bw / bh;
        widthM = widthM ?? Math.round(Math.sqrt(areaM2 * aspect) * 100) / 100;
        lengthM = lengthM ?? Math.round(Math.sqrt(areaM2 / aspect) * 100) / 100;
      } else if (scale) {
        widthM = widthM ?? Math.round(bw * scale * 100) / 100;
        lengthM = lengthM ?? Math.round(bh * scale * 100) / 100;
        if (areaM2 == null && widthM != null && lengthM != null) {
          areaM2 = Math.round(widthM * lengthM * 100) / 100;
        }
      }
      if (widthM == null && lengthM == null) return room;
      return { ...room, widthM, lengthM, areaM2 };
    }),
  });
}

/** Area figures a sheet prints that can be a terrace: not the gross, not a room-sized hall. */
export function terraceFigures<T extends { value: number }>(figures: T[], grossM2?: number): T[] {
  return figures.filter(
    (fig) =>
      fig.value >= 2.5 &&
      fig.value <= 16 &&
      !(grossM2 != null && Math.abs(fig.value - grossM2) < 0.05),
  );
}

/**
 * The printed program, read off this sheet rather than looked up by unit number.
 *
 * Room counts come from the extract, which reads the names the sheet prints.
 * Terraces come from the extract when it found them, else from the area figures
 * the sheet prints as text.
 *
 * What this cannot know is a terrace's level. None of the ten survey sheets
 * prints its ⊕ marks as text — they are vector outlines — so a roof terrace
 * that the extract missed is counted on the floor plate. The survey reports
 * the flats where that moves the scale target.
 */
export function printedTruthFromSheet(
  layout: FloorplanLayout,
  sheet: { areas: PlacedNumber[] },
  grossM2: number | undefined = layout.grossAreaM2,
): PrintedUnitTruth | undefined {
  if (grossM2 == null || !(grossM2 > 0)) return undefined;
  const living = layout.rooms.filter((room) => !isBuildingCoreRoom(room));
  const counts = printedTruthFromRooms(living, grossM2);
  if (!counts) return undefined;
  const terraces: PrintedTerrace[] =
    counts.terraces.length > 0
      ? counts.terraces
      : terraceFigures(sheet.areas, grossM2).map((fig) => ({ m2: fig.value }));
  return { ...counts, grossM2, terraces };
}

export function enrichLayoutForBooklet(
  layout: FloorplanLayout,
  extra?: {
    unitTitle?: string;
    sourceFileName?: string | null;
    sheetText?: string;
    /** The program printed on the sheet, when the caller could read it. */
    truth?: PrintedUnitTruth;
  },
): FloorplanLayout {
  const blob = [
    layout.unitLabel,
    layout.title,
    extra?.unitTitle,
    extra?.sourceFileName,
    extra?.sheetText,
    ...layout.notes,
    ...layout.dimensionStrings,
  ]
    .filter((row): row is string => Boolean(row && row.trim()))
    .join("\n");
  const unit = extractUnitLabel(blob) || layout.unitLabel;
  const gross = layout.grossAreaM2 ?? extractGrossAreaM2(blob);
  const floor = layout.floor ?? extractFloorLabel(blob);
  const known = extra?.truth;
  const grossM2 = known?.grossM2 ?? gross ?? layout.grossAreaM2;
  const measured = applyBboxMeasuresToLayout({
    ...layout,
    unitLabel: unit || layout.unitLabel,
    grossAreaM2: grossM2,
  });
  const tableRooms = roomsForBookletTable(measured, known);
  const rooms = known
    ? applyCadMeasuresToBookletRooms(
        bookletRoomsFromPrintedTruth(known),
        measured.rooms,
        known.grossM2,
      )
    : tableRooms;
  return parseFloorplanLayout({
    title: unit || layout.title,
    unitLabel: unit || layout.unitLabel,
    floor: floor || layout.floor,
    ceilingHeightM: layout.ceilingHeightM,
    north: layout.north,
    grossAreaM2: known?.grossM2 ?? gross ?? layout.grossAreaM2,
    rooms: rooms.length > 0 ? rooms : layout.rooms,
    dimensionStrings: layout.dimensionStrings,
    notes: layout.notes,
    islandStoolCount: layout.islandStoolCount,
    internalStairs: layout.internalStairs,
    requiresReview: layout.requiresReview,
  });
}

export function pickRicherBookletLayout(
  posted: FloorplanLayout,
  stored?: FloorplanLayout | null,
): FloorplanLayout {
  if (!stored) return posted;
  const postedCad = cadMeasureCount(posted.rooms);
  const storedCad = cadMeasureCount(stored.rooms);
  const rooms =
    storedCad > postedCad
      ? stored.rooms
      : posted.rooms.length > 0
        ? posted.rooms
        : stored.rooms;
  return {
    ...posted,
    title: posted.title || stored.title,
    unitLabel: posted.unitLabel || stored.unitLabel,
    floor: posted.floor || stored.floor,
    grossAreaM2: posted.grossAreaM2 ?? stored.grossAreaM2,
    ceilingHeightM: posted.ceilingHeightM ?? stored.ceilingHeightM,
    rooms,
  };
}

/**
 * Prefer printed names with CAD metres.
 *
 * Never replace a full sales program with a thinner CAD box list — that is how
 * דירה 18's cover shrank to kitchen / bedroom / ממ"ד and dropped living, baths
 * and terraces. Incomplete measures with the right names beat a wrong inventory.
 */
export function bookletRoomsFromCadOrProgram(
  program: FloorplanRoom[],
  cadRooms: FloorplanRoom[],
  grossM2?: number,
): FloorplanRoom[] {
  const stamped = applyCadMeasuresToBookletRooms(program, cadRooms, grossM2);
  const programHabitable = program.filter((room) => {
    if (isBuildingCoreRoom(room)) return false;
    const kind = room.kind ?? inferRoomKind(room.name);
    return (
      kind === "living" ||
      kind === "kitchen" ||
      kind === "bedroom" ||
      kind === "mmd" ||
      kind === "bathroom"
    );
  }).length;
  if (programHabitable >= 4) return stamped;
  if (
    stamped.filter((room) => {
      const kind = room.kind ?? inferRoomKind(room.name);
      return kind !== "balcony" && !isBuildingCoreRoom(room) && room.widthM != null && room.lengthM != null;
    }).length >= 2
  ) {
    return stamped;
  }
  const measured = cadRooms.filter((room) => room.widthM != null && room.lengthM != null);
  if (measured.length >= 2 && measured.length >= program.length) return measured;
  return stamped;
}

/** Indoor rooms without width×length — the export should remasure from the PDF. */
export function bookletNeedsCadRemasure(layout: FloorplanLayout): boolean {
  const indoor = layout.rooms.filter((room) => {
    if (isBuildingCoreRoom(room)) return false;
    const kind = room.kind ?? inferRoomKind(room.name);
    return kind !== "balcony";
  });
  const measured = indoor.filter((room) => room.widthM != null && room.lengthM != null).length;
  return measured < 2;
}

/** Counts printed on the sheet — no invented room dimensions. */
export function bookletRoomsFromPrintedTruth(truth: PrintedUnitTruth): FloorplanRoom[] {
  const rooms: FloorplanRoom[] = [
    { name: "מגורים", kind: "living", source: "ocr_verified" },
    { name: "מטבח", kind: "kitchen", source: "ocr_verified" },
  ];
  for (let i = 1; i <= truth.bedrooms; i += 1) {
    rooms.push({ name: `חדר שינה ${i}`, kind: "bedroom", source: "ocr_verified" });
  }
  if (truth.mmd > 0) {
    rooms.push({ name: 'ממ"ד', kind: "mmd", source: "ocr_verified" });
  }
  for (let i = 1; i <= truth.bathrooms; i += 1) {
    rooms.push({
      name: truth.bathrooms > 1 ? `חדר רחצה ${i}` : "חדר רחצה",
      kind: "bathroom",
      source: "ocr_verified",
    });
  }
  floorPlateTerraces(truth).forEach((terrace, i, all) => {
    rooms.push({
      name: all.length > 1 ? `מרפסת ${i + 1}` : "מרפסת",
      kind: "balcony",
      areaM2: terrace.m2,
      source: "ocr_verified",
    });
  });
  return rooms;
}

/**
 * CAD often drops a hatched terrace or a wet room when the sheet's area
 * figures are outlines, not a text layer. Fill the printed program so the
 * photoreal prompt still names every terrace and bath the buyer can see.
 */
export function overlayPrintedProgram(
  layout: FloorplanLayout,
  truth?: PrintedUnitTruth,
): FloorplanLayout {
  const known = truth;
  if (!known) return layout;
  const kindOf = (room: FloorplanRoom) => room.kind ?? inferRoomKind(room.name);
  // Sales stills follow the sheet hatch — not only same-⊕ floor-plate decks.
  const wantTerraces = sheetTerracesForViz(known);
  const cadTerraces = layout.rooms.filter((room) => kindOf(room) === "balcony");
  const terraceMatch =
    cadTerraces.length === wantTerraces.length &&
    wantTerraces.every((terrace) =>
      cadTerraces.some((room) => room.areaM2 != null && Math.abs(room.areaM2 - terrace.m2) < 0.15),
    );
  let rooms = terraceMatch
    ? layout.rooms
    : [
        ...layout.rooms.filter((room) => kindOf(room) !== "balcony"),
        ...wantTerraces.map((terrace, i) => ({
          name: wantTerraces.length > 1 ? `מרפסת ${i + 1}` : "מרפסת",
          kind: "balcony" as const,
          areaM2: terrace.m2,
          source: "ocr_verified" as const,
        })),
      ];
  const bathrooms = rooms.filter((room) => kindOf(room) === "bathroom").length;
  for (let i = bathrooms; i < known.bathrooms; i += 1) {
    rooms = [
      ...rooms,
      {
        name: known.bathrooms > 1 ? `חדר רחצה ${i + 1}` : "חדר רחצה",
        kind: "bathroom" as const,
        source: "ocr_verified" as const,
      },
    ];
  }
  return parseFloorplanLayout({
    ...layout,
    grossAreaM2: known.grossM2,
    rooms,
  });
}

export function layoutForHonestBooklet(
  base: FloorplanLayout,
  truth?: PrintedUnitTruth,
): FloorplanLayout {
  const rooms = truth
    ? bookletRoomsFromPrintedTruth(truth)
    : dropUnusableCadRooms(base.rooms, base.grossAreaM2);
  const unitTitle = base.unitLabel
    ? /^דירה\b/u.test(base.unitLabel.trim())
      ? base.unitLabel.trim()
      : `דירה ${base.unitLabel.replace(/^דירה\s*/u, "").trim()}`
    : base.title;
  const floorFromNotes = base.notes.find((note) => /^קומה\s/u.test(note.trim()));
  return parseFloorplanLayout({
    title: unitTitle,
    unitLabel: base.unitLabel,
    floor: base.floor ?? floorFromNotes,
    ceilingHeightM: base.ceilingHeightM,
    north: base.north,
    grossAreaM2: truth?.grossM2 ?? base.grossAreaM2,
    rooms,
    dimensionStrings: base.dimensionStrings,
    notes: [
      ...base.notes,
      truth
        ? "מספר החללים לפי מה שמודפס בתוכנית. אין מידות חדר בודד כשחיתוך ה-CAD מיזג חללים."
        : "חללים עם מידות בלתי סבירות הוסרו מהטבלה.",
    ],
    islandStoolCount: base.islandStoolCount,
    internalStairs: base.internalStairs,
    requiresReview: true,
  });
}
