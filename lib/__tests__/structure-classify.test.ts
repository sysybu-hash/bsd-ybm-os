import { classifyStructure, planBlock, type FileEvidence, type PlanEvidence } from "@/lib/projects/structure/classify";

const plan = (over: Partial<PlanEvidence>): PlanEvidence => ({
  id: "p0",
  kind: "floor",
  widthM: 12,
  heightM: 10,
  units: [],
  dwelling: 0,
  commercial: 0,
  site: 0,
  storey: null,
  ...over,
});

const file = (over: Partial<FileEvidence>): FileEvidence => ({
  fileKind: "dxf",
  plans: [],
  storeySheets: 0,
  facadeSheets: 0,
  numberedFloorSheets: 0,
  houseSheets: 0,
  ...over,
});

describe("classifyStructure", () => {
  it("reads a flat from its bedrooms", () => {
    const v = classifyStructure(file({ plans: [plan({ dwelling: 3, closedM2: 95 })] }));
    expect(v.structure).toBe("apartment");
    expect(v.sure).toBe(true);
  });

  it("offers a sales sheet with no text as a flat, and asks", () => {
    const v = classifyStructure(file({ fileKind: "pdf", plans: [plan({})] }));
    expect(v.structure).toBe("apartment");
    expect(v.sure).toBe(false);
  });

  it("reads a building from a strip of numbered floors", () => {
    const v = classifyStructure(
      file({
        fileKind: "dwf",
        numberedFloorSheets: 3,
        plans: [plan({ id: "a", units: [1, 2, 3, 4] }), plan({ id: "b", units: [5, 6, 7, 8], dwelling: 4 })],
      }),
    );
    expect(v.structure).toBe("building");
    expect(v.sure).toBe(true);
  });

  it("reads a private house from storey sheets and facades", () => {
    const v = classifyStructure(file({ storeySheets: 2, facadeSheets: 1, plans: [plan({ storey: 0 }), plan({ id: "q", storey: 1 })] }));
    expect(v.structure).toBe("house");
    expect(v.sure).toBe(true);
  });

  it("reads a shop floor from what it prints", () => {
    const v = classifyStructure(file({ plans: [plan({ commercial: 6, closedM2: 829, widthM: 53, heightM: 17 })] }));
    expect(v.structure).toBe("commercial");
    expect(v.sure).toBe(true);
  });

  it("takes a large floor with no dwelling word as commercial, but asks", () => {
    const v = classifyStructure(file({ plans: [plan({ closedM2: 656, widthM: 53, heightM: 14 })] }));
    expect(v.structure).toBe("commercial");
    expect(v.sure).toBe(false);
  });

  it("asks when the signs disagree", () => {
    const v = classifyStructure(file({ plans: [plan({ dwelling: 2, commercial: 3, closedM2: 120 })] }));
    expect(v.sure).toBe(false);
    expect(v.reasons.some((r) => r.includes("סותרים"))).toBe(true);
  });

  it("refuses a photograph, and a file with no floor plan", () => {
    expect(classifyStructure(file({ fileKind: "image", photo: true })).blockers).toHaveLength(1);
    const elevations = classifyStructure(file({ plans: [plan({ kind: "elevation" }), plan({ id: "s", kind: "section" })] }));
    expect(elevations.structure).toBe("unknown");
    expect(elevations.blockers[0]).toContain("לא נמצאה");
  });

  it("knows a site plan", () => {
    const v = classifyStructure(file({ plans: [plan({ kind: "site", site: 2 })] }));
    expect(v.structure).toBe("site");
  });

  it("blocks the strip a sprawling drawing closes into, and the file when no floor is left", () => {
    // Pisga before the full reader: 12.5 m² closed in a 107 × 4.9 m extent.
    const strip = plan({ widthM: 107, heightM: 4.9, closedM2: 12.5 });
    expect(planBlock(strip)).toContain("נסגרו רק");
    const v = classifyStructure(file({ plans: [strip] }));
    expect(v.blockedPlans.get("p0")).toBeDefined();
    expect(v.blockers).toHaveLength(1);
    expect(v.sure).toBe(false);
  });

  it("lets one sign decide when it far outweighs the other (Pisga: 11 shop and class names, 1 flat word)", () => {
    const v = classifyStructure(file({ plans: [plan({ commercial: 11, dwelling: 1, closedM2: 829, widthM: 53, heightM: 17 })] }));
    expect(v.structure).toBe("commercial");
    expect(v.sure).toBe(true);
  });

  it("reads numbers on a strip with shop words and no flat as shop numbers", () => {
    const v = classifyStructure(
      file({ fileKind: "dwf", numberedFloorSheets: 10, plans: [plan({ units: [1, 2, 3], commercial: 7 })] }),
    );
    expect(v.structure).toBe("commercial");
  });

  it("does not take a building's strip for a house because it names storeys and draws facades", () => {
    const v = classifyStructure(
      file({ fileKind: "dwf", numberedFloorSheets: 4, storeySheets: 1, facadeSheets: 4, plans: [plan({ units: [1, 2, 3, 4], dwelling: 2 })] }),
    );
    expect(v.structure).toBe("building");
    expect(v.sure).toBe(true);
  });
});

