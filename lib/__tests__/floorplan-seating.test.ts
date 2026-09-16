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

  it("ignores a shape too small to sit on", () => {
    expect(findRoundedFurniture(corners(100, 100, 0.15 * UPM, 0.15 * UPM), UPM)).toEqual(
      [],
    );
  });
});
