import {
  isUnusableCadRoom,
  stripUnusableRoomMeasures,
} from "@/lib/projects/floorplan-booklet-rooms";

describe("a measurement that contradicts the room", () => {
  it("drops a living room the width of a corridor", () => {
    // 2.3 by 5.9 is thirteen square metres and passes an area test, and it is
    // the width of a corridor. That figure was going into the brief.
    const room = { name: "סלון", kind: "living" as const, widthM: 2.3, lengthM: 5.91 };
    expect(isUnusableCadRoom(room)).toBe(true);
    expect(stripUnusableRoomMeasures(room).widthM).toBeUndefined();
  });

  it("drops a bathroom the size of a bedroom", () => {
    const room = { name: "חדר רחצה", kind: "bathroom" as const, areaM2: 14.5 };
    expect(isUnusableCadRoom(room)).toBe(true);
  });

  it("keeps a room whose measurements fit what it is", () => {
    // The shelter room on 28-8-23-2 measures 2.98 by 3.78 on the sheet; the
    // geometry read 2.78 by 3.55, and that is worth carrying.
    const room = { name: "ממ\"ד", kind: "mmd" as const, widthM: 2.78, lengthM: 3.55 };
    expect(isUnusableCadRoom(room)).toBe(false);
    expect(stripUnusableRoomMeasures(room).widthM).toBe(2.78);
  });

  it("leaves a room with no measurements alone", () => {
    const room = { name: "מרפסת", kind: "balcony" as const };
    expect(isUnusableCadRoom(room)).toBe(false);
  });
});
