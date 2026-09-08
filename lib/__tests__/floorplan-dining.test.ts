import {
  findDiningTable,
  settleTables,
  type FurniturePiece,
} from "@/lib/projects/floorplan-furniture";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

const UPM = 56;

/** The four corner arcs of one chair, which is all this CAD puts in the curve list. */
function chair(x: number, y: number): VectorSegment[] {
  const out: VectorSegment[] = [];
  const r = 4;
  const corners: Array<[number, number]> = [
    [0, 0],
    [r * 2, 0],
    [0, r * 2],
    [r * 2, r * 2],
  ];
  for (const [ox, oy] of corners) {
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      out.push({
        x1: x + ox + t * r,
        y1: y + oy,
        x2: x + ox + (t + 0.25) * r,
        y2: y + oy + r * 0.4,
        lineWidth: 1,
      });
    }
  }
  return out;
}

const piece = (
  x: number,
  y: number,
  w: number,
  h: number,
  kind: FurniturePiece["kind"],
): FurniturePiece => ({
  x,
  y,
  w,
  h,
  widthCm: (w / UPM) * 100,
  depthCm: (h / UPM) * 100,
  kind,
});

describe("findDiningTable", () => {
  /** Chairs down both long sides and one at each end, as דירה 14 draws them. */
  const ring = [
    ...chair(300, 340),
    ...chair(300, 400),
    ...chair(390, 340),
    ...chair(390, 400),
    ...chair(345, 300),
    ...chair(345, 450),
  ];

  it("finds the table in the hole in the middle of the ring", () => {
    const table = findDiningTable(ring, UPM);
    expect(table).not.toBeNull();
    // Inside the ring, and a real table's proportions rather than the ring's.
    expect(table!.x).toBeGreaterThan(300);
    expect(table!.y).toBeGreaterThan(300);
    expect(table!.widthCm).toBeGreaterThan(50);
    expect(table!.depthCm).toBeGreaterThan(50);
  });

  it("finds nothing when there is no ring", () => {
    expect(findDiningTable([...chair(300, 340)], UPM)).toBeNull();
  });
});

describe("settleTables", () => {
  it("drops a table-shaped box with no chairs near it", () => {
    // The legend box on דירה 14 is 136 by 86 cm and was winning on area.
    const legend = piece(578, 942, 76, 48, "table");
    const settled = settleTables([legend], [...chair(300, 340)], UPM);
    expect(settled.filter((p) => p.kind === "table")).toHaveLength(0);
  });

  it("keeps the ring's table over a bigger box", () => {
    const legend = piece(578, 942, 200, 120, "table");
    const fromRing = piece(369, 596, 50, 117, "table");
    const settled = settleTables(
      [legend, fromRing],
      [...chair(300, 340)],
      UPM,
      fromRing,
    );
    expect(settled.find((p) => p.x === 369)!.kind).toBe("table");
    expect(settled.find((p) => p.x === 578)!.kind).toBe("unknown");
  });

  it("falls back to the largest when the sheet carries no curves at all", () => {
    const small = piece(100, 100, 70, 44, "table");
    const big = piece(500, 100, 100, 60, "table");
    const settled = settleTables([small, big], [], UPM);
    expect(settled.filter((p) => p.kind === "table")).toHaveLength(1);
    expect(settled.find((p) => p.x === 500)!.kind).toBe("table");
  });
});
