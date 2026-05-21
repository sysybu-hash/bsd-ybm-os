import pdfParse from "pdf-parse";
import { inferMimeFromFileName } from "@/lib/scan-mime";

const MAX_NOTEBOOK_TEXT = 120_000;

export async function extractTextForNotebook(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const mime = inferMimeFromFileName(fileName, mimeType);

  if (mime === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    const parsed = await pdfParse(buffer);
    return (parsed.text ?? "").trim().slice(0, MAX_NOTEBOOK_TEXT);
  }

  if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") {
    return buffer.toString("utf8").trim().slice(0, MAX_NOTEBOOK_TEXT);
  }

  if (mime.startsWith("image/")) {
    return `[קובץ תמונה: ${fileName} — הועלה למחברת כמקור; לפענוח מלא השתמשו בפענוח AI]`;
  }

  if (
    mime.includes("spreadsheet") ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    fileName.toLowerCase().endsWith(".xlsx") ||
    fileName.toLowerCase().endsWith(".xls")
  ) {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buffer, { type: "buffer" });
      const parts: string[] = [];
      for (const name of wb.SheetNames.slice(0, 8)) {
        const sheet = wb.Sheets[name];
        if (!sheet) continue;
        const csv = XLSX.utils.sheet_to_csv(sheet);
        parts.push(`## ${name}\n${csv}`);
      }
      return parts.join("\n\n").trim().slice(0, MAX_NOTEBOOK_TEXT);
    } catch {
      return `[גיליון Excel: ${fileName} — לא ניתן לחלץ טקסט]`;
    }
  }

  if (
    mime.includes("wordprocessingml") ||
    fileName.toLowerCase().endsWith(".docx")
  ) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return (result.value ?? "").trim().slice(0, MAX_NOTEBOOK_TEXT);
    } catch {
      return `[מסמך Word: ${fileName}]`;
    }
  }

  return `[קובץ: ${fileName}, סוג: ${mime} — תוכן בינארי; לחילוץ טקסט מלא השתמשו בפענוח AI]`;
}

export function buildFolderListingMarkdown(
  folderName: string,
  files: Array<{ name: string; mimeType: string; webViewLink?: string | null }>,
): string {
  const lines = [`# תיקייה: ${folderName}`, "", "| שם | סוג | קישור |", "| --- | --- | --- |"];
  for (const f of files) {
    const kind = f.mimeType.includes("folder") ? "תיקייה" : f.mimeType.split("/").pop() ?? f.mimeType;
    const link = f.webViewLink ? `[פתח](${f.webViewLink})` : "—";
    lines.push(`| ${f.name} | ${kind} | ${link} |`);
  }
  return lines.join("\n").slice(0, MAX_NOTEBOOK_TEXT);
}
