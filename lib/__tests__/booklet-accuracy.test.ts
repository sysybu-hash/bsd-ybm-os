/** @jest-environment node */
import { PDFDocument } from "pdf-lib";

import { accuracyPageHtml, appendPdf, withAccuracyPage, type AccuracyRow } from "@/lib/projects/accuracy/booklet-accuracy";
import { buildingAccuracyRows } from "@/lib/projects/pipeline/runProject";

jest.setTimeout(30_000);

const stats = (n: number) => ({ n, median: 0.03, p90: 0.21, max: 0.9, withinClose: 0.78, beyondFar: 0.06 });

async function pdfOf(pages: number): Promise<Buffer> {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage([400, 300]);
  return Buffer.from(await d.save());
}

describe("the booklet's accuracy page", () => {
  it("prints the measured numbers per sheet and the narrow claim, with no pass/fail grade", () => {
    const html = accuracyPageHtml("בית", [{ sheet: "קומת קרקע", stats: stats(1200) }]);
    expect(html).toContain("קומת קרקע");
    expect(html).toContain("<td>1200</td><td>3</td><td>21</td><td>78%</td><td>6%</td>");
    expect(html).toContain("מה הדוח אינו מאשר");
    expect(html).toContain("עמידה בהיתר");
    expect(html).not.toMatch(/עובר|נכשל|גבולי/);
    expect(accuracyPageHtml("בית", [{ sheet: "מפלס +3.10", stats: stats(5) }])).toContain(`מפלס <span dir="ltr">+3.10</span>`);
  });

  it("is appended after the booklet's last page", async () => {
    const merged = await PDFDocument.load(await appendPdf(await pdfOf(3), await pdfOf(1)));
    expect(merged.getPageCount()).toBe(4);
  });

  it("leaves the booklet as it was when nothing was measured or the page fails", async () => {
    const booklet = await pdfOf(2);
    const none = await withAccuracyPage(booklet, "בית", [{ sheet: "א", stats: stats(0) }], jest.fn(), jest.fn());
    expect(none).toEqual({ pdf: booklet, added: false });
    const onError = jest.fn();
    const failed = await withAccuracyPage(booklet, "בית", [{ sheet: "א", stats: stats(10) }], () => Promise.reject(new Error("chromium")), onError);
    expect(failed).toEqual({ pdf: booklet, added: false });
    expect(onError).toHaveBeenCalledWith("chromium");
    const ok = await withAccuracyPage(booklet, "בית", [{ sheet: "א", stats: stats(10) }], () => pdfOf(1), jest.fn());
    expect(ok.added).toBe(true);
    expect((await PDFDocument.load(ok.pdf)).getPageCount()).toBe(3);
  });

  it("names a building's storeys as the studio does, with the model's name when there are several", () => {
    const overlay = { points: [], all: stats(50), byKind: [], bounds: { close: 0.15, far: 0.35 } };
    const model = (name: string) => ({
      name,
      primitives: [],
      extent: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
      storeys: [{ id: "f0", level: 0, height: 3, roof: false, title: "קומת קרקע" }],
      cameras: [],
      sheets: [
        { storeyId: "f0", key: "f0", width: 10, height: 10, overlay },
        { storeyId: "f1", key: "f1", width: 10, height: 10, overlay: null },
      ],
    });
    const one = buildingAccuracyRows({ version: 1, kind: "building", models: [model("בית")] } as never);
    expect(one.map((r: AccuracyRow) => r.sheet)).toEqual(["קומת קרקע"]);
    const two = buildingAccuracyRows({ version: 1, kind: "building", models: [model("א"), model("ב")] } as never);
    expect(two.map((r: AccuracyRow) => r.sheet)).toEqual(["א · קומת קרקע", "ב · קומת קרקע"]);
  });
});
