import {
  doorsFromSwings,
  findCrossedBoxes,
  findSwingArcs,
  hatchedWallsMissed,
  narrowWallsAroundLeaves,
  openingsInWalls,
  type Opening,
  type WallBody,
} from "@/lib/projects/floorplan-solid";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

// 50 units a metre throughout.
const U = 50;
const seg = (x1: number, y1: number, x2: number, y2: number): VectorSegment => ({ x1, y1, x2, y2, lineWidth: 1 });

/** A quarter circle round (cx, cy), drawn dashed: a dash every 6°, 3° long. */
const dashedQuarter = (cx: number, cy: number, r: number, fromDeg: number): VectorSegment[] => {
  const out: VectorSegment[] = [];
  for (let d = 0; d < 90; d += 6) {
    const a0 = ((fromDeg + d) * Math.PI) / 180;
    const a1 = ((fromDeg + d + 3) * Math.PI) / 180;
    out.push(seg(cx + r * Math.cos(a0), cy + r * Math.sin(a0), cx + r * Math.cos(a1), cy + r * Math.sin(a1)));
  }
  return out;
};

const wall = (orientation: "h" | "v", centre: number, from: number, to: number, thickness = 10): WallBody => ({
  orientation,
  centre,
  thickness,
  from,
  to,
});

describe("door swings found as circles", () => {
  it("finds a dashed quarter at a door's radius, with its hinge and both ends", () => {
    const arcs = findSwingArcs(dashedQuarter(200, 200, 40, 0), [], U);
    expect(arcs).toHaveLength(1);
    const [arc] = arcs;
    expect(arc!.cx).toBeCloseTo(200, 0);
    expect(arc!.cy).toBeCloseTo(200, 0);
    expect(arc!.r).toBeCloseTo(40, 0);
    expect(arc!.a1 - arc!.a0).toBeGreaterThan(80);
  });

  it("does not take a whole circle, or a quarter too small for a door", () => {
    const circle = [0, 90, 180, 270].flatMap((d) => dashedQuarter(200, 200, 40, d));
    expect(findSwingArcs(circle, [], U)).toHaveLength(0);
    expect(findSwingArcs(dashedQuarter(200, 200, 12, 0), [], U)).toHaveLength(0);
  });

  it("reads a swing drawn as two Bézier chords, its circle fixed by three points", () => {
    const r = 40;
    const p = (deg: number) => [200 + r * Math.cos((deg * Math.PI) / 180), 200 + r * Math.sin((deg * Math.PI) / 180)] as const;
    const curves = [seg(...p(0), ...p(45)), seg(...p(45), ...p(90))];
    const arcs = findSwingArcs([], curves, U);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.cx).toBeCloseTo(200, 0);
  });
});

describe("doors from the swings", () => {
  // An h wall at y 100 with a 40-unit doorway from x 200 to 240; the swing's
  // hinge at (200, 100), sweeping down into the room.
  const bodies = [wall("h", 100, 100, 200), wall("h", 100, 240, 340)];
  const arc = { cx: 200, cy: 100, r: 40, a0: 0, a1: 90, strokes: 15 };

  it("makes the doorway a door, its leaf toward the tip", () => {
    const doorway: Opening & { kind: string } = { orientation: "h", centre: 100, thickness: 10, from: 200, to: 240, kind: "opening" };
    const out = doorsFromSwings([doorway], [arc], bodies, [], U, () => true);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("door");
    expect(out[0]!.leaf).toMatchObject({ x: 200, y: 100 });
    expect(out[0]!.leaf!.dy).toBeCloseTo(40, 0);
  });

  it("opens the wall where a swing stands and no opening was found", () => {
    const over = [wall("h", 100, 100, 340)];
    const out = doorsFromSwings([], [arc], over, [], U, () => true);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "door", orientation: "h", from: 200, to: 240 });
  });

  // A front door as the Gotlib sheet draws it: the leaf swings up along the
  // hatched wall it is hinged on, and the jamb stands against another cross
  // wall. Neither runs along the doorway's own line.
  const upSwing = { cx: 200, cy: 100, r: 40, a0: -90, a1: 0, strokes: 15 };
  const hingeWall = wall("v", 200, 40, 100);
  const hatch = [75, 78, 81, 84].map((my) => seg(195, my - 5, 205, my + 5));

  it("hangs a door between two cross walls when no wall runs along its line", () => {
    const cross = [hingeWall, wall("v", 245, 100, 200)];
    const out = doorsFromSwings([], [upSwing], cross, hatch, U, () => true);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "door", orientation: "h", centre: 100, from: 200, to: 240 });
  });

  it("does not hang a door where only one end meets a wall", () => {
    expect(doorsFromSwings([], [upSwing], [hingeWall], hatch, U, () => true)).toHaveLength(0);
  });

  it("leaves a door no swing is drawn for as a doorway with no leaf", () => {
    const door: Opening & { kind: string } = {
      orientation: "h",
      centre: 100,
      thickness: 10,
      from: 200,
      to: 240,
      kind: "door",
      leaf: { x: 200, y: 100, dx: 0, dy: 40 },
    };
    const out = doorsFromSwings([door], [], bodies, [], U, () => true);
    expect(out[0]).toMatchObject({ kind: "opening", leaf: undefined });
  });

  it("does not make a door off every wall or for a stair hall it does not serve", () => {
    expect(doorsFromSwings([], [arc], [], [], U, () => true)).toHaveLength(0);
    expect(doorsFromSwings([], [arc], bodies, [], U, () => false)).toHaveLength(0);
  });
});

describe("openings stand in walls", () => {
  it("drops a window whose end meets no wall, and keeps one between two", () => {
    const bodies = [wall("v", 100, 0, 200), wall("h", 0, 100, 400), wall("h", 200, 100, 200), wall("h", 200, 260, 400)];
    const inRoom: Opening & { kind: string } = { orientation: "v", centre: 150, thickness: 8, from: 5, to: 60, kind: "window" };
    const inWall: Opening & { kind: string } = { orientation: "h", centre: 200, thickness: 10, from: 200, to: 260, kind: "window" };
    expect(openingsInWalls([inRoom, inWall], bodies, U)).toEqual([inWall]);
  });

  it("closes an inside gap whose two faces are drawn on across it", () => {
    const bodies = [wall("h", 100, 0, 100), wall("h", 100, 180, 300)];
    const gap: Opening & { kind: string } = { orientation: "h", centre: 100, thickness: 10, from: 100, to: 180, kind: "opening" };
    const faces = [seg(0, 95, 300, 95), seg(0, 105, 300, 105)];
    expect(openingsInWalls([gap], bodies, U, { segments: faces, betweenRooms: () => true })).toHaveLength(0);
    expect(openingsInWalls([gap], bodies, U, { segments: [], betweenRooms: () => true })).toHaveLength(1);
  });
});

describe("walls the sheet hatches", () => {
  /** 45° strokes every 3 units, clipped to the band's faces and ends as a sheet draws them. */
  const hatch = (x0: number, x1: number, y0: number, y1: number) => {
    const out: VectorSegment[] = [];
    const h = y1 - y0;
    for (let x = x0 - h; x <= x1; x += 3) {
      // The line from (x, y1) up to (x + h, y0), clipped to x0..x1.
      const a = Math.max(x, x0);
      const b = Math.min(x + h, x1);
      if (b - a < 1) continue;
      out.push(seg(a, y1 - (a - x), b, y1 - (b - x)));
    }
    return out;
  };

  it("builds the hatched piece no body was found for, beside one that was", () => {
    const found = [wall("v", 100, 100, 300)];
    const missed = hatchedWallsMissed(found, hatch(105, 140, 95, 105), U, { x: 0, y: 0, width: 400, height: 400 });
    expect(missed).toHaveLength(1);
    expect(missed[0]).toMatchObject({ orientation: "h" });
    expect(missed[0]!.thickness).toBeGreaterThan(6);
  });

  it("leaves a hatched symbol standing clear of every wall", () => {
    const found = [wall("v", 100, 100, 300)];
    expect(hatchedWallsMissed(found, hatch(250, 285, 195, 205), U, { x: 0, y: 0, width: 400, height: 400 })).toHaveLength(0);
  });

  it("narrows a wall to its hatch where a door's leaf was read into it", () => {
    // A 30-unit band whose hatch is a 6-unit wall at its middle.
    const band = wall("v", 100, 0, 200, 30);
    const strokes: VectorSegment[] = [];
    for (let y = 5; y < 195; y += 3) strokes.push(seg(97, y, 103, y + 6));
    const door: Opening & { kind: string } = {
      orientation: "h",
      centre: 0,
      thickness: 10,
      from: 105,
      to: 145,
      kind: "door",
      leaf: { x: 110, y: 10, dx: 0, dy: 40 },
    };
    const [narrowed] = narrowWallsAroundLeaves([band], [door], strokes, U);
    expect(narrowed!.thickness).toBeCloseTo(6, 0);
    expect(narrowed!.centre).toBeCloseTo(100, 0);
  });
});

describe("crossed boxes", () => {
  it("finds a rectangle with both diagonals drawn", () => {
    const box = [seg(0, 0, 40, 30), seg(0, 30, 40, 0), seg(0, 0, 40, 0), seg(0, 30, 40, 30)];
    expect(findCrossedBoxes(box, U)).toEqual([{ x: 0, y: 0, w: 40, h: 30 }]);
    expect(findCrossedBoxes([seg(0, 0, 40, 30)], U)).toHaveLength(0);
  });
});
