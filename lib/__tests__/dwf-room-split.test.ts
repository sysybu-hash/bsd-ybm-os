import type { DwfFloor } from "@/lib/projects/dwf-floor";
import { splitWetChambers } from "@/lib/projects/dwf-room-split";
import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";

const UPM = (72 / 25.4) * 10;
const CM = 2;
const OUTSIDE = 99;
const ID = 5;

type Box = { x: number; y: number; w: number; h: number };

/** One room drawn as boxes in metres, everything else wall. */
function floorOf(boxes: Box[]): DwfFloor {
  const px = (m: number) => Math.round((m * 100) / CM);
  const cols = px(10);
  const rows = px(8);
  const room = new Int32Array(cols * rows);
  const wall = new Uint8Array(cols * rows).fill(1);
  let area = 0;
  for (const b of boxes) {
    for (let y = px(b.y); y < px(b.y + b.h); y++) {
      for (let x = px(b.x); x < px(b.x + b.w); x++) {
        if (room[y * cols + x] !== ID) area++;
        room[y * cols + x] = ID;
        wall[y * cols + x] = 0;
      }
    }
  }
  return {
    cols,
    rows,
    cm: CM,
    unitsPerMetre: UPM,
    wall,
    room,
    outside: OUTSIDE,
    rooms: [{ id: ID, areaM2: (area * CM * CM) / 10_000, kind: null, names: [] }],
    apartments: [{ unit: 1, rooms: [ID] }],
  };
}

const toilet = (x: number, y: number): FurniturePiece => ({
  x: x * UPM,
  y: y * UPM,
  w: 0.4 * UPM,
  h: 0.6 * UPM,
  kind: "fixture",
  fixture: "toilet",
  widthCm: 40,
  depthCm: 60,
});

describe("splitWetChambers", () => {
  // A 3 × 3 m landing, and east of it, through a 20 cm wall, a 2 × 2.5 m bathroom.
  const landing = { x: 1, y: 1, w: 3, h: 3 };
  const bath = { x: 4.2, y: 1, w: 2, h: 2.5 };
  const pan = toilet(5.5, 1.2);

  it("parts a bathroom from the landing it was read with, at its door", () => {
    const floor = floorOf([landing, bath, { x: 4, y: 1.5, w: 0.2, h: 0.8 }]);
    const own = [ID];
    const before = floor.rooms[0]!.areaM2;
    const made = splitWetChambers(floor, own, ID, [pan]);
    expect(made).toHaveLength(1);
    const room = floor.rooms.find((r) => r.id === made[0])!;
    expect(room.kind).toBe("bathroom");
    expect(room.areaM2).toBeGreaterThan(4.8);
    expect(room.areaM2).toBeLessThan(5.3);
    expect(own).toContain(made[0]);
    expect(floor.rooms[0]!.areaM2 + room.areaM2).toBeCloseTo(before, 1);
    const at = (x: number, y: number) => floor.room[Math.round((y * 100) / CM) * floor.cols + Math.round((x * 100) / CM)];
    expect(at(5.2, 2.2)).toBe(made[0]);
    expect(at(2.5, 2.5)).toBe(ID);
  });

  it("leaves a room with no pan, bath or shower in it", () => {
    const floor = floorOf([landing, bath, { x: 4, y: 1.5, w: 0.2, h: 0.8 }]);
    expect(splitWetChambers(floor, [ID], ID, [])).toHaveLength(0);
    expect(floor.rooms).toHaveLength(1);
  });

  it("leaves a room whose parts open wide into each other", () => {
    const floor = floorOf([landing, bath, { x: 4, y: 1.2, w: 0.2, h: 2 }]);
    expect(splitWetChambers(floor, [ID], ID, [pan])).toHaveLength(0);
    expect(floor.rooms).toHaveLength(1);
  });
});
