import {
  findRoundedFurniture,
  seatsAroundTable,
  stoolsAlongRun,
  type FurniturePiece,
} from "@/lib/projects/floorplan-furniture";
import type { VectorSegment } from "@/lib/projects/floorplan-vector";

const UPM = 56;

const piece = (
  x: number,
  y: number,
  widthM: number,
  depthM: number,
  kind: FurniturePiece["kind"] = "table",
): FurniturePiece => ({
  x,
  y,
  w: widthM * UPM,
  h: depthM * UPM,
  widthCm: widthM * 100,
  depthCm: depthM * 100,
  kind,
});

describe("seatsAroundTable", () => {
  // דירה 14's table: 89 by 209 cm, standing on its long axis, with six chairs.
  const table = piece(369, 596, 0.89, 2.09);

  it("seats six: a pair down each long side and one at each end", () => {
    const seats = seatsAroundTable(table, UPM);
    expect(seats).toHaveLength(6);
    expect(seats.every((s) => s.kind === "seat")).toBe(true);
  });

  it("stands them clear of the table, never on it", () => {
    for (const seat of seatsAroundTable(table, UPM)) {
      const overlapsX =
        seat.x < table.x + table.w && seat.x + seat.w > table.x;
      const overlapsY =
        seat.y < table.y + table.h && seat.y + seat.h > table.y;
      expect(overlapsX && overlapsY).toBe(false);
    }
  });

  it("turns with the table", () => {
    const across = piece(369, 596, 2.09, 0.89);
    const seats = seatsAroundTable(across, UPM);
    expect(seats).toHaveLength(6);
    // Four along the top and bottom now, one at each side.
    const sides = seats.filter(
      (s) => s.x + s.w <= across.x || s.x >= across.x + across.w,
    );
    expect(sides).toHaveLength(2);
  });

  it("gives a table too small to seat a pair no chairs at all", () => {
    expect(seatsAroundTable(piece(0, 0, 0.5, 0.5), UPM)).toEqual([]);
  });
});

describe("stoolsAlongRun", () => {
  // The island: 52 cm deep, 228 cm long, seating four on this sheet.
  const island = piece(532, 616, 0.52, 2.28, "storage");

  it("seats a 228 cm island four across, not two", () => {
    // Spaced at 1.35 times their width this returned two.
    expect(stoolsAlongRun(island, UPM, "low")).toHaveLength(4);
  });

  it("puts them on the side asked for", () => {
    const low = stoolsAlongRun(island, UPM, "low");
    const high = stoolsAlongRun(island, UPM, "high");
    expect(low.every((s) => s.x + s.w <= island.x)).toBe(true);
    expect(high.every((s) => s.x >= island.x + island.w)).toBe(true);
  });

  it("keeps them shallower than they are wide, as a stool is", () => {
    for (const stool of stoolsAlongRun(island, UPM, "low")) {
      expect(stool.widthCm).toBeLessThan(stool.depthCm);
    }
  });
});

describe("findRoundedFurniture", () => {
  /**
   * The four corner arcs of one rounded piece, each a quarter circle in chords.
   * On this sheet they come through about 11 by 15 cm, which is 6 to 8 units.
   */
  function corners(x: number, y: number, w: number, h: number) {
    const out: VectorSegment[] = [];
    const r = 7;
    const quarter = (cx: number, cy: number, from: number) => {
      for (let i = 0; i < 5; i++) {
        const a = ((from + (90 * i) / 5) * Math.PI) / 180;
        const b = ((from + (90 * (i + 1)) / 5) * Math.PI) / 180;
        out.push({
          x1: cx + r * Math.cos(a),
          y1: cy + r * Math.sin(a),
          x2: cx + r * Math.cos(b),
          y2: cy + r * Math.sin(b),
          lineWidth: 1,
        });
      }
    };
    quarter(x + r, y + r, 180);
    quarter(x + w - r, y + r, 270);
    quarter(x + r, y + h - r, 90);
    quarter(x + w - r, y + h - r, 0);
    return out;
  }

  it("assembles an armchair from its corners", () => {
    const arm = 0.75 * UPM;
    const found = findRoundedFurniture(corners(376, 789, arm, arm), UPM);
    expect(found).toHaveLength(1);
    expect(found[0]!.kind).toBe("seat");
    expect(found[0]!.widthCm).toBeGreaterThan(60);
  });

  it("keeps two armchairs a metre apart apart", () => {
    const arm = 0.75 * UPM;
    const found = findRoundedFurniture(
      [...corners(376, 789, arm, arm), ...corners(376 + 1.6 * UPM, 789, arm, arm)],
      UPM,
    );
    expect(found).toHaveLength(2);
  });

  it("parts two sofas standing 25 cm apart, as דירה 16's pair does", () => {
    // Each sofa is two 70 cm seats side by side, so the arcs inside one sofa
    // are further apart than the two sofas are.
    const seat = 0.7 * UPM;
    const sofa = (x: number) => [...corners(x, 789, seat, seat), ...corners(x + seat, 789, seat, seat)];
    const found = findRoundedFurniture([...sofa(376), ...sofa(376 + 2 * seat + 0.25 * UPM)], UPM);
    expect(found).toHaveLength(2);
    for (const piece of found) expect(Math.max(piece.widthCm, piece.depthCm)).toBeCloseTo(140, 0);
  });

  it("parts דירה 14's armchair from the two-seater beside it, by the edges drawn", () => {
    // An armchair and a 1.44 m two-seater 32 cm apart: sofa-sized together.
    // The front edge runs across each piece and stops between them.
    const arm = 0.75 * UPM;
    const two = 1.44 * UPM;
    const gap = 0.32 * UPM;
    const deep = 0.7 * UPM;
    const edge = (x: number, len: number) => ({ x1: x + 7, y1: 789 + deep * 0.8, x2: x + len - 7, y2: 789 + deep * 0.8, lineWidth: 1 });
    const found = findRoundedFurniture(
      [...corners(376, 789, arm, deep), ...corners(376 + arm + gap, 789, two / 2, deep), ...corners(376 + arm + gap + two / 2, 789, two / 2, deep)],
      UPM,
      { segments: [edge(376, arm), edge(376 + arm + gap, two)] },
    );
    expect(found.map((p) => Math.round(Math.max(p.widthCm, p.depthCm))).sort()).toEqual([144, 75]);
  });

  it("does not call a door swing and the marks round it a sofa", () => {
    // דירה 21's bedroom doorway: an arc and four small marks, 1.86 by 1.05 m
    // across, none of them at a corner of that box.
    const knot = (x: number, y: number) => corners(x, y, 0.13 * UPM, 0.13 * UPM).slice(0, 5);
    const found = findRoundedFurniture(
      [knot(376, 789 + 0.54 * UPM), knot(376 + 0.44 * UPM, 789 + 0.53 * UPM), knot(376 + 1.1 * UPM, 789), knot(376 + 1.74 * UPM, 789 + 0.71 * UPM), knot(376 + 0.98 * UPM, 789 + 0.98 * UPM)].flat(),
      UPM,
    );
    expect(found.filter((p) => Math.max(p.widthCm, p.depthCm) > 100)).toEqual([]);
  });

  it("ignores a shape too small to sit on", () => {
    expect(findRoundedFurniture(corners(100, 100, 0.15 * UPM, 0.15 * UPM), UPM)).toEqual(
      [],
    );
  });
});
