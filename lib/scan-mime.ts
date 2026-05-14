/**
 * הרחבת תמיכה בקבצים לסריקה: בחירת ספק יעיל וזיהוי MIME לפי סיומת כשהדפדפן לא ממלא type.
 */

const IMAGE = /^image\//;
const PDF = "application/pdf";
export const MAX_SCAN_FILE_BYTES = 25 * 1024 * 1024;

/** MIME ש-Gemini מקבל בדרך כלל כ-binary inline (בנוסף לתמונות ו-PDF) */
const GEMINI_FILE_LIKE = new Set([
  PDF,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
  "application/rtf",
  "text/rtf",
  "text/plain",
  "text/csv",
  "text/html",
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
  [/\.docx$/i, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [/\.doc$/i, "application/msword"],
  [/\.xlsx$/i, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [/\.xls$/i, "application/vnd.ms-excel"],
  [/\.pptx$/i, "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  [/\.csv$/i, "text/csv"],
  [/\.txt$/i, "text/plain"],
  [/\.json$/i, "application/json"],
  [/\.xml$/i, "application/xml"],
  [/\.html?$/i, "text/html"],
  [/\.rtf$/i, "application/rtf"],
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

/** OpenAI / Anthropic במסלול תמונה — תמונות בלבד */
export function isOpenAiAnthropicVisionMime(mime: string): boolean {
  return IMAGE.test(mime);
}

/** תמונות + PDF — מסלול סריקה ישיר ל-OpenAI / Anthropic (לא ניתוב ל-Gemini) */
export function isOpenAiAnthropicScanMime(mime: string): boolean {
  return IMAGE.test(mime) || mime === PDF;
}

/** אם נדרש פענוח ויזואלי/קובץ כבד — מועדף Gemini */
export function shouldPreferGeminiForMime(mime: string): boolean {
  if (mime === PDF) return true;
  if (GEMINI_FILE_LIKE.has(mime)) return true;
  if (isTextLikeMime(mime)) return false; // נטפל בנפרד כטקסט
  return true;
}

/** תיאור להצגה ב-UI */
export const SCAN_ACCEPT_SUMMARY =
  "PDF, Office (Word/Excel/PowerPoint), תמונות, CSV, JSON, XML, HTML, RTF, טקסט";

/** react-dropzone: קבצים נפוצים לסריקה ולגיבוי */
export const DROPZONE_ACCEPT: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/bmp": [".bmp"],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
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
};

export function isSupportedScanMime(mime: string): boolean {
  return IMAGE.test(mime) || Object.prototype.hasOwnProperty.call(DROPZONE_ACCEPT, mime);
}
