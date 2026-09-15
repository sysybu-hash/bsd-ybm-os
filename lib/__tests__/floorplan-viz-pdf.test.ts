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
import { enrichLayoutForBooklet } from "@/lib/projects/floorplan-booklet-rooms";
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
    expect(text).toContain("דירה 14");
    expect(text).toContain("עזריאל 63");
    expect(text).toContain("מטבח");
    expect(text).toMatch(/תוכנית המכר/);
    expect(text).toContain("קומה 4");
    expect(text).not.toMatch(/קומה קומה/);
    expect(text).not.toMatch(/CAD|OCR|פענוח|ניחוש/);
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
    expect(paras.join(" ")).toMatch(/דופלקס/);
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
    expect(text).toMatch(/דופלקס/);
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
    expect(html).toContain("על הדירה");
    expect(html).toContain("חללי הדירה");
    expect(html).toContain("rooms-table-wrap");
    expect(html).toContain("דירה 14");
    expect(html).toMatch(/<h1>דירה 14<\/h1>/);
    expect(html).not.toMatch(/<h1>עזריאל 63<\/h1>/);
    expect(html).toContain("חרדי קלאסי");
    expect(html).toContain("שולחן שבת");
    expect(html).toContain("object-fit: contain");
    expect(html).toContain("page-break-inside: avoid");
    expect(html).toContain("break-before: page");
    expect(html).toContain("overflow-wrap: anywhere");
    expect(html).not.toContain("unicode-bidi: isolate");
    expect(html).not.toContain("word-break: break-word");
    expect(html).toContain("table-layout: fixed");
    expect(html).toContain("כל התוכנית — מבט על");
    expect(html).toContain("פנים — מטבח");
    expect(html).toContain("data:image/jpeg;base64,AAAA");
    expect(html).toContain("מפת התמצאות");
    expect(html).toContain("LOCATORSTRIP");
    expect(html).toContain("height: 1123px");
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
    expect(html).toContain("1/4 · שער");
    expect(html).toContain("2/4 · הדמיה");
    expect(html).toContain("3/4 · תוכנית");
    expect(html).toContain("4/4 · השוואה");
    expect(html).toContain("PLANSHEET");
  });

  it("presents the visualization as a signed gallery plate", () => {
    const html = buildFloorplanVizPdfHtml(layout, images, { planImage: plan });
    expect(html).toContain("plate-master");
    expect(html).toContain("ornament-frame");
    expect(html).toContain("gallery-plaque");
    expect(html).toContain("הופק ע״י מערכת BSD-YBM");
    expect(html).toContain("שטח ברוטו");
    expect(html).toContain("103.29");
    expect((html.match(/class="gallery-plaque/g) ?? []).length).toBe(3);
    expect(html).toContain("plate-compare");
    expect(html).toContain("flex: 1 1 0%");
    expect(html).toContain("object-fit: contain");
    expect(html).toContain("https://www.bsd-ybm.co.il");
    expect((html.match(/class="brand-link"/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("can show a padded compare drawing while page 3 keeps the submitted sheet", () => {
    const html = buildFloorplanVizPdfHtml(layout, images, {
      planImage: plan,
      comparePlanImage: { mimeType: "image/jpeg", base64: "CROPPEDPLAN" },
    });
    expect(html).toContain("PLANSHEET");
    expect(html).toContain("CROPPEDPLAN");
    expect((html.match(/PLANSHEET/g) ?? []).length).toBe(1);
    expect((html.match(/CROPPEDPLAN/g) ?? []).length).toBe(1);
  });

  it("keeps the tight hero on page 2 and the paired still on page 4", () => {
    const html = buildFloorplanVizPdfHtml(layout, images, {
      planImage: plan,
      comparePlanImage: { mimeType: "image/jpeg", base64: "CROPPEDPLAN" },
      compareHeroImage: { mimeType: "image/jpeg", base64: "PAIREDSTILL" },
    });
    expect(html.split("base64,HERO").length - 1).toBe(1);
    expect(html).toContain("PAIREDSTILL");
    expect(html).toContain("CROPPEDPLAN");
  });

  it("does not print the hero still a second time as its own plate", () => {
    const html = buildFloorplanVizPdfHtml(layout, images, { planImage: plan });
    // Twice on the comparison pages (plate 2/4 and the side-by-side), no more.
    expect(html.split("base64,HERO").length - 1).toBe(2);
    expect(html).not.toContain("base64,KITCHEN");
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
      includeAllPlates: true,
      locators: [{ mimeType: "image/jpeg", base64: "HEROLOCATOR" }, { mimeType: "image/jpeg", base64: "KITCHENLOCATOR" }],
    });
    expect(html).toContain("KITCHENLOCATOR");
    expect(html).not.toContain("HEROLOCATOR");
  });

  it("fills the cover table from CAD rooms instead of leaving it blank", () => {
    const cad = parseFloorplanLayout({
      unitLabel: "14",
      grossAreaM2: 111.29,
      rooms: [
        { name: "מטבח", kind: "kitchen", areaM2: 33.9, source: "cad" },
        { name: "חדר שינה 1", kind: "bedroom", areaM2: 8.4, source: "cad" },
        { name: "חדר שינה 2", kind: "bedroom", areaM2: 9.1, source: "cad" },
        { name: "חדר שינה 3", kind: "bedroom", areaM2: 10, source: "cad" },
        { name: "חדר שינה 4", kind: "bedroom", areaM2: 9.5, source: "cad" },
        { name: "חדר רחצה 1", kind: "bathroom", areaM2: 4.2, source: "cad" },
        { name: "חדר רחצה 2", kind: "bathroom", areaM2: 3.8, source: "cad" },
        { name: 'ממ"ד', kind: "mmd", areaM2: 9, source: "cad" },
      ],
    });
    const html = buildFloorplanVizPdfHtml(cad, images, { planImage: plan, unitTitle: "דירה 14" });
    expect(html).toContain("חדר שינה 1");
    expect(html).toContain("111.29");
    expect(html).not.toContain("לא חולצו חללים מהתוכנית");
    expect(html).toContain("compare-frame");
    expect(html).toMatch(/\.compare-frame\s*\{[^}]*border:\s*none/);
  });

  it("default sales booklet is cover plus three comparison pages", () => {
    const html = buildFloorplanVizPdfHtml(layout, images, { planImage: plan });
    expect(html).toContain('class="cover"');
    expect(html).toContain("plate-master");
    expect((html.match(/class="plate /g) ?? []).length).toBe(3);
    expect(html).toContain("font-family: \"NotoHebrew\"");
  });

  it("does not put the CAD geometry companion on the sales plates", () => {
    const html = buildFloorplanVizPdfHtml(
      layout,
      [
        { viewId: "overview", roomName: "גיאומטריה", labelHe: "גיאומטריה מהתוכנית", mimeType: "image/jpeg", base64: "CADGEO" },
        { viewId: "overview", labelHe: "כל התוכנית — מבט על", mimeType: "image/jpeg", base64: "HERO" },
      ],
      { planImage: plan },
    );
    expect(html).toContain("base64,HERO");
    expect(html).not.toContain("base64,CADGEO");
  });
});

describe("the three-page comparison booklet", () => {
  const images = [
    { viewId: "overview" as const, labelHe: "כל התוכנית — מבט על", mimeType: "image/jpeg", base64: "HERO" },
    { viewId: "interior" as const, labelHe: "פנים — מטבח", roomName: "מטבח", mimeType: "image/jpeg", base64: "KITCHEN" },
  ];
  const plan = { mimeType: "image/jpeg", base64: "PLANSHEET" };

  it("is exactly the still, the sheet and the two side by side", () => {
    const html = buildFloorplanVizPdfHtml(layout, images, { planImage: plan, comparisonOnly: true });
    expect(html).toContain("1/3 · הדמיה");
    expect(html).toContain("2/3 · תוכנית");
    expect(html).toContain("3/3 · השוואה");
    expect(html).toContain("plate-master");
    expect((html.match(/class="plate /g) ?? []).length).toBe(3);
    expect((html.match(/class="page-logo"/g) ?? []).length).toBe(3);
  });

  it("drops the cover and its room table", () => {
    const html = buildFloorplanVizPdfHtml(layout, images, { planImage: plan, comparisonOnly: true });
    expect(html).not.toContain("על הדירה");
    expect(html).not.toContain("חללי הדירה");
    expect(html).not.toContain('class="cover"');
  });

  it("leaves out the other stills, so a batch does not become a brochure", () => {
    const html = buildFloorplanVizPdfHtml(layout, images, { planImage: plan, comparisonOnly: true });
    expect(html).not.toContain("base64,KITCHEN");
  });

  it("does not open on a blank page, and every plate still fills its page", () => {
    const html = buildFloorplanVizPdfHtml(layout, images, { planImage: plan, comparisonOnly: true });
    expect(html).toContain("body > .plate:first-child");
    // The height belongs to .plate itself. Moving it onto the first-child
    // override once left every later page's panels collapsed to content height.
    const plateRule = html.slice(html.indexOf(".plate {"), html.indexOf("body > .plate:first-child"));
    expect(plateRule).toContain("height: 1123px");
    expect(plateRule).toContain("display: grid");
    expect(html).toContain("grid-template-rows: auto minmax(0, 1fr) auto");
    expect(html).toContain("min-height: 36px");
  });

  it("is ignored without a sheet to compare against", () => {
    const html = buildFloorplanVizPdfHtml(layout, images, { comparisonOnly: true });
    expect(html).toContain("על הדירה");
    expect(html).toContain("base64,KITCHEN");
  });

  it("still builds the full booklet when includeAllPlates is on", () => {
    const html = buildFloorplanVizPdfHtml(layout, images, { planImage: plan, includeAllPlates: true });
    expect(html).toContain("על הדירה");
    expect(html).toContain("base64,KITCHEN");
  });

  it("prints unit, m² and the BSD-YBM producer bar after enriching an empty payload", () => {
    const filled = enrichLayoutForBooklet(parseFloorplanLayout({ rooms: [] }), {
      unitTitle: "דירה 14",
      sourceFileName: "דירה 14 .pdf",
    });
    const html = buildFloorplanVizPdfHtml(filled, images, { planImage: plan, unitTitle: "דירה 14" });
    expect(html).toContain("דירה 14");
    expect(html).toContain("111.29");
    expect(html).toContain("חדר שינה 1");
    expect(html).toContain("produced-bar");
    expect(html).toContain("הופק על ידי מערכת BSD-YBM");
  });
});
