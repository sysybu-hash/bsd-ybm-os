import sharp from "sharp";
import { inferMimeFromFileName } from "@/lib/scan-mime";
import {
  buildInkWallJpeg,
  buildRoomIndexOverlayJpeg,
  buildRoomMassingJpeg,
  detectPaperCropBox,
  floorplanSourceFileName,
  isRasterFloorplanMime,
  prepareFloorplanSource,
  sniffFloorplanMime,
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
