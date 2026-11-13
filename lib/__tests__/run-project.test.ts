/**
 * @jest-environment node
 */
import { GENERIC_CAD_PROFILE, layerKind, withLayerMap } from "@/lib/projects/building/cad-layers";
import { isFlatFailure, measureFlatFromDxf } from "@/lib/projects/pipeline/flat-measured";
import { answerAssumptions, chooseRoute, convertDwgFiles, dwgConvertedBefore, runProject, RunProjectError, type RunDeps, type RunInput } from "@/lib/projects/pipeline/runProject";

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

describe("convertDwgFiles — DWG read as DXF", () => {
  const report = async () => undefined;
  const base = (convertDwg?: RunDeps["convertDwg"]): RunDeps => ({
    fetchFile: async (url) => Buffer.from(`dwg:${url.split("/").pop()}`),
    putBooklet: async () => "",
    htmlToPdf: async () => Buffer.from(""),
    house: async () => ({ html: "", pictures: 0, notes: [] }),
    buildingDwf: async () => ({ html: "", pictures: 0 }),
    ...(convertDwg ? { convertDwg } : {}),
  });

  it("converts each DWG without a DXF of its name, puts the DXF bytes in its place, and keeps the client's own DXF", async () => {
    const bytes = new Map<string, Buffer>();
    const seen: string[] = [];
    const files = [file("p/0.dwg", "dwg"), file("p/1.DWG", "dwg"), file("p/1.dxf", "dxf"), file("p/notes.pdf", "pdf")];
    const out = await convertDwgFiles(files, bytes, base(async (b) => (seen.push(b.toString()), Buffer.from(`dxf<${b}>`))), report);
    expect(seen).toEqual(["dwg:0.dwg"]);
    expect(out.map((f) => `${f.relPath}:${f.kind}`)).toEqual(["p/0.dxf:dxf", "p/1.DWG:dwg", "p/1.dxf:dxf", "p/notes.pdf:pdf"]);
    expect(bytes.get("p/0.dxf")?.toString()).toBe("dxf<dwg:0.dwg>");
  });

  it("leaves the files as they were without a converter, so the DWG stops the run as before", async () => {
    const files = [file("a.dwg", "dwg"), file("b.dwg", "dwg")];
    expect(await convertDwgFiles(files, new Map(), base(), report)).toBe(files);
  });

  it("stops with a message the client can act on when a conversion fails or the site has no key", async () => {
    const files = [file("x/0.dwg", "dwg")];
    await expect(convertDwgFiles(files, new Map(), base(async () => null), report)).rejects.toThrow("0.dwg לא הומר ל־DXF");
    const unavailable = Object.assign(new Error("no key"), { name: "DwgConversionUnavailableError" });
    await expect(convertDwgFiles(files, new Map(), base(async () => { throw unavailable; }), report)).rejects.toMatchObject({ code: "needs-conversion" });
  });

  it("runs a project of DWGs through the house route on the converted DXF", async () => {
    const calls: string[] = [];
    const d = base(async (b) => Buffer.from(`dxf<${b}>`));
    const out = await runProject(
      { jobId: "j9", projectId: "p1", kind: "public", files: [file("s/0.dwg", "dwg"), file("s/facades.dwg", "dwg")], answers, layerMaps: {}, projectName: "בית" },
      report,
      { ...d, house: async (fs) => (calls.push([...fs].map(([k, v]) => `${k}=${v}`).join(",")), { html: "<html/>", pictures: 1, notes: [] }) },
    );
    expect(out.route).toBe("house");
    expect(calls).toEqual(["0.dxf=dxf<dwg:0.dwg>,facades.dxf=dxf<dwg:facades.dwg>"]);
    expect(out.dwgConverted).toBe(2);
  });

  it("counts the conversions a run paid for even when it stops after them", async () => {
    const d = base(async (b) => Buffer.from(`dxf<${b}>`));
    // One flat from two DXFs is refused, but both DWGs were already converted.
    const run = runProject({ jobId: "j10", projectId: "p1", kind: "flat", files: [file("a.dwg", "dwg"), file("b.dwg", "dwg")], answers, layerMaps: {} }, report, d);
    const err: unknown = await run.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RunProjectError);
    expect(dwgConvertedBefore(err)).toBe(2);
    expect(dwgConvertedBefore(new Error("other"))).toBe(0);
  });
});
