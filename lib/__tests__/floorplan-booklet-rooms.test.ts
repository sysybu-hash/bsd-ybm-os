import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import {
  applyBboxMeasuresToLayout,
  applyCadMeasuresToBookletRooms,
  bookletNeedsCadRemasure,
  bookletRoomsFromCadOrProgram,
  bookletRoomsFromPrintedTruth,
  cadMeasureCount,
  dropUnusableCadRooms,
  enrichLayoutForBooklet,
  overlayKnownSheetProgram,
  floorPlateTerraces,
  knownSheetTruth,
  layoutForHonestBooklet,
  pickRicherBookletLayout,
  roomsForBookletTable,
} from "@/lib/projects/floorplan-booklet-rooms";

describe("honest booklet rooms", () => {
  it("drops a merged kitchen blob and a corridor-thin bathroom", () => {
    const rooms = dropUnusableCadRooms(
      [
        { name: "מטבח", kind: "kitchen", areaM2: 33.9 },
        { name: "חדר רחצה 2", kind: "bathroom", widthM: 0.76, lengthM: 4.93, areaM2: 2.76 },
        { name: "חדר שינה 1", kind: "bedroom", areaM2: 8.36, widthM: 3.28, lengthM: 2.55 },
      ],
      111.29,
    );
    expect(rooms.map((room) => room.name)).toEqual(["חדר שינה 1"]);
  });

  it("lists printed counts without inventing room dimensions", () => {
    const rooms = bookletRoomsFromPrintedTruth({
      grossM2: 111.29,
      bedrooms: 4,
      mmd: 1,
      bathrooms: 2,
      terraces: [{ m2: 4.1 }, { m2: 6.4 }, { m2: 3.16 }],
    });
    expect(rooms.filter((room) => room.kind === "bedroom")).toHaveLength(4);
    expect(rooms.filter((room) => room.kind === "living")).toHaveLength(1);
    expect(rooms.find((room) => room.kind === "balcony")?.areaM2).toBe(4.1);
    expect(rooms.find((room) => room.kind === "bedroom")?.areaM2).toBeUndefined();
  });

  it("prefers the printed sheet over a CAD merge", () => {
    const cad = parseFloorplanLayout({
      unitLabel: "14",
      grossAreaM2: 111.29,
      rooms: [{ name: "מטבח", kind: "kitchen", areaM2: 33.9, source: "cad" }],
    });
    const booklet = layoutForHonestBooklet(cad, {
      grossM2: 111.29,
      bedrooms: 4,
      mmd: 1,
      bathrooms: 2,
      terraces: [{ m2: 4.1 }],
    });
    expect(booklet.rooms.filter((room) => room.kind === "bedroom")).toHaveLength(4);
    expect(booklet.rooms.some((room) => room.areaM2 === 33.9)).toBe(false);
    expect(booklet.title).toBe("דירה 14");
    expect(booklet.rooms.find((room) => room.kind === "living")?.source).toBe("ocr_verified");
  });

  it("keeps a printed program on the cover when CAD rooms were merged", () => {
    const cad = parseFloorplanLayout({
      unitLabel: "14",
      grossAreaM2: 111.29,
      rooms: [
        { name: "מטבח", kind: "kitchen", areaM2: 33.9, source: "cad" },
        { name: "חדר שינה 1", kind: "bedroom", areaM2: 8.4, source: "cad" },
        { name: "חדר שינה 2", kind: "bedroom", areaM2: 9.1, source: "cad" },
        { name: "חדר שינה 3", kind: "bedroom", areaM2: 10, source: "cad" },
        { name: "חדר שינה 4", kind: "bedroom", areaM2: 9.5, source: "cad" },
        { name: "חדר רחצה 1", kind: "bathroom", widthM: 0.76, lengthM: 4.93, areaM2: 2.76, source: "cad" },
        { name: "חדר רחצה 2", kind: "bathroom", areaM2: 4.2, source: "cad" },
        { name: 'ממ"ד', kind: "mmd", areaM2: 9, source: "cad" },
      ],
    });
    const rooms = roomsForBookletTable(cad);
    expect(rooms.filter((room) => room.kind === "bedroom")).toHaveLength(4);
    expect(rooms.some((room) => room.kind === "living" || room.name === "מגורים ומטבח")).toBe(true);
    expect(rooms.some((room) => room.kind === "bathroom")).toBe(true);
  });

  it("uses the stored run layout when the export payload has no rooms", () => {
    const posted = parseFloorplanLayout({ rooms: [] });
    const stored = parseFloorplanLayout({
      unitLabel: "דירה 14",
      grossAreaM2: 111.29,
      rooms: [{ name: "חדר שינה 1", kind: "bedroom", areaM2: 9, source: "cad" }],
    });
    const picked = pickRicherBookletLayout(posted, stored);
    expect(picked.unitLabel).toBe("דירה 14");
    expect(picked.rooms).toHaveLength(1);
    expect(picked.grossAreaM2).toBe(111.29);
  });

  it("fills unit, printed area and rooms from the known sheet when the payload is empty", () => {
    const empty = parseFloorplanLayout({ rooms: [] });
    const booklet = enrichLayoutForBooklet(empty, {
      unitTitle: "דירה 14",
      sourceFileName: "דירה 14 .pdf",
    });
    expect(booklet.unitLabel).toMatch(/דירה 14/);
    expect(booklet.grossAreaM2).toBe(111.29);
    expect(booklet.rooms.filter((room) => room.kind === "bedroom")).toHaveLength(4);
    expect(knownSheetTruth("דירה 14")?.grossM2).toBe(111.29);
  });

  it("does not cross-wire flats that share a printed gross area", () => {
    // דירה 19 and 23 are both 57 מ"ר; area-only used to pick the first hit.
    expect(knownSheetTruth(undefined, 57)).toBeUndefined();
    expect(knownSheetTruth(undefined, 59.01)).toBeUndefined();
    expect(knownSheetTruth("דירה 19", 57)?.terraces).toEqual([{ m2: 4.7, levelM: 11.42 }]);
    expect(knownSheetTruth("דירה 23", 57)?.terraces).toEqual([{ m2: 3.3, levelM: 14.36 }]);
    expect(knownSheetTruth("דירה 18", 59.01)?.terraces?.[0]?.m2).toBe(4.6);
    expect(knownSheetTruth("דירה 22", 59.01)?.terraces?.[0]?.m2).toBe(3.3);
  });

  it("writes CAD width and length onto the printed room list", () => {
    const program = bookletRoomsFromPrintedTruth({
      grossM2: 111.29,
      bedrooms: 4,
      mmd: 1,
      bathrooms: 2,
      terraces: [{ m2: 4.1 }],
    });
    const rooms = applyCadMeasuresToBookletRooms(program, [
      { name: "ח.שינה 1", kind: "bedroom", widthM: 3.28, lengthM: 2.55, areaM2: 8.36, source: "cad" },
      { name: "ח.שינה 2", kind: "bedroom", widthM: 3.1, lengthM: 2.8, areaM2: 8.7, source: "cad" },
      { name: "מטבח", kind: "kitchen", areaM2: 33.9, source: "cad" },
    ], 111.29);
    const bed1 = rooms.find((room) => room.name === "חדר שינה 1");
    expect(bed1?.widthM).toBe(3.28);
    expect(bed1?.lengthM).toBe(2.55);
    expect(bed1?.source).toBe("cad");
    // Large kitchen CAD is the open-plan volume — stamped onto מגורים ומטבח.
    expect(rooms.some((room) => room.name === "מגורים ומטבח")).toBe(true);
    expect(rooms.find((room) => room.name === "מגורים ומטבח")?.areaM2).toBe(33.9);
    expect(rooms.find((room) => room.kind === "balcony")?.areaM2).toBe(4.1);
  });

  it("prefers the CAD box over an extracted guess on the same room", () => {
    const rooms = applyCadMeasuresToBookletRooms(
      [{ name: "חדר שינה 1", kind: "bedroom", areaM2: 12, source: "inferred" }],
      [{ name: "ח.שינה 1", kind: "bedroom", widthM: 3.28, lengthM: 2.55, areaM2: 8.36, source: "cad" }],
      111.29,
    );
    expect(rooms[0]?.areaM2).toBe(8.36);
    expect(rooms[0]?.source).toBe("cad");
  });

  it("keeps stored CAD rooms when the export payload only has names", () => {
    const posted = parseFloorplanLayout({
      rooms: [
        { name: "מגורים", kind: "living" },
        { name: "חדר שינה 1", kind: "bedroom" },
      ],
    });
    const stored = parseFloorplanLayout({
      unitLabel: "דירה 14",
      rooms: [{ name: "חדר שינה 1", kind: "bedroom", widthM: 3.28, lengthM: 2.55, areaM2: 8.36, source: "cad" }],
    });
    const picked = pickRicherBookletLayout(posted, stored);
    expect(cadMeasureCount(picked.rooms)).toBe(1);
    expect(picked.rooms[0]?.widthM).toBe(3.28);
  });

  it("keeps the printed program when CAD boxes did not match room kinds", () => {
    // Falling back to the CAD list used to shrink דירה 18's cover to three
    // mislabeled rooms and drop living, baths and terraces.
    const rooms = bookletRoomsFromCadOrProgram(
      bookletRoomsFromPrintedTruth({
        grossM2: 114.11,
        bedrooms: 4,
        mmd: 1,
        bathrooms: 2,
        terraces: [{ m2: 4.1 }],
      }),
      [
        { name: "חלל 1", kind: "other", widthM: 3.4, lengthM: 2.8, areaM2: 9.5, source: "cad" },
        { name: "חלל 2", kind: "other", widthM: 3.1, lengthM: 3.0, areaM2: 9.3, source: "cad" },
        { name: "חלל 3", kind: "other", widthM: 2.9, lengthM: 2.6, areaM2: 7.5, source: "cad" },
      ],
      114.11,
    );
    expect(rooms.filter((room) => room.kind === "bedroom")).toHaveLength(4);
    expect(rooms.some((room) => room.kind === "living")).toBe(true);
    expect(rooms.some((room) => room.kind === "bathroom")).toBe(true);
    expect(rooms.some((room) => room.name === "חלל 1")).toBe(false);
  });

  it("does not let a sparse CAD remasure wipe דירה 18's printed rooms", () => {
    const program = bookletRoomsFromPrintedTruth(knownSheetTruth("דירה 18", 59.01)!);
    const rooms = bookletRoomsFromCadOrProgram(
      program,
      [
        { name: "מטבח", kind: "kitchen", widthM: 6.18, lengthM: 4.7, areaM2: 22.93, source: "cad" },
        { name: "חדר שינה", kind: "bedroom", widthM: 3.12, lengthM: 2.52, areaM2: 7.67, source: "cad" },
        { name: 'ממ"ד', kind: "mmd", widthM: 2.6, lengthM: 3.02, areaM2: 7.62, source: "cad" },
      ],
      59.01,
    );
    expect(rooms.filter((room) => room.kind === "bedroom")).toHaveLength(2);
    expect(rooms.filter((room) => room.kind === "balcony").map((room) => room.areaM2)).toEqual([4.6, 8]);
    expect(rooms.some((room) => room.name === "מגורים ומטבח" || room.kind === "living")).toBe(true);
    expect(rooms.some((room) => room.kind === "bathroom")).toBe(true);
    expect(rooms.some((room) => room.kind === "mmd")).toBe(false);
    const open = rooms.find((room) => room.name === "מגורים ומטבח");
    expect(open?.widthM).toBe(6.18);
    expect(open?.lengthM).toBe(4.7);
    expect(rooms.find((room) => room.name === "חדר שינה 2")?.widthM).toBe(2.6);
    expect(rooms.filter((room) => room.kind === "balcony").every((room) => room.areaM2 != null)).toBe(true);

    const sparse = parseFloorplanLayout({
      unitLabel: "דירה 18",
      grossAreaM2: 59.01,
      rooms: [
        { name: "מטבח", kind: "kitchen", widthM: 6.18, lengthM: 4.7, areaM2: 22.93, source: "cad" },
        { name: "חדר שינה", kind: "bedroom", widthM: 3.12, lengthM: 2.52, areaM2: 7.67, source: "cad" },
        { name: 'ממ"ד', kind: "mmd", widthM: 2.6, lengthM: 3.02, areaM2: 7.62, source: "cad" },
      ],
    });
    const table = roomsForBookletTable(sparse);
    expect(table.filter((room) => room.kind === "bedroom")).toHaveLength(2);
    expect(table.some((room) => room.name === "מגורים ומטבח")).toBe(true);
    expect(table.filter((room) => room.kind === "balcony")).toHaveLength(2);
  });

  it("fills width and length from room boxes when metres are missing", () => {
    const layout = applyBboxMeasuresToLayout(
      parseFloorplanLayout({
        grossAreaM2: 80,
        rooms: [
          { name: "חדר שינה 1", kind: "bedroom", bbox: { x: 0.1, y: 0.1, w: 0.3, h: 0.25 }, source: "cad" },
          { name: "חדר שינה 2", kind: "bedroom", bbox: { x: 0.45, y: 0.1, w: 0.25, h: 0.25 }, source: "cad" },
          { name: "מטבח", kind: "kitchen", bbox: { x: 0.1, y: 0.45, w: 0.4, h: 0.3 }, source: "cad" },
        ],
      }),
    );
    const bed = layout.rooms.find((room) => room.name === "חדר שינה 1");
    expect(bed?.widthM).toBeGreaterThan(2);
    expect(bed?.lengthM).toBeGreaterThan(2);
    expect(roomsForBookletTable(layout).find((room) => room.name === "חדר שינה 1")?.widthM).toBe(
      bed?.widthM,
    );
  });

  it("asks for a PDF remasure when indoor rooms have no width and length", () => {
    const empty = enrichLayoutForBooklet(parseFloorplanLayout({ rooms: [] }), {
      unitTitle: "דירה 14",
      sourceFileName: "דירה 14 .pdf",
    });
    expect(bookletNeedsCadRemasure(empty)).toBe(true);
    const measured = parseFloorplanLayout({
      grossAreaM2: 111.29,
      rooms: [
        { name: "חדר שינה 1", kind: "bedroom", widthM: 3.2, lengthM: 2.5, source: "cad" },
        { name: "חדר שינה 2", kind: "bedroom", widthM: 3.0, lengthM: 2.6, source: "cad" },
        { name: "מרפסת 1", kind: "balcony", areaM2: 4.1, source: "ocr_verified" },
      ],
    });
    expect(bookletNeedsCadRemasure(measured)).toBe(false);
  });

  it("keeps a roof terrace off the floor-plate room list", () => {
    const rooms = bookletRoomsFromPrintedTruth({
      grossM2: 59.01,
      bedrooms: 2,
      mmd: 0,
      bathrooms: 1,
      levelM: 11.42,
      terraces: [
        { m2: 4.6, levelM: 11.42 },
        { m2: 8, levelM: 11.42 },
        { m2: 5.2, levelM: 12.79 },
      ],
    });
    expect(floorPlateTerraces({
      grossM2: 59.01,
      bedrooms: 2,
      mmd: 0,
      bathrooms: 1,
      levelM: 11.42,
      terraces: [
        { m2: 4.6, levelM: 11.42 },
        { m2: 8, levelM: 11.42 },
        { m2: 5.2, levelM: 12.79 },
      ],
    }).map((row) => row.m2)).toEqual([4.6, 8]);
    expect(rooms.filter((room) => room.kind === "balcony").map((room) => room.areaM2)).toEqual([4.6, 8]);
  });

  it("fills printed terraces and a missing bath when CAD dropped them", () => {
    const known = knownSheetTruth("דירה 18", 59.01);
    expect(known?.bedrooms).toBe(2);
    const overlay = overlayKnownSheetProgram(
      parseFloorplanLayout({
        unitLabel: "דירה 18",
        grossAreaM2: 59.01,
        rooms: [
          { name: "מגורים", kind: "living" },
          { name: "מטבח", kind: "kitchen" },
          { name: "חדר שינה 1", kind: "bedroom" },
          { name: "חדר שינה 2", kind: "bedroom" },
          { name: "מרפסת", kind: "balcony", areaM2: 5.2 },
        ],
      }),
    );
    expect(overlay.rooms.filter((room) => room.kind === "bathroom")).toHaveLength(1);
    expect(overlay.rooms.filter((room) => room.kind === "balcony").map((room) => room.areaM2)).toEqual(
      [4.6, 8, 5.2],
    );
  });

  it("keeps sheet מרפסת on דירה 23 even when ⊕ differs from the flat", () => {
    const overlay = overlayKnownSheetProgram(
      parseFloorplanLayout({
        unitLabel: "דירה 23",
        grossAreaM2: 57,
        rooms: [
          { name: "מגורים", kind: "living" },
          { name: "מטבח", kind: "kitchen" },
          { name: "חדר שינה 1", kind: "bedroom", bedCount: 2 },
          { name: "חדר שינה 2", kind: "bedroom", bedCount: 1 },
          { name: "חדר רחצה", kind: "bathroom" },
        ],
      }),
    );
    expect(overlay.rooms.filter((room) => room.kind === "balcony").map((room) => room.areaM2)).toEqual([
      3.3,
    ]);
  });
});
