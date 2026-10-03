import { findWardrobes } from "@/lib/projects/floorplan-wardrobe";

const UPM = 58;
const seg = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2, lineWidth: 2 });
const m = (v: number) => v * UPM;

// דירה 16's middle bedroom: a 1.7 m wardrobe against the west wall, its rail
// drawn double down the middle and seven hangers across it, some tilted.
const rail = [seg(m(3.33), m(9.46), m(3.33), m(11.16)), seg(m(3.36), m(9.46), m(3.36), m(11.16))];
const hangers = [9.66, 9.76, 9.86, 10.06, 10.26, 10.56, 10.86].map((y, i) =>
  seg(m(3.15), m(y + (i % 2 ? 0.05 : 0)), m(3.55), m(y)),
);
const front = [seg(m(3.64), m(9.46), m(3.64), m(11.16)), seg(m(3.05), m(11.16), m(3.64), m(11.16))];

describe("wardrobes, found by their hangers", () => {
  it("finds one wardrobe the length of its rail, a wardrobe deep", () => {
    const found = findWardrobes([...rail, ...hangers, ...front], UPM);
    expect(found).toHaveLength(1);
    const w = found[0]!;
    expect(w.kind).toBe("storage");
    expect(w.h / UPM).toBeCloseTo(1.7, 1);
    expect(w.w / UPM).toBeCloseTo(0.6, 1);
    expect((w.x + w.w / 2) / UPM).toBeCloseTo(3.35, 1);
  });

  it("wants four hangers: a line with a stroke or two across it is not a wardrobe", () => {
    expect(findWardrobes([...rail, ...hangers.slice(0, 3)], UPM)).toEqual([]);
  });

  it("ignores hangers that do not cross the rail", () => {
    const aside = hangers.map((h) => ({ ...h, x1: h.x1 + m(1), x2: h.x2 + m(1) }));
    expect(findWardrobes([...rail, ...aside], UPM)).toEqual([]);
  });
});
