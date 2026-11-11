import { blockKind, doorWidthCm, hatchKind, layerKind, profileFor, REVIT_AIA_PROFILE } from "@/lib/projects/building/cad-layers";
import { facadeSideOfName, projectFromSheets } from "@/lib/projects/building/house-project";

// Layers of the Damesek Eliezer plans, a Revit export (מתי תכנון, 2023).
const DAMESEK_LAYERS = ["A_WALL_PRTN", "A-WALL-PATT", "A_DOOR", "A_SEEN_LT", "A-ANNO-IDEN", "A-ANNO-DIMS", "S-GRID", "A_FIXT_SANT", "A-FLOR-STRS", "C-TOPO"];

describe("Revit export (AIA layers)", () => {
  it("is recognised by its layers", () => {
    expect(profileFor(DAMESEK_LAYERS).id).toBe("revit-aia");
  });

  it("reads its walls from a patterned hatch, not only a solid one", () => {
    expect(REVIT_AIA_PROFILE.patternedPoche).toBe(true);
    expect(hatchKind(REVIT_AIA_PROFILE, "FP_2", "A-WALL-PATT")).toBe("wall-int");
    expect(hatchKind(REVIT_AIA_PROFILE, "FP_2", "S-COLS")).toBe("wall-int");
    expect(hatchKind(REVIT_AIA_PROFILE, "SOLID", "A-ANNO-IDEN")).toBe("ignore");
  });

  it("knows a door and a window by the family's name, whatever layer it stands on", () => {
    expect(blockKind(REVIT_AIA_PROFILE, "BW IntSgl - 100_210-1897853-קומה 01-שטיבלאך", "A_DOOR")).toBe("door");
    expect(blockKind(REVIT_AIA_PROFILE, "M_Single-Flush - 0715 x 2134mm לטרספה 2-944334-x", "A_DOOR")).toBe("door");
    expect(blockKind(REVIT_AIA_PROFILE, "חלון קשת 5 - __חלון קשת  100_940", "A_SEEN_LT")).toBe("window");
    expect(blockKind(REVIT_AIA_PROFILE, "BW Standard Double _ Surround - 320_285", "A_SEEN_LT")).toBe("window");
    expect(blockKind(REVIT_AIA_PROFILE, "__חלון עגול - __חלון עגול", "A_SEEN_LT")).toBe("window");
    // A tag and a level are annotation, a service cabinet's door is not a room's.
    expect(blockKind(REVIT_AIA_PROFILE, "RC_MULTI_TAG - אלומיניום-1670613-x", "A-ANNO-IDEN")).toBe("ignore");
    expect(blockKind(REVIT_AIA_PROFILE, "RvZ_Service Cabinet Door X2 - 80_110", "A_DOOR")).toBe("furniture");
  });

  it("takes a door's width from its type", () => {
    expect(doorWidthCm(REVIT_AIA_PROFILE, "BW IntSgl - 100_210-1897853-קומה 01")).toBe(100);
    expect(doorWidthCm(REVIT_AIA_PROFILE, "BW IntSgl - 120_210 _ידית בהלה-1897842")).toBe(120);
    expect(doorWidthCm(REVIT_AIA_PROFILE, "M_Single-Flush - 0915 x 2134mm לטרספה")).toBe(91.5);
  });

  it("files its layers", () => {
    expect(layerKind(REVIT_AIA_PROFILE, "A-FLOR-STRS")).toBe("stairs");
    expect(layerKind(REVIT_AIA_PROFILE, "A-ANNO-DIMS")).toBe("dimension");
    expect(layerKind(REVIT_AIA_PROFILE, "C-TOPO")).toBe("ignore");
  });
});

describe("elevations as files of their own", () => {
  it("names the side a file draws", () => {
    expect(facadeSideOfName("מגרש 535 - Elevation - חזית  מזרחית03.dxf")).toBe("מזרחית");
    expect(facadeSideOfName("north-elevation.dxf")).toBe("צפונית");
    expect(facadeSideOfName("A-ground.dxf")).toBeNull();
  });

  it("keeps every elevation file, not the first only", () => {
    const { project, problems } = projectFromSheets([
      { file: "M-ground.dxf", name: "M-ground.dxf", whole: true },
      { file: "M-floor1.dxf", name: "M-floor1.dxf", whole: true },
      { file: "חזית מזרחית.dxf", name: "חזית מזרחית.dxf" },
      { file: "חזית צפונית.dxf", name: "חזית צפונית.dxf" },
    ]);
    expect(problems).toEqual([]);
    expect(project?.facades.file).toBe("חזית מזרחית.dxf");
    expect(project?.facades.also?.map((r) => r.file)).toEqual(["חזית צפונית.dxf"]);
    expect(project?.models[0]?.floors).toHaveLength(2);
  });
});
