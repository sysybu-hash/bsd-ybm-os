import { modelOf, storeyOf } from "@/lib/projects/building/dxf-house";
import { classifyStructure, type PlanEvidence } from "@/lib/projects/structure/classify";

describe("storey names written in Latin letters", () => {
  it("reads Wolf's files as the storeys they are", () => {
    expect(storeyOf("tochnit karka_kayam_seminar volf.dxf")).toBe(0);
    expect(storeyOf("tochnit 1_kayam_seminar volf.dxf")).toBe(1);
    expect(storeyOf("tochnit 2_tosefet_seminar volf.dxf")).toBe(2);
    expect(storeyOf("tochnit 3_tosefet_seminar volf.dxf")).toBe(3);
    expect(storeyOf("tochnit gag_tosefet_seminar volf.dxf")).toBe("roof");
    expect(storeyOf("komat martef.dwf")).toBe(-1);
    expect(storeyOf("קומה 4")).toBe(4);
  });

  it("does not take a word that only contains one", () => {
    expect(storeyOf("gagliano-house.dxf")).toBeNull();
    expect(storeyOf("garmushka_seminar volf-חזיתות-חתכים.dwf")).toBeNull();
  });

  it("keeps the Hebrew and English names as before", () => {
    expect(storeyOf("A_קומת קרקע")).toBe(0);
    expect(storeyOf("B_קומה א")).toBe(1);
    expect(storeyOf("C - גג")).toBe("roof");
    expect(storeyOf("A-ground.dwf")).toBe(0);
  });

  it("drops the storey from the model name", () => {
    expect(modelOf("tochnit 1_kayam_seminar volf")).toBe(modelOf("tochnit karka_kayam_seminar volf"));
  });
});

describe("files that are a building's storeys", () => {
  const plan = (id: string, over: Partial<PlanEvidence>): PlanEvidence => ({
    id, kind: "floor", widthM: 40, heightM: 22, closedM2: 540, units: [], dwelling: 0, commercial: 6, site: 0, storey: null, ...over,
  });

  it("are one building by storeys, even when its rooms are classrooms", () => {
    const v = classifyStructure({
      fileKind: "files",
      storeySheets: 5,
      facadeSheets: 0,
      numberedFloorSheets: 0,
      houseSheets: 0,
      plans: [plan("a", {}), plan("b", {}), plan("c", {}), plan("d", {}), plan("e", { closedM2: 876 })],
    });
    expect(v.structure).toBe("house");
    expect(v.sure).toBe(true);
  });
});
