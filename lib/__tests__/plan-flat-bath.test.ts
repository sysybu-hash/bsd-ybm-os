import { flatBathRooms } from "@/lib/projects/building/plan-flat-bath";

describe("flatBathRooms", () => {
  it("includes bathrooms and circulation that touches them", () => {
    const rooms = [
      { kind: "bathroom", name: "ח.רחצה 3", areaM2: 1.18, x: 14, z: 10.98, w: 1.36, d: 0.86 },
      { kind: "circulation", name: "מסדרון 3", areaM2: 0.89, x: 15.4, z: 10.96, w: 1.04, d: 0.88 },
      { kind: "circulation", name: "מסדרון 2", areaM2: 3.92, x: 15.2, z: 9.56, w: 0.98, d: 4.04 },
      { kind: "circulation", name: "רחוק", areaM2: 4, x: 1, z: 1, w: 1, d: 4 },
      { kind: "bedroom", name: "חדר", areaM2: 12, x: 10, z: 4, w: 3, d: 4 },
    ];
    const got = flatBathRooms(rooms).map((r) => r.name);
    expect(got).toContain("ח.רחצה 3");
    expect(got).toContain("מסדרון 3");
    expect(got).toContain("מסדרון 2");
    expect(got).not.toContain("רחוק");
    expect(got).not.toContain("חדר");
  });
});
