
const RASTER = /^image\//i;
export const MAX_LONG_EDGE = 4096;
export const MIN_SHORT_EDGE = 1600;
export const TARGET_SHORT_EDGE = 2400;

export const DXF_MIME = "image/vnd.dxf";
export const DWG_MIME = "image/vnd.dwg";

export type PreparedFloorplanSource = {
  base64: string;
  mimeType: string;
  /** "cad" is a DXF or DWG: vectors with layers, read without rasterising anything. */
  sourceKind: "pdf" | "photo" | "drawing" | "cad";
};

/** DXF is text, and its first record opens a SECTION. */
export function looksLikeDxf(bytes: Buffer | Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 512)).toString("latin1");
  return /(^|\n)\s*0\s*\r?\n\s*SECTION/i.test(head) || head.includes("AutoCAD Binary DXF");
}

/** DWG is binary, and its first bytes name the release that wrote it. */
export function looksLikeDwg(bytes: Buffer | Uint8Array): boolean {
  return /^AC10\d{2}/.test(Buffer.from(bytes.subarray(0, 6)).toString("latin1"));
}

export function isCadFloorplanMime(mime: string): boolean {
  return mime === DXF_MIME || mime === DWG_MIME;
}

export function isRasterFloorplanMime(mime: string): boolean {
  // A DXF's media type starts with image/ and is not a picture: sharp cannot
  // decode it, and every crop and trim in this pipeline gates on this test.
  if (isCadFloorplanMime(mime)) return false;
  return RASTER.test(mime) && !/svg/i.test(mime);
}

export function floorplanSourceFileName(mimeType: string): string {
  if (mimeType === "application/pdf") return "floorplan.pdf";
  if (mimeType === DXF_MIME) return "floorplan.dxf";
  if (mimeType === DWG_MIME) return "floorplan.dwg";
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
    // 512 bytes: a DXF's opening SECTION record sits further in than a magic number.
    const buf = Buffer.from(base64.slice(0, 1024), "base64");
    if (buf.slice(0, 4).toString("latin1") === "%PDF") return "application/pdf";
    if (looksLikeDwg(buf)) return DWG_MIME;
    if (looksLikeDxf(buf)) return DXF_MIME;
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

