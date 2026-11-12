/**
 * @jest-environment node
 */
import { GENERIC_CAD_PROFILE, layerKind, withLayerMap } from "@/lib/projects/building/cad-layers";
import { isFlatFailure, measureFlatFromDxf } from "@/lib/projects/pipeline/flat-measured";
import { answerAssumptions, chooseRoute, runProject, RunProjectError, type RunDeps, type RunInput } from "@/lib/projects/pipeline/runProject";

const file = (relPath: string, kind: RunInput["files"][number]["kind"]) => ({ relPath, kind, blobUrl: `https://x.public.blob.vercel-storage.com/${relPath}` });
const answers: RunInput["answers"] = {
  units: { value: "cm", source: "sheet", from: "header_units" },
  floorHeight: { value: 3, source: "default" },
  facade: { value: "stone", source: "user" },
  north: { value: "up", source: "default" },
  surroundings: { value: "none", source: "default" },
  furniture: { value: "full", source: "user" },
  views: { value: ["exterior_day", "aerial"], source: "inferred", from: "kind" },
};

describe("chooseRoute — which pipeline the files take", () => {
  it("a flat is built from one DXF", () => {
    expect(chooseRoute("flat", [file("a.dxf", "dxf"), file("a.pdf", "pdf")]).route).toBe("flat-dxf");
  });

  it("stops a flat with no DXF, naming why, before anything is fetched", () => {
    expect(() => chooseRoute("flat", [file("a.dwg", "dwg")])).toThrow(expect.objectContaining({ code: "needs-conversion" }));
    expect(() => chooseRoute("flat", [file("a.pdf", "pdf")])).toThrow(expect.objectContaining({ code: "unsupported" }));
    expect(() => chooseRoute("flat", [file("a.dxf", "dxf"), file("b.dxf", "dxf")])).toThrow(RunProjectError);
    expect(() => chooseRoute("house", [])).toThrow(expect.objectContaining({ code: "no-files" }));
  });

  it("one DWF strip is a building; several sheets are the house pipeline", () => {
    expect(chooseRoute("building", [file("strip.dwf", "dwf")]).route).toBe("building-dwf");
    expect(chooseRoute("public", [file("0.dxf", "dxf"), file("facades.dxf", "dxf"), file("x.pdf", "pdf")])).toEqual({ route: "house", files: [file("0.dxf", "dxf"), file("facades.dxf", "dxf")] });
    expect(() => chooseRoute("industrial", [file("a.pdf", "pdf")])).toThrow(expect.objectContaining({ code: "unsupported" }));
  });
});

describe("answerAssumptions — rule 13.2", () => {
  it("lists what the client did not say, and only the answers the route used", () => {
    const out = answerAssumptions(answers, ["units", "floorHeight", "furniture", "views"]);
    expect(out).toEqual(["יחידות השרטוט: סנטימטר — מהגיליון (כותרת הקובץ)", "גובה קומה: 3 — ברירת מחדל", "מבטים: חוץ ביום, מבט מלמעלה — הוסק (סוג המבנה)"]);
  });
});

describe("withLayerMap — the layers the client confirmed win", () => {
  it("names a confirmed layer's part and leaves the others to the profile", () => {
    const p = withLayerMap(GENERIC_CAD_PROFILE, { "A-WALL": "wall-int", "my.layer(1)": "window" });
    expect(layerKind(p, "a-wall")).toBe("wall-int");
    expect(layerKind(p, "my.layer(1)")).toBe("window");
    expect(layerKind(p, "myXlayer(1)")).toBeNull();
    expect(withLayerMap(GENERIC_CAD_PROFILE, {})).toBe(GENERIC_CAD_PROFILE);
  });
});

describe("measureFlatFromDxf — refuses what it cannot read", () => {
  it("garbage bytes are unreadable, not a crash", () => {
    const r = measureFlatFromDxf({ bytes: Buffer.from("not a dxf") });
    expect(isFlatFailure(r) && r.reason).toBe("unreadable");
  });
});

describe("runProject — the house and DWF routes through their pipelines", () => {
  const deps = (): RunDeps & { calls: string[] } => {
    const calls: string[] = [];
    return {
      calls,
      fetchFile: async (url) => {
        calls.push(`fetch ${url.split("/").pop()}`);
        return Buffer.from(url);
      },
      putBooklet: async (jobId) => `https://x.public.blob.vercel-storage.com/vmb-booklets/${jobId}/booklet.pdf`,
      htmlToPdf: async (html) => Buffer.from(`pdf:${html}`),
      house: async (files, name) => {
        calls.push(`house ${[...files.keys()].join(",")} ${name}`);
        return { html: "<html/>", pictures: 7, notes: ["no notes file"] };
      },
      buildingDwf: async () => ({ html: "<html/>", pictures: 3 }),
    };
  };

  it("fetches each sheet, builds unpainted, reports each stage and returns the booklet", async () => {
    const d = deps();
    const stages: string[] = [];
    const out = await runProject(
      { jobId: "j1", projectId: "p1", kind: "house", files: [file("plans/0.dxf", "dxf"), file("plans/facades.dxf", "dxf")], answers, layerMaps: {}, projectName: "בית" },
      async (stage, done, total) => void stages.push(`${stage} ${done}/${total ?? "?"}`),
      d,
    );
    expect(d.calls).toEqual(["fetch 0.dxf", "fetch facades.dxf", "house 0.dxf,facades.dxf בית"]);
    expect(stages).toEqual(["read 1/2", "read 2/2", "render 7/7", "booklet 1/1"]);
    expect(out).toMatchObject({ bookletUrl: expect.stringContaining("vmb-booklets/j1/"), picturesPainted: 0, picturesFree: 7, route: "house" });
    expect(out.assumptions[0]).toBe("no notes file");
  });

  it("says when the confirmed layers did not reach the route", async () => {
    const out = await runProject(
      { jobId: "j2", projectId: "p1", kind: "building", files: [file("strip.dwf", "dwf")], answers, layerMaps: { "strip.dwf": { W: "wall-ext" } } },
      async () => undefined,
      deps(),
    );
    expect(out.route).toBe("building-dwf");
    expect(out.picturesFree).toBe(3);
    expect(out.assumptions.some((a) => a.includes("השכבות שאושרו"))).toBe(true);
  });
});
