import { readShare, scanDxf } from "@/lib/vmb/scan";

const rec = (...pairs: Array<[number, string | number]>) => pairs.map(([c, v]) => `${c}\n${v}`).join("\n");
const line = (layer: string, x: number) => rec([0, "LINE"], [8, layer], [10, x], [20, 0], [11, x + 100], [21, 0]);

/** Walls and doors a reader takes, a layer no reader knows, a layer switched off, and one entity type the reader does not draw. */
function sample(): string {
  return [
    rec([0, "SECTION"], [2, "HEADER"], [9, "$ACADVER"], [1, "AC1015"], [9, "$INSUNITS"], [70, 4]),
    rec([0, "ENDSEC"]),
    rec([0, "SECTION"], [2, "TABLES"]),
    rec([0, "LAYER"], [2, "A-WALL"], [70, 0], [62, 7]),
    rec([0, "LAYER"], [2, "A-DOOR"], [70, 0], [62, 2]),
    rec([0, "LAYER"], [2, "XREF-JUNK"], [70, 0], [62, 3]),
    // A negative colour is how DXF marks a layer off.
    rec([0, "LAYER"], [2, "HIDDEN-NOTES"], [70, 0], [62, -4]),
    rec([0, "ENDSEC"]),
    rec([0, "SECTION"], [2, "BLOCKS"]),
    rec([0, "BLOCK"], [2, "MYSTERY"], [10, 0], [20, 0]),
    rec([0, "LINE"], [8, "0"], [10, 0], [20, 0], [11, 5], [21, 5]),
    rec([0, "ENDBLK"]),
    rec([0, "ENDSEC"]),
    rec([0, "SECTION"], [2, "ENTITIES"]),
    line("A-WALL", 0),
    line("A-WALL", 200),
    line("A-WALL", 400),
    line("A-DOOR", 600),
    line("XREF-JUNK", 800),
    line("XREF-JUNK", 900),
    line("HIDDEN-NOTES", 1000),
    rec([0, "INSERT"], [8, "XREF-JUNK"], [2, "MYSTERY"], [10, 50], [20, 50]),
    rec([0, "3DSOLID"], [8, "A-WALL"]),
    rec([0, "ENDSEC"]),
    rec([0, "EOF"]),
  ].join("\n");
}

describe("scanDxf", () => {
  const r = scanDxf(sample())!;

  it("opens the sheet", () => {
    expect(r).not.toBeNull();
    expect(r.profile).toBe("generic");
  });

  it("counts what the readers take against what is there", () => {
    expect(r.counts.layers.read).toBe(2);
    // A-WALL, A-DOOR, XREF-JUNK, the block's layer 0, and the off layer the flattener never emits.
    expect(r.counts.layers.total).toBeGreaterThanOrEqual(4);
    expect(r.counts.entities.read).toBe(4);
    expect(r.counts.entities.total).toBeGreaterThan(r.counts.entities.read);
    expect(r.counts.blocks).toEqual({ read: 0, total: 1 });
  });

  it("lists every left-out thing with its reason", () => {
    const junk = r.unread.find((u) => u.name === "XREF-JUNK");
    // Its two lines, the block reference, and the block's own line (layer 0 inside a block takes the reference's layer).
    expect(junk).toMatchObject({ reason: "no_reader", count: 4 });
    expect(junk?.holds).toMatchObject({ lines: 3, blocks: 1 });
    expect(r.unread.some((u) => u.reason === "off_layer" && u.name === "HIDDEN-NOTES" && u.count === 1)).toBe(true);
    expect(r.unread.some((u) => u.reason === "unsupported" && u.name === "3DSOLID")).toBe(true);
    // Biggest first.
    expect(r.unread.map((u) => u.count)).toEqual([...r.unread.map((u) => u.count)].sort((a, b) => b - a));
  });

  it("gives the read share", () => {
    expect(readShare(r.counts)).toBeCloseTo(r.counts.entities.read / r.counts.entities.total);
    expect(readShare({ layers: { read: 0, total: 0 }, blocks: { read: 0, total: 0 }, entities: { read: 0, total: 0 }, hatches: { read: 0, total: 0 } })).toBeNull();
  });

  it("returns null for bytes that are not a DXF", () => {
    expect(scanDxf("not a drawing")).toBeNull();
  });
});
