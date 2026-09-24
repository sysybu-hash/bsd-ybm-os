import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";
import {
  assignFurniture,
  isEnvelopeOpening,
  markEntranceHall,
  roomsForLayout,
  segmentRooms,
  type SegmentedRoom,
} from "@/lib/projects/floorplan-segment";
import type { Opening, SpanRow, WallBody } from "@/lib/projects/floorplan-solid";

const UPM = 56;

/** A flat 6 m by 4 m, split down the middle by a partition with a doorway. */
const wall = (b: Partial<WallBody>): WallBody => ({
  orientation: "h",
  centre: 0,
  thickness: 10,
  from: 0,
  to: 0,
  ...b,
});

const W = 6 * UPM;
const H = 4 * UPM;
const shell: WallBody[] = [
  wall({ orientation: "h", centre: 0, from: 0, to: W }),
  wall({ orientation: "h", centre: H, from: 0, to: W }),
  wall({ orientation: "v", centre: 0, from: 0, to: H }),
  wall({ orientation: "v", centre: W, from: 0, to: H }),
];
const divider = wall({ orientation: "v", centre: W / 2, from: 0, to: H });
const bounds = { x: -20, y: -20, width: W + 40, height: H + 40 };

/** Floor over the whole shell, at the pitch interiorComponents uses. */
const floor: SpanRow[] = [];
for (let y = 0; y <= H; y += 2) floor.push({ y, spans: [[0, W]] });

const piece = (
  x: number,
  y: number,
  kind: FurniturePiece["kind"],
): FurniturePiece => ({
  x,
  y,
  w: UPM * 0.9,
  h: UPM * 0.9,
  widthCm: 90,
  depthCm: 90,
  kind,
});

const run = (furniture: FurniturePiece[], bodies = [...shell, divider]) =>
  segmentRooms({
    bodies,
    openings: [],
    floor,
    furniture,
    bounds,
    unitsPerMetre: UPM,
  });

describe("which room a piece stands in", () => {
  /** A region with a hole in it where the piece's own outline stopped the flood. */
  const withHole = (x0: number, x1: number, y0: number, y1: number, hole: [number, number, number, number]) => {
    const rows: SpanRow[] = [];
    for (let y = y0; y < y1; y += 2) {
      const [hx0, hx1, hy0, hy1] = hole;
      rows.push({ y, spans: y >= hy0 && y < hy1 ? [[x0, hx0], [hx1, x1]] : [[x0, x1]] });
    }
    return rows;
  };
  const at = (x: number, y: number, wCm: number, hCm: number, kind: FurniturePiece["kind"]): FurniturePiece => ({
    x,
    y,
    w: (wCm / 100) * UPM,
    h: (hCm / 100) * UPM,
    widthCm: wCm,
    depthCm: hCm,
    kind,
  });

  it("gives a bed drawn as a closed island to the room round it", () => {
    // דירה 15's ממ"ד came back "other" because the bed's centre was in no region.
    const bed = at(UPM, UPM, 90, 200, "bed");
    const room = withHole(0, 4 * UPM, 0, 4 * UPM, [bed.x, bed.x + bed.w, bed.y, bed.y + bed.h]);
    expect(assignFurniture([room], [bed], UPM).get(bed)).toBe(0);
  });

  it("leaves a small island where it is, like a balcony's drain", () => {
    const drain = at(UPM, UPM, 37, 37, "fixture");
    const cell = withHole(0, 2 * UPM, 0, 1.5 * UPM, [drain.x, drain.x + drain.w, drain.y, drain.y + drain.h]);
    expect(assignFurniture([cell], [drain], UPM).has(drain)).toBe(false);
  });

  it("gives a pan to a WC cell but not to a living room", () => {
    const pan = at(0.5 * UPM, 0.5 * UPM, 40, 68, "fixture");
    const hole: [number, number, number, number] = [pan.x, pan.x + pan.w, pan.y, pan.y + pan.h];
    const wc = withHole(0, 1.4 * UPM, 0, 1.8 * UPM, hole);
    const living = withHole(0, 5 * UPM, 0, 4 * UPM, hole);
    expect(assignFurniture([wc], [pan], UPM).get(pan)).toBe(0);
    expect(assignFurniture([living], [pan], UPM).has(pan)).toBe(false);
  });
});

describe("segmentRooms", () => {
  describe("the ממ\"ד", () => {
    const beds = [piece(UPM, UPM, "bed"), piece(4 * UPM, UPM, "bed")];

    it("is the bedroom the sheet's +2 sill mark stands at", () => {
      const rooms = segmentRooms({
        bodies: [...shell, divider],
        openings: [],
        floor,
        furniture: beds,
        bounds,
        unitsPerMetre: UPM,
        shelterMarks: [{ x: W - 0.3 * UPM, y: H + 0.2 * UPM }],
      });
      const shelter = rooms.filter((room) => room.kind === "mmd");
      expect(shelter).toHaveLength(1);
      expect(shelter[0]!.bounds.x).toBeGreaterThan(W / 2 - 1);
    });

    it("is not guessed from the walls where the sheet marks none", () => {
      // Wall thickness named a shelter on דירה 18 and 22, which have none.
      expect(run(beds).filter((room) => room.kind === "mmd")).toHaveLength(0);
    });
  });

  describe("a WC in a cell of its own", () => {
    // A 1.5 by 0.8 m cell in the corner of the right-hand room.
    const cellWalls = [
      wall({ orientation: "h", centre: 0.8 * UPM, from: W / 2, to: W / 2 + 1.5 * UPM }),
      wall({ orientation: "v", centre: W / 2 + 1.5 * UPM, from: 0, to: 0.8 * UPM }),
    ];
    const bodies = [...shell, divider, ...cellWalls];
    const inCell = (kind: FurniturePiece["kind"]) =>
      piece(W / 2 + 0.75 * UPM - 0.45 * UPM, 0.4 * UPM - 0.45 * UPM, kind);
    const beds = [piece(UPM, UPM, "bed"), piece(4.5 * UPM, 2.5 * UPM, "bed")];

    it("is a bathroom, though smaller than a room", () => {
      const rooms = run([...beds, inCell("fixture")], bodies);
      expect(rooms.filter((r) => r.kind === "bathroom")).toHaveLength(1);
    });

    it("is dropped when nothing sanitary is drawn in it", () => {
      const rooms = run(beds, bodies);
      expect(rooms.filter((r) => r.kind === "bathroom")).toHaveLength(0);
      expect(rooms).toHaveLength(2);
    });
  });

  it("cuts a partitioned flat into one room per side", () => {
    const rooms = run([piece(UPM, UPM, "bed"), piece(4 * UPM, UPM, "bed")]);
    expect(rooms).toHaveLength(2);
    expect(rooms.every((r) => r.kind === "bedroom")).toBe(true);
  });

  it("measures each room rather than guessing it", () => {
    const rooms = run([piece(UPM, UPM, "bed"), piece(4 * UPM, UPM, "bed")]);
    // Two halves of a 6 by 4 m shell, less the walls they are cut from.
    for (const room of rooms) {
      expect(room.areaM2).toBeGreaterThan(8);
      expect(room.areaM2).toBeLessThan(12);
    }
  });

  it("calls a room with a wet fixture a bathroom", () => {
    const rooms = run([piece(UPM, UPM, "bed"), piece(4 * UPM, UPM, "fixture")]);
    expect(rooms.map((r) => r.kind).sort()).toEqual(["bathroom", "bedroom"]);
  });

  it("does not call the open living room a bathroom because a fixture sits in it", () => {
    const rooms = run([
      piece(UPM, UPM, "hob"),
      piece(2 * UPM, UPM, "table"),
      piece(2.5 * UPM, UPM, "fixture"),
      piece(4 * UPM, UPM, "bed"),
    ]);
    const open = rooms.find((r) => r.contents.some((c) => c.kind === "hob"));
    expect(open?.kind).toBe("living");
  });

  it("splits a merged living-and-bath along the wall between them", () => {
    const stub = wall({
      orientation: "h",
      centre: H / 2,
      from: W / 2,
      to: W,
      thickness: 8,
    });
    const rooms = run(
      [
        piece(UPM, UPM * 0.6, "table"),
        piece(2 * UPM, UPM * 0.6, "hob"),
        piece(UPM, H - UPM * 1.5, "fixture"),
      ],
      [...shell, stub],
    );
    expect(rooms.map((r) => r.kind).sort()).toEqual(["bathroom", "living"]);
  });

  it("calls the open kitchen-and-dining room a living room", () => {
    // These flats put the kitchen in the living room; naming that space the
    // kitchen buries the larger function.
    const rooms = run([
      piece(UPM, UPM, "hob"),
      piece(2 * UPM, UPM, "table"),
      piece(4 * UPM, UPM, "bed"),
    ]);
    expect(rooms.find((r) => r.contents.some((c) => c.kind === "hob"))!.kind).toBe(
      "living",
    );
  });

  it("records a bed and a bath in one region as a merge, not a room", () => {
    // No room holds both, so the pair is proof the flood ran through a doorway
    // that was never detected. On דירה 14 that is the lower bedroom and the
    // bathroom below it. With no wall between them the split has nothing to
    // cut along, so the merge is recorded rather than guessed apart.
    const rooms = run([piece(UPM, UPM, "bed"), piece(2 * UPM, UPM, "fixture")], [
      ...shell,
    ]);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.mergedKinds).toEqual(["bedroom", "bathroom"]);
  });

  it("splits a merged bed-and-bath along the nearest wall that separates them", () => {
    // דירה 14: the partition is drawn only from x346 eastward. The flood
    // still joins the two rooms through the western gap, but the ink that
    // is there already separates the bed from the bath.
    const stub = wall({
      orientation: "h",
      centre: H / 2,
      from: W / 2,
      to: W,
      thickness: 8,
    });
    const rooms = run(
      [piece(UPM, UPM * 0.6, "bed"), piece(UPM, H - UPM * 1.5, "fixture")],
      [...shell, stub],
    );
    expect(rooms.map((r) => r.kind).sort()).toEqual(["bathroom", "bedroom"]);
    expect(rooms.every((r) => r.mergedKinds == null)).toBe(true);
  });

  it("numbers rooms of the same kind so a table can list them apart", () => {
    const rooms = run([piece(UPM, UPM, "bed"), piece(4 * UPM, UPM, "bed")]);
    expect(rooms.map((r) => r.name).sort()).toEqual(["ח.שינה 1", "ח.שינה 2"]);
  });

  it("gives the booklet rooms it can print, marked as measured", () => {
    const rooms = roomsForLayout(run([piece(UPM, UPM, "bed")]), UPM);
    expect(rooms[0]).toMatchObject({ kind: "bedroom", source: "cad" });
    expect(rooms[0]!.areaM2).toBeGreaterThan(0);
  });

  it("gives the sides too, so the table does not print the area twice", () => {
    const rooms = roomsForLayout(run([piece(UPM, UPM, "bed")]), UPM);
    expect(rooms[0]!.widthM).toBeGreaterThan(0);
    expect(rooms[0]!.lengthM).toBeGreaterThan(0);
  });

  it("returns nothing when there are no walls to enclose anything", () => {
    expect(run([piece(UPM, UPM, "bed")], [])).toEqual([]);
  });

  it("calls a door with floor on only one side an envelope door", () => {
    // The front door sits on the outer wall. A room-to-room swing has floor
    // on both sides and must not be named the entrance.
    const envelope: Opening = {
      orientation: "v",
      centre: 0,
      thickness: 10,
      from: UPM,
      to: 2 * UPM,
    };
    const internal: Opening = {
      orientation: "v",
      centre: W / 2,
      thickness: 10,
      from: UPM,
      to: 2 * UPM,
    };
    expect(isEnvelopeOpening(envelope, floor, UPM)).toBe(true);
    expect(isEnvelopeOpening(internal, floor, UPM)).toBe(false);
  });

  it("names the circulation space behind the front door a vestibule", () => {
    const door: Opening = {
      orientation: "v",
      centre: 0,
      thickness: 10,
      from: 0,
      to: 4,
    };
    const hall: SegmentedRoom = {
      rows: [
        { y: 0, spans: [[0, UPM]] },
        { y: 2, spans: [[0, UPM]] },
      ],
      bounds: { x: 0, y: 0, width: UPM, height: UPM },
      areaM2: 2,
      kind: "circulation",
      name: "מסדרון",
      bedCount: 0,
      contents: [],
    };
    const named = markEntranceHall([hall], [door], floor, UPM);
    expect(named[0]!.name).toBe("מבואה");
    expect(named[0]!.kind).toBe("circulation");
  });
});
