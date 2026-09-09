import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";
import { roomsForLayout, segmentRooms } from "@/lib/projects/floorplan-segment";
import type { SpanRow, WallBody } from "@/lib/projects/floorplan-solid";

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

describe("segmentRooms", () => {
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
    // bathroom below it.
    const rooms = run([piece(UPM, UPM, "bed"), piece(2 * UPM, UPM, "fixture")], [
      ...shell,
    ]);
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!.mergedKinds).toEqual(["bedroom", "bathroom"]);
  });

  it("numbers rooms of the same kind so a table can list them apart", () => {
    const rooms = run([piece(UPM, UPM, "bed"), piece(4 * UPM, UPM, "bed")]);
    expect(rooms.map((r) => r.name).sort()).toEqual(["ח.שינה 1", "ח.שינה 2"]);
  });

  it("gives the booklet rooms it can print, marked as measured", () => {
    const rooms = roomsForLayout(run([piece(UPM, UPM, "bed")]));
    expect(rooms[0]).toMatchObject({ kind: "bedroom", source: "cad" });
    expect(rooms[0]!.areaM2).toBeGreaterThan(0);
  });

  it("returns nothing when there are no walls to enclose anything", () => {
    expect(run([piece(UPM, UPM, "bed")], [])).toEqual([]);
  });
});
