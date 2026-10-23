
const RASTER = /^image\//i;
export const MAX_LONG_EDGE = 4096;
export const MIN_SHORT_EDGE = 1600;
export const TARGET_SHORT_EDGE = 2400;

export const DXF_MIME = "image/vnd.dxf";
export const DWG_MIME = "image/vnd.dwg";
/**
 * A permit strip (DWF), or the W2D drawing stream inside one — the browser
 * uploads the stream alone. Not an image and not a CAD file the DXF reader
 * takes: it has its own reader, and a building's worth of apartments in it.
 */
export const DWF_MIME = "model/vnd.dwf";

export type PreparedFloorplanSource = {
  base64: string;
  mimeType: string;
  /** "cad" is a DXF, a DWG or a DWF: vectors, read without rasterising anything. */
  sourceKind: "pdf" | "photo" | "drawing" | "cad";
};

/** DXF is text, and its first record opens a SECTION. */
export function looksLikeDxf(bytes: Buffer | Uint8Array): boolean {
  let head = Buffer.from(bytes.subarray(0, 4096));
  if (head.length >= 3 && head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) head = head.subarray(3);
  const text = head.toString("latin1").replace(/^\uFEFF/, "");
  return /(^|\n)\s*0\s*\r?\n\s*SECTION/i.test(text) || text.includes("AutoCAD Binary DXF");
}

/** DWG is binary, and its first bytes name the release that wrote it. */
export function looksLikeDwg(bytes: Buffer | Uint8Array): boolean {
  return /^AC10\d{2}/.test(Buffer.from(bytes.subarray(0, 6)).toString("latin1"));
}

/** A W2D stream opens with its own name; a DWF package with "(DWF V". */
export function looksLikeDwf(bytes: Buffer | Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 8)).toString("latin1");
  return head.startsWith("(W2D") || head.startsWith("(DWF V");
}

export function isDwfFloorplanMime(mime: string): boolean {
  return mime === DWF_MIME;
}

export function isCadFloorplanMime(mime: string): boolean {
  return mime === DXF_MIME || mime === DWG_MIME;
}

/**
 * Names browsers and Windows attach to the same drawing.
 *
 * Chrome sends `application/dxf` or nothing for a DXF, and `application/acad`
 * for a DWG. The readers only recognise the canonical types below.
 */
const FLOORPLAN_MIME_ALIAS: Record<string, string> = {
  "application/pdf": "application/pdf",
  "application/x-pdf": "application/pdf",
  [DXF_MIME]: DXF_MIME,
  "application/dxf": DXF_MIME,
  "application/x-dxf": DXF_MIME,
  "image/x-dxf": DXF_MIME,
  [DWG_MIME]: DWG_MIME,
  "application/acad": DWG_MIME,
  "application/x-acad": DWG_MIME,
  "application/autocad_dwg": DWG_MIME,
  "application/dwg": DWG_MIME,
  "application/x-dwg": DWG_MIME,
  "image/x-dwg": DWG_MIME,
  "drawing/dwg": DWG_MIME,
  [DWF_MIME]: DWF_MIME,
  "application/dwf": DWF_MIME,
  "application/x-dwf": DWF_MIME,
  "drawing/x-dwf": DWF_MIME,
  "application/x-w2d": DWF_MIME,
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/heic": "image/heic",
  "image/heif": "image/heif",
};

/** The type this pipeline reads, or null when the label is not a plan. */
export function canonicalFloorplanMime(mime: string): string | null {
  const key = mime.trim().toLowerCase().split(";")[0]!.trim();
  return FLOORPLAN_MIME_ALIAS[key] ?? null;
}

/** What Blob, and the chunked fallback, will accept for a plan upload. */
export const FLOORPLAN_UPLOAD_CONTENT_TYPES = [
  ...new Set([...Object.keys(FLOORPLAN_MIME_ALIAS), "application/octet-stream"]),
];

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
  if (mimeType === DWF_MIME) return "floorplan.w2d";
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

/** Magic bytes win over a wrong label. A PDF named `.dxf` stays a PDF. */
export function sniffFloorplanBytes(base64: string): string | null {
  try {
    // A DXF's first SECTION can sit past a comment header. 8KB of base64 is ~6KB of text.
    const buf = Buffer.from(base64.slice(0, 8192), "base64");
    if (buf.length < 4) return null;
    if (buf.slice(0, 4).toString("latin1") === "%PDF") return "application/pdf";
    if (looksLikeDwg(buf)) return DWG_MIME;
    if (looksLikeDwf(buf)) return DWF_MIME;
    if (looksLikeDxf(buf)) return DXF_MIME;
    if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
    if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") {
      return "image/webp";
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function sniffFloorplanMime(base64: string, mimeType: string): string {
  const fromBytes = sniffFloorplanBytes(base64);
  if (fromBytes) return fromBytes;
  const alias = canonicalFloorplanMime(mimeType);
  if (alias) return alias;
  const mime = mimeType.trim();
  if (mime && mime !== "application/octet-stream") return mime;
  return mime || "application/pdf";
}

