import sharp from "sharp";

import { withBookletBrand } from "@/lib/projects/building/booklet-brand";
import { assembleBookletHtml } from "@/lib/projects/building/dwf-booklet-html";
import type { BookletState } from "@/lib/projects/building/dwf-booklet";

jest.setTimeout(30_000);

describe("the booklet's maker", () => {
  it("is BSD-YBM by default, and VisualModuBuild's name, site and logo inside withBookletBrand", async () => {
    const pic = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#88aa66" } }).jpeg().toBuffer();
    const pics = new Map<string, Buffer>([["sheet-floor-0.jpg", pic], ["view-plan-floor-0.jpg", pic], ["view-hero.jpg", pic]]);
    const state: BookletState = {
      finish: "house",
      floors: [{ id: "floor-0", level: 0, height: 3, units: [], shift: { x: 0, y: 0 }, outline: [], roof: false, registration: 1, sheetWidth: 100, sheetHeight: 100 }],
      artefacts: Object.fromEntries([...pics.keys()].map((n) => [n, n])),
    };
    const io = { put: async (n: string) => n, get: async (ref: string) => pics.get(ref)! };
    const plain = await assembleBookletHtml("בית", state, io);
    expect(plain).toContain("https://www.bsd-ybm.co.il");
    expect(plain).toContain("מערכת BSD-YBM");

    const vmb = await withBookletBrand({ name: "VisualModuBuild", site: "https://vmb.bsd-ybm.co.il", logoPngBase64: "QUJD" }, () => assembleBookletHtml("בית", state, io));
    expect(vmb).toContain("https://vmb.bsd-ybm.co.il");
    expect(vmb).toContain("מערכת VisualModuBuild");
    expect(vmb).toContain("data:image/png;base64,QUJD");
    expect(vmb).not.toContain("www.bsd-ybm.co.il");
    expect(vmb).not.toContain("BSD-YBM");
  });
});
