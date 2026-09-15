import sharp from "sharp";
import { inferMimeFromFileName } from "@/lib/scan-mime";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import {
  buildInkWallJpeg,
  buildRoomIndexOverlayJpeg,
  buildRoomMassingJpeg,
  cropSalesSheetForCompare,
  detectInkCropBox,
  detectPaperCropBox,
  innerDoubleFrameRect,
  innerSheetRect,
  floorplanSourceFileName,
  isRasterFloorplanMime,
  pairRastersForCompare,
  peelIsolatedEdgeFrame,
  preferDrawingOverSheetFrame,
  prepareFloorplanSource,
  sniffFloorplanMime,
  bufferIfPdf,
  stripRightFrameRulesX,
  stripRightSparseChromeX,
  titleDividerCutX,
  stripSheetFrameCorners,
  titleBlockCutX,
  trimRasterWhitespace,
} from "@/lib/projects/floorplan-photo-prep";

describe("floorplan photo prep", () => {
  it("infers jpeg from a Windows-style empty MIME using the file name", () => {
    expect(inferMimeFromFileName("דירה1.jpg", "")).toBe("image/jpeg");
    expect(inferMimeFromFileName("plan.PDF", "application/octet-stream")).toBe("application/pdf");
  });

  it("sniffs jpeg magic when MIME is missing", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString("base64");
    expect(sniffFloorplanMime(jpeg, "")).toBe("image/jpeg");
    expect(sniffFloorplanMime(Buffer.from("%PDF-1.4").toString("base64"), "")).toBe("application/pdf");
  });

  it("accepts PDF magic and rejects a JPEG stored under a .pdf name", () => {
    expect(bufferIfPdf(Buffer.from("%PDF-1.4 mock"))).not.toBeNull();
    expect(bufferIfPdf(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(bufferIfPdf(null)).toBeNull();
  });

  it("normalizes a small dark photo to a larger jpeg", async () => {
    const png = await sharp({
      create: { width: 48, height: 36, channels: 3, background: { r: 70, g: 70, b: 80 } },
    })
      .png()
      .toBuffer();
    const prepared = await prepareFloorplanSource(png.toString("base64"), "image/png");
    expect(prepared.sourceKind).toBe("photo");
    expect(prepared.mimeType).toBe("image/jpeg");
    const meta = await sharp(Buffer.from(prepared.base64, "base64")).metadata();
    expect(meta.format).toBe("jpeg");
    expect((meta.width ?? 0) >= 1600 || (meta.height ?? 0) >= 1600).toBe(true);
  });

  it("passes PDF through unchanged", async () => {
    const raw = Buffer.from("%PDF-1.4 mock").toString("base64");
    const prepared = await prepareFloorplanSource(raw, "application/pdf");
    expect(prepared).toEqual({ base64: raw, mimeType: "application/pdf", sourceKind: "pdf" });
    expect(floorplanSourceFileName("image/jpeg")).toBe("floorplan.jpg");
    expect(isRasterFloorplanMime("image/jpeg")).toBe(true);
    expect(isRasterFloorplanMime("application/pdf")).toBe(false);
  });

  it("crops to the light paper when the photo has a dark table around it", () => {
    const width = 20;
    const height = 20;
    const grey = Buffer.alloc(width * height, 20);
    for (let y = 4; y < 16; y++) {
      for (let x = 3; x < 17; x++) grey[y * width + x] = 210;
    }
    expect(detectPaperCropBox(width, height, grey)).toEqual(
      expect.objectContaining({ left: expect.any(Number), top: expect.any(Number) }),
    );
    const box = detectPaperCropBox(width, height, grey)!;
    expect(box.left).toBeLessThanOrEqual(3);
    expect(box.top).toBeLessThanOrEqual(4);
    expect(box.width).toBeGreaterThanOrEqual(12);
    expect(box.height).toBeGreaterThanOrEqual(10);
  });

  it("zooms a compare crop to the dark drawing, not the white sheet", async () => {
    const width = 80;
    const height = 100;
    const grey = Buffer.alloc(width * height, 250);
    for (let y = 18; y < 58; y += 1) {
      for (let x = 12; x < 36; x += 1) grey[y * width + x] = 20;
    }
    const box = detectInkCropBox(width, height, grey);
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThan(60);
    expect(box!.height).toBeLessThan(80);
    expect(box!.left).toBeGreaterThanOrEqual(0);
    expect(box!.top).toBeGreaterThanOrEqual(0);

    const sheet = await sharp({
      create: { width: 100, height: 140, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="100" height="140" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="20" width="30" height="50" fill="#111"/><rect x="76" y="8" width="22" height="124" fill="#ddd"/></svg>`,
          ),
        },
      ])
      .png()
      .toBuffer();
    const cropped = await cropSalesSheetForCompare(sheet.toString("base64"), "image/png");
    expect(cropped).toBeTruthy();
    const meta = await sharp(Buffer.from(cropped!.base64, "base64")).metadata();
    expect(meta.width ?? 0).toBeLessThan(80);
    expect(meta.height ?? 0).toBeLessThan(120);
  });

  it("finds the interior of a double rounded sheet frame", () => {
    const width = 80;
    const height = 100;
    const grey = Buffer.alloc(width * height, 250);
    for (let y = 6; y < 94; y += 1) {
      grey[y * width + 8] = 15;
      grey[y * width + 11] = 15;
      grey[y * width + 68] = 15;
      grey[y * width + 71] = 15;
    }
    for (let x = 8; x < 72; x += 1) {
      grey[6 * width + x] = 15;
      grey[9 * width + x] = 15;
      grey[90 * width + x] = 15;
      grey[93 * width + x] = 15;
    }
    const inner = innerDoubleFrameRect(width, height, grey);
    expect(inner.left).toBeGreaterThan(11);
    expect(inner.left + inner.width).toBeLessThanOrEqual(68);
  });

  it("prefers the apartment over a surrounding rounded sheet frame", () => {
    const width = 120;
    const height = 160;
    const grey = Buffer.alloc(width * height, 250);
    for (let y = 8; y < 152; y += 1) {
      grey[y * width + 6] = 20;
      grey[y * width + 113] = 20;
    }
    for (let x = 6; x <= 113; x += 1) {
      grey[8 * width + x] = 20;
      grey[151 * width + x] = 20;
    }
    for (let y = 40; y < 110; y += 1) {
      for (let x = 28; x <= 78; x += 1) grey[y * width + x] = 40;
    }
    const box = preferDrawingOverSheetFrame(width, height, grey);
    expect(box).toBeTruthy();
    expect(box!.left).toBeGreaterThan(10);
    expect(box!.left + box!.width).toBeLessThan(110);
    expect(box!.width).toBeLessThan(90);
  });

  it("cuts at the title divider, not the first gutter inside the flat", () => {
    const width = 120;
    const height = 160;
    const grey = Buffer.alloc(width * height, 250);
    for (let y = 20; y < 140; y += 1) {
      grey[y * width + 12] = 20;
      grey[y * width + 62] = 20;
    }
    for (let x = 12; x <= 62; x += 1) {
      grey[20 * width + x] = 20;
      grey[139 * width + x] = 20;
    }
    for (let y = 10; y < 150; y += 1) grey[y * width + 92] = 15;
    for (let y = 16; y < 144; y += 4) {
      for (let x = 98; x < 114; x += 2) grey[y * width + x] = 40;
    }
    const cut = titleDividerCutX(width, height, grey);
    expect(cut).toBeGreaterThan(70);
    expect(cut).toBeLessThanOrEqual(92);
  });

  it("does not treat an L-wing wall as the title divider", () => {
    const width = 240;
    const height = 300;
    const grey = Buffer.alloc(width * height, 250);
    const fill = (x0: number, y0: number, x1: number, y1: number, tone = 30) => {
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) grey[y * width + x] = tone;
      }
    };
    fill(24, 40, 100, 230);
    fill(110, 40, 168, 150);
    for (let y = 40; y < 230; y += 1) grey[y * width + 104] = 15;
    for (let y = 16; y < 280; y += 1) grey[y * width + 200] = 15;
    for (let y = 20; y < 276; y += 4) {
      for (let x = 208; x < 230; x += 2) grey[y * width + x] = 40;
    }
    const cut = titleDividerCutX(width, height, grey);
    expect(cut).toBeGreaterThan(168);
    expect(cut).toBeLessThanOrEqual(200);
  });

  it("keeps the right-hand bedrooms of an L-shaped unit drawing", async () => {
    const sheet = await sharp({
      create: { width: 240, height: 300, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="240" height="300" xmlns="http://www.w3.org/2000/svg">
              <rect x="24" y="40" width="76" height="190" fill="none" stroke="#111" stroke-width="3"/>
              <rect x="110" y="40" width="58" height="110" fill="none" stroke="#111" stroke-width="3"/>
              <line x1="100" y1="40" x2="100" y2="230" stroke="#111" stroke-width="3"/>
              <line x1="24" y1="130" x2="100" y2="130" stroke="#111" stroke-width="2"/>
              <line x1="110" y1="90" x2="168" y2="90" stroke="#111" stroke-width="2"/>
            </svg>`,
          ),
        },
      ])
      .png()
      .toBuffer();
    const cropped = await cropSalesSheetForCompare(sheet.toString("base64"), "image/png");
    expect(cropped).toBeTruthy();
    const meta = await sharp(Buffer.from(cropped!.base64, "base64")).metadata();
    expect(meta.width ?? 0).toBeGreaterThan(125);
  });

  it("does not crop away the kitchen when room boxes stop short of the title divider", async () => {
    const sheet = await sharp({
      create: { width: 240, height: 300, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="240" height="300" xmlns="http://www.w3.org/2000/svg">
              <rect x="24" y="40" width="70" height="90" fill="#111"/>
              <rect x="24" y="140" width="50" height="70" fill="#111"/>
              <rect x="100" y="40" width="52" height="200" fill="#111"/>
              <rect x="188" y="20" width="3" height="260" fill="#111"/>
              <rect x="200" y="24" width="28" height="250" fill="#555"/>
            </svg>`,
          ),
        },
      ])
      .png()
      .toBuffer();
    const layout = parseFloorplanLayout({
      rooms: [
        { name: "חדר", kind: "bedroom", bbox: { x: 0.1, y: 0.13, w: 0.28, h: 0.3 }, source: "cad" },
        { name: "חדר 2", kind: "bedroom", bbox: { x: 0.1, y: 0.48, w: 0.2, h: 0.22 }, source: "cad" },
        { name: "מטבח", kind: "kitchen", bbox: { x: 0.42, y: 0.13, w: 0.2, h: 0.62 }, source: "cad" },
      ],
    });
    const cropped = await cropSalesSheetForCompare(sheet.toString("base64"), "image/png", layout);
    expect(cropped).toBeTruthy();
    const meta = await sharp(Buffer.from(cropped!.base64, "base64")).metadata();
    expect(meta.width ?? 0).toBeGreaterThan(150);
  });

  it("keeps the same unit crop the 3D used when room boxes are trustworthy", async () => {
    const sheet = await sharp({
      create: { width: 200, height: 280, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="200" height="280" xmlns="http://www.w3.org/2000/svg">
              <rect x="20" y="36" width="70" height="80" fill="#111"/>
              <rect x="20" y="130" width="52" height="64" fill="#111"/>
              <rect x="100" y="36" width="48" height="90" fill="#111"/>
              <rect x="164" y="16" width="28" height="248" fill="#dddddd"/>
            </svg>`,
          ),
        },
      ])
      .png()
      .toBuffer();
    const layout = parseFloorplanLayout({
      rooms: [
        { name: "חדר", kind: "bedroom", bbox: { x: 0.1, y: 0.12, w: 0.36, h: 0.3 }, source: "cad" },
        { name: "מטבח", kind: "kitchen", bbox: { x: 0.1, y: 0.46, w: 0.28, h: 0.24 }, source: "cad" },
        { name: "סלון", kind: "living", bbox: { x: 0.48, y: 0.12, w: 0.26, h: 0.34 }, source: "cad" },
      ],
    });
    const cropped = await cropSalesSheetForCompare(sheet.toString("base64"), "image/png", layout);
    expect(cropped).toBeTruthy();
    const meta = await sharp(Buffer.from(cropped!.base64, "base64")).metadata();
    expect(meta.width ?? 0).toBeGreaterThan(130);
    expect(meta.height ?? 0).toBeGreaterThan(150);
  });

  it("does not keep a large rounded frame around a small drawing", async () => {
    const sheet = await sharp({
      create: { width: 240, height: 320, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="240" height="320" xmlns="http://www.w3.org/2000/svg">
              <rect x="10" y="12" width="168" height="296" rx="22" fill="none" stroke="#111" stroke-width="3"/>
              <rect x="14" y="16" width="160" height="288" rx="18" fill="none" stroke="#111" stroke-width="2"/>
              <rect x="48" y="72" width="58" height="88" fill="#111"/>
              <rect x="48" y="168" width="36" height="52" fill="#111"/>
              <rect x="188" y="16" width="42" height="288" fill="#eeeeee"/>
            </svg>`,
          ),
        },
      ])
      .png()
      .toBuffer();
    const cropped = await cropSalesSheetForCompare(sheet.toString("base64"), "image/png");
    expect(cropped).toBeTruthy();
    const meta = await sharp(Buffer.from(cropped!.base64, "base64")).metadata();
    expect(meta.width ?? 0).toBeLessThan(140);
    expect(meta.height ?? 0).toBeLessThan(270);
  });

  it("crops inside a thick rounded sheet frame to the drawing", async () => {
    const sheet = await sharp({
      create: { width: 200, height: 280, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="200" height="280" xmlns="http://www.w3.org/2000/svg">
              <rect x="8" y="8" width="184" height="264" rx="18" fill="none" stroke="#111" stroke-width="10"/>
              <rect x="40" y="48" width="52" height="96" fill="#111"/>
              <rect x="158" y="12" width="36" height="256" fill="#e8e8e8"/>
            </svg>`,
          ),
        },
      ])
      .png()
      .toBuffer();
    const grey = await sharp(sheet).extract({ left: 0, top: 0, width: 148, height: 280 }).greyscale().raw().toBuffer({
      resolveWithObject: true,
    });
    const inner = innerSheetRect(grey.info.width ?? 0, grey.info.height ?? 0, grey.data);
    expect(inner.width).toBeGreaterThan(40);
    const cropped = await cropSalesSheetForCompare(sheet.toString("base64"), "image/png");
    expect(cropped).toBeTruthy();
    const meta = await sharp(Buffer.from(cropped!.base64, "base64")).metadata();
    expect(meta.width ?? 0).toBeLessThan(110);
  });

  it("strips a leftover rounded-frame corner without eating the drawing", () => {
    const width = 40;
    const height = 60;
    const grey = Buffer.alloc(width * height, 250);
    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        if (x + y < 9) grey[y * width + x] = 20;
      }
    }
    for (let y = 18; y < 42; y += 1) {
      for (let x = 12; x < 28; x += 1) grey[y * width + x] = 30;
    }
    const stripped = stripSheetFrameCorners(width, height, grey);
    expect(stripped.left).toBeGreaterThan(0);
    expect(stripped.width).toBeGreaterThan(20);
    expect(stripped.height).toBeGreaterThan(30);
  });

  it("does not eat apartment walls that sit in the corners", () => {
    const width = 40;
    const height = 60;
    const grey = Buffer.alloc(width * height, 250);
    for (let y = 2; y < 58; y += 1) {
      grey[y * width + 2] = 20;
      grey[y * width + 37] = 20;
    }
    for (let x = 2; x < 38; x += 1) {
      grey[2 * width + x] = 20;
      grey[57 * width + x] = 20;
    }
    const stripped = stripSheetFrameCorners(width, height, grey);
    expect(stripped.left).toBeLessThanOrEqual(2);
    expect(stripped.left + stripped.width).toBeGreaterThanOrEqual(37);
  });

  it("keeps a drawing that extends past 74% and only drops title-block text", () => {
    const width = 100;
    const height = 120;
    const grey = Buffer.alloc(width * height, 250);
    for (let y = 15; y < 105; y += 1) {
      grey[y * width + 8] = 20;
      grey[y * width + 82] = 20;
    }
    for (let x = 8; x <= 82; x += 1) {
      grey[15 * width + x] = 20;
      grey[104 * width + x] = 20;
    }
    for (let y = 10; y < 110; y += 2) {
      for (let x = 90; x < 98; x += 1) grey[y * width + x] = 30;
    }
    const cut = titleBlockCutX(width, height, grey);
    expect(cut).toBeGreaterThan(82);
    expect(cut).toBeLessThan(92);
  });

  it("drops a sparse title-block column after the white gutter", () => {
    const width = 120;
    const height = 140;
    const grey = Buffer.alloc(width * height, 250);
    for (let y = 20; y < 120; y += 1) {
      grey[y * width + 10] = 20;
      grey[y * width + 70] = 20;
    }
    for (let x = 10; x <= 70; x += 1) {
      grey[20 * width + x] = 20;
      grey[119 * width + x] = 20;
    }
    for (let y = 30; y < 110; y += 7) {
      for (let x = 96; x < 108; x += 2) grey[y * width + x] = 40;
    }
    const cut = titleBlockCutX(width, height, grey);
    expect(cut).toBeGreaterThan(70);
    expect(cut).toBeLessThan(96);
  });

  it("does not cut an open living room between two walls", () => {
    const width = 100;
    const height = 120;
    const grey = Buffer.alloc(width * height, 250);
    for (let y = 15; y < 105; y += 1) {
      grey[y * width + 8] = 20;
      grey[y * width + 88] = 20;
    }
    for (let x = 8; x <= 88; x += 1) {
      grey[15 * width + x] = 20;
      grey[104 * width + x] = 20;
    }
    expect(titleBlockCutX(width, height, grey)).toBe(width);
  });

  it("peels a thin leftover title sliver without cutting the last wall", () => {
    const width = 100;
    const height = 120;
    const grey = Buffer.alloc(width * height, 250);
    for (let y = 15; y < 105; y += 1) {
      grey[y * width + 8] = 20;
      grey[y * width + 82] = 20;
    }
    for (let x = 8; x <= 82; x += 1) {
      grey[15 * width + x] = 20;
      grey[104 * width + x] = 20;
    }
    for (let y = 40; y < 80; y += 6) {
      grey[y * width + 94] = 35;
      grey[y * width + 96] = 35;
    }
    const cut = stripRightSparseChromeX(width, height, grey);
    expect(cut).toBeGreaterThan(82);
    expect(cut).toBeLessThan(94);
  });

  it("drops a double full-height sheet rule on the right", () => {
    const width = 100;
    const height = 140;
    const grey = Buffer.alloc(width * height, 250);
    for (let y = 30; y < 110; y += 1) {
      grey[y * width + 12] = 20;
      grey[y * width + 62] = 20;
      grey[y * width + 68] = 20;
    }
    for (let x = 12; x <= 68; x += 1) {
      grey[30 * width + x] = 20;
      grey[109 * width + x] = 20;
    }
    for (let y = 4; y < 136; y += 1) {
      grey[y * width + 88] = 15;
      grey[y * width + 91] = 15;
    }
    const cut = stripRightFrameRulesX(width, height, grey);
    expect(cut).toBeGreaterThan(68);
    expect(cut).toBeLessThan(88);
  });

  it("peels both leftover strokes of a double frame", () => {
    const width = 90;
    const height = 100;
    const grey = Buffer.alloc(width * height, 250);
    for (let y = 18; y < 82; y += 1) {
      grey[y * width + 10] = 20;
      grey[y * width + 58] = 20;
    }
    for (let x = 10; x <= 58; x += 1) {
      grey[18 * width + x] = 20;
      grey[81 * width + x] = 20;
    }
    for (let y = 0; y < height; y += 1) {
      grey[y * width + 70] = 15;
      grey[y * width + 71] = 15;
      grey[y * width + 84] = 15;
      grey[y * width + 85] = 15;
    }
    const peeled = peelIsolatedEdgeFrame(width, height, grey);
    expect(peeled.left + peeled.width).toBeLessThanOrEqual(70);
    expect(peeled.width).toBeGreaterThan(50);
  });

  it("peels a leftover full-height frame stroke even when a wall sits beside it", () => {
    const width = 80;
    const height = 100;
    const grey = Buffer.alloc(width * height, 250);
    for (let y = 18; y < 82; y += 1) {
      grey[y * width + 10] = 20;
      grey[y * width + 68] = 20;
    }
    for (let x = 10; x <= 68; x += 1) {
      grey[18 * width + x] = 20;
      grey[81 * width + x] = 20;
    }
    for (let y = 0; y < height; y += 1) {
      grey[y * width + 74] = 15;
      grey[y * width + 75] = 15;
    }
    const peeled = peelIsolatedEdgeFrame(width, height, grey);
    expect(peeled.left + peeled.width).toBeLessThanOrEqual(74);
    expect(peeled.width).toBeGreaterThan(50);
  });

  it("peels a leftover full-height frame stroke at the raster edge", () => {
    const width = 80;
    const height = 100;
    const grey = Buffer.alloc(width * height, 250);
    for (let y = 18; y < 82; y += 1) {
      grey[y * width + 10] = 20;
      grey[y * width + 58] = 20;
    }
    for (let x = 10; x <= 58; x += 1) {
      grey[18 * width + x] = 20;
      grey[81 * width + x] = 20;
    }
    for (let y = 0; y < height; y += 1) {
      grey[y * width + 76] = 15;
      grey[y * width + 77] = 15;
    }
    const peeled = peelIsolatedEdgeFrame(width, height, grey);
    expect(peeled.left).toBe(0);
    expect(peeled.left + peeled.width).toBeLessThanOrEqual(76);
    expect(peeled.width).toBeGreaterThan(50);
  });

  it("does not peel an apartment wall that stops inside the margins", () => {
    const width = 80;
    const height = 100;
    const grey = Buffer.alloc(width * height, 250);
    for (let y = 12; y < 88; y += 1) {
      grey[y * width + 8] = 20;
      grey[y * width + 72] = 20;
    }
    for (let x = 8; x <= 72; x += 1) {
      grey[12 * width + x] = 20;
      grey[87 * width + x] = 20;
    }
    const peeled = peelIsolatedEdgeFrame(width, height, grey);
    expect(peeled.left).toBe(0);
    expect(peeled.width).toBe(width);
  });

  it("drops a mid-page double rule that does not reach the paper edge", () => {
    const width = 120;
    const height = 200;
    const grey = Buffer.alloc(width * height, 250);
    for (let y = 55; y < 145; y += 1) {
      grey[y * width + 14] = 20;
      grey[y * width + 47] = 20;
      grey[y * width + 52] = 20;
    }
    for (let x = 14; x <= 52; x += 1) {
      grey[55 * width + x] = 20;
      grey[144 * width + x] = 20;
    }
    for (let y = 42; y < 168; y += 1) {
      grey[y * width + 102] = 18;
      grey[y * width + 106] = 18;
    }
    const cut = stripRightFrameRulesX(width, height, grey);
    expect(cut).toBeGreaterThan(52);
    expect(cut).toBeLessThan(102);
  });

  it("crops a light studio backdrop around a still, not only near-white paper", async () => {
    const still = await sharp({
      create: { width: 120, height: 90, channels: 3, background: { r: 232, g: 232, b: 236 } },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="120" height="90" xmlns="http://www.w3.org/2000/svg"><rect x="38" y="28" width="36" height="30" fill="#8b4513"/></svg>`,
          ),
        },
      ])
      .png()
      .toBuffer();
    const trimmed = await trimRasterWhitespace(still.toString("base64"), "image/png");
    expect(trimmed).toBeTruthy();
    const meta = await sharp(Buffer.from(trimmed!.base64, "base64")).metadata();
    expect(meta.width ?? 0).toBeLessThan(70);
    expect(meta.height ?? 0).toBeLessThan(55);
  });

  it("pads a wide still to the plan's aspect so the drawing is not letterboxed", async () => {
    const stillPng = await sharp({
      create: { width: 80, height: 40, channels: 3, background: { r: 180, g: 80, b: 40 } },
    })
      .png()
      .toBuffer();
    const planPng = await sharp({
      create: { width: 30, height: 60, channels: 3, background: { r: 20, g: 20, b: 20 } },
    })
      .png()
      .toBuffer();
    const paired = await pairRastersForCompare(
      { base64: stillPng.toString("base64"), mimeType: "image/png" },
      { base64: planPng.toString("base64"), mimeType: "image/png" },
    );
    const stillMeta = await sharp(Buffer.from(paired.still.base64, "base64")).metadata();
    const planMeta = await sharp(Buffer.from(paired.plan.base64, "base64")).metadata();
    const stillAspect = (stillMeta.width ?? 1) / (stillMeta.height ?? 1);
    const planAspect = (planMeta.width ?? 1) / (planMeta.height ?? 1);
    expect(Math.abs(stillAspect - planAspect)).toBeLessThan(0.05);
    expect(stillMeta.height ?? 0).toBeGreaterThan(70);
    expect(planMeta.height ?? 0).toBeGreaterThanOrEqual(58);
  });

  it("treats a full-page white sales raster as a drawing, not a phone photo", async () => {
    const png = await sharp({
      create: { width: 120, height: 160, channels: 3, background: { r: 250, g: 250, b: 248 } },
    })
      .png()
      .toBuffer();
    const prepared = await prepareFloorplanSource(png.toString("base64"), "image/png");
    expect(prepared.sourceKind).toBe("drawing");
    expect(prepared.mimeType).toBe("image/jpeg");
    const forced = await prepareFloorplanSource(png.toString("base64"), "image/png", { forceDrawing: true });
    expect(forced.sourceKind).toBe("drawing");
  });

  it("draws numbered room boxes on a plan raster", async () => {
    const png = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();
    const overlay = await buildRoomIndexOverlayJpeg(png.toString("base64"), [
      { bbox: { x: 0.1, y: 0.1, w: 0.3, h: 0.3 } },
      { bbox: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 } },
    ]);
    expect(overlay).toBeTruthy();
    const meta = await sharp(Buffer.from(overlay!, "base64")).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(200);
    expect(await buildRoomIndexOverlayJpeg(png.toString("base64"), [{}])).toBeNull();
  });

  it("tints rooms on the original drawing and keeps the wall ink, with no labels", async () => {
    const wall = await sharp({
      create: { width: 200, height: 160, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="200" height="160" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="24" height="144" fill="#111"/></svg>`,
          ),
        },
      ])
      .png()
      .toBuffer();
    const massing = await buildRoomMassingJpeg(wall.toString("base64"), [
      { name: "מטבח", kind: "kitchen", bbox: { x: 0.4, y: 0.1, w: 0.4, h: 0.4 } },
      { name: "סלון", kind: "living", bbox: { x: 0.4, y: 0.55, w: 0.5, h: 0.35 } },
    ]);
    expect(massing).toBeTruthy();
    const meta = await sharp(Buffer.from(massing!, "base64")).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(200);
    const raw = await sharp(Buffer.from(massing!, "base64")).removeAlpha().raw().toBuffer();
    const wallIdx = (80 * 200 + 16) * 3;
    expect(raw[wallIdx]).toBeLessThan(40);
    expect(await buildRoomMassingJpeg(wall.toString("base64"), [{ name: "מטבח", kind: "kitchen" }])).toBeNull();
    expect(await buildInkWallJpeg(wall.toString("base64"))).toBeTruthy();
  });
});
