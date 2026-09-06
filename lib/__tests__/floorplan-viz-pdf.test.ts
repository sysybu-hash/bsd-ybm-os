import {
  parseFloorplanLayout,
  type FloorplanLayout,
} from "@/lib/projects/floorplan-layout";
import {
  buildPlanOverviewCopy,
  buildViewCaption,
  formatFloorLabel,
  KIND_LABEL_HE,
} from "@/lib/projects/floorplan-viz-explanations";
import { buildFloorplanVizPdfHtml } from "@/lib/projects/floorplan-viz-pdf-html";

const layout: FloorplanLayout = parseFloorplanLayout({
  title: "עזריאל 63",
  unitLabel: "דירה 14",
  floor: "4",
  ceilingHeightM: 2.7,
  grossAreaM2: 103.29,
  rooms: [
    { name: "ח. מגורים", kind: "living", widthM: 4.1, lengthM: 3.2, source: "ocr_verified" },
    { name: "מטבח", kind: "kitchen", widthM: 3.2, lengthM: 2.7, source: "ocr_verified" },
    { name: 'ממ"ד', kind: "mmd", source: "ocr_verified" },
  ],
});

describe("floorplan viz PDF booklet", () => {
  it("writes a main plan explanation with area, rooms and BSD-YBM disclaimer", () => {
    const paras = buildPlanOverviewCopy(layout, "פרויקט הרצליה");
    const text = paras.join(" ");
    expect(text).toContain("103.29");
    expect(text).toContain("מטבח");
    expect(text).toContain("BSD-YBM");
    expect(text).toMatch(/גרמושקה|תוכנית/);
    expect(text).toContain("קומה 4");
    expect(text).not.toMatch(/קומה קומה/);
  });

  it("does not duplicate קומה when the floor label already includes it", () => {
    expect(formatFloorLabel("שלישית קומה")).toBe("שלישית קומה");
    expect(formatFloorLabel("4")).toBe("קומה 4");
    expect(formatFloorLabel("+9.64")).toBeNull();
    expect(formatFloorLabel("9.64+")).toBeNull();
    const paras = buildPlanOverviewCopy({ ...layout, floor: "שלישית קומה" }, "פרויקט");
    expect(paras.join(" ")).toContain("שלישית קומה");
    expect(paras.join(" ")).not.toMatch(/קומה שלישית קומה/);
  });

  it("mentions internal stairs on the booklet cover when they were decoded", () => {
    const stairLayout = parseFloorplanLayout({
      ...layout,
      internalStairs: { present: true, fromElevationM: 0, toElevationM: 1.26, insideUnit: true },
      rooms: [
        ...layout.rooms,
        { name: "מדרגות פנים", kind: "circulation", source: "inferred" },
      ],
    });
    const paras = buildPlanOverviewCopy(stairLayout);
    expect(paras.join(" ")).toMatch(/מדרגות פנים/);
    expect(paras.join(" ")).toMatch(/\+1\.26/);
    const overview = buildViewCaption({ viewId: "overview", labelHe: "כל התוכנית — מבט על" }, stairLayout);
    expect(overview).toMatch(/מדרגות פנים/);
    expect(overview.length).toBeLessThan(180);
  });

  it("omits the building elevator from the booklet room mix and formats absolute stair levels", () => {
    const duplex = parseFloorplanLayout({
      ...layout,
      internalStairs: { present: true, fromElevationM: 8.06, toElevationM: 9.64, insideUnit: true },
      rooms: [
        ...layout.rooms,
        { name: "מעלית", kind: "circulation", source: "ocr_verified" },
        { name: "מדרגות פנים", kind: "circulation", source: "inferred" },
      ],
    });
    const text = buildPlanOverviewCopy(duplex).join(" ");
    expect(text).toMatch(/מדרגות פנים/);
    expect(text).toMatch(/\+8\.06/);
    expect(text).toMatch(/\+9\.64/);
    expect(text).not.toMatch(/±8\.06/);
    expect(text).not.toMatch(/מעלית/);
  });

  it("does not print collapsed stair elevations as +9.64 → +9.64", () => {
    const collapsed = parseFloorplanLayout({
      ...layout,
      internalStairs: { present: true, fromElevationM: 9.64, toElevationM: 9.64, insideUnit: true },
      rooms: [...layout.rooms, { name: "מדרגות פנים", kind: "circulation", source: "inferred" }],
    });
    const text = buildPlanOverviewCopy(collapsed).join(" ");
    expect(text).toMatch(/מדרגות פנים/);
    expect(text).not.toMatch(/9\.64 → \+?9\.64/);
  });

  it("explains overview, isometric and a kitchen interior separately", () => {
    const overview = buildViewCaption({ viewId: "overview", labelHe: "כל התוכנית — מבט על" }, layout);
    const iso = buildViewCaption({ viewId: "isometric", labelHe: "כל התוכנית — איזומטריה" }, layout);
    const kitchen = buildViewCaption(
      { viewId: "interior", labelHe: "פנים — מטבח", roomName: "מטבח" },
      layout,
    );
    expect(overview).toMatch(/מבט על/);
    expect(overview.length).toBeLessThan(180);
    expect(iso).toMatch(/איזומטרי/);
    expect(iso.length).toBeLessThan(180);
    expect(kitchen).toContain("מטבח");
    expect(kitchen).toContain(KIND_LABEL_HE.kitchen);
    expect(kitchen).not.toBe(overview);
    expect(kitchen).not.toMatch(/צמוד ל:/);
  });

  it("builds HTML that never crops plates and brands BSD-YBM", () => {
    const html = buildFloorplanVizPdfHtml(
      layout,
      [
        {
          viewId: "overview",
          labelHe: "כל התוכנית — מבט על",
          mimeType: "image/jpeg",
          base64: "AAAA",
        },
        {
          viewId: "interior",
          labelHe: "פנים — מטבח",
          roomName: "מטבח",
          mimeType: "image/jpeg",
          base64: "BBBB",
        },
      ],
      { projectName: "פרויקט הרצליה", producedAt: new Date("2026-08-29T19:00:00Z"), locators: [
        { mimeType: "image/jpeg", base64: "LOCATORSTRIP" },
        null,
      ], styleLabelHe: "חרדי קלאסי", styleSummaryHe: "עץ כהה, שולחן שבת" },
    );
    expect(html).toContain("הופק על ידי מערכת BSD-YBM");
    expect(html).toContain("הסבר ראשי על התוכנית");
    expect(html).toContain("דירה 14");
    expect(html).toContain("חרדי קלאסי");
    expect(html).toContain("שולחן שבת");
    expect(html).toContain("object-fit: contain");
    expect(html).toContain("page-break-inside: avoid");
    expect(html).toContain("break-before: page");
    expect(html).toContain("overflow-wrap: anywhere");
    expect(html).toContain("table-layout: fixed");
    expect(html).toContain("כל התוכנית — מבט על");
    expect(html).toContain("פנים — מטבח");
    expect(html).toContain("data:image/jpeg;base64,AAAA");
    expect(html).toContain("מפת התמצאות");
    expect(html).toContain("LOCATORSTRIP");
    expect(html).toContain("padding-inline-start: 8mm");
    expect(html).not.toContain("plate-foot");
  });
});

describe("the booklet opening when the source sheet is supplied", () => {
  const images = [
    { viewId: "overview" as const, labelHe: "כל התוכנית — מבט על", mimeType: "image/jpeg", base64: "HERO" },
    { viewId: "interior" as const, labelHe: "פנים — מטבח", roomName: "מטבח", mimeType: "image/jpeg", base64: "KITCHEN" },
  ];
  const plan = { mimeType: "image/jpeg", base64: "PLANSHEET" };

  it("opens with the still, the drawing and the two side by side", () => {
    const html = buildFloorplanVizPdfHtml(layout, images, { planImage: plan });
    expect(html).toContain("1/3 · הדמיה");
    expect(html).toContain("2/3 · מקור");
    expect(html).toContain("3/3 · השוואה");
    expect(html).toContain("PLANSHEET");
  });

  it("does not print the hero still a second time as its own plate", () => {
    const html = buildFloorplanVizPdfHtml(layout, images, { planImage: plan });
    // Twice on the comparison pages (plate 1/3 and the side-by-side), no more.
    expect(html.split("base64,HERO").length - 1).toBe(2);
    expect(html).toContain("פנים — מטבח");
    expect(html).toContain("1/1 · מטבח");
  });

  it("keeps every still when there is no source sheet to compare against", () => {
    const html = buildFloorplanVizPdfHtml(layout, images, {});
    expect(html.split("base64,HERO").length - 1).toBe(1);
    expect(html).toContain("1/2 · מבט על");
    expect(html).toContain("2/2 · מטבח");
  });

  it("keeps a locator with its own plate after the hero is dropped", () => {
    const html = buildFloorplanVizPdfHtml(layout, images, {
      planImage: plan,
      locators: [{ mimeType: "image/jpeg", base64: "HEROLOCATOR" }, { mimeType: "image/jpeg", base64: "KITCHENLOCATOR" }],
    });
    expect(html).toContain("KITCHENLOCATOR");
    expect(html).not.toContain("HEROLOCATOR");
  });
});
