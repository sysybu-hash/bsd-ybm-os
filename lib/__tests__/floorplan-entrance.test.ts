import { findEntranceMarkers, placeEntranceDoor } from "@/lib/projects/floorplan-entrance";
import type { SpanRow, WallBody } from "@/lib/projects/floorplan-solid";

const UPM = 50;

/** The sheet's entrance arrow: a 23 by 13 point triangle, apex up. */
const arrowUp = (x: number, y: number) => [
  { x1: x - 11.5, y1: y, x2: x + 11.5, y2: y, lineWidth: 1 },
  { x1: x + 11.5, y1: y, x2: x, y2: y - 13, lineWidth: 1 },
  { x1: x, y1: y - 13, x2: x - 11.5, y2: y, lineWidth: 1 },
];

/** A flat whose floor runs from y = 0 to y = 200, with its lower wall at y = 205. */
const floor: SpanRow[] = [];
for (let y = 0; y < 200; y += 2) floor.push({ y, spans: [[0, 400]] });
const wall: WallBody = { orientation: "h", centre: 205, thickness: 10, from: 0, to: 400 };
const window = { orientation: "h" as const, centre: 205, thickness: 10, from: 180, to: 225, kind: "window" as const };

describe("the front door, from the entrance arrow", () => {
  it("finds the arrow and the way it points", () => {
    expect(findEntranceMarkers(arrowUp(200, 260))).toEqual([{ x: 200, y: 260, dx: 0, dy: -1 }]);
  });

  it("makes the opening the arrow points through a door", () => {
    // By the floor test the front door is a window: the landing is not the flat.
    const out = placeEntranceDoor([window], findEntranceMarkers(arrowUp(200, 260)), {
      floor,
      bodies: [wall],
      unitsPerMetre: UPM,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("door");
  });

  it("opens a door in the wall the arrow crosses where none was found", () => {
    const out = placeEntranceDoor([], findEntranceMarkers(arrowUp(200, 260)), {
      floor,
      bodies: [wall],
      unitsPerMetre: UPM,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "door", orientation: "h", centre: 205 });
    expect(out[0]!.to - out[0]!.from).toBeCloseTo(0.9 * UPM);
  });

  it("hangs the door between two jambs where the arrow crosses no wall", () => {
    // דירה 14: the door stands between the ends of two walls that run the other way.
    const jambs: WallBody[] = [
      { orientation: "v", centre: 170, thickness: 10, from: 150, to: 205 },
      { orientation: "v", centre: 230, thickness: 10, from: 150, to: 205 },
    ];
    const out = placeEntranceDoor([], findEntranceMarkers(arrowUp(200, 260)), {
      floor,
      bodies: jambs,
      unitsPerMetre: UPM,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "door", orientation: "h", from: 175, to: 225 });
  });

  it("ignores an arrow standing on the flat's own floor", () => {
    const out = placeEntranceDoor([window], findEntranceMarkers(arrowUp(200, 100)), {
      floor,
      bodies: [wall],
      unitsPerMetre: UPM,
    });
    expect(out[0]!.kind).toBe("window");
  });
});
