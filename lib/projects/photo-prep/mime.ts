
const RASTER = /^image\//i;
export const MAX_LONG_EDGE = 4096;
export const MIN_SHORT_EDGE = 1600;
export const TARGET_SHORT_EDGE = 2400;

export type PreparedFloorplanSource = {
  base64: string;
  mimeType: string;
  sourceKind: "pdf" | "photo" | "drawing";
};

export function isRasterFloorplanMime(mime: string): boolean {
  return RASTER.test(mime) && !/svg/i.test(mime);
}

export function floorplanSourceFileName(mimeType: string): string {
  if (mimeType === "application/pdf") return "floorplan.pdf";
  if (mimeType.includes("png")) return "floorplan.png";
  if (mimeType.includes("webp")) return "floorplan.webp";
  return "floorplan.jpg";
}

/** כש-Windows שולח type ריק והקובץ בכל זאת תמונה / PDF */
/** Real PDF bytes only — a JPEG stored under a .pdf name is not a sheet. */
export function bufferIfPdf(bytes: Buffer | Uint8Array | null | undefined): Buffer | null {
  if (!bytes || bytes.length < 4) return null;
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return buf.subarray(0, 4).toString("latin1") === "%PDF" ? buf : null;
}

export function sniffFloorplanMime(base64: string, mimeType: string): string {
  const mime = mimeType.trim();
  if (mime && mime !== "application/octet-stream") return mime;
  try {
    const buf = Buffer.from(base64.slice(0, 48), "base64");
    if (buf.slice(0, 4).toString("latin1") === "%PDF") return "application/pdf";
    if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
    if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") {
      return "image/webp";
    }
  } catch {
    /* ignore */
  }
  return mime || "application/pdf";
}

