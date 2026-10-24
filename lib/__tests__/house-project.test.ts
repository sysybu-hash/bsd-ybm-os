/**
 * @jest-environment node
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { ElevationLevels, LevelMark } from "@/lib/projects/building/house-levels";
import {
  GOTTLIEB_HOUSE,
  houseNotesFrom,
  houseProjectFromFiles,
  levelsFromMarks,
  northFromAnswer,
  northOfDegrees,
  projectFromSheets,
  standardLevels,
} from "@/lib/projects/building/house-project";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";

const sheet = (name: string, extra?: { sheet?: string }) => ({ file: extra?.sheet ? "plans.dxf" : name, name: extra?.sheet ?? name, ...extra });

describe("which uploaded sheet is which", () => {
  it("reads the models and their storeys off the files' names", () => {
    const { project, problems } = projectFromSheets(["C-floor1.dwf", "A-ground.dwf", "facades.dwf", "A-floor1.dwf", "C-ground.dwf"].map((n) => sheet(n)));
    expect(problems).toEqual([]);
    expect(project!.facades).toEqual({ file: "facades.dwf" });
    expect(project!.models).toEqual([
      { id: "A", name: "דגם A", floors: [{ file: "A-ground.dwf" }, { file: "A-floor1.dwf" }] },
      { id: "C", name: "דגם C", floors: [{ file: "C-ground.dwf" }, { file: "C-floor1.dwf" }] },
    ]);
    expect(project!.north).toBeUndefined();
    expect(project!.levels).toBeUndefined();
  });

  it("reads a DXF's layout tabs the same way", () => {
    const { project } = projectFromSheets([sheet("", { sheet: "B_קומת קרקע" }), sheet("", { sheet: "B_קומה א" }), sheet("", { sheet: "חזיתות" })]);
    expect(project!.facades).toEqual({ file: "plans.dxf", sheet: "חזיתות" });
    expect(project!.models).toEqual([{ id: "B", name: "דגם B", floors: [{ file: "plans.dxf", sheet: "B_קומת קרקע" }, { file: "plans.dxf", sheet: "B_קומה א" }] }]);
  });

  it("says what is missing", () => {
    expect(projectFromSheets([sheet("A-floor1.dwf")]).problems).toEqual(expect.arrayContaining([expect.stringMatching(/חזיתות/), expect.stringMatching(/אין קומת קרקע/)]));
    expect(projectFromSheets([sheet("A-ground.dwf"), sheet("A-floor2.dwf"), sheet("facades.dwf")]).problems).toEqual([expect.stringMatching(/חסרה קומה 1/)]);
  });

  // The client's own files stay out of the repository: where they are not, there is nothing to read.
  const dir = path.join(process.cwd(), "הדמיות גוטליב", "gottlieb-dwf");
  (existsSync(path.join(dir, "house.json")) ? it : it.skip)("takes the hand's notes beside the sheets: the Gottlieb house from its own files and notes", () => {
    const names = ["A-ground.dwf", "A-floor1.dwf", "B-ground.dwf", "B-floor1.dwf", "C-ground.dwf", "C-floor1.dwf", "facades.dwf"];
    const files = new Map<string, Buffer>(names.map((n) => [n, Buffer.alloc(0)]));
    files.set("house.json", readFileSync(path.join(dir, "house.json")));
    const { project, problems } = houseProjectFromFiles(files);
    expect(problems).toEqual([]);
    expect(project).toEqual(GOTTLIEB_HOUSE);
  });
});

describe("the hand's notes, checked", () => {
  it("keeps what holds and names what does not", () => {
    const { notes, problems } = houseNotesFrom({ north: 90, faces: ["south", "up"], levels: { floors: [0, 3], roof: 2, parapet: 3 }, site: { west: 0, east: 1 } });
    expect(notes.north).toEqual({ x: 1, z: 0 });
    expect(notes.site).toEqual({ west: 0, east: 1 });
    expect(notes.faces).toBeUndefined();
    expect(notes.levels).toBeUndefined();
    expect(problems).toHaveLength(2);
  });
});

describe("the compass off the plan's arrow", () => {
  it("turns degrees from the sheet's up into north in the model's frame", () => {
    expect(northOfDegrees(0)).toEqual({ x: 0, z: -1 });
    expect(northOfDegrees(90)).toEqual({ x: 1, z: 0 });
    expect(northOfDegrees(180)).toEqual({ x: 0, z: 1 });
  });

  it("keeps an arrow only where the sheet draws one", () => {
    const seg = (x1: number, y1: number, x2: number, y2: number) => ({ x1, y1, x2, y2, stroke: 0 });
    const plan = { pageWidth: 1000, pageHeight: 1000, segments: [seg(900, 100, 910, 60), seg(910, 60, 920, 100), seg(900, 100, 920, 100)], curves: [], texts: [], fills: [], arcs: [] } as unknown as DwfGeometry;
    expect(northFromAnswer({ found: true, box_2d: [50, 890, 110, 930], degrees: 90 }, plan)).toEqual({ north: { x: 1, z: 0 }, degrees: 90 });
    expect(northFromAnswer({ found: true, box_2d: [500, 100, 560, 160], degrees: 90 }, plan)).toBeNull();
    expect(northFromAnswer({ found: false }, plan)).toBeNull();
  });
});

describe("the storeys' levels off the elevations' marks", () => {
  const mark = (rel: number, kind: LevelMark["kind"]): LevelMark => ({ x: 0, y: 0, rel, abs: null, kind, text: String(rel) });
  const read = (marks: LevelMark[], ok = true) => ({ ok, marks, datum: null, zeroY: 0, scale: 1, rejected: [] }) as ElevationLevels;

  it("takes a floor a storey from ±0.00, and the roof and parapet over the top one", () => {
    const south = read([mark(0, "floor"), mark(2.97, "floor"), mark(5.84, "roof"), mark(-0.7, "parking")]);
    const west = read([mark(0.0, "floor"), mark(2.98, "floor"), mark(6.94, "roof"), mark(1.2, "opening")]);
    expect(levelsFromMarks([south, west, null], 2)).toEqual({ floors: [0, 2.97], roof: 5.84, parapet: 6.94 });
  });

  it("gives none where the marks do not give every storey, or the storeys are not storeys", () => {
    expect(levelsFromMarks([read([mark(0, "floor"), mark(2.97, "floor")])], 3)).toBeNull();
    expect(levelsFromMarks([read([mark(0, "floor"), mark(1.2, "floor")])], 2)).toBeNull();
    expect(levelsFromMarks([read([mark(0, "floor"), mark(2.97, "floor")], false)], 2)).toBeNull();
  });

  it("falls back to a storey's height for the roof without a roof mark", () => {
    expect(levelsFromMarks([read([mark(0, "floor"), mark(3.1, "floor")])], 2)).toEqual({ floors: [0, 3.1], roof: 6.2, parapet: 7.2 });
    expect(standardLevels(2)).toEqual({ floors: [0, 3], roof: 6, parapet: 7 });
  });
});
