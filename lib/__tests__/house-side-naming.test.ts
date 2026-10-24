import { PLAN_NORTH, sideTitle, sideWords, viewFrom, type Naming } from "@/lib/projects/building/compass";

/**
 * Where true north is not known, a house's sides are named from its street —
 * the same names whichever way the sheet happens to be turned, so two
 * booklets of one house never call its front "south" and then "east".
 */
describe("a house's sides named from its street", () => {
  const street: Naming = { by: "street", street: "south" };

  it("names the street front, the back, and the sides as seen from the street", () => {
    expect(sideTitle("south", street)).toBe("חזית רחוב");
    expect(sideTitle("north", street)).toBe("חזית אחורית");
    // Standing in the street at the plan's bottom, facing the house (up the sheet): the plan's right is on the right.
    expect(sideTitle("east", street)).toBe("חזית צד ימין");
    expect(sideTitle("west", street)).toBe("חזית צד שמאל");
  });

  it("turns with the street, not with the sheet", () => {
    const east: Naming = { by: "street", street: "east" };
    expect(sideTitle("east", east)).toBe("חזית רחוב");
    expect(sideTitle("west", east)).toBe("חזית אחורית");
    // Facing the house from the plan's right (looking left, -x, north up): the plan's top is on the right hand.
    expect(sideTitle("north", east)).toBe("חזית צד ימין");
    expect(sideTitle("south", east)).toBe("חזית צד שמאל");
  });

  it("says where a view is taken from in the same words", () => {
    expect(viewFrom({ x: 1, z: 1 }, street)).toBe("מצד הרחוב, מימין");
    expect(viewFrom({ x: -1, z: -1 }, street)).toBe("מאחור, משמאל");
    expect(sideWords("north", street).in).toBe("מאחור");
  });

  it("keeps the compass where north is known", () => {
    const compass: Naming = { by: "compass", north: PLAN_NORTH };
    expect(sideTitle("south", compass)).toBe("חזית דרומית");
    expect(viewFrom({ x: 1, z: 1 }, compass)).toBe("מדרום־מזרח");
    expect(sideTitle("south", { by: "compass", north: { x: 1, z: 0 } })).toBe("חזית מזרחית");
  });
});
