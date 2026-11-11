import { readDxfDrawing } from "@/lib/projects/dxf-drawing";
import { decodeLayerName, previewRescan, suggestLayers } from "@/lib/vmb/rescan";
import { scanDxf } from "@/lib/vmb/scan";

const rec = (...pairs: Array<[number, string | number]>) => pairs.map(([c, v]) => `${c}\n${v}`).join("\n");
const line = (layer: string, x: number) => rec([0, "LINE"], [8, layer], [10, x], [20, 0], [11, x + 100], [21, 0]);
const text = (layer: string, x: number) => rec([0, "TEXT"], [8, layer], [10, x], [20, 50], [40, 10], [1, "note"]);
const layer = (name: string, aci: number) => rec([0, "LAYER"], [2, name], [70, 0], [62, aci]);

/** A sheet whose missed parts each need a different second-round reader. A DXF from 2007 on is UTF-8, so odd names survive as written. */
function sample(): string {
  const body = [
    line("A-WALL", 0),
    line("A-DOOR", 100),
    line("A-DOOR", 200),
    line("00-WL", 300),
    line("ehr", 400),
    line("÷éø", 500),
    text("NOTES-X", 0),
    text("NOTES-X", 100),
    text("NOTES-X", 200),
    line("MYSTERY", 600),
    rec([0, "INSERT"], [8, "A-WALL"], [2, "L1"], [10, 0], [20, 0]),
  ];
  // Ten blocks, each holding the next; the wall line sits in the innermost, past the reader's eight levels.
  const blocks = Array.from({ length: 10 }, (_, i) =>
    rec([0, "BLOCK"], [2, `L${i + 1}`], [10, 0], [20, 0]),
  ).map((head, i) => [head, i < 9 ? rec([0, "INSERT"], [8, "0"], [2, `L${i + 2}`], [10, 0], [20, 0]) : line("0", 0), rec([0, "ENDBLK"])].join("\n"));
  return [
    rec([0, "SECTION"], [2, "HEADER"], [9, "$ACADVER"], [1, "AC1027"], [9, "$INSUNITS"], [70, 4]),
    rec([0, "ENDSEC"]),
    rec([0, "SECTION"], [2, "TABLES"]),
    layer("A-WALL", 7),
    // Off in the file: a negative colour.
    layer("A-DOOR", -2),
    layer("00-WL", 1),
    layer("ehr", 1),
    layer("÷éø", 1),
    layer("NOTES-X", 3),
    layer("MYSTERY", 3),
    rec([0, "ENDSEC"]),
    rec([0, "SECTION"], [2, "BLOCKS"]),
    ...blocks,
    rec([0, "ENDSEC"]),
    rec([0, "SECTION"], [2, "ENTITIES"]),
    ...body,
    rec([0, "ENDSEC"]),
    rec([0, "EOF"]),
  ].join("\n");
}

describe("decodeLayerName", () => {
  it("reads DOS Hebrew that came through as cp1252 or raw C1, and Windows Hebrew that came through as Latin-1", () => {
    expect(decodeLayerName("—\u0089˜")).toBe("קיר");
    expect(decodeLayerName("÷éø")).toBe("קיר");
    expect(decodeLayerName("A-WALL")).toBeNull();
  });
});

describe("the second scan", () => {
  const drawing = readDxfDrawing(sample())!;

  it("matches each missed layer by its own reader, and leaves the unknowable one alone", () => {
    const s = suggestLayers(drawing);
    const by = Object.fromEntries(s.map((x) => [x.layer, x]));
    expect(by["A-DOOR"]).toMatchObject({ kind: "door", via: "hidden_layer", pieces: 2 });
    expect(by["00-WL"]).toMatchObject({ kind: "wall-ext", via: "other_office" });
    expect(by["ehr"]).toMatchObject({ kind: "wall-int", via: "typed_hebrew", readsAs: "קיר" });
    expect(by["÷éø"]).toMatchObject({ kind: "wall-int", via: "decoded_name", readsAs: "קיר" });
    expect(by["NOTES-X"]).toMatchObject({ kind: "text", via: "content", pieces: 3 });
    expect(by["MYSTERY"]).toBeUndefined();
    expect(by["A-WALL"]).toBeUndefined();
  });

  it("previews the gain: deeper blocks found on their own, the rest only once approved", () => {
    const p = previewRescan(drawing);
    expect(p.deeper).toBeGreaterThan(0);
    expect(p.after.entities.read).toBeGreaterThan(p.before.entities.read + p.deeper);
    // Each approved layer counts as read, the off one included.
    expect(p.after.layers.read).toBe(p.before.layers.read + p.suggestions.length);
  });

  it("reads exactly what was approved", () => {
    const first = scanDxf(sample())!;
    const second = scanDxf(sample(), { layerMap: { "A-DOOR": "door" }, maxDepth: 16 })!;
    expect(second.unread.find((u) => u.reason === "off_layer")).toBeUndefined();
    expect(second.unread.some((u) => u.name === "00-WL")).toBe(true);
    expect(second.counts.entities.read).toBeGreaterThan(first.counts.entities.read);
  });
});
