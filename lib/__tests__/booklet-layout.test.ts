/**
 * @jest-environment node
 */
import sharp from "sharp";

import { buildProjectBookletHtml, type BookletImage, type ProjectBookletInput } from "@/lib/projects/building/booklet-html";
import { facadeAboveYard, withoutMargin } from "@/lib/projects/building/dwf-booklet-html";

const img = (w: number, h: number): BookletImage => ({ mimeType: "image/jpeg", base64: "AA==", width: w, height: h });
const input = (sheetImg: BookletImage, renderImg: BookletImage, tables: ProjectBookletInput["chapters"][number]["tables"]): ProjectBookletInput => ({
  projectName: "p",
  subtitle: "s",
  hero: img(100, 100),
  kpis: [],
  paragraphs: [],
  chapters: [{ name: "דגם A", hero: img(100, 100), kpis: [], paragraphs: [], rooms: [], tables, sheets: [{ no: 1, title: "חזית", caption: "c", sheet: sheetImg, render: renderImg }], plates: [], report: [] }],
});
const table = (title: string) => ({ title, head: ["חלל", "שטח"], rows: [["סלון", "24.5"]] });

describe("a comparison page", () => {
  it("holds two wide pictures one over the other, and two squarer ones side by side", () => {
    expect(buildProjectBookletHtml(input(img(2400, 1300), img(2400, 1300), undefined))).toMatch(/class="compare stack"/);
    expect(buildProjectBookletHtml(input(img(2400, 2400), img(2000, 2000), undefined))).not.toMatch(/class="compare stack"/);
    expect(buildProjectBookletHtml(input(img(2400, 1300), img(2000, 2000), undefined))).not.toMatch(/class="compare stack"/);
  });
});

describe("a model's opening page", () => {
  it("carries its storey tables, and the data page only the others", () => {
    const html = buildProjectBookletHtml(input(img(10, 10), img(10, 10), [table("קומת קרקע · מפלס +0.00"), table("קומה א' · מפלס +2.97"), table("מפלסים וגבהים")]));
    const [opener, rest] = [html.indexOf('class="opener-tables"'), html.indexOf('class="data-page"')];
    expect(opener).toBeGreaterThan(0);
    expect(rest).toBeGreaterThan(opener);
    const openerBlock = html.slice(opener, rest);
    expect(openerBlock).toContain("קומת קרקע");
    expect(openerBlock).toContain("קומה א'");
    expect(openerBlock).not.toContain("מפלסים וגבהים");
    expect(html.slice(rest)).toContain("מפלסים וגבהים");
    expect(html.slice(rest, rest + 800)).not.toContain("קומת קרקע");
  });

  it("has no data page where the storey tables are all its tables", () => {
    const html = buildProjectBookletHtml(input(img(10, 10), img(10, 10), [table("קומת קרקע · מפלס +0.00")]));
    expect(html).toContain('class="opener-tables"');
    expect(html).not.toContain('class="data-page"');
  });
});

describe("withoutMargin", () => {
  it("cuts the white round a drawing and leaves a hand of white", async () => {
    const drawing = await sharp({ create: { width: 1000, height: 700, channels: 3, background: "#ffffff" } })
      .composite([{ input: await sharp({ create: { width: 500, height: 300, channels: 3, background: "#333333" } }).png().toBuffer(), left: 250, top: 200 }])
      .jpeg()
      .toBuffer();
    const out = await sharp(await withoutMargin(drawing)).metadata();
    expect(out.width!).toBeLessThan(600);
    expect(out.height!).toBeLessThan(400);
    expect(out.width!).toBeGreaterThanOrEqual(540);
  });

  it("leaves a picture with no margin as it is", async () => {
    const full = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#445566" } }).jpeg().toBuffer();
    expect(await withoutMargin(full)).toBe(full);
  });
});

describe("facadeAboveYard", () => {
  const picture = async (brownFrom: number | null) => {
    const rows: Buffer[] = [];
    const plaster = { create: { width: 600, height: 400, channels: 3 as const, background: "#e6e1d6" } };
    const base = sharp(plaster);
    const layers = brownFrom == null ? [] : [{ input: await sharp({ create: { width: 600, height: 400 - brownFrom, channels: 3, background: "#9a8a70" } }).png().toBuffer(), left: 0, top: brownFrom }];
    rows.push(await base.composite(layers).jpeg().toBuffer());
    return rows[0]!;
  };

  it("cuts the picture where the cut ground begins, keeping a strip of it", async () => {
    const out = await sharp(await facadeAboveYard(await picture(250))).metadata();
    expect(out.width).toBe(600);
    expect(out.height!).toBeGreaterThanOrEqual(250);
    expect(out.height!).toBeLessThan(270);
  });

  it("leaves a picture with no ground in it as it is", async () => {
    const plain = await picture(null);
    expect(await facadeAboveYard(plain)).toBe(plain);
  });
});

import { planKeyOf } from "@/lib/projects/building/dwf-booklet-html";
import type { RoomLabel } from "@/lib/projects/building/room-labels";
import { DWF_FLOOR_UNITS_PER_METRE as UPM } from "@/lib/projects/dwf-building";

describe("a house plan's key", () => {
  const floor = { sheetWidth: 20 * UPM, sheetHeight: 20 * UPM, shift: { x: 0, y: 0 }, outline: [[2, 2], [18, 2], [18, 18], [2, 18]] as Array<[number, number]> };
  const label = (name: string | null, fx: number, fy: number, home = true): RoomLabel => ({ name, dims: { w: 3, l: 4 }, areaM2: 12, fx, fy, home });

  it("numbers the first home's named rooms in reading order and marks both homes", () => {
    const key = planKeyOf({ labels: [label("סלון", 0.3, 0.7), label("ח.שינה", 0.3, 0.2), label("מטבח", 0.2, 0.7), label("סלון", 0.7, 0.7, false)], floor, padM: 0 })!;
    expect(key.rows.map((r) => [r.n, r.name])).toEqual([[1, "חדר שינה"], [2, "מטבח"], [3, "סלון"]]);
    expect(key.rows[0]!.dims).toBe("3.00×4.00");
    // Each room twice: where it is, and across the pair's axis (x = 10) as the mirror.
    expect(key.markers).toHaveLength(6);
    const one = key.markers.filter((m) => m.n === 1);
    expect(one[0]!.fx).toBeCloseTo(0.3);
    expect(one[1]!.fx).toBeCloseTo(0.7);
    expect(one[0]!.fy).toBeCloseTo(one[1]!.fy);
  });

  it("places a label by the render's frame, the sheet's with the padding round it", () => {
    const key = planKeyOf({ labels: [label("סלון", 0.5, 0.5), label("סלון", 0.9, 0.5, false)], floor, padM: 2 })!;
    expect(key.markers[0]!.fx).toBeCloseTo(0.5);
    const edge = planKeyOf({ labels: [label("סלון", 0, 0)], floor, padM: 2 })!;
    expect(edge.markers[0]!.fx).toBeCloseTo(2 / 24);
    expect(key.scale.fraction).toBeCloseTo(5 / 24);
  });

  it("marks one home where the sheet draws one, and nothing where it names no room", () => {
    expect(planKeyOf({ labels: [label("סלון", 0.3, 0.5)], floor, padM: 0 })!.markers).toHaveLength(1);
    expect(planKeyOf({ labels: [], floor, padM: 0 })).toBeUndefined();
  });
});

describe("a keyed plan page", () => {
  it("carries the key's table and the numbers on the picture", () => {
    const sheet = { no: 1, title: "קומת קרקע", caption: "c", sheet: img(100, 100), render: img(4000, 4000), key: planKeyOf({ labels: [{ name: "סלון", dims: { w: 4.95, l: 4.95 }, areaM2: 24.5, fx: 0.4, fy: 0.5, home: true }], floor: { sheetWidth: 20 * UPM, sheetHeight: 20 * UPM, shift: { x: 0, y: 0 }, outline: [[2, 2], [18, 2], [18, 18]] }, padM: 0 }) };
    const html = buildProjectBookletHtml({ ...input(img(10, 10), img(10, 10), undefined), chapters: [{ ...input(img(10, 10), img(10, 10), undefined).chapters[0]!, sheets: [sheet] }] });
    expect(html).toContain("מקרא החללים");
    expect(html).toContain("4.95×4.95");
    expect(html).toContain("צפון");
    expect(html).toMatch(/<text[^>]*>1<\/text>/);
  });
});
