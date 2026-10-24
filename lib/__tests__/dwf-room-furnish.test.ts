import type { DwfFloor } from "@/lib/projects/dwf-floor";
import { furnishBareRooms, withSinkAndHob } from "@/lib/projects/dwf-room-furnish";
import type { FurniturePiece } from "@/lib/projects/floorplan-furniture";
import type { FloorplanRoomKind } from "@/lib/projects/floorplan-layout";
import { plausibleUse } from "@/lib/projects/building/house-rooms-ai";

const UPM = (72 / 25.4) * 10;
const CM = 2;
const OUTSIDE = 99;

/**
 * A floor of rooms laid out in metres: each room a box, walls 20 cm between
 * and round them, and gaps cut in the walls — a door into the next room or a
 * window onto the world, both closed as a house sheet closes them (4).
 */
function floorOf(
  rooms: Array<{ id: number; kind: FloorplanRoomKind; x: number; y: number; w: number; h: number }>,
  gaps: Array<{ x: number; y: number; w: number; h: number }>,
): DwfFloor {
  const px = (m: number) => Math.round((m * 100) / CM);
  const cols = px(14);
  const rows = px(12);
  const room = new Int32Array(cols * rows).fill(OUTSIDE);
  const wall = new Uint8Array(cols * rows);
  const fill = (b: { x: number; y: number; w: number; h: number }, f: (k: number) => void) => {
    for (let y = px(b.y); y < px(b.y + b.h); y++) for (let x = px(b.x); x < px(b.x + b.w); x++) f(y * cols + x);
  };
  for (const r of rooms) {
    fill({ x: r.x - 0.2, y: r.y - 0.2, w: r.w + 0.4, h: r.h + 0.4 }, (k) => {
      room[k] = 0;
      wall[k] = 1;
    });
  }
  for (const r of rooms) {
    fill(r, (k) => {
      room[k] = r.id;
      wall[k] = 0;
    });
  }
  for (const g of gaps) fill(g, (k) => (wall[k] = 4));
  return {
    cols,
    rows,
    cm: CM,
    unitsPerMetre: UPM,
    wall,
    room,
    outside: OUTSIDE,
    rooms: rooms.map((r) => ({ id: r.id, areaM2: r.w * r.h, kind: r.kind, names: [] })),
    apartments: [{ unit: 1, rooms: rooms.map((r) => r.id) }],
  };
}

const m = (units: number) => units / UPM;
const inBox = (p: FurniturePiece, b: { x: number; y: number; w: number; h: number }) =>
  m(p.x) >= b.x - 0.01 && m(p.y) >= b.y - 0.01 && m(p.x + p.w) <= b.x + b.w + 0.01 && m(p.y + p.h) <= b.y + b.h + 0.01;
const overlap = (a: FurniturePiece, b: FurniturePiece) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;

describe("furnishBareRooms", () => {
  const bedroom = { id: 1, kind: "bedroom" as const, x: 1, y: 1, w: 4, h: 3.5 };
  const hall = { id: 2, kind: "circulation" as const, x: 1, y: 4.7, w: 4, h: 1.5 };
  // A door from the hall in the bedroom's south wall, near its west end.
  const door = { x: 1.3, y: 4.5, w: 0.9, h: 0.2 };
  // Windows in the north and east walls, closed as doorways are.
  const windows = [
    { x: 2, y: 0.8, w: 1.6, h: 0.2 },
    { x: 5, y: 1.8, w: 0.2, h: 1.4 },
  ];

  it("puts two single beds and a wardrobe in a bare bedroom, clear of its door", () => {
    const floor = floorOf([bedroom, hall], [door, ...windows]);
    const { added } = furnishBareRooms(floor, [1, 2], [], new Set([1]));
    const beds = added.filter((p) => p.kind === "bed");
    expect(beds).toHaveLength(2);
    for (const b of beds) {
      expect(Math.min(b.widthCm, b.depthCm)).toBeCloseTo(90, 0);
      expect(Math.max(b.widthCm, b.depthCm)).toBeCloseTo(200, 0);
      expect(b.head).toBeDefined();
    }
    expect(added.filter((p) => p.kind === "storage")).toHaveLength(1);
    for (const p of added) {
      expect(inBox(p, bedroom)).toBe(true);
      // Nothing in the door's swing: 75 cm in front of it.
      expect(overlap(p, { x: (door.x - 0.1) * UPM, y: (door.y - 0.75) * UPM, w: (door.w + 0.2) * UPM, h: 0.75 * UPM } as FurniturePiece)).toBe(false);
    }
    for (let i = 0; i < added.length; i++) for (let j = i + 1; j < added.length; j++) expect(overlap(added[i]!, added[j]!)).toBe(false);
  });

  it("does not take a window for a door", () => {
    // Windows on three sides and the door on the fourth: the room still takes its beds.
    const small = { id: 1, kind: "bedroom" as const, x: 1, y: 1, w: 3.1, h: 2.85 };
    const below = { ...hall, y: 4.05 };
    const floor = floorOf(
      [small, below],
      [
        { x: 1.3, y: 3.85, w: 0.8, h: 0.2 },
        { x: 1.5, y: 0.8, w: 1.4, h: 0.2 },
        { x: 0.8, y: 1.5, w: 0.2, h: 1.2 },
        { x: 4.1, y: 1.5, w: 0.2, h: 1.2 },
      ],
    );
    const { added } = furnishBareRooms(floor, [1, 2], [], new Set([1]));
    expect(added.filter((p) => p.kind === "bed").length).toBeGreaterThanOrEqual(1);
  });

  it("leaves a bedroom whose bed was read as it is", () => {
    const floor = floorOf([bedroom, hall], [door]);
    const bed: FurniturePiece = { x: 1.1 * UPM, y: 1.1 * UPM, w: 0.9 * UPM, h: 2 * UPM, kind: "bed", widthCm: 90, depthCm: 200 };
    const { added } = furnishBareRooms(floor, [1, 2], [bed], new Set([1]));
    expect(added.filter((p) => p.kind === "bed")).toHaveLength(0);
    for (const p of added) expect(overlap(p, bed)).toBe(false);
  });

  it("furnishes only the rooms it is given", () => {
    const floor = floorOf([bedroom, hall], [door]);
    expect(furnishBareRooms(floor, [1, 2], [], new Set()).added).toHaveLength(0);
    expect(furnishBareRooms(floor, [1, 2], [], new Set([2])).added).toHaveLength(0);
  });

  it("sets a dining table for a crowd, a bookcase and a sofa in a bare living room", () => {
    const living = { id: 1, kind: "living" as const, x: 1, y: 1, w: 5, h: 5 };
    const lobby = { id: 2, kind: "circulation" as const, x: 1, y: 6.2, w: 5, h: 1.5 };
    const floor = floorOf([living, lobby], [{ x: 4.5, y: 6, w: 1, h: 0.2 }]);
    const { added } = furnishBareRooms(floor, [1, 2], [], new Set([1]));
    const table = added.find((p) => p.kind === "table");
    expect(table).toBeDefined();
    expect(Math.max(m(table!.w), m(table!.h))).toBeGreaterThanOrEqual(1.8);
    const chairs = added.filter((p) => p.kind === "seat" && Math.max(p.widthCm, p.depthCm) <= 60);
    expect(chairs.length).toBeGreaterThanOrEqual(8);
    expect(added.some((p) => p.kind === "storage")).toBe(true);
    expect(added.some((p) => p.kind === "seat" && Math.max(p.widthCm, p.depthCm) > 100)).toBe(true);
    for (const p of added) expect(inBox(p, living)).toBe(true);
  });

  it("lays a worktop with its sink and hob in a bare kitchen", () => {
    const kitchen = { id: 1, kind: "kitchen" as const, x: 1, y: 1, w: 3, h: 3 };
    const lobby = { id: 2, kind: "circulation" as const, x: 1, y: 4.2, w: 3, h: 1.5 };
    const floor = floorOf([kitchen, lobby], [{ x: 2.5, y: 4, w: 0.9, h: 0.2 }]);
    const { added } = furnishBareRooms(floor, [1, 2], [], new Set([1]));
    expect(added.some((p) => p.kind === "sink")).toBe(true);
    expect(added.some((p) => p.kind === "hob")).toBe(true);
    expect(added.some((p) => p.kind === "counter")).toBe(true);
    for (const p of added) expect(inBox(p, kitchen)).toBe(true);
  });

  const kitchen = { id: 1, kind: "kitchen" as const, x: 1, y: 1, w: 3, h: 3 };
  const lobby = { id: 2, kind: "circulation" as const, x: 1, y: 4.2, w: 3, h: 1.5 };
  const kitchenDoor = { x: 2.5, y: 4, w: 0.9, h: 0.2 };

  it("sets a sink and a hob into a bare counter, and a fridge beside it", () => {
    const floor = floorOf([kitchen, lobby], [kitchenDoor]);
    const counter: FurniturePiece = { x: 1 * UPM, y: 1 * UPM, w: 2.6 * UPM, h: 0.6 * UPM, kind: "counter", widthCm: 260, depthCm: 60 };
    const { added, dropped } = furnishBareRooms(floor, [1, 2], [counter], new Set([1]));
    expect(dropped).toEqual([counter]);
    const run = added.filter((p) => p.kind === "counter" || p.kind === "sink" || p.kind === "hob");
    expect(run.filter((p) => p.kind === "sink")).toHaveLength(1);
    expect(run.filter((p) => p.kind === "hob")).toHaveLength(1);
    expect(run.reduce((s, p) => s + p.w, 0)).toBeCloseTo(counter.w, 3);
    for (const p of run) expect(p.y).toBe(counter.y);
    const fridge = added.find((p) => p.kind === "storage");
    expect(fridge).toBeDefined();
    expect(Math.min(fridge!.widthCm, fridge!.depthCm)).toBeGreaterThanOrEqual(60);
    for (const p of added) for (const q of run) if (p !== q) expect(overlap(p, q)).toBe(false);
  });

  it("clears seats read from stair treads off the walls for a worktop", () => {
    const narrow = { ...kitchen, w: 2.2, h: 1.8 };
    const floor = floorOf([narrow, { ...lobby, y: 3 }], [{ x: 1.2, y: 2.8, w: 0.9, h: 0.2 }]);
    const tread = (x: number, y: number): FurniturePiece => ({ x: x * UPM, y: y * UPM, w: 0.45 * UPM, h: 0.45 * UPM, kind: "seat", widthCm: 45, depthCm: 45 });
    const treads = [tread(1.1, 1.05), tread(1.6, 1.05), tread(2.1, 1.05), tread(2.6, 1.05), tread(1.05, 1.6), tread(2.7, 1.6)];
    const { added, dropped } = furnishBareRooms(floor, [1, 2], treads, new Set([1]));
    expect(added.some((p) => p.kind === "sink")).toBe(true);
    expect(added.some((p) => p.kind === "hob")).toBe(true);
    expect(dropped.length).toBeGreaterThan(0);
    for (const p of dropped) expect(p.kind).toBe("seat");
    const kept = treads.filter((t) => !dropped.includes(t));
    for (const p of added) for (const t of kept) expect(overlap(p, t)).toBe(false);
  });

  it("leaves the chairs round a table where they stand", () => {
    const floor = floorOf([kitchen, lobby], [kitchenDoor]);
    const table: FurniturePiece = { x: 2 * UPM, y: 2 * UPM, w: 1 * UPM, h: 0.8 * UPM, kind: "table", widthCm: 100, depthCm: 80 };
    const chair = (x: number, y: number): FurniturePiece => ({ x: x * UPM, y: y * UPM, w: 0.45 * UPM, h: 0.45 * UPM, kind: "seat", widthCm: 45, depthCm: 45 });
    const chairs = [chair(2.25, 1.5), chair(2.25, 2.85)];
    const { dropped } = furnishBareRooms(floor, [1, 2], [table, ...chairs], new Set([1]));
    expect(dropped).toHaveLength(0);
  });
});

describe("withSinkAndHob", () => {
  const counter = (lenCm: number): FurniturePiece => ({ x: 0, y: 0, w: (lenCm / 100) * UPM, h: 0.6 * UPM, kind: "counter", widthCm: lenCm, depthCm: 60 });

  it("lays counter, sink, counter, hob, counter along the run", () => {
    const run = withSinkAndHob(counter(300), UPM);
    expect(run.map((p) => p.kind)).toEqual(["counter", "sink", "counter", "hob", "counter"]);
    expect(run.reduce((s, p) => s + p.widthCm, 0)).toBeCloseTo(300, 3);
    for (let i = 1; i < run.length; i++) expect(run[i]!.x).toBeCloseTo(run[i - 1]!.x + run[i - 1]!.w, 3);
  });

  it("splits a short run between the sink and the hob", () => {
    const run = withSinkAndHob(counter(125), UPM);
    expect(run.map((p) => p.kind).sort()).toEqual(["hob", "sink"]);
  });

  it("follows a run that stands along the page's height", () => {
    const upright: FurniturePiece = { x: 0, y: 0, w: 0.6 * UPM, h: 2.4 * UPM, kind: "counter", widthCm: 60, depthCm: 240 };
    const run = withSinkAndHob(upright, UPM);
    expect(run.some((p) => p.kind === "sink")).toBe(true);
    for (const p of run) expect(p.x).toBe(0);
    expect(run.reduce((s, p) => s + p.depthCm, 0)).toBeCloseTo(240, 3);
  });
});

describe("plausibleUse", () => {
  it("keeps a reading only where the room could be put to it", () => {
    expect(plausibleUse("bathroom", 21.7, 4.9).ok).toBe(false);
    expect(plausibleUse("bathroom", 4.2, 2).ok).toBe(true);
    expect(plausibleUse("bedroom", 4.5, 1.96).ok).toBe(false);
    expect(plausibleUse("bedroom", 8.7, 2.8).ok).toBe(true);
    expect(plausibleUse("living", 6, 2).ok).toBe(false);
    expect(plausibleUse("kitchen", 7.7, 2.04).ok).toBe(true);
    expect(plausibleUse("hall", 1, 0.9).ok).toBe(true);
    expect(plausibleUse("laundry", 0.92, 0.88).ok).toBe(false);
  });
});
