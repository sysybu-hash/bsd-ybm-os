import { inferRoomKind } from "@/lib/projects/floorplan-layout";
import { floorplanVizPresetsFor, listFloorplanVizPresets } from "@/lib/projects/floorplan-viz-styles";
import { sceneRoomKindOf } from "@/lib/projects/scene3d/types";

describe("a commercial floor's spaces", () => {
  it("reads shops, offices and halls from what the plan prints", () => {
    expect(inferRoomKind("חנות 3")).toBe("shop");
    expect(inferRoomKind("משרדים")).toBe("office");
    expect(inferRoomKind("עיצוב מרחבי למידה 901")).toBe("hall");
    expect(inferRoomKind("כיתה ג")).toBe("hall");
    expect(inferRoomKind("לובי כניסה")).toBe("hall");
  });

  it("leaves a flat's rooms as they were", () => {
    expect(inferRoomKind("חדר שינה הורים")).toBe("bedroom");
    expect(inferRoomKind('ממ"ד')).toBe("mmd");
    expect(inferRoomKind("מטבח")).toBe("kitchen");
    expect(inferRoomKind("סלון")).toBe("living");
  });

  it("furnishes them in the scene as spaces it has no rules for", () => {
    expect(sceneRoomKindOf("shop")).toBe("other");
    expect(sceneRoomKindOf("bedroom")).toBe("bedroom");
    expect(sceneRoomKindOf(undefined)).toBe("other");
  });

  it("offers a commercial floor its own styles, and a flat the homes'", () => {
    expect(floorplanVizPresetsFor("commercial")).toEqual(["retail", "office", "public_space"]);
    const homes = floorplanVizPresetsFor("apartment");
    expect(homes).toContain("contemporary");
    expect(homes).not.toContain("retail");
    // A picker with no structure (the project dashboard) still lists every preset.
    expect(listFloorplanVizPresets().length).toBe(homes.length + 3);
  });
});
