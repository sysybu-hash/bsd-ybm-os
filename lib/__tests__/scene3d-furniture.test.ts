import { partsFor } from "@/lib/projects/scene3d/furniture";
import { fixtureKind } from "@/lib/projects/scene3d/furniture/fixture-kind";
import { facingFor, headFacing } from "@/lib/projects/scene3d/orientation";
import type { Facing } from "@/lib/projects/scene3d/orientation";
import { FURNITURE_HEIGHT_M } from "@/lib/projects/scene3d/standards";

/**
 * A piece of furniture is the box that was measured, built out.
 *
 * The contract: whatever a constructor makes stands inside the footprint the
 * drawing gives it. A model that widened a bed by five centimetres to make the
 * room look better is precisely the liberty this engine takes away, so it is
 * asserted for every kind, at every facing, at sizes from a stool to a wall of
 * wardrobes.
 */

const KINDS = ["bed", "desk", "table", "seat", "storage", "counter", "hob", "sink", "fixture", "unknown"];
const FACINGS: Facing[] = ["north", "east", "south", "west"];
const BOXES = [
  { wM: 0.45, dM: 0.45 },
  { wM: 0.9, dM: 2.0 },
  { wM: 2.0, dM: 0.9 },
  { wM: 1.6, dM: 0.6 },
  { wM: 3.2, dM: 0.62 },
  { wM: 0.7, dM: 1.7 },
];

/** A handle stands proud of its door; nothing else may leave the footprint. */
const PROUD_M = 0.02;

describe("every piece fits the box it was measured in", () => {
  for (const kind of KINDS) {
    it(`${kind} stays inside its footprint, whichever way it faces`, () => {
      for (const facing of FACINGS) {
        for (const box of BOXES) {
          const hM = FURNITURE_HEIGHT_M[kind] ?? 0.5;
          const parts = partsFor(kind, { ...box, hM, facing });
          expect(parts.length).toBeGreaterThan(0);
          for (const p of parts) {
            expect(Math.abs(p.x) + p.w / 2).toBeLessThanOrEqual(box.wM / 2 + PROUD_M + 1e-9);
            expect(Math.abs(p.z) + p.d / 2).toBeLessThanOrEqual(box.dM / 2 + PROUD_M + 1e-9);
            // Nothing sinks through the floor, and nothing reaches the ceiling.
            expect(p.y - p.h / 2).toBeGreaterThanOrEqual(-1e-9);
            expect(p.y + p.h / 2).toBeLessThan(2.7);
            expect(p.w).toBeGreaterThan(0);
            expect(p.h).toBeGreaterThan(0);
            expect(p.d).toBeGreaterThan(0);
          }
        }
      }
    });
  }

  it("is the same piece every time it is built", () => {
    const spec = { wM: 1.6, dM: 0.6, hM: 0.9, facing: "north" as const };
    expect(partsFor("counter", spec)).toEqual(partsFor("counter", spec));
  });

  it("builds a block it cannot name as a plain box, not as a guess", () => {
    const parts = partsFor("whatever-this-was", { wM: 1, dM: 1, hM: 0.5, facing: "north" });
    expect(parts).toHaveLength(1);
    expect(parts[0]!.material).toBe("neutral");
  });
});

describe("the rules a piece obeys", () => {
  it("never builds a double bed for a haredi still, however wide the drawing", () => {
    for (const facing of FACINGS) {
      const parts = partsFor("bed", { wM: 1.8, dM: 2.0, hM: 0.5, facing, haredi: true });
      const mattress = parts.find((p) => p.tag === "mattress")!;
      expect(Math.min(mattress.w, mattress.d)).toBeLessThanOrEqual(0.9);
      expect(parts.filter((p) => p.tag === "pillow")).toHaveLength(1);
      expect(parts.filter((p) => p.tag === "headboard")).toHaveLength(1);
    }
  });

  it("gives a wardrobe one door per 60 cm of measured width", () => {
    const doors = (wM: number) =>
      partsFor("storage", { wM, dM: 0.6, hM: 2, facing: "north" }).filter((p) => p.tag === "door").length;
    expect(doors(0.5)).toBe(1);
    expect(doors(1.2)).toBe(2);
    expect(doors(2.4)).toBe(4);
  });

  it("tells a bath from a basin the way the oblique plate does", () => {
    expect(fixtureKind(1.7, 0.7)).toBe("bath");
    expect(fixtureKind(0.6, 0.45)).toBe("basin");
    const bath = partsFor("fixture", { wM: 1.7, dM: 0.7, hM: 0.55, facing: "north" });
    expect(bath.map((p) => p.tag)).toContain("tub");
    const basin = partsFor("fixture", { wM: 0.6, dM: 0.45, hM: 0.55, facing: "north" });
    expect(basin.map((p) => p.tag)).toContain("bowl");
  });
});

describe("which way a piece faces", () => {
  const upm = 100;

  it("turns a back to the wall it stands against", () => {
    const piece = { x: 100, y: 12, w: 90, h: 60 };
    const walls = [{ x: 0, y: 0, w: 600, h: 10 }];
    expect(facingFor({ piece, walls, anchors: [], roomCentre: { x: 300, y: 200 }, unitsPerMetre: upm })).toBe(
      "north",
    );
  });

  it("turns a chair's back to the table when no wall is near", () => {
    const piece = { x: 100, y: 200, w: 45, h: 45 };
    const table = { x: 100, y: 250, w: 140, h: 90 };
    expect(
      facingFor({ piece, walls: [], anchors: [table], roomCentre: { x: 300, y: 200 }, unitsPerMetre: upm }),
    ).toBe("south");
  });

  it("otherwise turns it away from the middle of the room", () => {
    const piece = { x: 500, y: 200, w: 60, h: 60 };
    expect(
      facingFor({ piece, walls: [], anchors: [], roomCentre: { x: 300, y: 200 }, unitsPerMetre: upm }),
    ).toBe("east");
  });

  it("puts a bed's head at a short end whatever the room says", () => {
    const tall = { x: 0, y: 0, w: 90, h: 200 };
    expect(headFacing(tall, "east")).toBe("north");
    expect(headFacing(tall, "south")).toBe("south");
    const wide = { x: 0, y: 0, w: 200, h: 90 };
    expect(headFacing(wide, "north")).toBe("west");
    expect(headFacing(wide, "east")).toBe("east");
  });
});
