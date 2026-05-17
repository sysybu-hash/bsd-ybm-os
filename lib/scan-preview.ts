/** MIME types שניתן להציג בדפדפן בתצוגה מקדימה */
export function canBrowserPreviewMime(mime: string): boolean {
  if (mime.startsWith("image/")) return true;
  if (mime === "application/pdf") return true;
  return false;
}

export type ScanPreviewKind = "image" | "pdf" | "text" | "none";

export function scanPreviewKind(mime: string): ScanPreviewKind {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime === "text/plain" || mime === "text/csv") return "text";
  return "none";
}

export function isOfficeMime(mime: string): boolean {
  return (
    mime.includes("officedocument") ||
    mime === "application/msword" ||
    mime === "application/vnd.ms-excel"
  );
}
