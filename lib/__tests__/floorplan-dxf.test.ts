import {
  geometryFromDxfDocument,
  isWallLayer,
  looksLikeDwg,
  looksLikeDxf,
  metresPerUnit,
  geometryFromDxf,
  renderDxfPageJpeg,
} from "@/lib/projects/floorplan-dxf";

/** A 4m x 3m room drawn on a wall layer, with a basin on a fixtures layer. */
const room = {
  header: { $INSUNITS: 6 },
  entities: [
    { type: "LWPOLYLINE", layer: "A-WALL", shape: true, vertices: [
      { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 },
    ] },
    { type: "CIRCLE", layer: "A-FIXTURES", center: { x: 3.5, y: 2.5 }, radius: 0.25 },
    { type: "LINE", layer: "DIMENSIONS", vertices: [{ x: 0, y: -0.5 }, { x: 4, y: -0.5 }] },
  ],
};

describe("dxf geometry", () => {
  it("renders vector geometry and source labels into a JPEG reference", async () => {
    const dxf = [
      "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "6", "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES",
      "0", "LINE", "8", "A-WALL", "10", "0", "20", "0", "11", "4", "21", "0",
      "0", "LINE", "8", "A-WALL", "10", "4", "20", "0", "11", "4", "21", "3",
      "0", "LINE", "8", "A-WALL", "10", "4", "20", "3", "11", "0", "21", "3",
      "0", "LINE", "8", "A-WALL", "10", "0", "20", "3", "11", "0", "21", "0",
      "0", "TEXT", "8", "ROOM-NAMES", "10", "1", "20", "1.5", "40", "0.2", "1", "חדר שינה",
      "0", "ENDSEC", "0", "EOF",
    ].join("\n");
    const geometry = await geometryFromDxf(dxf);
    expect(geometry).not.toBeNull();
    const jpeg = await renderDxfPageJpeg(geometry!, dxf, 400);
    expect(jpeg?.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  });

  it("refuses to rasterise a page it cannot size", async () => {
    const dxf = ["0", "SECTION", "2", "ENTITIES", "0", "ENDSEC", "0", "EOF"].join("\n");
    const page = { segments: [], curves: [], pageWidth: 400, pageHeight: 300 };
    const geometry = page as unknown as Parameters<typeof renderDxfPageJpeg>[0];
    expect(await renderDxfPageJpeg({ ...geometry, pageWidth: 0 }, dxf, 400)).toBeNull();
    expect(await renderDxfPageJpeg({ ...geometry, pageWidth: Number.NaN }, dxf, 400)).toBeNull();
    expect(await renderDxfPageJpeg(geometry, dxf, 10)).toBeNull();
    // A sheet this tall would not fit the raster budget.
    expect(await renderDxfPageJpeg({ ...geometry, pageHeight: 30_000 }, dxf, 400)).toBeNull();
    // Nothing drawn on it.
    expect(await renderDxfPageJpeg(geometry, dxf, 400)).toBeNull();
  });

  it("reads walls, fixtures and dimensions into the pipeline's own shape", () => {
    const geometry = geometryFromDxfDocument(room);
    expect(geometry).not.toBeNull();
    // Four closing sides plus the dimension line; the circle is four chords.
    expect(geometry!.segments).toHaveLength(5);
    expect(geometry!.curves).toHaveLength(4);
    // The page is the drawing's own extent, and the dimension line below the
    // room is part of it: 3m of room plus the 0.5m the chain sits out by.
    expect(geometry!.pageWidth).toBeCloseTo(4, 5);
    expect(geometry!.pageHeight).toBeCloseTo(3.5, 5);
  });

  it("marks only the wall layer thick enough for the wall detector", () => {
    const geometry = geometryFromDxfDocument(room)!;
    // Walls are the four sides of the room; the dimension line is not one.
    expect(geometry.walls).toHaveLength(4);
    expect(geometry.segments.filter((s) => s.lineWidth === 1)).toHaveLength(1);
    expect(isWallLayer("A-WALL")).toBe(true);
    expect(isWallLayer("קירות פנים")).toBe(true);
    expect(isWallLayer("A-DOOR")).toBe(false);
    expect(isWallLayer(undefined)).toBe(false);
  });

  it("flips the y axis, because DXF counts up and the viewport counts down", () => {
    const geometry = geometryFromDxfDocument({
      entities: [
        { type: "LINE", layer: "A-WALL", vertices: [{ x: 0, y: 0 }, { x: 0, y: 3 }] },
        // A drawing needs extent in both axes; one line on its own is not a plan.
        { type: "LINE", layer: "A-WALL", vertices: [{ x: 0, y: 0 }, { x: 4, y: 0 }] },
      ],
    })!;
    const [wall] = geometry.segments;
    // The DXF's y=3 is the top of the drawing, which is y=0 in the viewport.
    expect(wall!.y1).toBeCloseTo(3, 5);
    expect(wall!.y2).toBeCloseTo(0, 5);
  });

  it("reads the drawing's units, and admits when it cannot", () => {
    expect(metresPerUnit({ $INSUNITS: 6 })).toBe(1);
    expect(metresPerUnit({ $INSUNITS: 4 })).toBe(0.001);
    expect(metresPerUnit({ $INSUNITS: 5 })).toBe(0.01);
    expect(metresPerUnit({ $INSUNITS: 0 })).toBeUndefined();
    expect(metresPerUnit(undefined)).toBeUndefined();
  });

  it("returns nothing for a drawing with no geometry in it", () => {
    expect(geometryFromDxfDocument({ entities: [] })).toBeNull();
    expect(geometryFromDxfDocument({ entities: [{ type: "TEXT", layer: "NOTES" }] })).toBeNull();
  });

  it("tells a DXF from a DWG by its first bytes", () => {
    expect(looksLikeDxf(Buffer.from("0\nSECTION\n  2\nHEADER\n", "latin1"))).toBe(true);
    expect(looksLikeDxf(Buffer.from("AC1027\u0000\u0000", "latin1"))).toBe(false);
    expect(looksLikeDwg(Buffer.from("AC1027\u0000\u0000", "latin1"))).toBe(true);
    expect(looksLikeDwg(Buffer.from("%PDF-1.7", "latin1"))).toBe(false);
  });
});
