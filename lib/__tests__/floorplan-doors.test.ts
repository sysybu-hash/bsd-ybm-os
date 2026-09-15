import { findDoorSwings, type WallBody } from "@/lib/projects/floorplan-solid";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

const UPM = 56;
const DOOR = 0.85 * UPM;

/** A horizontal wall with its face along y = 100. */
const wall: WallBody = {
  orientation: "h",
  centre: 100,
  thickness: 16,
  from: 0,
  to: 400,
};

/** The leaf: hinged on the wall at x, standing open into the room. */
const leaf = (x: number): VectorSegment => ({
  x1: x,
  y1: 100,
  x2: x,
  y2: 100 + DOOR,
  lineWidth: 2,
});

/** The dashed quarter circle the leaf sweeps, as chords. */
function swing(x: number, degrees = 90, n = 10): VectorSegment[] {
  const out: VectorSegment[] = [];
  for (let i = 0; i < n; i++) {
    const a = (degrees * (i / (n - 1)) * Math.PI) / 180;
    const b = (degrees * ((i + 0.4) / (n - 1)) * Math.PI) / 180;
    out.push({
      x1: x + DOOR * Math.cos(a),
      y1: 100 + DOOR * Math.sin(a),
      x2: x + DOOR * Math.cos(b),
      y2: 100 + DOOR * Math.sin(b),
      lineWidth: 1,
    });
  }
  return out;
}

describe("findDoorSwings", () => {
  it("finds a door whose swing is only four chords", () => {
    // דירה 23 draws some swings with a short polyline. Six chords was
    // dropping those doors and the flat came back with two openings.
    const found = findDoorSwings([leaf(200)], swing(200, 90, 4), [wall], UPM);
    expect(found).toHaveLength(1);
  });

  it("finds a door from its leaf and the arc it sweeps", () => {
    const found = findDoorSwings([leaf(200)], swing(200), [wall], UPM);
    expect(found).toHaveLength(1);
    expect(found[0]!.orientation).toBe("h");
    expect(found[0]!.to - found[0]!.from).toBeCloseTo(DOOR, 0);
  });

  it("wants both signals: a leaf with no arc is furniture", () => {
    expect(findDoorSwings([leaf(200)], [], [wall], UPM)).toEqual([]);
  });

  it("rejects a rim that closes all the way round, which is a bath", () => {
    // Distance alone passed this: a bath rim puts plenty of chords at 85 cm from
    // a point on the wall beside it, and six of them looked like a swing.
    expect(findDoorSwings([leaf(200)], swing(200, 350, 24), [wall], UPM)).toEqual(
      [],
    );
  });

  it("takes one door once, however many strokes drew it", () => {
    const strokes = [leaf(200), leaf(202), leaf(203)];
    const arcs = [...swing(200), ...swing(202)];
    expect(findDoorSwings(strokes, arcs, [wall], UPM)).toHaveLength(1);
  });

  it("keeps two real doors a metre apart, which a distance rule would merge", () => {
    const found = findDoorSwings(
      [leaf(120), leaf(240)],
      [...swing(120), ...swing(240)],
      [wall],
      UPM,
    );
    expect(found).toHaveLength(2);
  });

  it("ignores a swing outside the flat, on the landing", () => {
    const found = findDoorSwings([leaf(200)], swing(200), [wall], UPM, {
      extent: { x: 1000, y: 1000, width: 100, height: 100 },
    });
    expect(found).toEqual([]);
  });

  it("ignores a line with both ends on walls, which is a wall", () => {
    const across: VectorSegment = {
      x1: 200,
      y1: 100,
      x2: 200 + DOOR,
      y2: 100,
      lineWidth: 2,
    };
    expect(findDoorSwings([across], swing(200), [wall], UPM)).toEqual([]);
  });
});

describe("a swing as the scale's door-width signal", () => {
  it("reports a door whose opening the wall clips short", () => {
    // The opening is clipped to the wall it sits in, so a door against the end
    // of a wall comes back narrower than the door is. lockScale had been
    // re-measuring that clipped width and rejecting the door — on דירה 23 both
    // doors were clipped under 75 cm at the one scale that works, so the plan
    // locked no scale at all and rendered nothing. The leaf is the width, and
    // findDoorSwings has already required it to be a door's.
    const short: WallBody = { ...wall, from: 190, to: 190 + DOOR * 0.8 };
    const found = findDoorSwings([leaf(200)], swing(200), [short], UPM);
    expect(found).toHaveLength(1);
    expect(found[0]!.to - found[0]!.from).toBeLessThan(DOOR);
  });
});
