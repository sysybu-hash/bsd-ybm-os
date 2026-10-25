import {
  countDwellingLabels,
  DXF_PAGE_UNITS_PER_METRE,
  dxfReportLines,
  geometryFromDxf,
  isWallLayer,
  looksLikeDwg,
  looksLikeDxf,
  metresPerUnit,
  planGeometriesFromDxf,
  renderDxfPageJpeg,
} from "@/lib/projects/floorplan-dxf";

/** A DXF as its group codes: a header with $INSUNITS, then the entities given as code/value pairs. */
function dxf(units: number | null, ...entities: Array<Array<string | number>>): string {
  const header = units == null ? [] : ["9", "$INSUNITS", "70", String(units)];
  return [
    "0", "SECTION", "2", "HEADER", ...header, "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    ...entities.flatMap((e) => e.map(String)),
    "0", "ENDSEC", "0", "EOF",
  ].join("\n");
}

const line = (layer: string, x1: number, y1: number, x2: number, y2: number) =>
  ["0", "LINE", "8", layer, "10", x1, "20", y1, "11", x2, "21", y2];
const text = (layer: string, value: string, x = 1, y = 1) =>
  ["0", "TEXT", "8", layer, "10", x, "20", y, "40", 0.2, "1", value];
const rect = (layer: string, x0: number, y0: number, x1: number, y1: number) =>
  ["0", "LWPOLYLINE", "8", layer, "90", 4, "70", 1, "10", x0, "20", y0, "10", x1, "20", y0, "10", x1, "20", y1, "10", x0, "20", y1];
/** A door: its swing, a quarter arc about the hinge, and its leaf, a line from the hinge to the arc's end. */
const door = (layer: string, cx: number, cy: number, r: number) => [
  "0", "ARC", "8", layer, "10", cx, "20", cy, "40", r, "50", 0, "51", 90,
  ...line(layer, cx, cy, cx, cy + r),
];

/** A 4m x 3m room drawn on a wall layer, with a basin on a fixtures layer. */
const room = dxf(
  6,
  rect("A-WALL", 0, 0, 4, 3),
  ["0", "CIRCLE", "8", "A-FIXTURES", "10", 3.5, "20", 2.5, "40", 0.25],
  line("NOTES", 0, -0.5, 4, -0.5),
  ["0", "DIMENSION", "8", "DIMENSIONS", "10", 0, "20", -1, "11", 2, "21", -1, "1", "4.00"],
);

describe("dxf geometry", () => {
  it("renders vector geometry and source labels into a JPEG reference", async () => {
    const source = dxf(
      6,
      line("A-WALL", 0, 0, 4, 0),
      line("A-WALL", 4, 0, 4, 3),
      line("A-WALL", 4, 3, 0, 3),
      line("A-WALL", 0, 3, 0, 0),
      text("ROOM-NAMES", "חדר שינה", 1, 1.5),
    );
    const geometry = await geometryFromDxf(source);
    expect(geometry).not.toBeNull();
    expect(geometry!.labels?.[0]?.text).toBe("חדר שינה");
    const jpeg = await renderDxfPageJpeg(geometry!, 400);
    expect(jpeg?.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  it("refuses to rasterise a page it cannot size", async () => {
    const page = { segments: [], walls: [], curves: [], pageWidth: 400, pageHeight: 300 };
    expect(await renderDxfPageJpeg({ ...page, pageWidth: 0 }, 400)).toBeNull();
    expect(await renderDxfPageJpeg({ ...page, pageWidth: Number.NaN }, 400)).toBeNull();
    expect(await renderDxfPageJpeg(page, 10)).toBeNull();
    // A sheet this tall would not fit the raster budget.
    expect(await renderDxfPageJpeg({ ...page, pageHeight: 30_000 }, 400)).toBeNull();
    // Nothing drawn on it.
    expect(await renderDxfPageJpeg(page, 400)).toBeNull();
  });

  it("reads walls and fixtures into the pipeline's own shape, and dimensions as dimensions", async () => {
    const geometry = (await geometryFromDxf(room))!;
    expect(geometry).not.toBeNull();
    // Four closing sides plus the note's line; the circle is curves, never a wall.
    expect(geometry.segments).toHaveLength(5);
    expect(geometry.curves.length).toBeGreaterThan(4);
    expect(geometry.walls).toHaveLength(4);
    expect(geometry.segments.filter((s) => s.lineWidth === 1)).toHaveLength(1);
    // A metre is a metre of the 1:50 page every threshold downstream was tuned at.
    expect(geometry.unitsPerMetre).toBeCloseTo(DXF_PAGE_UNITS_PER_METRE, 6);
    // The dimension is not drawn as lines, and the report says so.
    expect(geometry.cad?.skipped.dimensions).toBe(1);
    expect(isWallLayer("A-WALL")).toBe(true);
    expect(isWallLayer("קירות פנים")).toBe(true);
    expect(isWallLayer("A-DOOR")).toBe(false);
    expect(isWallLayer(undefined)).toBe(false);
  });

  it("flips the y axis, because DXF counts up and the viewport counts down", async () => {
    const geometry = (await geometryFromDxf(dxf(6, line("A-WALL", 0, 0, 0, 3), line("A-WALL", 0, 0, 4, 0))))!;
    const wall = geometry.segments.find((s) => s.x1 === s.x2)!;
    const k = DXF_PAGE_UNITS_PER_METRE;
    // The DXF's y=3 is the top of the drawing, which is the page's top less its margin.
    expect(wall.y1 - wall.y2).toBeCloseTo(3 * k, 5);
  });

  it("reads the drawing's units, and admits when it cannot", async () => {
    expect(metresPerUnit({ $INSUNITS: 6 })).toBe(1);
    expect(metresPerUnit({ $INSUNITS: 4 })).toBe(0.001);
    expect(metresPerUnit({ $INSUNITS: 5 })).toBe(0.01);
    expect(metresPerUnit({ $INSUNITS: 0 })).toBeUndefined();
    expect(metresPerUnit(undefined)).toBeUndefined();
    const millimetres = await geometryFromDxf(dxf(4, line("A-WALL", 0, 0, 4000, 0), line("A-WALL", 0, 0, 0, 3000)));
    expect(millimetres?.cad?.unitsM).toBe(0.001);
    // Too little wall to be a plan of its own: the page is the drawing, 4 m wide.
    expect(millimetres?.pageWidth).toBeCloseTo(4 * DXF_PAGE_UNITS_PER_METRE, 3);
    const unknown = await geometryFromDxf(dxf(null, line("A-WALL", 0, 0, 400, 0), line("A-WALL", 0, 0, 0, 300)));
    expect(unknown?.unitsPerMetre).toBeUndefined();
  });

  it("believes the doors over a header that names the wrong unit", async () => {
    // Pisga's header says millimetres and it draws in centimetres: a door's
    // leaf of 90 units is 9 cm in millimetres, and 90 cm in centimetres.
    const source = dxf(
      4,
      rect("קיר בטון", 0, 0, 800, 20),
      rect("קיר בטון", 0, 580, 800, 600),
      rect("קיר בטון", 0, 0, 20, 600),
      rect("קיר בטון", 780, 0, 800, 600),
      door("דלתות", 100, 20, 90),
      door("דלתות", 300, 20, 90),
      door("דלתות", 500, 20, 80),
    );
    const geometry = (await geometryFromDxf(source))!;
    expect(geometry.cad?.unitsM).toBe(0.01);
    expect(geometry.cad?.unitsFrom).toBe("doors");
    expect(geometry.cad?.plans[0]?.doors).toBe(3);
    expect(dxfReportLines(geometry.cad!)[0]).toContain("ס״מ");
  });

  it("reads the walls a block draws, where it is inserted", async () => {
    const source = [
      "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "6", "0", "ENDSEC",
      "0", "SECTION", "2", "BLOCKS",
      "0", "BLOCK", "2", "CORE", "10", "0", "20", "0",
      ...line("A-WALL", 0, 0, 4, 0).map(String),
      ...line("A-WALL", 0, 0, 0, 3).map(String),
      "0", "ENDBLK",
      "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES",
      "0", "INSERT", "8", "0", "2", "CORE", "10", "10", "20", "5",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");
    const geometry = (await geometryFromDxf(source))!;
    expect(geometry.walls).toHaveLength(2);
  });

  it("puts each plan of a sheet row on its own page", () => {
    const plan = (x: number) => [
      rect("A-WALL", x, 0, x + 10, 0.2),
      rect("A-WALL", x, 7.8, x + 10, 8),
      rect("A-WALL", x, 0, x + 0.2, 8),
      rect("A-WALL", x + 9.8, 0, x + 10, 8),
      door("A-DOOR", x + 2, 0.2, 0.9),
      door("A-DOOR", x + 5, 0.2, 0.9),
    ];
    const pages = planGeometriesFromDxf(dxf(6, ...plan(0), ...plan(100), ...plan(200)));
    expect(pages).toHaveLength(3);
    for (const page of pages) expect(page.pageWidth / page.unitsPerMetre!).toBeCloseTo(14, 3);
    expect(pages[0]!.cad?.plans).toHaveLength(3);
  });

  it("tells a flat's drawing from a shop floor by the words printed on it", async () => {
    // A flat keeps the bedroom and bathroom checks; only a floor that names no
    // dwelling is measured as an open plan.
    const walls = [line("A-WALL", 0, 0, 4000, 0), line("A-WALL", 0, 0, 0, 3000)];
    const flat = await geometryFromDxf(
      dxf(4, ...walls, text("TEXT", "חדר שינה"), ["0", "MTEXT", "8", "TEXT", "10", 1, "20", 1, "40", 0.2, "1", "{\\fArial|b0;ממ\"ד}"]),
    );
    expect(flat?.dwellingLabels).toBe(2);
    const shop = await geometryFromDxf(dxf(4, ...walls, text("TEXT", "חנות 3"), text("TEXT", "שירותים"), text("TEXT", "מדרגות")));
    expect(shop?.dwellingLabels).toBe(0);
    expect(countDwellingLabels([{ text: "דירה 14" }, {}])).toBe(1);
  });

  it("returns nothing for a drawing with no geometry in it", async () => {
    expect(await geometryFromDxf(dxf(6))).toBeNull();
    expect(await geometryFromDxf(dxf(6, text("NOTES", "הערה")))).toBeNull();
    expect(await geometryFromDxf("not a drawing")).toBeNull();
  });

  it("tells a DXF from a DWG by its first bytes", () => {
    expect(looksLikeDxf(Buffer.from("0\nSECTION\n  2\nHEADER\n", "latin1"))).toBe(true);
    expect(looksLikeDxf(Buffer.from("AC1027\u0000\u0000", "latin1"))).toBe(false);
    expect(looksLikeDwg(Buffer.from("AC1027\u0000\u0000", "latin1"))).toBe(true);
    expect(looksLikeDwg(Buffer.from("%PDF-1.7", "latin1"))).toBe(false);
  });
});
