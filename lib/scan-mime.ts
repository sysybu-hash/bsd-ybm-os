/**
 * הרחבת תמיכה בקבצים לסריקה: בחירת ספק יעיל וזיהוי MIME לפי סיומת כשהדפדפן לא ממלא type.
 */

const IMAGE = /^image\//;
const PDF = "application/pdf";
export const MAX_SCAN_FILE_BYTES = 25 * 1024 * 1024;

/** MIME ש-Gemini מקבל בדרך כלל כ-binary inline (בנוסף לתמונות ו-PDF) */
const GEMINI_FILE_LIKE = new Set([
  PDF,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.text",
  "application/rtf",
  "text/rtf",
  "text/plain",
  "text/csv",
  "text/html",
  "text/markdown",
  "application/json",
  "application/xml",
  "text/xml",
]);

const EXT_TO_MIME: [RegExp, string][] = [
  [/\.pdf$/i, PDF],
  [/\.png$/i, "image/png"],
  [/\.(jpe?g)$/i, "image/jpeg"],
  [/\.gif$/i, "image/gif"],
  [/\.webp$/i, "image/webp"],
  [/\.bmp$/i, "image/bmp"],
  [/\.heic$/i, "image/heic"],
  [/\.heif$/i, "image/heif"],
  [/\.tiff?$/i, "image/tiff"],
  [/\.svg$/i, "image/svg+xml"],
  [/\.docx$/i, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [/\.doc$/i, "application/msword"],
  [/\.xlsx$/i, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [/\.xls$/i, "application/vnd.ms-excel"],
  [/\.pptx$/i, "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  [/\.ppt$/i, "application/vnd.ms-powerpoint"],
  [/\.ods$/i, "application/vnd.oasis.opendocument.spreadsheet"],
  [/\.odt$/i, "application/vnd.oasis.opendocument.text"],
  [/\.csv$/i, "text/csv"],
  [/\.txt$/i, "text/plain"],
  [/\.json$/i, "application/json"],
  [/\.xml$/i, "application/xml"],
  [/\.html?$/i, "text/html"],
  [/\.rtf$/i, "application/rtf"],
  [/\.md$/i, "text/markdown"],
  [/\.markdown$/i, "text/markdown"],
];

export function inferMimeFromFileName(fileName: string, mimeFromBrowser: string): string {
  const trimmed = mimeFromBrowser?.trim();
  if (trimmed && trimmed !== "application/octet-stream") return trimmed;
  const lower = fileName.toLowerCase();
  for (const [re, mime] of EXT_TO_MIME) {
    if (re.test(lower)) return mime;
  }
  return trimmed || "application/octet-stream";
}

export function isTextLikeMime(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "text/xml" ||
    mime === "text/csv" ||
    mime === "application/rtf"
  );
}

export function isDocxMime(mime: string): boolean {
  return mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

export function isOpenAiAnthropicVisionMime(mime: string): boolean {
  return IMAGE.test(mime);
}

export function isOpenAiAnthropicScanMime(mime: string): boolean {
  return IMAGE.test(mime) || mime === PDF;
}

export function shouldPreferGeminiForMime(mime: string): boolean {
  if (mime === PDF) return true;
  if (GEMINI_FILE_LIKE.has(mime)) return true;
  if (isTextLikeMime(mime)) return false;
  return IMAGE.test(mime);
}

export const SCAN_ACCEPT_SUMMARY =
  "PDF, Office (Word/Excel/PowerPoint), OpenDocument, תמונות (JPEG/PNG/HEIC/TIFF/WebP), CSV, JSON, XML, HTML, Markdown, RTF, טקסט";

export const DROPZONE_ACCEPT: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/bmp": [".bmp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "image/tiff": [".tif", ".tiff"],
  "image/svg+xml": [".svg"],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
  "text/markdown": [".md", ".markdown"],
  "application/json": [".json"],
  "application/xml": [".xml"],
  "text/xml": [".xml"],
  "text/html": [".html", ".htm"],
  "application/rtf": [".rtf"],
  "text/rtf": [".rtf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.oasis.opendocument.spreadsheet": [".ods"],
  "application/vnd.oasis.opendocument.text": [".odt"],
};

/** מחרוזת accept ל־<input type="file"> */
export function buildScanFileAcceptAttribute(): string {
  const exts = new Set<string>();
  for (const list of Object.values(DROPZONE_ACCEPT)) {
    for (const ext of list) exts.add(ext);
  }
  return [...exts].sort().join(",");
}

export function isSupportedScanMime(mime: string): boolean {
  if (IMAGE.test(mime)) return true;
  if (Object.prototype.hasOwnProperty.call(DROPZONE_ACCEPT, mime)) return true;
  if (GEMINI_FILE_LIKE.has(mime)) return true;
  return false;
}

export function isSupportedScanFile(file: File): boolean {
  const mime = inferMimeFromFileName(file.name, file.type || "application/octet-stream");
  return isSupportedScanMime(mime);
}
