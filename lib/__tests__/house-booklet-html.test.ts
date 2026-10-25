import sharp from "sharp";

import { assembleBookletHtml } from "@/lib/projects/building/dwf-booklet-html";
import type { BookletState } from "@/lib/projects/building/dwf-booklet";

jest.setTimeout(30_000);

const picture = () => sharp({ create: { width: 40, height: 30, channels: 3, background: "#88aa66" } }).jpeg().toBuffer();

describe("a house booklet's plan pages", () => {
  it("writes no room names over the plan, and says where the architect's are", async () => {
    const pics = new Map<string, Buffer>([
      ["sheet-floor-0.jpg", await picture()],
      ["view-plan-floor-0.jpg", await picture()],
      ["view-hero.jpg", await picture()],
    ]);
    const state: BookletState = {
      finish: "house",
      floors: [{ id: "floor-0", level: 0, height: 3, units: [], shift: { x: 0, y: 0 }, outline: [], roof: false, registration: 1, sheetWidth: 100, sheetHeight: 100 }],
      artefacts: Object.fromEntries([...pics.keys()].map((n) => [n, n])),
      // One home's bedroom named, its twin's not: what Gottlieb's sheets write.
      rooms: { "floor-0": [{ name: "ח.שינה", dims: { w: 3, l: 3.5 }, areaM2: 10.5, fx: 0.3, fy: 0.4, home: true }, { name: null, dims: { w: 2.83, l: 4.45 }, areaM2: 12.59, fx: 0.7, fy: 0.4, home: true }] },
    };
    const html = await assembleBookletHtml("גוטליב", state, { put: async (n) => n, get: async (ref) => pics.get(ref)! });
    expect(html).not.toContain('class="labelled"');
    expect(html).toContain("שמות החדרים ושטחם — בגיליון שלצד ההדמיה ובטבלת השטחים");
  });
});
