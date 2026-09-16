import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import type { SegmentedRoom } from "@/lib/projects/floorplan-segment";
import {
  cadMassingSafeToPhotograph,
  cadTargetAreaM2,
  printedTerraceM2,
  decideFloorplanVizRoute,
  geometryImageFromCad,
  layoutForCadBooklet,
  layoutFromCadRooms,
  cadHeroImages,
  cadImagesForBooklet,
  mergeCadPhotorealImages,
  overviewImageFromCad,
  rasterFallbackConfidence,
} from "@/lib/projects/floorplan-viz-route";
import { knownSheetTruth } from "@/e2e/fixtures/floorplan-truth";

const extent = { x: 10, y: 20, width: 400, height: 300 };

const cadRoom = (kind: SegmentedRoom["kind"], name: string): SegmentedRoom => ({
  rows: [],
  bounds: { x: 0, y: 0, width: 116, height: 174 },
  areaM2: 12.4,
  kind,
  name,
  bedCount: kind === "bedroom" ? 1 : 0,
  contents: [],
});

describe("decideFloorplanVizRoute", () => {
  it("sends a vector PDF with printed area down the CAD path", () => {
    // The app used to ignore renderFlatFromPdf and ask the model to invent
    // rooms from a wall diagram. A sales-sheet PDF that has an extent and a
    // printed area must take the geometric pipeline.
    expect(
      decideFloorplanVizRoute({
        mimeType: "application/pdf",
        photo: false,
        extent,
        grossAreaM2: 111.29,
      }),
    ).toEqual({ kind: "cad", targetAreaM2: 111.29 });
  });

  it("marks a scan as raster when the sheet has no vector extent", () => {
    // flatExtentFromSheet returns null on a scan. That is the routing
    // condition — there is no separate detector.
    expect(
      decideFloorplanVizRoute({
        mimeType: "application/pdf",
        photo: false,
        extent: null,
        grossAreaM2: 111.29,
      }),
    ).toEqual({ kind: "raster", reason: "no-extent" });
  });

  it("falls back to raster when the printed area was not read, without crashing", () => {
    // Scale lock needs a target. Missing grossAreaM2 used to be a hard stop
    // in the CLI; the upload path must keep serving the old route.
    expect(
      decideFloorplanVizRoute({
        mimeType: "application/pdf",
        photo: false,
        extent,
      }),
    ).toEqual({ kind: "raster", reason: "no-area" });
    expect(
      decideFloorplanVizRoute({
        mimeType: "application/pdf",
        photo: false,
        extent,
        grossAreaM2: 0,
      }),
    ).toEqual({ kind: "raster", reason: "no-area" });
  });

  it("does not send a photo or a JPEG down the CAD path", () => {
    expect(
      decideFloorplanVizRoute({
        mimeType: "application/pdf",
        photo: true,
        extent,
        grossAreaM2: 90,
      }),
    ).toEqual({ kind: "raster", reason: "photo" });
    expect(
      decideFloorplanVizRoute({
        mimeType: "image/jpeg",
        photo: false,
        extent,
        grossAreaM2: 90,
      }),
    ).toEqual({ kind: "raster", reason: "not-pdf" });
  });
});

describe("layoutFromCadRooms", () => {
  it("replaces OCR rooms with CAD rooms and keeps the printed area", () => {
    const extracted = parseFloorplanLayout({
      title: "דירה 14",
      unitLabel: "14",
      grossAreaM2: 111.29,
      rooms: [{ name: "סלון מומצא", kind: "living" }],
    });
    const layout = layoutFromCadRooms(extracted, [cadRoom("bedroom", "ח.שינה")], 58);
    expect(layout.grossAreaM2).toBe(111.29);
    expect(layout.unitLabel).toBe("14");
    expect(layout.rooms).toHaveLength(1);
    expect(layout.rooms[0]).toMatchObject({ name: "חדר שינה", kind: "bedroom", source: "cad" });
    expect(layout.rooms[0]!.name).not.toBe("סלון מומצא");
  });

  it("reads the unit number from the file name when the extract has none", () => {
    const extracted = parseFloorplanLayout({ grossAreaM2: 111.29, rooms: [] });
    const layout = layoutFromCadRooms(extracted, [cadRoom("bedroom", "ח.שינה")], 58, {
      sourceName: "דירה 14 .pdf",
    });
    expect(layout.unitLabel).toBe("דירה 14");
  });
});

describe("overviewImageFromCad / rasterFallbackConfidence", () => {
  it("puts photoreal in overview and keeps CAD out of the gallery", () => {
    const images = mergeCadPhotorealImages({
      photoreal: [
        {
          viewId: "overview",
          labelHe: "כל התוכנית — מבט על",
          mimeType: "image/jpeg",
          base64: "photo",
        },
        {
          viewId: "isometric",
          labelHe: "כל התוכנית — איזומטריה",
          mimeType: "image/jpeg",
          base64: "iso",
        },
      ],
      geometry: { mimeType: "image/jpeg", base64: "cad" },
    });
    expect(images[0]).toMatchObject({ viewId: "overview", base64: "photo" });
    expect(images[0]?.roomName).toBeUndefined();
    expect(images.some((img) => img.roomName === "גיאומטריה")).toBe(false);
    expect(images[1]).toMatchObject({ viewId: "isometric", base64: "iso" });
  });

  it("keeps CAD as a geometry companion only when photoreal has no overview", () => {
    const images = mergeCadPhotorealImages({
      photoreal: [
        {
          viewId: "isometric",
          labelHe: "כל התוכנית — איזומטריה",
          mimeType: "image/jpeg",
          base64: "iso",
        },
      ],
      geometry: { mimeType: "image/jpeg", base64: "cad" },
    });
    expect(images[0]).toMatchObject({
      viewId: "overview",
      roomName: "גיאומטריה",
      base64: "cad",
    });
    expect(images.some((img) => img.viewId === "overview" && !img.roomName)).toBe(false);
    expect(images[1]).toMatchObject({ viewId: "isometric", base64: "iso" });
  });

  it("pairs a living still with the CAD companion plate", () => {
    const images = cadHeroImages({
      still: { mimeType: "image/jpeg", base64: "hero" },
      geometry: { mimeType: "image/jpeg", base64: "cad" },
    });
    expect(images[0]).toMatchObject({
      viewId: "overview",
      labelHe: "כל התוכנית — מבט על",
      base64: "hero",
    });
    expect(images[0]?.roomName).toBeUndefined();
    expect(images[1]).toMatchObject({
      viewId: "overview",
      roomName: "גיאומטריה",
      base64: "cad",
    });
  });

  it("keeps a geometry-only companion when there is no living still yet", () => {
    const images = cadImagesForBooklet({ mimeType: "image/jpeg", base64: "cad" });
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      viewId: "overview",
      roomName: "גיאומטריה",
      labelHe: "גיאומטריה מהתוכנית",
    });
    expect(images.some((img) => img.viewId === "overview" && !img.roomName)).toBe(false);
  });

  it("wraps the CAD still as a single overview frame", () => {
    const image = overviewImageFromCad({ mimeType: "image/jpeg", base64: "abc" });
    expect(image).toEqual({
      viewId: "overview",
      labelHe: "כל התוכנית — מבט על",
      mimeType: "image/jpeg",
      base64: "abc",
    });
  });

  it("keeps the CAD plate as a second overview so it does not collide", () => {
    const image = geometryImageFromCad({ mimeType: "image/jpeg", base64: "cad" });
    expect(image).toEqual({
      viewId: "overview",
      roomName: "גיאומטריה",
      labelHe: "גיאומטריה מהתוכנית",
      mimeType: "image/jpeg",
      base64: "cad",
    });
  });

  it("uses the printed extract when CAD merged habitable rooms", () => {
    const extracted = parseFloorplanLayout({
      grossAreaM2: 111.29,
      rooms: [
        { name: "סלון", kind: "living", areaM2: 18 },
        { name: "מטבח", kind: "kitchen", areaM2: 10 },
        { name: "חדר שינה 1", kind: "bedroom", areaM2: 12 },
        { name: "חדר שינה 2", kind: "bedroom", areaM2: 11 },
        { name: "חדר שינה 3", kind: "bedroom", areaM2: 10 },
        { name: "חדר שינה 4", kind: "bedroom", areaM2: 9 },
      ],
    });
    const cad = parseFloorplanLayout({
      title: "דירה 14",
      unitLabel: "14",
      grossAreaM2: 111.29,
      rooms: [
        { name: "ח.רחצה 1", kind: "bathroom", areaM2: 35, source: "cad" },
        { name: "ח.שינה 1", kind: "bedroom", areaM2: 9, source: "cad" },
      ],
    });
    const booklet = layoutForCadBooklet(extracted, cad);
    expect(booklet.unitLabel).toBe("14");
    expect(booklet.grossAreaM2).toBe(111.29);
    expect(booklet.rooms.some((room) => room.kind === "living")).toBe(true);
    expect(booklet.rooms.filter((room) => room.kind === "bedroom")).toHaveLength(4);
    const bed1 = booklet.rooms.find((room) => room.kind === "bedroom");
    expect(bed1?.areaM2).toBe(9);
    expect(bed1?.source).toBe("cad");
  });

  it("uses the printed program's area when the extract has no gross", () => {
    const lean = parseFloorplanLayout({ unitLabel: "דירה 15", rooms: [] });
    expect(cadTargetAreaM2(lean, { truth: knownSheetTruth("דירה 15") })).toBeCloseTo(
      114.11 + 4.1 + 6.44 + 3.16,
      2,
    );
    // A unit number is not an area: without a program there is nothing to lock.
    expect(cadTargetAreaM2(lean)).toBeUndefined();
  });

  it("reads terrace figures off the sheet when the extract has no balconies", () => {
    expect(printedTerraceM2([{ value: 4.1 }, { value: 6.4 }, { value: 3.16 }, { value: 111.29 }], 111.29)).toBeCloseTo(
      13.66,
      2,
    );
    const lean = parseFloorplanLayout({ grossAreaM2: 111.29, rooms: [] });
    expect(cadTargetAreaM2(lean, { printedTerraceM2: 13.66 })).toBeCloseTo(124.95, 2);
  });

  it("adds same-level terrace area to the CAD scale target", () => {
    const layout = parseFloorplanLayout({
      grossAreaM2: 111.29,
      rooms: [
        { name: "מרפסת 1", kind: "balcony", areaM2: 4.1 },
        { name: "מרפסת 2", kind: "balcony", areaM2: 6.4 },
        { name: "מרפסת 3", kind: "balcony", areaM2: 3.16 },
        { name: "חדר שינה", kind: "bedroom", areaM2: 12 },
      ],
    });
    expect(cadTargetAreaM2(layout)).toBeCloseTo(124.95, 2);
  });

  it("does not lock scale to a roof terrace printed on the same sheet", () => {
    const lean = parseFloorplanLayout({ unitLabel: "דירה 18", rooms: [] });
    expect(
      cadTargetAreaM2(lean, { printedTerraceM2: 5.2, truth: knownSheetTruth("דירה 18", 59.01) }),
    ).toBeCloseTo(59.01 + 4.6 + 8, 2);
  });

  it("will not photograph CAD massing that dropped the bath or grew a roof stair as a terrace", () => {
    const broken = parseFloorplanLayout({
      unitLabel: "דירה 18",
      grossAreaM2: 59.01,
      rooms: [
        { name: "מגורים", kind: "living" },
        { name: "מטבח", kind: "kitchen" },
        { name: "חדר שינה 1", kind: "bedroom" },
        { name: "חדר שינה 2", kind: "bedroom" },
        { name: "מרפסת", kind: "balcony", areaM2: 5.2 },
      ],
    });
    const truth = knownSheetTruth("דירה 18", 59.01);
    expect(cadMassingSafeToPhotograph(broken, truth)).toBe(false);
    expect(cadMassingSafeToPhotograph(broken)).toBe(true);
    const matching = parseFloorplanLayout({
      unitLabel: "דירה 18",
      grossAreaM2: 59.01,
      rooms: [
        { name: "מגורים", kind: "living" },
        { name: "מטבח", kind: "kitchen" },
        { name: "חדר שינה 1", kind: "bedroom" },
        { name: "חדר שינה 2", kind: "bedroom" },
        { name: "חדר רחצה", kind: "bathroom" },
        { name: "מרפסת 1", kind: "balcony", areaM2: 4.6 },
        { name: "מרפסת 2", kind: "balcony", areaM2: 8 },
      ],
    });
    expect(cadMassingSafeToPhotograph(matching, truth)).toBe(true);
  });

  it("labels a raster fallback so a scan is not sold as CAD", () => {
    const report = rasterFallbackConfidence();
    expect(report.tier).toBe("raster");
    expect(report.ok).toBe(true);
    expect(report.soft.join(" ")).toMatch(/אינה CAD/);
  });
});
