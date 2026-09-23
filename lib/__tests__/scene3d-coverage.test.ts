import {
  COVERAGE_FLOOR,
  measurementCoverage,
  measurementIsCompleteEnough,
} from "@/lib/projects/scene3d/coverage";
import type { SceneInput } from "@/lib/projects/scene3d/build-scene";

/**
 * The engine has to know when it does not know.
 *
 * דירה 14: the sheet prints nine room names, the measurement finds four, and
 * the still came back as four rooms — correct, and useless beside a
 * photograph. A still is offered only when the measurement covers the flat.
 */

const floorRect = (i: number) => ({ x: i * 100, y: 0, w: 90, h: 90 });

const input = (named: number, labelled: number, openings: number): SceneInput => ({
  unitsPerMetre: 100,
  bounds: { x: 0, y: 0, width: 1000, height: 200 },
  bodies: [],
  openings: Array.from({ length: openings }, () => ({
    orientation: "v" as const,
    centre: 50,
    thickness: 8,
    from: 0,
    to: 80,
    kind: "door" as const,
  })),
  floorRects: Array.from({ length: Math.max(named, labelled) }, (_, i) => floorRect(i)),
  terraceRects: [],
  furniture: [],
  rooms: Array.from({ length: named }, (_, i) => ({
    name: `room ${i}`,
    kind: "bedroom",
    areaM2: 8,
    rects: [floorRect(i)],
  })),
  labelledRooms: Array.from({ length: labelled }, (_, i) => ({
    name: `label ${i}`,
    kind: "bedroom",
    box: { x: i * 100, y: 0, w: 90, h: 90 },
  })),
});

describe("how much of the flat the measurement found", () => {
  it("refuses a still when the sheet names far more rooms than were found", () => {
    // The דירה 14 case, in numbers.
    const coverage = measurementCoverage(input(4, 9, 6));
    expect(coverage.ratio).toBeLessThan(COVERAGE_FLOOR);
    expect(coverage.shortfall).toContain("4");
    expect(coverage.shortfall).toContain("9");
    expect(measurementIsCompleteEnough(input(4, 9, 6))).toBe(false);
  });

  it("allows a still when the measurement covers the flat", () => {
    // דירה 15 measures eight rooms against the eight the sheet names.
    expect(measurementIsCompleteEnough(input(8, 8, 11))).toBe(true);
    // And a room or two short is still a flat worth photographing.
    expect(measurementIsCompleteEnough(input(7, 9, 9))).toBe(true);
  });

  it("refuses a flat measured as a set of sealed boxes", () => {
    const coverage = measurementCoverage(input(6, 6, 2));
    expect(coverage.shortfall).toContain("פתחים");
  });

  it("does not hold a sheet against itself when it labels nothing", () => {
    const unlabelled = input(3, 0, 4);
    unlabelled.labelledRooms = [];
    expect(measurementIsCompleteEnough(unlabelled)).toBe(true);
  });

  it("counts only the labels that fall on measured floor, not the neighbour's", () => {
    const withNeighbour = input(6, 6, 6);
    withNeighbour.labelledRooms = [
      ...(withNeighbour.labelledRooms ?? []),
      // Three rooms of the flat next door, off this flat's floor entirely.
      ...Array.from({ length: 3 }, (_, i) => ({
        name: `neighbour ${i}`,
        kind: "bedroom",
        box: { x: 9000 + i * 100, y: 0, w: 90, h: 90 },
      })),
    ];
    expect(measurementCoverage(withNeighbour).labelled).toBe(6);
    expect(measurementIsCompleteEnough(withNeighbour)).toBe(true);
  });
});
